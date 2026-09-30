"""Extract text from NSC PDFs as visual *rows*.

NSC papers are laid out in columns: question number | text | marks.
PyMuPDF returns those as separate lines, so we merge lines that sit on the
same visual row (vertical overlap) and read them left to right:

    "1.1"  "Which ONE of the following ...?"  "(2)"
      ->  "1.1 Which ONE of the following ...?  (2)"

Superscripts become Unicode (x², 10⁻³), Wingdings ticks become ✓ and
Symbol-font private-use characters are mapped back to real symbols.
"""
from __future__ import annotations

import hashlib
import re
from collections import defaultdict
from dataclasses import dataclass

import pymupdf

TICK = "✓"

_SUPERSCRIPT = str.maketrans("0123456789+-−=()n", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾ⁿ")
_SUPERSCRIPTABLE = set("0123456789+-−=()n ")

# Symbol font glyphs that arrive as U+F0xx (private use area).
_SYMBOL_PUA = {
    0x61: "α", 0x62: "β", 0x63: "χ", 0x64: "δ", 0x44: "Δ", 0x65: "ε", 0x66: "φ",
    0x67: "γ", 0x6C: "λ", 0x6D: "μ", 0x70: "π", 0x71: "θ", 0x72: "ρ", 0x73: "σ",
    0x53: "Σ", 0x74: "τ", 0x77: "ω", 0x57: "Ω", 0xB4: "×", 0xB0: "°", 0xB1: "±",
    0xA3: "≤", 0xB3: "≥", 0xB9: "≠", 0xBB: "≈", 0xD6: "√", 0xAE: "→", 0xDE: "⇒",
    0x2D: "−", 0xB7: "•", 0xA5: "∞", 0x2B: "+", 0x3D: "=", 0xBA: "≡", 0xA2: "′",
}
# Unambiguous tick glyphs in the private-use area (Wingdings 0xFC / 0xFE).
_TICK_CHARS = {"\uf0fc", "\uf0fe"}
# Inside Wingdings / Wingdings 2 fonts: ü, þ (Wingdings) and P, R (Wingdings 2) draw ticks.
_WINGDING_TICKS = {"ü", "þ", "P", "R", "\uf0fc", "\uf0fe", "\uf050", "\uf052"}


@dataclass
class Row:
    page: int
    text: str
    y0: float
    y1: float
    x0: float
    page_height: float
    page_width: float = 595.0


@dataclass
class ExtractedPdf:
    rows: list[Row]
    page_count: int
    first_pages_text: str
    sha256: str


def _clean_char_stream(text: str, font: str) -> str:
    font_l = (font or "").lower()
    if "wingding" in font_l:
        return TICK if any(c in _WINGDING_TICKS for c in text) else ""
    if "dingbat" in font_l or "zapf" in font_l:
        # ZapfDingbats: "3"/"4" (and their Unicode forms) are check marks
        return TICK * sum(1 for c in text if c in "34✓✔") if any(c in "34✓✔" for c in text) else ""
    out = []
    for ch in text:
        cp = ord(ch)
        if ch in _TICK_CHARS:
            out.append(TICK)
        elif 0xF000 <= cp <= 0xF0FF:
            mapped = _SYMBOL_PUA.get(cp - 0xF000)
            if mapped:
                out.append(mapped)
            elif "symbol" not in font_l:
                out.append(chr(cp - 0xF000) if 0x20 <= cp - 0xF000 < 0x7F else "")
        elif 0xE000 <= cp <= 0xF8FF:
            continue  # other private-use glyphs carry no meaning for us
        elif ch in "\u00ad\u200b\ufeff":
            continue
        else:
            out.append(ch)
    return "".join(out)


def _render_spans(spans: list[dict]) -> str:
    parts: list[str] = []
    prev_x1 = None
    for span in spans:
        raw = span.get("text", "")
        text = _clean_char_stream(raw, span.get("font", ""))
        if not text:
            continue
        is_super = bool(span.get("flags", 0) & 1)
        if is_super and text.strip():
            stripped = text.strip()
            if set(stripped) <= _SUPERSCRIPTABLE:
                text = stripped.translate(_SUPERSCRIPT).replace(" ", "")
            else:
                text = "^" + stripped
        x0, _, x1, _ = span["bbox"]
        size = span.get("size", 10) or 10
        if prev_x1 is not None and parts:
            gap = x0 - prev_x1
            if gap > 12 and not is_super:
                parts.append("  ")  # a column gap inside one PDF line
            elif gap > size * 0.18 and not parts[-1].endswith(" ") and not text.startswith(" ") and not is_super:
                parts.append(" ")
        parts.append(text)
        prev_x1 = x1
    return "".join(parts)


def _cluster_rows(
    lines: list[tuple[float, float, float, float, str]], page: int, height: float, width: float = 595.0
) -> list[Row]:
    lines.sort(key=lambda l: ((l[1] + l[3]) / 2, l[0]))
    rows: list[list[tuple]] = []
    bounds: list[list[float]] = []
    for line in lines:
        x0, y0, x1, y1, text = line
        h = max(1.0, y1 - y0)
        placed = False
        for idx in range(len(rows) - 1, max(-1, len(rows) - 4), -1):
            ry0, ry1 = bounds[idx]
            overlap = min(y1, ry1) - max(y0, ry0)
            if overlap >= 0.5 * min(h, max(1.0, ry1 - ry0)):
                rows[idx].append(line)
                bounds[idx] = [min(ry0, y0), max(ry1, y1)]
                placed = True
                break
        if not placed:
            rows.append([line])
            bounds.append([y0, y1])

    result: list[Row] = []
    for items, (ry0, ry1) in zip(rows, bounds):
        items.sort(key=lambda l: l[0])
        text_parts: list[str] = []
        prev_x1 = None
        for x0, _, x1, _, t in items:
            if prev_x1 is not None:
                text_parts.append("  " if x0 - prev_x1 > 12 else " ")
            text_parts.append(t.strip())
            prev_x1 = x1
        text = "".join(text_parts).strip()
        if text:
            result.append(Row(page=page, text=text, y0=ry0, y1=ry1, x0=items[0][0], page_height=height, page_width=width))
    return result


_BOILERPLATE_RE = re.compile(
    r"copyright\s+reserved|please\s+turn\s+over|kopiereg\s+voorbehou|blaai\s+om",
    re.I,
)
_PAGE_NUMBER_RE = re.compile(r"^\s*(page\s*)?\d{1,3}\s*(of\s*\d{1,3})?\s*$", re.I)


def _signature(text: str) -> str:
    return re.sub(r"\d+", "#", re.sub(r"\s+", " ", text.strip().lower()))


def _remove_boilerplate(rows: list[Row], page_count: int) -> list[Row]:
    """Drop running headers/footers: rows near the top/bottom edge that repeat on many pages."""

    def in_margin(r: Row) -> bool:
        return r.y1 < r.page_height * 0.12 or r.y0 > r.page_height * 0.88

    pages_by_sig: dict[str, set[int]] = defaultdict(set)
    for r in rows:
        if in_margin(r):
            pages_by_sig[_signature(r.text)].add(r.page)
    threshold = max(3, int(page_count * 0.4))
    repeating = {sig for sig, pages in pages_by_sig.items() if len(pages) >= threshold}

    kept = []
    for r in rows:
        if _BOILERPLATE_RE.search(r.text):
            cleaned = _BOILERPLATE_RE.sub("", r.text).strip()
            if not cleaned:
                continue
            r = Row(r.page, cleaned, r.y0, r.y1, r.x0, r.page_height, r.page_width)
        if in_margin(r):
            if _signature(r.text) in repeating or _PAGE_NUMBER_RE.match(r.text):
                continue
        kept.append(r)
    return kept


def extract_pdf(data: bytes) -> ExtractedPdf:
    if b"%PDF" not in data[:1024]:
        raise ValueError("Not a PDF file")
    doc = pymupdf.open(stream=data, filetype="pdf")
    try:
        rows: list[Row] = []
        first_pages: list[str] = []
        for page_index, page in enumerate(doc, start=1):
            info = page.get_text("dict")
            lines = []
            for block in info.get("blocks", []):
                if block.get("type") != 0:
                    continue
                for line in block.get("lines", []):
                    direction = line.get("dir", (1, 0))
                    if abs(direction[1]) > 0.2:  # rotated margin text
                        continue
                    text = _render_spans(line.get("spans", []))
                    if text.strip():
                        x0, y0, x1, y1 = line["bbox"]
                        lines.append((x0, y0, x1, y1, text))
            page_rows = _cluster_rows(lines, page_index, page.rect.height, page.rect.width)
            rows.extend(page_rows)
            if page_index <= 2:
                first_pages.append(" ".join(r.text for r in page_rows))
        page_count = doc.page_count
    finally:
        doc.close()

    rows = _remove_boilerplate(rows, page_count)
    return ExtractedPdf(
        rows=rows,
        page_count=page_count,
        first_pages_text="\n".join(first_pages),
        sha256=hashlib.sha256(data).hexdigest(),
    )
