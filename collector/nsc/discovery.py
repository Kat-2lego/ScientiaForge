"""Find NSC exam pages on the DBE site and pair every question paper with its memo."""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Iterable, Optional
from urllib.parse import parse_qs, unquote, urljoin, urlparse

from bs4 import BeautifulSoup

from .subjects import ParsedTitle, parse_title

log = logging.getLogger("nsc")


# --------------------------------------------------------------------------- #
# Data classes
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class ExamPage:
    year: int
    session: str
    url: str
    label: str


@dataclass(frozen=True)
class DocLink:
    heading: str
    title: str
    url: str


@dataclass
class PaperCandidate:
    year: int
    session: str
    grade: int
    subject: str
    paper_number: int
    language: str
    qp: DocLink
    memo: Optional[DocLink]
    page_url: str

    @property
    def key(self) -> tuple:
        return (self.year, self.session, self.grade, self.subject, self.paper_number, self.language)

    @property
    def label(self) -> str:
        return f"{self.subject} Paper {self.paper_number} — {self.session} {self.year}"


# --------------------------------------------------------------------------- #
# Session / year helpers
# --------------------------------------------------------------------------- #
def normalise_session(text: str) -> Optional[str]:
    t = (text or "").lower()
    if re.search(r"\bnov|oct\s*/\s*nov|november", t):
        return "November"
    if re.search(r"may|june", t):
        return "May/June"
    if re.search(r"feb|march|supplementary", t):
        return "Feb/March"
    return None


def _resolve_linkclick(href: str, base_url: str) -> str:
    """DNN wraps outgoing links as LinkClick.aspx?link=<encoded-url>; unwrap when possible."""
    absolute = urljoin(base_url, href)
    parsed = urlparse(absolute)
    if parsed.path.lower().endswith("linkclick.aspx"):
        link = parse_qs(parsed.query).get("link", [""])[0]
        link = unquote(link).strip()
        if link.lower().startswith("http"):
            return link
    return absolute


# --------------------------------------------------------------------------- #
# Index page -> exam pages
# --------------------------------------------------------------------------- #
_EXAM_LINK_RE = re.compile(r"^\s*(20\d{2})\b(?P<rest>.*)$")
_EXAM_WORDS_RE = re.compile(r"exam|paper", re.I)
_EXAM_EXCLUDE_RE = re.compile(r"timetable|result|exemplar|common paper|remark|guideline|tips", re.I)


def parse_index_page(html: str, base_url: str) -> list[ExamPage]:
    soup = BeautifulSoup(html, "html.parser")
    pages: dict[tuple[int, str], ExamPage] = {}
    for a in soup.find_all("a", href=True):
        text = re.sub(r"\s+", " ", a.get_text(" ")).strip()
        m = _EXAM_LINK_RE.match(text)
        if not m or not _EXAM_WORDS_RE.search(text) or _EXAM_EXCLUDE_RE.search(text):
            continue
        session = normalise_session(m.group("rest"))
        if not session:
            continue
        year = int(m.group(1))
        url = _resolve_linkclick(a["href"], base_url)
        pages.setdefault((year, session), ExamPage(year, session, url, text))
    return sorted(pages.values(), key=lambda p: (-p.year, p.session))


# --------------------------------------------------------------------------- #
# Exam page -> document links
# --------------------------------------------------------------------------- #
_GROUP_HEADINGS = {"languages", "non languages", "non-languages", "nonlanguages"}


_HEADING_TAGS = ("h1", "h2", "h3", "h4", "h5", "h6")


def _is_heading(el) -> bool:
    """Subject headings are <h2>s on the DBE pages, but DNN module titles can also
    be <span class="Head"> or an element whose id ends in "titleLabel"."""
    if el.name in _HEADING_TAGS:
        return True
    classes = " ".join(el.get("class") or [])
    return (el.name in ("span", "div", "caption", "legend") and bool(re.search(r"\bHead\b|dnnTitle|ModuleTitle", classes))) or (
        (el.get("id") or "").endswith("titleLabel")
    )


def parse_exam_page(html: str, page_url: str) -> list[DocLink]:
    """Walk the whole page in document order, remembering the latest subject heading.

    No container id is assumed: DNN puts the paper tables in different panes on
    different pages, and menus/footers never contain LinkClick file tickets anyway.
    """
    soup = BeautifulSoup(html, "html.parser")
    heading: Optional[str] = None
    seen: set[tuple[str, str]] = set()
    links: list[DocLink] = []

    for el in soup.find_all(True):
        if el.name == "a":
            href = el.get("href") or ""
            low = href.lower()
            if "linkclick.aspx" not in low or "fileticket=" not in low or not heading:
                continue
            if "forcedownload" in low:
                continue  # same file as the title link next to it
            title = re.sub(r"\s+", " ", el.get_text(" ")).strip()
            if not title or title.lower() == "download":
                continue
            if (heading, title) in seen:
                continue
            seen.add((heading, title))
            links.append(DocLink(heading=heading, title=title, url=urljoin(page_url, href)))
        elif _is_heading(el):
            text = re.sub(r"\s+", " ", el.get_text(" ")).strip()
            if not text or len(text) > 80:
                continue
            heading = None if text.lower() in _GROUP_HEADINGS else text
    return links


def describe_page(html: str) -> str:
    """One line for the log when a page yields nothing: what did we actually get?"""
    soup = BeautifulSoup(html or "", "html.parser")
    title = re.sub(r"\s+", " ", soup.title.get_text(" ")).strip() if soup.title else "(no <title>)"
    low = (html or "").lower()
    return (
        f"page title {title!r}, {len(html or ''):,} characters, "
        f"{low.count('fileticket=')} fileticket mentions, {len(soup.find_all(_HEADING_TAGS))} headings"
    )


# --------------------------------------------------------------------------- #
# Document links -> paper candidates
# --------------------------------------------------------------------------- #
_LANG_PREF = {"English": 0, "Both": 1, None: 2, "Afrikaans": 9}


def build_candidates(
    links: Iterable[DocLink],
    year: int,
    session: str,
    page_url: str,
    languages_mode: str = "english",
    grade: int = 12,
) -> list[PaperCandidate]:
    """Pair papers with memos. languages_mode: none | english | all."""
    grouped: dict[tuple[str, int], dict[str, list[tuple[ParsedTitle, DocLink]]]] = {}

    for link in links:
        parsed = parse_title(link.heading, link.title)
        if parsed.skip_reason:
            log.debug("Skipping %s / %s (%s)", link.heading, link.title, parsed.skip_reason)
            continue
        if parsed.kind not in ("paper", "memo"):
            continue
        if parsed.province:  # provincial SAL papers: not national, skip
            continue
        if parsed.is_language_subject:
            if languages_mode == "none":
                continue
            if languages_mode == "english" and not parsed.subject.startswith("English"):
                continue
        elif parsed.doc_language == "Afrikaans":
            continue

        slot = grouped.setdefault((parsed.subject, parsed.paper_number), {"paper": [], "memo": []})
        slot[parsed.kind].append((parsed, link))

    candidates: list[PaperCandidate] = []
    for (subject, number), docs in sorted(grouped.items()):
        if not docs["paper"]:
            log.debug("Memo without a paper: %s P%s", subject, number)
            continue
        docs["paper"].sort(key=lambda d: _LANG_PREF.get(d[0].doc_language, 5))
        docs["memo"].sort(key=lambda d: _LANG_PREF.get(d[0].doc_language, 5))
        qp = docs["paper"][0][1]
        memo = docs["memo"][0][1] if docs["memo"] else None
        candidates.append(
            PaperCandidate(
                year=year,
                session=session,
                grade=grade,
                subject=subject,
                paper_number=number,
                language="English",
                qp=qp,
                memo=memo,
                page_url=page_url,
            )
        )
    return candidates


def page_meta_from_html(html: str) -> tuple[Optional[int], Optional[str]]:
    """Fallback for --source-url: read year/session from the page <title>."""
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(" ") if soup.title else ""
    m = re.search(r"(20\d{2})", title)
    return (int(m.group(1)) if m else None, normalise_session(title))
