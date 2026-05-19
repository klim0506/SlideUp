from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers

from apps.billing.utils import get_effective_plan, get_or_create_slide_credit
from .services import provision_user_account


User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email")
        read_only_fields = ("id",)


class UserRegistrationSerializer(serializers.ModelSerializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ("id", "email", "password")
        read_only_fields = ("id",)

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return email

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        email = validated_data["email"]

        with transaction.atomic():
            user = User.objects.create_user(email=email, password=password)

            request = self.context.get("request")
            session_key = request.session.session_key if request else None
            provision_user_account(user, session_key=session_key, send_welcome=True)

        return user


class GoogleLoginSerializer(serializers.Serializer):
    credential = serializers.CharField(write_only=True)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        email = attrs["email"].strip().lower()
        password = attrs["password"]

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist as exc:
            raise serializers.ValidationError("Invalid email or password.") from exc

        if not user.check_password(password):
            raise serializers.ValidationError("Invalid email or password.")
        if not user.is_active:
            raise serializers.ValidationError("This account is inactive.")

        attrs["user"] = user
        return attrs


class CurrentUserSerializer(serializers.ModelSerializer):
    plan = serializers.SerializerMethodField()
    slides_available = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "email", "plan", "slides_available")
        read_only_fields = fields

    def get_plan(self, user):
        return get_effective_plan(user)

    def get_slides_available(self, user):
        return get_or_create_slide_credit(user).available()
