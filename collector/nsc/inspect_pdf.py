"""`python collector.py --inspect FILE.pdf`: show what the extractor sees in a PDF.

Use it when a paper produces 0 questions. It reports whether the PDF has a text
layer at all, what the raw text looks like, and how the parser's rows read.
"""
from __future__ import annotations

import re
from pathlib import Path

import pymupdf

from .patterns import KEY_RE
from .pdf_text import extract_pdf


def _short(text: str, n: int = 110) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= n else text[: n - 1] + "…"


def inspect_pdf(path: Path, pages: int = 3, rows_per_page: int = 22, start_page: int = 1) -> str:
    data = Path(path).read_bytes()
    out: list[str] = [f"=== {path.name}  ({len(data):,} bytes) ==="]
    doc = pymupdf.open(stream=data, filetype="pdf")
    try:
        n_pages = doc.page_count
        chars, images = [], []
        for page in doc:
            chars.append(len(page.get_text("text").strip()))
            images.append(len(page.get_images(full=True)))
        out.append(f"pages: {n_pages}   encrypted: {doc.is_encrypted}   producer: {doc.metadata.get('producer')!r}")
        out.append(f"text characters per page (first 12): {chars[:12]}")
        out.append(f"images per page (first 12):          {images[:12]}")
        avg = sum(chars) / max(1, n_pages)
        if avg < 150:
            out.append(
                "VERDICT: almost no text. This PDF is a scan/picture of the paper, so its questions "
                "can't be read without OCR. It will be stored as download-only."
            )
        fonts: dict[str, int] = {}
        for page in list(doc)[:3]:
            for f in page.get_fonts():
                fonts[f[3]] = fonts.get(f[3], 0) + 1
        out.append(f"fonts on pages 1-3: {sorted(fonts)[:10]}")

        first = max(0, start_page - 1)
        for i in range(first, min(first + pages, n_pages)):
            raw = [ln for ln in doc[i].get_text("text").splitlines() if ln.strip()]
            out.append(f"\n--- page {i + 1}: raw text, first {rows_per_page} of {len(raw)} lines ---")
            out.extend(f"  {_short(ln)!r}" for ln in raw[:rows_per_page])
    finally:
        doc.close()

    ex = extract_pdf(data)
    keys = [r for r in ex.rows if KEY_RE.match(r.text)]
    out.append(f"\nparser rows: {len(ex.rows)}   rows that start like a question number: {len(keys)}")
    shown = [r for r in ex.rows if first <= r.page - 1 < first + pages] if start_page > 1 else ex.rows[:30]
    for r in shown[:60]:
        out.append(f"  p{r.page} x={r.x0:5.0f}/{r.page_width:.0f}  {_short(r.text)!r}")
    if keys:
        out.append("first question-number rows overall:")
        out.extend(f"  p{r.page} x={r.x0:5.0f}  {_short(r.text)!r}" for r in keys[:12])
        in_range = [r for r in keys if first <= r.page - 1 < first + pages]
        if start_page > 1:
            out.append(f"question-number rows on the requested pages ({start_page}-{first + pages}):")
            out.extend(f"  p{r.page} x={r.x0:5.0f}  {_short(r.text)!r}" for r in in_range[:40])
    return "\n".join(out)


def latest_cached(cache_dir: Path, count: int = 2) -> list[Path]:
    files = sorted((Path(cache_dir) / "downloads").glob("*.bin"), key=lambda p: p.stat().st_mtime, reverse=True)
    return files[:count]
