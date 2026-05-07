from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("presentations", "0006_presentation_assets"),
    ]

    operations = [
        migrations.AddField(
            model_name="presentation",
            name="style",
            field=models.CharField(default="pitch", max_length=32),
        ),
    ]
