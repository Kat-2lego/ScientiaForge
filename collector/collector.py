#!/usr/bin/env python3
"""SkillForge · NSC past-paper collector.

Finds Grade 12 NSC question papers + memos on the DBE website, stores the
PDFs in Supabase Storage and the extracted questions / memo answers in
Supabase Postgres. Safe to run repeatedly: papers already stored are skipped.

Examples
  python collector.py                         # everything new since 2020 (Nov + May/June)
  python collector.py --dry-run               # list what would be processed, download nothing
  python collector.py --years 2024 --subjects mathematics "physical sciences"
  python collector.py --years 2024 --subjects mathematics --no-upload   # parse only, JSON to out/
  python collector.py --reparse-outdated      # re-extract papers parsed by an older extractor
  python collector.py --local qp.pdf memo.pdf --subject Mathematics      # test the parser offline
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from nsc.config import DEFAULT_SESSIONS, DEFAULT_SINCE_YEAR, EXTRACTOR_VERSION, load_settings
from nsc.discovery import normalise_session
from nsc.pipeline import Collector, RunOptions, process_local_files
from nsc.storage import SupabaseClient, SupabaseError

log = logging.getLogger("nsc")


def setup_logging(log_dir: Path, verbose: bool) -> None:
    log_dir.mkdir(parents=True, exist_ok=True)
    log.setLevel(logging.DEBUG)
    log.handlers.clear()

    console = logging.StreamHandler(sys.stdout)
    console.setLevel(logging.DEBUG if verbose else logging.INFO)
    console.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
    log.addHandler(console)

    file_handler = logging.FileHandler(log_dir / "collector.log", encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    log.addHandler(file_handler)


def parse_args(argv: list[str]) -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description="Collect NSC past papers + memos into Supabase.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("Examples", 1)[1] if "Examples" in __doc__ else None,
    )
    ap.add_argument("--years", type=int, nargs="+", help="only these exam years, e.g. --years 2023 2024")
    ap.add_argument("--since", type=int, default=DEFAULT_SINCE_YEAR, help=f"earliest year (default {DEFAULT_SINCE_YEAR})")
    ap.add_argument(
        "--sessions", nargs="+", default=list(DEFAULT_SESSIONS),
        help='exam sessions: November, "May/June", "Feb/March" (default: November May/June)',
    )
    ap.add_argument("--subjects", nargs="+", default=[], help='subject filter (substring), e.g. mathematics "life sciences"')
    ap.add_argument("--papers", type=int, nargs="+", help="only these paper numbers, e.g. --papers 1")
    ap.add_argument("--limit", type=int, help="process at most N papers this run")
    ap.add_argument("--languages", choices=("none", "english", "all"), default="english",
                    help="language subjects to include (default: english = English HL/FAL only)")
    ap.add_argument("--dry-run", action="store_true", help="discover and list papers; download nothing")
    ap.add_argument("--no-upload", action="store_true", help="download + parse, write JSON to out/, don't touch Supabase")
    ap.add_argument("--save-json", action="store_true", help="also write the extracted data to out/ for checking")
    ap.add_argument("--reparse", action="store_true", help="re-process papers even if already stored")
    ap.add_argument("--reparse-outdated", action="store_true",
                    help=f"re-process papers stored by an older extractor (current {EXTRACTOR_VERSION})")
    ap.add_argument("--no-subject-check", action="store_true", help="don't compare the PDF cover with the subject")
    ap.add_argument("--source-url", help="use one exam page instead of discovering them")
    ap.add_argument("--year", type=int, help="year of --source-url (read from the page title if omitted)")
    ap.add_argument("--session", help="session of --source-url")
    ap.add_argument("--local", nargs="+", metavar="PDF", help="parse local files: QUESTION_PAPER.pdf [MEMO.pdf]")
    ap.add_argument("--subject", default="Mathematics", help="subject name for --local (affects memo cleaning)")
    ap.add_argument(
        "--inspect", nargs="+", metavar="PDF",
        help="show what the extractor sees in these PDFs (or 'latest' for the two most recently downloaded)",
    )
    ap.add_argument("--pages", type=int, default=3, help="with --inspect: how many pages to show")
    ap.add_argument("--start-page", type=int, default=1, help="with --inspect: first page to show")
    ap.add_argument("--review", metavar="JSON", help="print a check-it-yourself report for a file written to out/")
    ap.add_argument("--summary", nargs="?", const="", metavar="DIR", help="table of every parsed paper in out/ (or DIR)")
    ap.add_argument("--all", action="store_true", help="with --review: list every question that was left out, not just a sample")
    ap.add_argument("-v", "--verbose", action="store_true", help="debug output on the console")
    return ap.parse_args(argv)


def run_local(args: argparse.Namespace) -> int:
    qp = Path(args.local[0])
    memo = Path(args.local[1]) if len(args.local) > 1 else None
    result = process_local_files(qp, memo, args.subject)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    stats = result["stats"]
    log.info(
        "%d questions, %d matched to memo, %d suitable for Active Recall (%d auto-marked)",
        stats["questions"], stats["matched"], stats["recall"], stats["auto"],
    )
    return 0


def _use_utf8_output() -> None:
    """Windows redirects (`> file.txt`) default to cp1252, which can't write the
    minus signs, dashes and symbols found in exam papers. Always write UTF-8."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def main(argv: list[str] | None = None) -> int:
    _use_utf8_output()
    args = parse_args(argv if argv is not None else sys.argv[1:])
    settings = load_settings()
    setup_logging(settings.log_dir, args.verbose)

    if args.summary is not None:
        from nsc.review import summarise_dir

        print(summarise_dir(Path(args.summary) if args.summary else settings.out_dir))
        return 0

    if args.review:
        from nsc.review import review_json

        print(review_json(Path(args.review), show_all=args.all))
        return 0

    if args.inspect:
        from nsc.inspect_pdf import inspect_pdf, latest_cached

        files = latest_cached(settings.cache_dir) if args.inspect == ["latest"] else [Path(f) for f in args.inspect]
        if not files:
            log.error("No PDFs found to inspect")
            return 2
        for f in files:
            print(inspect_pdf(f, pages=args.pages, start_page=args.start_page))
            print()
        return 0

    if args.local:
        return run_local(args)

    sessions = []
    for s in args.sessions:
        norm = normalise_session(s)
        if not norm:
            log.error("Unknown session %r (use November, May/June or Feb/March)", s)
            return 2
        sessions.append(norm)

    options = RunOptions(
        years=set(args.years) if args.years else None,
        since=args.since,
        sessions=tuple(dict.fromkeys(sessions)),
        subjects=args.subjects,
        papers=set(args.papers) if args.papers else None,
        limit=args.limit,
        dry_run=args.dry_run,
        no_upload=args.no_upload,
        save_json=args.save_json,
        reparse=args.reparse,
        reparse_outdated=args.reparse_outdated,
        languages=args.languages,
        subject_check=not args.no_subject_check,
        source_url=args.source_url,
        source_year=args.year,
        source_session=normalise_session(args.session) if args.session else None,
    )

    client = None
    if settings.has_supabase:
        try:
            client = SupabaseClient(settings.supabase_url, settings.supabase_key, settings.bucket)
        except SupabaseError as exc:
            log.error("%s", exc)
            return 2
    elif not (args.dry_run or args.no_upload):
        log.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. "
                  "Copy .env.example to .env, or use --dry-run / --no-upload.")
        return 2

    log.info("NSC collector %s starting", EXTRACTOR_VERSION)
    try:
        summary = Collector(settings, options, client).run()
    except SupabaseError as exc:
        log.error("Supabase error: %s", exc)
        return 2
    except KeyboardInterrupt:
        log.warning("Stopped by user")
        return 130

    failed = summary.count("failed")
    if args.dry_run:
        log.info(
            "Dry run: %d papers found, %d would be processed, %d already stored",
            summary.discovered, summary.count("planned"), summary.count("skipped"),
        )
    else:
        log.info(
            "Finished: %d ready, %d partial (download only), %d skipped (already stored), %d failed",
            summary.count("ready"), summary.count("partial"), summary.count("skipped"), failed,
        )
    if failed:
        log.info("Failures were logged to %s", settings.log_dir / "failures.jsonl")
        for r in summary.results:
            if r.status == "failed":
                log.info("  FAILED %s: %s", r.label, r.detail)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
