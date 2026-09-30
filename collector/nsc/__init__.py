"""NSC past-paper collector for SkillForge Study Hub.

Pipeline: discover (DBE site) -> download -> extract text -> parse questions
-> parse memo -> match + classify -> upload PDFs -> ingest rows (one RPC).
"""
from .config import EXTRACTOR_VERSION

__all__ = ["EXTRACTOR_VERSION"]
