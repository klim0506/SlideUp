# Generated for richer-slide generation rollout.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("generation", "0003_generationsettings_cli_runner_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="generationsettings",
            name="api_max_tokens",
            field=models.PositiveIntegerField(
                default=16384,
                help_text=(
                    "Anthropic API max_tokens for generation calls. Larger values allow"
                    " richer slides but cost more and take longer. Range 1024–32000."
                ),
            ),
        ),
        migrations.AlterField(
            model_name="generationsettings",
            name="cli_timeout_seconds",
            field=models.PositiveIntegerField(default=300),
        ),
    ]
