"""Extra session metadata writers.

Each module adds one data block to a session sidecar file: weather series,
full classification, quali phases, pit stops. core.py calls them for new
ingests, backfill.py calls them for older files. Plain functions, no
framework. If a block is already present it gets overwritten with fresh
values, so re-running is safe.
"""

from . import results, weather

__all__ = ["results", "weather"]
