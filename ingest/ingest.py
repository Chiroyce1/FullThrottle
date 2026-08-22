import fastf1
import os
import argparse
import pandas as pd
from core import archive_data, SESSION_MAP
from utils import get_processed_sessions

DEFAULT_YEAR = 2026

# Sessions to archive - include practice sessions and pre-season testing
WANTED_SESSIONS = {'Race', 'Qualifying', 'Sprint',
                   'Sprint Qualifying', 'Practice 1', 'Practice 2', 'Practice 3'}

def parse_args():
    parser = argparse.ArgumentParser(
        description='Archive FastF1 telemetry sessions.')
    parser.add_argument('year', nargs='?', type=int, default=DEFAULT_YEAR)
    parser.add_argument('--round', dest='round_numbers',
                        action='append', type=int)
    parser.add_argument('--session', dest='session_names', action='append')
    parser.add_argument('--output-dir', dest='output_dirs', action='append')
    parser.add_argument('--force', action='store_true', help='Force re-download even if processed')
    return parser.parse_args()


def main():
    args = parse_args()
    year = args.year
    now_utc = pd.Timestamp.utcnow()

    # Use the git-tracked metadata to know what is already processed
    processed_sessions = get_processed_sessions(year)

    allowed_rounds = set(args.round_numbers or [])
    allowed_sessions = set(args.session_names or [])
    output_dirs = args.output_dirs or [os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static', 'data')]

    fastf1.Cache._default_cache_enabled = True
    fastf1.Cache.set_disabled()
    events = fastf1.get_event_schedule(year)

    test_number = 1

    for _, series_row in events.iterrows():
        round_number = series_row['RoundNumber']
        event_name = series_row['EventName']
        is_testing = series_row['EventFormat'] == 'testing'

        if allowed_rounds and int(round_number) not in allowed_rounds:
            continue

        if is_testing:
            current_test_number = test_number
            test_number += 1

        print(f"\n========================================================")
        print(f"Starting extraction for Round {round_number}: {event_name}")
        print(f"========================================================\n")

        sessions = [
            series_row['Session1'],
            series_row['Session2'],
            series_row['Session3'],
            series_row['Session4'],
            series_row['Session5']
        ]

        for idx, session_name in enumerate(sessions):
            if not session_name or str(session_name).lower() == 'nan' or session_name == 'None':
                continue

            # Check if session is in the future
            session_date = series_row.get(f'Session{idx+1}DateUtc')
            if pd.notna(session_date):
                try:
                    if session_date.tzinfo is None:
                        session_date = session_date.tz_localize('UTC')
                    # Give it a 4-hour buffer after the start time for the session to finish and data to be published
                    if session_date > now_utc - pd.Timedelta(hours=4):
                        print(f"Skipping {session_name} for Round {round_number} (session has not happened yet).")
                        continue
                except Exception:
                    pass

            if is_testing:
                day_number = idx + 1
                short_session = f'day{day_number}'
                base_name = f"f1_{year}_test{current_test_number}_{short_session}"
            else:
                if session_name not in WANTED_SESSIONS:
                    print(f"Skipping {session_name} (not in wanted sessions)")
                    continue

                if allowed_sessions and session_name not in allowed_sessions and SESSION_MAP.get(session_name) not in allowed_sessions:
                    continue

                short_session = SESSION_MAP.get(session_name, 'R')
                base_name = f"f1_{year}_rd{round_number}_{short_session.lower()}"

            # Check metadata.json to skip instantly (solves CI/CD empty folder issue)
            if base_name in processed_sessions and not args.force:
                print(f"Skipping {session_name}... (already in metadata.json)")
                continue

            # Also check local file as a fallback
            json_filename = f"{base_name}.json"
            expected_file = os.path.join(output_dirs[0], str(year), json_filename)
            if os.path.exists(expected_file) and not args.force:
                print(f"Skipping {session_name}... ({expected_file} already exists locally).")
                continue

            print(f"\nArchiving {session_name}...")
            try:
                if is_testing:
                    archive_data(year=year, r_type='TESTING',
                                 round_id=current_test_number, session_id=short_session, day=day_number, output_dirs=output_dirs)
                else:
                    archive_data(year=year, r_type=session_name,
                                 round_id=round_number, session_id=short_session, output_dirs=output_dirs)
            except Exception as error:
                print(f"Failed to archive {session_name} for Round {round_number}: {error}")


if __name__ == '__main__':
    main()
