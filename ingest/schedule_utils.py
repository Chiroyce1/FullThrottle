"""
Pure schedule helpers for race-weekend session detection.

Jolpica's race schedule exposes dates/times for practice sessions, sprints,
qualifying, and the race. These helpers turn that schedule into UTC session
windows and decide which sessions have finished and still need ingesting.
"""

from datetime import datetime, timedelta, timezone
from typing import Any

SESSION_DURATIONS_MIN = {
    "fp1": 60,
    "fp2": 60,
    "fp3": 60,
    "sq": 45,
    "s": 60,
    "q": 75,
    "r": 180,
}

JOLPICA_SESSION_FIELDS = (
    ("FirstPractice", "fp1"),
    ("SecondPractice", "fp2"),
    ("ThirdPractice", "fp3"),
    ("SprintQualifying", "sq"),
    ("SprintShootout", "sq"),
    ("Sprint", "s"),
    ("Qualifying", "q"),
)


def _parse_session_window(
    session: Any,
    duration_min: int,
) -> tuple[datetime, datetime] | None:
    if not isinstance(session, dict):
        return None

    date_str = session.get("date")
    if not date_str:
        return None

    try:
        day = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None

    time_str = session.get("time")
    if not time_str:
        # Without a session time, wait until the day is over before treating it
        # as complete. This avoids triggering a pipeline run for a session that
        # may still be happening.
        end = day.replace(hour=23, minute=59, second=59)
        return day, end

    try:
        start = datetime.fromisoformat(f"{date_str}T{time_str}".replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None

    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    start = start.astimezone(timezone.utc)

    return start, start + timedelta(minutes=duration_min)


def session_windows(race: dict[str, Any]) -> list[tuple[str, datetime, datetime]]:
    """Return ``(session_code, start, end)`` for every scheduled session."""
    windows: list[tuple[str, datetime, datetime]] = []
    seen: set[str] = set()

    for field, code in JOLPICA_SESSION_FIELDS:
        if code in seen or field not in race:
            continue
        window = _parse_session_window(race.get(field), SESSION_DURATIONS_MIN[code])
        if window is not None:
            windows.append((code, window[0], window[1]))
            seen.add(code)

    race_window = _parse_session_window(race, SESSION_DURATIONS_MIN["r"])
    if race_window is not None and "r" not in seen:
        windows.append(("r", race_window[0], race_window[1]))

    return windows


def round_has_started(race: dict[str, Any], now_utc: datetime) -> bool:
    """Return True once any session in the weekend has started."""
    return any(start <= now_utc for _, start, _ in session_windows(race))


def started_rounds(races: list[dict[str, Any]], now_utc: datetime) -> list[int]:
    """Return rounds whose weekend has begun, including the current round."""
    rounds: list[int] = []
    for race in races:
        try:
            round_num = int(race.get("round", 0))
        except (TypeError, ValueError):
            continue
        if round_num > 0 and round_has_started(race, now_utc):
            rounds.append(round_num)
    return rounds


def pending_sessions(
    races: list[dict[str, Any]],
    processed: set[str],
    year: int,
    now_utc: datetime,
) -> list[str]:
    """Return completed session keys that are missing from metadata."""
    pending: list[str] = []
    for race in races:
        try:
            round_num = int(race.get("round", 0))
        except (TypeError, ValueError):
            continue
        if round_num <= 0:
            continue

        for code, _, end in session_windows(race):
            session_key = f"f1_{year}_rd{round_num}_{code}"
            if end <= now_utc and session_key not in processed:
                pending.append(session_key)

    return pending
