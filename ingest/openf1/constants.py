"""
Constants, schema type definitions, and session mappings for the OpenF1 pipeline.
"""

OPENF1_BASE = "https://api.openf1.org/v1"
JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1"

TYPE_MAP = {
    'speed': 'uint16',
    'rpm': 'uint16',
    'n_gear': 'uint8',
    'throttle': 'uint8',
    'brake': 'bool',
    'drs': 'uint8',
    'x': 'float32',
    'y': 'float32',
    'z': 'float32',
    'distance': 'float32',
    'distance_to_driver_ahead': 'float32',
    'time_gap': 'float32',
    'lap_number': 'uint8',
    'stint': 'uint8',
    'tyre_life': 'uint8',
    'track_status': 'uint8',
    'position': 'uint8',
    'driver_number': 'uint8',
    'session_time': 'float32'
}

ESSENTIAL_COLUMNS = [
    'session_time', 'distance', 'speed', 'rpm', 'n_gear', 'throttle',
    'brake', 'drs', 'x', 'y', 'z', 'driver_number',
    'distance_to_driver_ahead', 'time_gap', 'lap_number', 'stint',
    'compound', 'tyre_life', 'track_status', 'position'
]


def get_session_code(session_obj: dict) -> str:
    """Normalize OpenF1 session name or session type into standard FullThrottle session code."""
    n = (session_obj.get("session_name") or session_obj.get("session_type") or "").lower()
    if "practice 1" in n or "fp1" in n:
        return "fp1"
    if "practice 2" in n or "fp2" in n:
        return "fp2"
    if "practice 3" in n or "fp3" in n:
        return "fp3"
    if "sprint qualifying" in n or "sprint shootout" in n or "sq" in n:
        return "sq"
    if "sprint" in n:
        return "s"
    if "qualifying" in n or "quali" in n:
        return "q"
    if "race" in n:
        return "r"
    return "r"
