"""
HTTP Client for OpenF1 and Jolpica Ergast with automatic rate-limit pacing and exponential backoff.
"""

import time
import requests


class OpenF1Client:
    """Session-managed HTTP client for OpenF1 with polite rate pacing and retry logic."""

    def __init__(self, request_delay: float = 0.5):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "FullThrottle-OpenF1-Ingest/1.0 (https://fullthrottle.chiroyce.dev)"
        })
        self.request_delay = request_delay
        self.last_request_time = 0.0

    def get(self, url: str, params: dict = None, max_retries: int = 5):
        """Perform a paced GET request with retry and backoff on 429 rate limit."""
        for attempt in range(max_retries):
            # Enforce pacing between calls to respect OpenF1 rate limits
            elapsed = time.time() - self.last_request_time
            if elapsed < self.request_delay:
                time.sleep(self.request_delay - elapsed)

            self.last_request_time = time.time()
            try:
                resp = self.session.get(url, params=params, timeout=30)
                if resp.status_code == 200:
                    return resp.json()
                elif resp.status_code == 429:
                    retry_after = int(resp.headers.get("Retry-After", 5))
                    print(f"\nRate limited (429). Sleeping {retry_after}s (attempt {attempt+1}/{max_retries})...")
                    time.sleep(retry_after)
                    continue
                elif resp.status_code == 404:
                    return None
                else:
                    print(f"Warning: GET {url} returned HTTP {resp.status_code}")
                    return None
            except Exception as e:
                print(f"Request error for {url}: {e} (attempt {attempt+1}/{max_retries})")
                time.sleep(2)
        return None
