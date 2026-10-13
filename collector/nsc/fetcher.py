"""A polite HTTP client for the DBE website.

* one request at a time, with a delay between requests
* automatic retries with back-off on timeouts / 5xx / 429
* downloaded documents are cached on disk, so re-runs and --reparse
  never hit the DBE site twice for the same file
"""
from __future__ import annotations

import hashlib
import logging
import time
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

log = logging.getLogger("nsc")

MAX_DOCUMENT_BYTES = 80 * 1024 * 1024  # DBE PDFs are normally < 10 MB


class DownloadError(RuntimeError):
    pass


class PoliteSession:
    def __init__(self, user_agent: str, delay: float, cache_dir: Path, timeout: int = 90):
        self.delay = max(0.0, delay)
        self.timeout = timeout
        self.cache_dir = Path(cache_dir) / "downloads"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._last_request = 0.0

        retry = Retry(
            total=4,
            connect=4,
            read=4,
            backoff_factor=2,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=("GET", "HEAD"),
            respect_retry_after_header=True,
        )
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": user_agent,
                "Accept": "text/html,application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-ZA,en;q=0.9",
            }
        )
        adapter = HTTPAdapter(max_retries=retry)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

    # ------------------------------------------------------------------ #
    def _wait_turn(self) -> None:
        elapsed = time.monotonic() - self._last_request
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        self._last_request = time.monotonic()

    def get_html(self, url: str) -> tuple[str, str]:
        """Return (final_url_after_redirects, html)."""
        self._wait_turn()
        resp = self.session.get(url, timeout=self.timeout, allow_redirects=True)
        resp.raise_for_status()
        resp.encoding = resp.encoding or "utf-8"
        return resp.url, resp.text

    def download(self, url: str) -> bytes:
        """Download a document (cached on disk by URL)."""
        key = hashlib.sha1(url.encode("utf-8")).hexdigest()
        cached = self.cache_dir / f"{key}.bin"
        if cached.exists() and cached.stat().st_size > 0:
            log.debug("Cache hit for %s", url)
            return cached.read_bytes()

        self._wait_turn()
        try:
            with self.session.get(url, timeout=self.timeout, stream=True, allow_redirects=True) as resp:
                resp.raise_for_status()
                chunks, size = [], 0
                for chunk in resp.iter_content(chunk_size=256 * 1024):
                    size += len(chunk)
                    if size > MAX_DOCUMENT_BYTES:
                        raise DownloadError(f"File is larger than {MAX_DOCUMENT_BYTES // 1_048_576} MB: {url}")
                    chunks.append(chunk)
        except requests.RequestException as exc:
            raise DownloadError(f"Download failed for {url}: {exc}") from exc

        data = b"".join(chunks)
        if not data:
            raise DownloadError(f"Empty response for {url}")
        tmp = cached.with_suffix(".part")
        tmp.write_bytes(data)
        tmp.replace(cached)
        return data
