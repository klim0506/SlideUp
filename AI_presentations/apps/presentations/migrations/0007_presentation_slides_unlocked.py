from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("presentations", "0006_presentation_assets"),
    ]

    operations = [
        migrations.AddField(
            model_name="presentation",
            name="slides_unlocked",
            field=models.PositiveIntegerField(
                blank=True,
                help_text="Если задано — доступны только первые N слайдов (остальные превью до апгрейда); null — все.",
                null=True,
            ),
        ),
    ]
