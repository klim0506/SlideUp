from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("presentations", "0004_colorscheme"),
    ]

    operations = [
        migrations.AddField(
            model_name="presentation",
            name="slide_histories",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
