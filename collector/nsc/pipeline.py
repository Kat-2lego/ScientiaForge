"""The collection pipeline, one paper at a time.

    discover -> skip if already stored -> download QP + memo -> validate
    -> extract -> parse questions -> parse memo -> classify -> upload -> ingest

A failure in one paper is logged (logs/failures.jsonl) and the run moves on.
Nothing is written to the database for a failed paper, so the next run
simply tries it again.
"""
from __future__ import annotations

import json
import logging
import re
import traceback
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .classify import classify
from .config import (
    DBE_INDEX_URL,
    EXTRACTOR_VERSION,
    MIN_RECALL_QUESTIONS,
    SEED_EXAM_PAGES,
    Settings,
)
from .discovery import (
    describe_page,
    ExamPage,
    PaperCandidate,
    build_candidates,
    page_meta_from_html,
    parse_exam_page,
    parse_index_page,
)
from .fetcher import DownloadError, PoliteSession
from .memo_parser import MemoAnswer, looks_like_memo, parse_memo
from .paper_parser import ParsedPaper, parse_question_paper
from .pdf_text import ExtractedPdf, extract_pdf
from .storage import SupabaseClient, storage_paths
from .subjects import cover_subject_names, expected_cover_name

log = logging.getLogger("nsc")


class DataError(RuntimeError):
    """The source document is not what the DBE page says it is."""


# --------------------------------------------------------------------------- #
# Options / results
# --------------------------------------------------------------------------- #
@dataclass
class RunOptions:
    years: Optional[set[int]] = None
    since: int = 2020
    sessions: tuple[str, ...] = ("November", "May/June")
    subjects: list[str] = field(default_factory=list)  # case-insensitive substrings
    papers: Optional[set[int]] = None
    limit: Optional[int] = None
    dry_run: bool = False
    no_upload: bool = False
    save_json: bool = False
    reparse: bool = False
    reparse_outdated: bool = False
    languages: str = "english"
    subject_check: bool = True
    source_url: Optional[str] = None
    source_year: Optional[int] = None
    source_session: Optional[str] = None


@dataclass
class PaperResult:
    label: str
    status: str  # ready | partial | failed | skipped | planned
    detail: str = ""


@dataclass
class RunSummary:
    exam_pages: int = 0
    discovered: int = 0
    results: list[PaperResult] = field(default_factory=list)

    def count(self, status: str) -> int:
        return sum(1 for r in self.results if r.status == status)


# --------------------------------------------------------------------------- #
# Validation helpers
# --------------------------------------------------------------------------- #
def ensure_pdf(data: bytes, what: str) -> None:
    if data[:4] == b"PK\x03\x04":
        raise DataError(f"The {what} is a ZIP archive, not a PDF")
    head = data[:1024].lstrip()
    if not head.startswith(b"%PDF"):
        if head[:15].lower().startswith((b"<!doctype", b"<html")):
            raise DataError(f"The {what} link returned a web page instead of a PDF")
        raise DataError(f"The {what} is not a PDF file")


def detect_cover_subject(first_page_text: str) -> Optional[str]:
    """Longest known subject name printed on the cover page, if any."""
    text = re.sub(r"\s+", " ", (first_page_text or "").upper())
    text = text.replace("&", "AND")
    for name in cover_subject_names():  # longest first
        if re.search(rf"(?<![A-Z]){re.escape(name)}(?![A-Z])", text):
            return name
    return None


def check_cover(extracted: ExtractedPdf, subject: str, what: str) -> Optional[str]:
    """Raise if the cover names a different subject; return a note when it can't be checked."""
    expected = expected_cover_name(subject)
    first_page = extracted.first_pages_text.split("\n")[0]
    found = detect_cover_subject(first_page)
    if found is None:
        return f"{what} cover subject not found (not checked)"
    if expected not in cover_subject_names():
        return None
    if found != expected:
        raise DataError(f"The {what} cover says {found!r}, expected {expected!r} (DBE link error?)")
    return None


def _safe_name(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_")


# --------------------------------------------------------------------------- #
# The collector
# --------------------------------------------------------------------------- #
class Collector:
    def __init__(self, settings: Settings, options: RunOptions, client: Optional[SupabaseClient] = None):
        self.settings = settings
        self.opts = options
        self.client = client
        self.web = PoliteSession(settings.user_agent, settings.request_delay, settings.cache_dir)
        self.failures_path = settings.log_dir / "failures.jsonl"
        self.settings.log_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ #
    # Discovery
    # ------------------------------------------------------------------ #
    def exam_pages(self) -> list[ExamPage]:
        if self.opts.source_url:
            return [self._single_source_page()]

        log.info("Searching for papers on the DBE website...")
        pages: list[ExamPage] = []
        try:
            final_url, html = self.web.get_html(DBE_INDEX_URL)
            pages = parse_index_page(html, final_url)
        except Exception as exc:  # network trouble, layout change...
            log.warning("Could not read the DBE index page (%s); using the built-in list", exc)
        if not pages:
            log.warning("No exam pages found on the index page; using the built-in list")
            pages = [ExamPage(y, s, u, f"{y} {s} NSC Examination Papers") for y, s, u in SEED_EXAM_PAGES]

        selected = [p for p in pages if self._wants(p)]
        log.info("Exam pages selected: %s", ", ".join(f"{p.session} {p.year}" for p in selected) or "none")
        return selected

    def _single_source_page(self) -> ExamPage:
        year, session = self.opts.source_year, self.opts.source_session
        if not (year and session):
            _, html = self.web.get_html(self.opts.source_url)
            page_year, page_session = page_meta_from_html(html)
            year = year or page_year
            session = session or page_session
        if not (year and session):
            raise SystemExit("Could not tell the year/session of --source-url; pass --year and --session too")
        return ExamPage(int(year), session, self.opts.source_url, "custom source")

    def _wants(self, page: ExamPage) -> bool:
        if self.opts.years is not None:
            if page.year not in self.opts.years:
                return False
        elif page.year < self.opts.since:
            return False
        return page.session in self.opts.sessions

    @staticmethod
    def _why_no_questions(qp) -> str:
        chars = sum(len(r.text) for r in qp.rows)
        per_page = chars / max(1, qp.page_count)
        if per_page < 150:
            return (f"the PDF has almost no text ({chars} characters on {qp.page_count} pages): it looks like a scan. "
                    "Run: python collector.py --inspect latest")
        return ("the PDF has text but no question numbers were recognised. "
                "Run: python collector.py --inspect latest   and share the output")

    def _explain_empty_page(self, page: ExamPage, url: str, html: str) -> None:
        """Nothing found: keep the HTML so the cause can be seen, and say what came back."""
        try:
            self.settings.log_dir.mkdir(parents=True, exist_ok=True)
            dump = self.settings.log_dir / f"empty_page_{page.year}_{page.session.replace('/', '-')}.html"
            dump.write_text(html or "", encoding="utf-8")
            where = f"saved to {dump}"
        except OSError:
            where = "could not be saved"
        log.warning("No document links found on %s (%s)", url, describe_page(html))
        log.warning("The page HTML %s. If it isn't the list of papers, the DBE site is blocking or changed.", where)

    def candidates_for(self, page: ExamPage) -> list[PaperCandidate]:
        final_url, html = self.web.get_html(page.url)
        links = parse_exam_page(html, final_url)
        if not links:
            self._explain_empty_page(page, final_url, html)
        found = build_candidates(links, page.year, page.session, final_url, self.opts.languages)
        if self.opts.subjects:
            wanted = [s.lower() for s in self.opts.subjects]
            found = [c for c in found if any(w in c.subject.lower() for w in wanted)]
        if self.opts.papers:
            found = [c for c in found if c.paper_number in self.opts.papers]
        log.info("%s %s: %d papers listed (%d document links)", page.session, page.year, len(found), len(links))
        return found

    # ------------------------------------------------------------------ #
    # Run
    # ------------------------------------------------------------------ #
    def run(self) -> RunSummary:
        summary = RunSummary()
        existing: dict[tuple, dict] = {}
        if self.client:
            existing = self.client.existing_papers()
            log.info("Supabase already has %d papers", len(existing))
            if not (self.opts.dry_run or self.opts.no_upload):
                self.client.check_bucket()

        pages = self.exam_pages()
        summary.exam_pages = len(pages)
        processed = 0

        for page in pages:
            try:
                candidates = self.candidates_for(page)
            except Exception as exc:
                log.error("Could not read %s %s (%s): %s", page.session, page.year, page.url, exc)
                self._record_failure(f"{page.session} {page.year} exam page", page.url, None, exc)
                summary.results.append(PaperResult(f"{page.session} {page.year} exam page", "failed", str(exc)))
                continue

            for cand in candidates:
                summary.discovered += 1
                log.info("Found %s", cand.label)
                row = existing.get(cand.key)
                if row and not self._should_reprocess(row):
                    log.info("Already in Supabase, skipping")
                    summary.results.append(PaperResult(cand.label, "skipped", "already stored"))
                    continue
                if self.opts.limit is not None and processed >= self.opts.limit:
                    continue
                processed += 1

                if self.opts.dry_run:
                    memo = "with memo" if cand.memo else "NO memo listed"
                    log.info("Would process (%s): %s", memo, cand.qp.url)
                    summary.results.append(PaperResult(cand.label, "planned", memo))
                    continue

                try:
                    result = self.process(cand)
                except Exception as exc:  # one bad paper must never stop the run
                    log.error("FAILED %s: %s", cand.label, exc)
                    log.debug("%s", traceback.format_exc())
                    self._record_failure(cand.label, cand.qp.url, cand.memo.url if cand.memo else None, exc)
                    result = PaperResult(cand.label, "failed", str(exc))
                summary.results.append(result)
        return summary

    def _should_reprocess(self, row: dict) -> bool:
        if self.opts.reparse:
            return True
        if self.opts.reparse_outdated and row.get("extractor_version") != EXTRACTOR_VERSION:
            return True
        return row.get("processing_status") in ("failed", "pending")

    # ------------------------------------------------------------------ #
    # One paper
    # ------------------------------------------------------------------ #
    def process(self, cand: PaperCandidate) -> PaperResult:
        notes: list[str] = []

        log.info("Downloading question paper...")
        qp_bytes = self.web.download(cand.qp.url)
        ensure_pdf(qp_bytes, "question paper")
        qp = extract_pdf(qp_bytes)
        if looks_like_memo(qp.first_pages_text.split("\n")[0]):
            raise DataError("The question-paper link points to a marking guideline")
        if self.opts.subject_check:
            note = check_cover(qp, cand.subject, "question paper")
            if note:
                notes.append(note)

        memo_bytes: Optional[bytes] = None
        memo: Optional[ExtractedPdf] = None
        if cand.memo:
            log.info("Downloading memorandum...")
            try:
                memo_bytes = self.web.download(cand.memo.url)
                ensure_pdf(memo_bytes, "memorandum")
                memo = extract_pdf(memo_bytes)
                if memo.sha256 == qp.sha256:
                    raise DataError("The memo link returns the question paper itself")
                if not looks_like_memo(memo.first_pages_text):
                    raise DataError("The memo document does not look like a marking guideline")
                if self.opts.subject_check:
                    note = check_cover(memo, cand.subject, "memorandum")
                    if note:
                        notes.append(note)
            except (DataError, DownloadError, ValueError) as exc:
                # Keep the question paper; it's still useful for download.
                log.warning("Memo not usable: %s", exc)
                notes.append(f"memo not usable: {exc}")
                memo_bytes, memo = None, None
        else:
            notes.append("no memo listed on the DBE page")

        log.info("Extracting questions...")
        paper = parse_question_paper(qp.rows, qp.first_pages_text)
        notes.extend(paper.warnings[:5])
        log.info("Found %d questions (%d numbered items)", len(paper.questions), len(paper.all_keys))
        if not paper.questions:
            why = self._why_no_questions(qp)
            log.warning("No questions extracted: %s", why)
            notes.append(f"no questions extracted: {why}")

        answers: dict[str, MemoAnswer] = {}
        if memo:
            log.info("Matching memorandum answers...")
            answers = parse_memo(memo.rows, paper.all_keys, cand.subject)
            matched = sum(1 for q in paper.questions if q.number in answers and answers[q.number].text)
            log.info("Matched %d of %d questions to memo answers", matched, len(paper.questions))

        payload_questions, stats = self._build_questions(paper, answers)
        status = "ready"
        if not memo:
            status = "partial"
        elif stats["recall"] < MIN_RECALL_QUESTIONS:
            status = "partial"
            notes.append(f"only {stats['recall']} questions suitable for Active Recall")
        if status == "partial":
            # No Active Recall without a trustworthy memo / enough questions.
            for q in payload_questions:
                q["is_recall_suitable"] = False

        qp_path, memo_path = storage_paths(
            cand.year, cand.session, cand.subject, cand.paper_number, cand.grade, cand.language
        )
        paper_payload = {
            "year": cand.year,
            "exam_session": cand.session,
            "grade": cand.grade,
            "subject": cand.subject,
            "paper_number": cand.paper_number,
            "language": cand.language,
            "paper_title": f"{cand.subject} Paper {cand.paper_number}",
            "question_paper_storage_path": qp_path,
            "memorandum_storage_path": memo_path if memo_bytes else None,
            "source_url": cand.qp.url,
            "memo_source_url": cand.memo.url if cand.memo else None,
            "question_paper_sha256": qp.sha256,
            "memorandum_sha256": memo.sha256 if memo else None,
            "page_count": qp.page_count,
            "memo_page_count": memo.page_count if memo else None,
            "total_marks": paper.total_marks,
            "processing_status": status,
            "processing_notes": self._notes_text(stats, notes),
            "extractor_version": EXTRACTOR_VERSION,
        }

        if self.opts.save_json or self.opts.no_upload:
            self._save_json(cand, paper_payload, payload_questions)

        if self.opts.no_upload or not self.client:
            log.info("Not uploading (--no-upload / no Supabase credentials)")
        else:
            log.info("Uploading files to Supabase...")
            self.client.upload(qp_path, qp_bytes)
            if memo_bytes:
                self.client.upload(memo_path, memo_bytes)
            log.info("Saving database records...")
            db_questions = [{k: v for k, v in q.items() if not k.startswith("_")} for q in payload_questions]
            paper_id = self.client.rpc("nsc_ingest_paper", {"p_paper": paper_payload, "p_questions": db_questions})
            log.debug("Stored as paper id %s", paper_id)

        detail = f"{stats['questions']} questions, {stats['matched']} with memo, {stats['recall']} for Active Recall"
        log.info("Completed %s (%s: %s)", cand.label, status, detail)
        return PaperResult(cand.label, status, detail)

    def _build_questions(self, paper: ParsedPaper, answers: dict[str, MemoAnswer]):
        out: list[dict] = []
        stats = {"questions": 0, "matched": 0, "recall": 0, "auto": 0}
        for q in paper.questions:
            memo = answers.get(q.number)
            if memo is not None and not memo.text:
                memo = None
            c = classify(q, memo)
            stats["questions"] += 1
            stats["matched"] += 1 if memo else 0
            stats["recall"] += 1 if c.is_recall_suitable else 0
            stats["auto"] += 1 if c.is_recall_suitable and c.is_auto_markable else 0
            marks = q.marks if q.marks is not None else (memo.marks if memo else None)
            item = {
                "question_number": q.number,
                "sort_key": list(q.key),
                "top_question": q.top_question,
                "section": q.section,
                "context_text": c.context_text if c.context_changed else q.context,
                "question_text": q.text,
                "question_type": c.question_type,
                "options": c.options if c.options is not None else q.options,
                "marks": marks if marks is None or 0 <= marks <= 100 else None,
                "page_number": q.page,
                "has_figure": c.has_figure,
                "is_auto_markable": c.is_auto_markable,
                "is_recall_suitable": c.is_recall_suitable,
                "memo": None,
                "_reasons": c.reasons,  # QA output only, never sent to the database
            }
            if memo:
                item["memo"] = {
                    "answer_text": memo.text[:4000],
                    "accepted_answer": c.accepted_answer,
                    "accepted_alternatives": c.alternatives,
                    "keywords": c.keywords,
                    "answer_format": c.answer_format,
                    "marks": marks if marks is not None else memo.marks,
                    "memo_page_number": memo.page,
                }
            out.append(item)
        return out, stats

    @staticmethod
    def _notes_text(stats: dict, notes: list[str]) -> str:
        head = (
            f"{stats['questions']} questions extracted; {stats['matched']} matched to memo answers; "
            f"{stats['recall']} suitable for Active Recall ({stats['auto']} auto-marked)"
        )
        extra = "; ".join(dict.fromkeys(n for n in notes if n))
        return f"{head}. {extra}".strip(" .")[:2000]

    # ------------------------------------------------------------------ #
    # Output helpers
    # ------------------------------------------------------------------ #
    def _save_json(self, cand: PaperCandidate, paper: dict, questions: list[dict]) -> None:
        out_dir = self.settings.out_dir
        out_dir.mkdir(parents=True, exist_ok=True)
        name = _safe_name(f"{cand.year}_{cand.session}_{cand.subject}_P{cand.paper_number}") + ".json"
        path = out_dir / name
        path.write_text(json.dumps({"paper": paper, "questions": questions}, indent=2, ensure_ascii=False), "utf-8")
        log.info("Wrote %s", path)

    def _record_failure(self, label: str, url: str, memo_url: Optional[str], exc: Exception) -> None:
        entry = {
            "time": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "paper": label,
            "question_paper_url": url,
            "memo_url": memo_url,
            "error_type": type(exc).__name__,
            "error": str(exc),
            "extractor_version": EXTRACTOR_VERSION,
        }
        with self.failures_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


def process_local_files(qp_path: Path, memo_path: Optional[Path], subject: str) -> dict:
    """Parse local PDFs without touching the network or Supabase (used by --local)."""
    qp = extract_pdf(qp_path.read_bytes())
    paper = parse_question_paper(qp.rows, qp.first_pages_text)
    answers = {}
    if memo_path:
        memo = extract_pdf(memo_path.read_bytes())
        answers = parse_memo(memo.rows, paper.all_keys, subject)
    dummy = Collector.__new__(Collector)
    questions, stats = Collector._build_questions(dummy, paper, answers)
    return {"total_marks": paper.total_marks, "warnings": paper.warnings, "stats": stats, "questions": questions}


__all__ = [
    "Collector",
    "DataError",
    "PaperResult",
    "RunOptions",
    "RunSummary",
    "check_cover",
    "detect_cover_subject",
    "ensure_pdf",
    "process_local_files",
]
