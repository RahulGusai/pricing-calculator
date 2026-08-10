"""PDF rendering and private artifact storage adapters.

The database owns document state.  This module only renders an immutable
snapshot and stores its bytes behind a replaceable local/S3-compatible adapter.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path
from typing import Protocol
from xml.sax.saxutils import escape

import boto3
from botocore.config import Config as BotoConfig
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from pricing_api.config import Settings


@dataclass(frozen=True, slots=True)
class PrintableLine:
    name: str
    description: str
    quantity: str
    unit_price: str
    discount: str
    tax: str
    grand_total: str


@dataclass(frozen=True, slots=True)
class PrintableDocument:
    number: str
    title: str
    customer_name: str
    document_date: str
    valid_until: str
    currency: str
    lines: tuple[PrintableLine, ...]
    subtotal: str
    discount: str
    tax: str
    grand_total: str


@dataclass(frozen=True, slots=True)
class StoredArtifact:
    object_key: str
    checksum: str
    size_bytes: int
    content_type: str


class ArtifactStorage(Protocol):
    """Storage seam: S3 is production, local disk is test/development only."""

    def put_pdf(self, object_key: str, content: bytes) -> StoredArtifact: ...

    def delete(self, object_key: str) -> None: ...

    def download_url(self, object_key: str, expires_at: datetime) -> str: ...

    def read(self, object_key: str) -> bytes | None: ...


def _money(currency: str, amount: str) -> str:
    prefix = {"USD": "$", "INR": "₹", "AED": "AED "}.get(currency, f"{currency} ")
    return f"{prefix}{amount}"


def render_document_pdf(document: PrintableDocument) -> bytes:
    """Render a compact, deterministic finalized-document PDF in memory."""

    stream = BytesIO()
    pdf = SimpleDocTemplate(
        stream,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=document.number,
    )
    styles = getSampleStyleSheet()
    story = [
        Paragraph(escape(document.title), styles["Title"]),
        Spacer(1, 4 * mm),
        Paragraph(f"<b>{escape(document.number)}</b>", styles["BodyText"]),
        Paragraph(f"Customer: {escape(document.customer_name)}", styles["BodyText"]),
        Paragraph(f"Issue date: {escape(document.document_date)}", styles["BodyText"]),
        Paragraph(f"Valid until: {escape(document.valid_until)}", styles["BodyText"]),
        Paragraph(f"Currency: {escape(document.currency)}", styles["BodyText"]),
        Spacer(1, 6 * mm),
    ]

    table_data: list[list[str]] = [
        ["Item", "Qty", "Unit price", "Discount", "Tax", "Line total"]
    ]
    for line in document.lines:
        item = escape(line.name)
        if line.description:
            item = f"{item}<br/><font size=8>{escape(line.description)}</font>"
        table_data.append(
            [
                item,
                line.quantity,
                _money(document.currency, line.unit_price),
                _money(document.currency, line.discount),
                _money(document.currency, line.tax),
                _money(document.currency, line.grand_total),
            ]
        )
    table = Table(
        table_data,
        repeatRows=1,
        colWidths=[50 * mm, 14 * mm, 26 * mm, 25 * mm, 20 * mm, 28 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1d2733")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d8dde3")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f8fa")]),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.extend([table, Spacer(1, 6 * mm)])

    totals = Table(
        [
            ["Subtotal", _money(document.currency, document.subtotal)],
            ["Discount", _money(document.currency, document.discount)],
            ["Tax", _money(document.currency, document.tax)],
            ["Grand total", _money(document.currency, document.grand_total)],
        ],
        colWidths=[35 * mm, 35 * mm],
        hAlign="RIGHT",
    )
    totals.setStyle(
        TableStyle(
            [
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("LINEABOVE", (0, -1), (-1, -1), 0.75, colors.HexColor("#1d2733")),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(totals)
    pdf.build(story)
    return stream.getvalue()


class LocalArtifactStorage:
    """Development/test adapter.  Never selected when APP_ENVIRONMENT=production."""

    def __init__(self, base_dir: Path) -> None:
        self.base_dir = base_dir.resolve()

    def _path_for(self, object_key: str) -> Path:
        path = (self.base_dir / object_key).resolve()
        if self.base_dir not in path.parents:
            raise ValueError("Artifact object key escapes the configured local directory.")
        return path

    def put_pdf(self, object_key: str, content: bytes) -> StoredArtifact:
        path = self._path_for(object_key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return StoredArtifact(
            object_key=object_key,
            checksum=hashlib.sha256(content).hexdigest(),
            size_bytes=len(content),
            content_type="application/pdf",
        )

    def delete(self, object_key: str) -> None:
        path = self._path_for(object_key)
        if path.exists():
            path.unlink()

    def download_url(self, object_key: str, expires_at: datetime) -> str:
        # The API's authorized content route streams the local file in development.
        return f"/api/v1/artifacts/local/{object_key}"

    def read(self, object_key: str) -> bytes | None:
        path = self._path_for(object_key)
        return path.read_bytes() if path.exists() else None


class S3ArtifactStorage:
    """Private S3/Railway Bucket adapter; permanent URLs are never persisted."""

    def __init__(self, settings: Settings) -> None:
        self.bucket = settings.s3_bucket or ""
        self.ttl_seconds = settings.s3_presigned_url_ttl_seconds
        config = BotoConfig(s3={"addressing_style": settings.s3_url_style})
        self.client = boto3.client(
            "s3",
            region_name=settings.s3_region,
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            config=config,
        )

    def put_pdf(self, object_key: str, content: bytes) -> StoredArtifact:
        checksum = hashlib.sha256(content).hexdigest()
        self.client.put_object(
            Bucket=self.bucket,
            Key=object_key,
            Body=content,
            ContentType="application/pdf",
        )
        return StoredArtifact(
            object_key=object_key,
            checksum=checksum,
            size_bytes=len(content),
            content_type="application/pdf",
        )

    def delete(self, object_key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=object_key)

    def download_url(self, object_key: str, expires_at: datetime) -> str:
        remaining = max(1, int((expires_at - datetime.now(UTC)).total_seconds()))
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": object_key},
            ExpiresIn=min(remaining, self.ttl_seconds),
        )

    def read(self, object_key: str) -> bytes | None:
        # S3 artifacts are intentionally sent directly through presigned URLs.
        return None


def build_artifact_storage(settings: Settings) -> ArtifactStorage:
    if settings.artifact_storage == "s3":
        return S3ArtifactStorage(settings)
    return LocalArtifactStorage(settings.local_artifacts_dir)


def artifact_expiry(settings: Settings) -> datetime:
    return datetime.now(UTC) + timedelta(seconds=settings.s3_presigned_url_ttl_seconds)
