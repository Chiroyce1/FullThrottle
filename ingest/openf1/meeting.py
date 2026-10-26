"""
Meeting and session resolution using Jolpica Ergast and OpenF1 APIs.
"""

from datetime import datetime, timezone
from .constants import OPENF1_BASE, JOLPICA_BASE
from .client import OpenF1Client


def fetch_year_schedule(client: OpenF1Client, year: int) -> list:
    """
    Fetches the full season race calendar from Jolpica Ergast.
    Returns a list of race objects with round, raceName, date, etc.
    """
    try:
        r = client.get(f"{JOLPICA_BASE}/{year}.json")
        if r and "MRData" in r and "RaceTable" in r["MRData"]:
            return r["MRData"]["RaceTable"].get("Races", [])
    except Exception as e:
        print(f"Could not load full year schedule: {e}")
    return []


def fetch_meeting_and_sessions(client: OpenF1Client, year: int, round_id: int):
    """
    Finds OpenF1 sessions matching year and round by cross-referencing Jolpica Ergast schedule.
    Returns:
        (matched_sessions, race_name, circuit_name, country_name)
    """
    race_name = None
    country_name = None
    circuit_name = None
    date_str = None

    try:
        r = client.get(f"{JOLPICA_BASE}/{year}/{round_id}.json")
        if r and "MRData" in r and "RaceTable" in r["MRData"] and r["MRData"]["RaceTable"]["Races"]:
            race_info = r["MRData"]["RaceTable"]["Races"][0]
            race_name = race_info.get("raceName")
            circuit_name = race_info.get("Circuit", {}).get("circuitName")
            country_name = race_info.get("Circuit", {}).get("Location", {}).get("country")
            date_str = race_info.get("date")
    except Exception as e:
        print(f"Could not load Jolpica schedule: {e}")

    # Query OpenF1 sessions for this year
    sessions = client.get(f"{OPENF1_BASE}/sessions", params={"year": year})
    if not sessions:
        raise RuntimeError(f"No OpenF1 sessions found for year {year}")

    matched_sessions = []
    if date_str:
        race_dt = datetime.strptime(date_str, "%Y-%m-%d").date()

        def dt_diff(s):
            try:
                s_dt = datetime.fromisoformat(s.get("date_start").replace("Z", "+00:00")).date()
                return abs((s_dt - race_dt).days)
            except Exception:
                return 9999

        sessions_sorted = sorted(sessions, key=dt_diff)
        best_meeting = sessions_sorted[0].get("meeting_key")
        matched_sessions = [s for s in sessions if s.get("meeting_key") == best_meeting]

    if not matched_sessions and country_name:
        cn = country_name.strip().lower()
        matched_sessions = [
            s for s in sessions
            if s.get("country_code", "").lower() == cn
            or s.get("country_name", "").lower() == cn
            or cn in s.get("country_name", "").lower()
            or s.get("country_name", "").lower() in cn
        ]

    if not matched_sessions:
        raise RuntimeError(f"Could not match OpenF1 sessions for {year} Round {round_id} ({country_name})")

    return matched_sessions, race_name, circuit_name, country_name
