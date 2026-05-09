"""Backfill legacy ``json_v1`` presentations into the canonical ``html_v1`` format.

Usage::

    # See what would happen, without writing anything:
    python manage.py migrate_slides_to_html --dry-run

    # Convert one specific presentation:
    python manage.py migrate_slides_to_html --id <uuid>

    # Convert at most 200 rows in this run:
    python manage.py migrate_slides_to_html --limit 200

    # Write a JSON report alongside the run:
    python manage.py migrate_slides_to_html --report /tmp/backfill.json

The command is idempotent: rows already at ``presentation_format='html_v1'`` are
skipped. Each converted row keeps a copy of the original slides under
``Presentation.assets['_legacy_slides']`` (only on the first conversion) so the
operation can be reversed if needed; see ``--rollback``.
"""

from __future__ import annotations

import json
from typing import Any

from django.core.management.base import BaseCommand, CommandError

from apps.presentations.models import Presentation
from apps.presentations.slide_html import (
    PRESENTATION_FORMAT_HTML_V1,
    PRESENTATION_FORMAT_JSON_V1,
    SLIDE_SID_KEY,
    coerce_html_slide,
    metadata_for_legacy_slide,
    sanitize_slide_html,
)


_LEGACY_BACKUP_KEY = "_legacy_slides"


class Command(BaseCommand):
    help = "Convert legacy json_v1 slide decks into html_v1 (sanitized HTML)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Report only; do not write.")
        parser.add_argument("--id", dest="presentation_id", help="Convert exactly one presentation.")
        parser.add_argument("--limit", type=int, default=0, help="Max rows to process (0 = unlimited).")
        parser.add_argument(
            "--report",
            dest="report_path",
            default="",
            help="Optional path to write a JSON report of the run.",
        )
        parser.add_argument(
            "--rollback",
            action="store_true",
            help="Restore presentations to json_v1 from the asset backup (if present).",
        )

    def handle(self, *args, **options):
        dry_run: bool = options["dry_run"]
        presentation_id: str | None = options["presentation_id"]
        limit: int = max(int(options.get("limit") or 0), 0)
        report_path: str = options["report_path"]
        rollback: bool = options["rollback"]

        qs = Presentation.objects.all()
        if presentation_id:
            qs = qs.filter(pk=presentation_id)
        if rollback:
            qs = qs.filter(presentation_format=PRESENTATION_FORMAT_HTML_V1)
        else:
            qs = qs.filter(presentation_format=PRESENTATION_FORMAT_JSON_V1)
        qs = qs.order_by("created_at")
        if limit:
            qs = qs[:limit]

        report: dict[str, Any] = {
            "dry_run": dry_run,
            "rollback": rollback,
            "scanned": 0,
            "converted": 0,
            "skipped": 0,
            "errors": [],
            "rows": [],
        }

        for presentation in qs.iterator():
            report["scanned"] += 1
            try:
                if rollback:
                    changed, summary = self._rollback_one(presentation, dry_run=dry_run)
                else:
                    changed, summary = self._convert_one(presentation, dry_run=dry_run)
                report["rows"].append(summary)
                if changed:
                    report["converted"] += 1
                else:
                    report["skipped"] += 1
            except Exception as exc:  # noqa: BLE001 — we do want a wide net here
                report["errors"].append({"id": str(presentation.id), "error": str(exc)})
                self.stderr.write(self.style.ERROR(f"{presentation.id}: {exc}"))

        if report_path:
            with open(report_path, "w", encoding="utf-8") as fh:
                json.dump(report, fh, ensure_ascii=False, indent=2)

        verb = "rollback" if rollback else "convert"
        self.stdout.write(
            self.style.SUCCESS(
                f"{verb}: scanned={report['scanned']} converted={report['converted']}"
                f" skipped={report['skipped']} errors={len(report['errors'])}"
                f" (dry_run={dry_run})"
            )
        )

    # ------------------------------------------------------------------
    # Per-row work
    # ------------------------------------------------------------------

    def _convert_one(self, presentation: Presentation, *, dry_run: bool) -> tuple[bool, dict]:
        legacy_slides = presentation.slides if isinstance(presentation.slides, list) else []
        if not legacy_slides:
            # Empty deck — just bump the format flag so we don't keep visiting it.
            if not dry_run:
                presentation.presentation_format = PRESENTATION_FORMAT_HTML_V1
                presentation.save(update_fields=("presentation_format",))
            return True, {"id": str(presentation.id), "status": "empty", "slides": 0}

        new_slides: list[dict] = []
        sanitization_warnings = 0
        for slide in legacy_slides:
            coerced = coerce_html_slide(slide)
            cleaned_html = sanitize_slide_html(coerced.get("html") or "")
            if cleaned_html != (coerced.get("html") or ""):
                sanitization_warnings += 1
                coerced["html"] = cleaned_html
            # Preserve sid + augment metadata from legacy fields the converter may not see.
            md = coerced.get("metadata") or {}
            if isinstance(slide, dict):
                legacy_md = metadata_for_legacy_slide(slide)
                for k, v in legacy_md.items():
                    md.setdefault(k, v)
            coerced["metadata"] = md
            if isinstance(slide, dict) and isinstance(slide.get(SLIDE_SID_KEY), str) and slide[SLIDE_SID_KEY]:
                coerced[SLIDE_SID_KEY] = slide[SLIDE_SID_KEY]
            new_slides.append(coerced)

        summary = {
            "id": str(presentation.id),
            "status": "converted",
            "slides": len(new_slides),
            "sanitization_warnings": sanitization_warnings,
        }

        if dry_run:
            return True, summary

        # Backup legacy slides into the assets bag so rollback is possible.
        assets = dict(presentation.assets) if isinstance(presentation.assets, dict) else {}
        if _LEGACY_BACKUP_KEY not in assets:
            assets[_LEGACY_BACKUP_KEY] = legacy_slides

        presentation.slides = new_slides
        presentation.presentation_format = PRESENTATION_FORMAT_HTML_V1
        presentation.assets = assets
        presentation.save(update_fields=("slides", "presentation_format", "assets"))
        return True, summary

    def _rollback_one(self, presentation: Presentation, *, dry_run: bool) -> tuple[bool, dict]:
        assets = presentation.assets if isinstance(presentation.assets, dict) else {}
        backup = assets.get(_LEGACY_BACKUP_KEY)
        if not isinstance(backup, list):
            return False, {"id": str(presentation.id), "status": "no-backup"}

        summary = {
            "id": str(presentation.id),
            "status": "rolled-back",
            "slides": len(backup),
        }
        if dry_run:
            return True, summary

        new_assets = {k: v for k, v in assets.items() if k != _LEGACY_BACKUP_KEY}
        presentation.slides = backup
        presentation.presentation_format = PRESENTATION_FORMAT_JSON_V1
        presentation.assets = new_assets or None
        presentation.save(update_fields=("slides", "presentation_format", "assets"))
        return True, summary
