"""Settings and constants for the NSC past-paper collector."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

try:  # optional: load collector/.env when python-dotenv is installed
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:  # pragma: no cover
    pass

# Bump this whenever parsing rules change. `--reparse-outdated` re-processes
# papers that were extracted with an older version.
EXTRACTOR_VERSION = "1.0.0"

DBE_BASE_URL = "https://www.education.gov.za"
DBE_INDEX_URL = (
    "https://www.education.gov.za/Curriculum/"
    "NationalSeniorCertificate(NSC)Examinations.aspx"
)

# Used when the index page can't be read or lists nothing usable.
# (year, session, url) — add more here if DBE moves things around.
SEED_EXAM_PAGES: list[tuple[int, str, str]] = [
    (2024, "November", "https://www.education.gov.za/2024NSCNovemberpastpapers.aspx"),
    (
        2023,
        "November",
        "https://www.education.gov.za/Curriculum/NationalSeniorCertificate(NSC)Examinations/"
        "2023NSCNovemberpastpapers.aspx",
    ),
]

DEFAULT_SESSIONS = ("November", "May/June")
DEFAULT_SINCE_YEAR = 2020

# Active Recall is only switched on for papers with at least this many
# suitable questions; below that the paper is still published for download.
MIN_RECALL_QUESTIONS = 3


@dataclass(frozen=True)
class Settings:
    supabase_url: str = ""
    supabase_key: str = ""
    bucket: str = "past-papers"
    request_delay: float = 1.5
    user_agent: str = (
        "SkillForge-StudyHub-Collector/1.0 (+educational use; NSC past papers)"
    )
    cache_dir: Path = field(default_factory=lambda: Path(".cache"))
    log_dir: Path = field(default_factory=lambda: Path("logs"))
    out_dir: Path = field(default_factory=lambda: Path("out"))

    @property
    def has_supabase(self) -> bool:
        return bool(self.supabase_url and self.supabase_key)


def load_settings() -> Settings:
    base = Path(__file__).resolve().parent.parent
    return Settings(
        supabase_url=os.getenv("SUPABASE_URL", "").rstrip("/"),
        supabase_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
        bucket=os.getenv("NSC_STORAGE_BUCKET", "past-papers"),
        request_delay=float(os.getenv("NSC_REQUEST_DELAY", "1.5")),
        cache_dir=Path(os.getenv("NSC_CACHE_DIR", base / ".cache")),
        log_dir=Path(os.getenv("NSC_LOG_DIR", base / "logs")),
        out_dir=Path(os.getenv("NSC_OUT_DIR", base / "out")),
    )
