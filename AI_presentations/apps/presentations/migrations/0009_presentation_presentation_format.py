from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("presentations", "0008_merge_20260509_0706"),
    ]

    operations = [
        migrations.AddField(
            model_name="presentation",
            name="presentation_format",
            field=models.CharField(
                default="json_v1",
                max_length=16,
                help_text=(
                    "Slide storage shape: json_v1 (legacy structured) or html_v1"
                    " (canonical HTML)."
                ),
            ),
        ),
    ]
