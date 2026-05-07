# Production Checklist

- Set `DJANGO_DEBUG=False`.
- Set a strong unique `DJANGO_SECRET_KEY`.
- Set `DJANGO_ALLOWED_HOSTS` to production domains only.
- Set `FRONTEND_PUBLIC_URL` to the public frontend origin.
- Set `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` to trusted HTTPS origins.
- Configure PostgreSQL credentials and run migrations.
- Configure Redis for Celery broker and result backend.
- Configure SMTP settings and verify registration emails.
- Configure YooKassa credentials, return URL, and webhook endpoint.
- Serve static files from `STATIC_ROOT` behind HTTPS.
