#!/usr/bin/env python3
"""
Generate a one-page PDF summary of the app using only stdlib.

Why stdlib:
- Network access is restricted, so we can't rely on installing reportlab.
- This script writes a minimal, single-page PDF with built-in fonts (Helvetica).

Output:
- Writes final artifact to output/pdf/overlaymvp-app-summary.pdf
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple

import textwrap


PAGE_W = 612  # US Letter, points
PAGE_H = 792


def _pdf_escape(text: str) -> str:
    # PDF literal strings need backslash escaping for \ ( ) and newlines.
    return (
        text.replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
        .replace("\r", "")
        .replace("\n", "\\n")
    )


@dataclass(frozen=True)
class TextRun:
    x: float
    y: float
    font: str  # "F1" or "F2"
    size: int
    color_rgb: Tuple[float, float, float]
    lines: List[str]
    leading: int


def _emit_text(run: TextRun) -> str:
    r, g, b = run.color_rgb
    out: List[str] = []
    out.append("BT")
    out.append(f"{r:.3f} {g:.3f} {b:.3f} rg")
    out.append(f"/{run.font} {run.size} Tf")
    out.append(f"{run.leading} TL")
    out.append(f"{run.x:.1f} {run.y:.1f} Td")
    for i, line in enumerate(run.lines):
        if i > 0:
            out.append("T*")
        out.append(f"({_pdf_escape(line)}) Tj")
    out.append("ET")
    return "\n".join(out) + "\n"


def _emit_rect(x: float, y: float, w: float, h: float, stroke_rgb: Tuple[float, float, float]) -> str:
    r, g, b = stroke_rgb
    return f"q\n{r:.3f} {g:.3f} {b:.3f} RG\n1 w\n{x:.1f} {y:.1f} {w:.1f} {h:.1f} re S\nQ\n"


class MiniPDF:
    def __init__(self) -> None:
        self._objects: List[bytes] = []

    def add_object(self, body: bytes) -> int:
        self._objects.append(body)
        return len(self._objects)

    def build(self) -> bytes:
        header = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
        offsets: List[int] = []
        out = bytearray()
        out.extend(header)
        for idx, obj in enumerate(self._objects, start=1):
            offsets.append(len(out))
            out.extend(f"{idx} 0 obj\n".encode("ascii"))
            out.extend(obj)
            if not obj.endswith(b"\n"):
                out.extend(b"\n")
            out.extend(b"endobj\n")
        xref_start = len(out)
        out.extend(f"xref\n0 {len(self._objects) + 1}\n".encode("ascii"))
        out.extend(b"0000000000 65535 f \n")
        for off in offsets:
            out.extend(f"{off:010d} 00000 n \n".encode("ascii"))
        out.extend(
            (
                "trailer\n"
                f"<< /Size {len(self._objects) + 1} /Root 1 0 R >>\n"
                "startxref\n"
                f"{xref_start}\n"
                "%%EOF\n"
            ).encode("ascii")
        )
        return bytes(out)


def _wrap_lines(raw_lines: List[str], max_chars: int) -> List[str]:
    wrapped: List[str] = []
    for raw in raw_lines:
        line = raw.rstrip()
        if not line:
            wrapped.append("")
            continue

        bullet_prefix = ""
        subsequent_indent = ""
        if line.startswith("- "):
            bullet_prefix = "- "
            subsequent_indent = "  "
            body = line[2:]
        elif line.startswith("1) ") or line.startswith("2) ") or line.startswith("3) ") or line.startswith("4) "):
            bullet_prefix = line[:3]
            subsequent_indent = "   "
            body = line[3:]
        else:
            body = line

        chunks = textwrap.wrap(
            body,
            width=max_chars - len(bullet_prefix),
            break_long_words=False,
            break_on_hyphens=False,
        )
        if not chunks:
            wrapped.append(line)
            continue

        wrapped.append(bullet_prefix + chunks[0])
        for chunk in chunks[1:]:
            wrapped.append(subsequent_indent + chunk)

    return wrapped


def _content_stream() -> str:
    # Layout constants
    margin = 48
    gap = 18
    col_w = (PAGE_W - margin * 2 - gap) / 2  # ~249
    left_x = margin
    right_x = margin + col_w + gap

    top = PAGE_H - 48

    teal = (0.06, 0.46, 0.42)  # ~ #0f766e
    black = (0.0, 0.0, 0.0)
    gray = (0.83, 0.83, 0.83)

    parts: List[str] = []

    # Title + divider
    parts.append(_emit_text(TextRun(
        x=margin,
        y=top,
        font="F2",
        size=16,
        color_rgb=black,
        lines=["Workflow Automation Platform (OverlayMVP)"],
        leading=18,
    )))
    parts.append(f"q\n{gray[0]:.3f} {gray[1]:.3f} {gray[2]:.3f} RG\n1 w\n{margin:.1f} {(top-10):.1f} m {(PAGE_W-margin):.1f} {(top-10):.1f} l S\nQ\n")

    # Column containers (subtle)
    col_top = top - 22
    col_bottom = 72
    col_h = col_top - col_bottom
    parts.append(_emit_rect(left_x, col_bottom, col_w, col_h, stroke_rgb=(0.90, 0.90, 0.90)))
    parts.append(_emit_rect(right_x, col_bottom, col_w, col_h, stroke_rgb=(0.90, 0.90, 0.90)))

    # LEFT COLUMN ------------------------------------------------------------
    y = col_top - 18
    parts.append(_emit_text(TextRun(
        x=left_x + 12,
        y=y,
        font="F2",
        size=9,
        color_rgb=teal,
        lines=["WHAT IT IS"],
        leading=12,
    )))
    y -= 14
    parts.append(_emit_text(TextRun(
        x=left_x + 12,
        y=y,
        font="F1",
        size=10,
        color_rgb=black,
        lines=_wrap_lines(
            [
                "AI-powered Chrome extension + web dashboard to record and guide interactive web workflows (SOP walkthroughs)."
            ],
            max_chars=44,
        ),
        leading=12,
    )))

    y -= 44
    parts.append(_emit_text(TextRun(
        x=left_x + 12,
        y=y,
        font="F2",
        size=9,
        color_rgb=teal,
        lines=["WHO ITS FOR"],
        leading=12,
    )))
    y -= 14
    parts.append(_emit_text(TextRun(
        x=left_x + 12,
        y=y,
        font="F1",
        size=10,
        color_rgb=black,
        lines=_wrap_lines(
            [
                "Department managers at SMBs (10-500 employees) who need a repeatable way to capture and teach software processes to their teams."
            ],
            max_chars=44,
        ),
        leading=12,
    )))

    y -= 62
    parts.append(_emit_text(TextRun(
        x=left_x + 12,
        y=y,
        font="F2",
        size=9,
        color_rgb=teal,
        lines=["HOW TO RUN (MINIMAL)"],
        leading=12,
    )))
    y -= 14
    parts.append(_emit_text(TextRun(
        x=left_x + 12,
        y=y,
        font="F1",
        size=9,
        color_rgb=black,
        lines=_wrap_lines(
            [
                "- Prereqs: Node 18+, Python 3.11+, Chrome",
                "- Install JS deps: npm install (repo root)",
                "- Backend deps: cd backend; python -m venv venv; source venv/bin/activate; pip install -r requirements.txt",
                "- Configure env: cp backend/.env.example backend/.env; set JWT_SECRET_KEY + (optional) ANTHROPIC_API_KEY",
                "- Migrate DB: cd backend; alembic upgrade head",
                "- Start: uvicorn app.main:app --reload --port 8000",
                "- Start UI: cd dashboard; npm run dev (http://localhost:3000)",
                "- Extension: cd extension; npm run build; load extension/dist in Chrome",
                "- Celery/AI: celery -A app.celery_app worker; Redis install/start steps: Not found in repo",
            ],
            max_chars=48,
        ),
        leading=11,
    )))

    # RIGHT COLUMN -----------------------------------------------------------
    y = col_top - 18
    parts.append(_emit_text(TextRun(
        x=right_x + 12,
        y=y,
        font="F2",
        size=9,
        color_rgb=teal,
        lines=["WHAT IT DOES"],
        leading=12,
    )))
    y -= 14
    parts.append(_emit_text(TextRun(
        x=right_x + 12,
        y=y,
        font="F1",
        size=10,
        color_rgb=black,
        lines=_wrap_lines(
            [
                "- Records user actions + screenshots (Chrome extension)",
                "- Stores captured steps locally (IndexedDB) during recording",
                "- Uploads workflows + screenshots to backend REST API",
                "- AI step labeling in background (Celery task)",
                "- Walkthrough overlay guides users on live sites",
                "- Dashboard to sign up/login and review workflows + step details",
                "- Company features: invites, roles, permissions, notifications, health endpoints",
            ],
            max_chars=48,
        ),
        leading=12,
    )))

    y -= 150
    parts.append(_emit_text(TextRun(
        x=right_x + 12,
        y=y,
        font="F2",
        size=9,
        color_rgb=teal,
        lines=["HOW IT WORKS (ARCHITECTURE)"],
        leading=12,
    )))
    y -= 14
    parts.append(_emit_text(TextRun(
        x=right_x + 12,
        y=y,
        font="F1",
        size=8,
        color_rgb=black,
        lines=_wrap_lines(
            [
                "Components:",
                "- Extension (MV3): popup UI + background service worker + content scripts",
                "- Backend: FastAPI routers (auth, workflows, steps, screenshots, healing, company, invites, notifications, health, users)",
                "- DB: SQLAlchemy + SQLite by default (see backend/.env.example)",
                "- Async: Celery worker + Redis broker for AI labeling",
                "- Storage: S3 if configured; else local backend/screenshots (served at /screenshots)",
                "- Dashboard: React + Vite app (see dashboard/.env.example)",
                "",
                "Data flow (happy path):",
                "1) Record in extension -> steps/screenshots captured",
                "2) Upload to backend -> DB records stored",
                "3) Trigger processing -> Celery labels steps -> notification created",
                "4) Review in dashboard; run walkthrough overlay in extension",
            ],
            max_chars=54,
        ),
        leading=10,
    )))

    return "".join(parts)


def main() -> int:
    out_dir = Path("output/pdf")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "overlaymvp-app-summary.pdf"

    content = _content_stream().encode("utf-8")
    stream_obj = b"<< /Length %d >>\nstream\n" % (len(content),) + content + b"endstream\n"

    pdf = MiniPDF()

    # 1: Catalog
    pdf.add_object(b"<< /Type /Catalog /Pages 2 0 R >>\n")

    # 2: Pages
    pdf.add_object(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n")

    # 3: Page
    page = (
        "<< /Type /Page /Parent 2 0 R "
        f"/MediaBox [0 0 {PAGE_W} {PAGE_H}] "
        "/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> "
        "/Contents 6 0 R >>\n"
    ).encode("ascii")
    pdf.add_object(page)

    # 4: Helvetica
    pdf.add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n")

    # 5: Helvetica-Bold
    pdf.add_object(
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\n"
    )

    # 6: Content stream
    pdf.add_object(stream_obj)

    out_path.write_bytes(pdf.build())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
