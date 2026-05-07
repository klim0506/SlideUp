from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("presentations", "0005_presentation_slide_histories"),
    ]

    operations = [
        migrations.AddField(
            model_name="presentation",
            name="assets",
            field=models.JSONField(blank=True, null=True),
        ),
    ]
