import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import exceptions

from apps.billing.models import SlideCredit, Subscription
from apps.billing.plan_limits_config import free_monthly_slides
from apps.billing.utils import transfer_guest_credits_to_user
from apps.presentations.models import Presentation

from .emails import send_welcome_email


User = get_user_model()


def provision_user_account(user, session_key=None, send_welcome=True):
    slide_credit, _ = SlideCredit.objects.get_or_create(
        user=user,
        defaults={"monthly_limit": free_monthly_slides()},
    )
    if slide_credit.monthly_limit <= 0:
        slide_credit.monthly_limit = free_monthly_slides()
        slide_credit.save(update_fields=["monthly_limit"])

    Subscription.objects.get_or_create(
        user=user,
        defaults={"plan": Subscription.Plan.FREE},
    )

    if session_key:
        transfer_guest_credits_to_user(user, session_key)
        Presentation.objects.filter(
            user__isnull=True,
            session_key=session_key,
        ).update(user=user)

    if send_welcome:
        transaction.on_commit(lambda: send_welcome_email(user))


def verify_google_id_token(id_token, client_id):
    query = urlencode({"id_token": id_token})
    url = f"https://oauth2.googleapis.com/tokeninfo?{query}"

    try:
        with urlopen(url, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError) as exc:
        raise exceptions.AuthenticationFailed(
            "Google sign-in is temporarily unavailable."
        ) from exc

    if payload.get("aud") != client_id:
        raise exceptions.AuthenticationFailed("Google token audience mismatch.")
    if payload.get("email_verified") not in ("true", True):
        raise exceptions.AuthenticationFailed("Google account email is not verified.")

    email = (payload.get("email") or "").strip().lower()
    if not email:
        raise exceptions.AuthenticationFailed("Google account did not provide an email.")

    return {
        "email": email,
        "given_name": (payload.get("given_name") or "").strip(),
        "family_name": (payload.get("family_name") or "").strip(),
        "name": (payload.get("name") or "").strip(),
    }


def get_or_create_google_user(profile, session_key=None):
    email = profile["email"]

    with transaction.atomic():
        user = User.objects.filter(email__iexact=email).first()
        created = user is None

        if created:
            user = User(
                email=email,
                first_name=profile.get("given_name", ""),
                last_name=profile.get("family_name", ""),
                username=profile.get("name", "")[:150],
                is_active=True,
            )
            user.set_unusable_password()
            user.save()

        provision_user_account(
            user,
            session_key=session_key,
            send_welcome=created,
        )

    return user
