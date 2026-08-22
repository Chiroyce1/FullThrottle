"""
Metadata generation script for the F1 telemetry pipeline.
This script scans the generated session JSON files to compile a master
`metadata.json` file. It extracts session details, event names, and
locations, organizing them hierarchically by year and round. This metadata
is consumed by the frontend to display the available telemetry data.
"""

import os
import json
import re

def parse_session_label(code):
    """Map session short codes to human-readable labels."""
    labels = {
        'r': 'Race',
        'q': 'Qualifying',
        'fp1': 'Practice 1',
        'fp2': 'Practice 2',
        'fp3': 'Practice 3',
        's': 'Sprint',
        'sq': 'Sprint Qualifying'
    }
    return labels.get(code.lower(), code.upper())

def main():
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'static'))
    data_dir = os.path.join(base_dir, 'data')
    if not os.path.exists(data_dir):
        # Fallback if run before moving
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'FullThrottle-Clean', 'static'))
        data_dir = os.path.join(base_dir, 'data')
        
    session_order = {
        'fp1': 0,
        'fp2': 1,
        'fp3': 2,
        'sq': 3,
        's': 4,
        'q': 5,
        'r': 6
    }

    output_path = os.path.join(base_dir, 'metadata.json')
    years_map = {}

    # Seed from existing metadata.json so the CI runner (which has no local data/)
    # doesn't wipe historical rounds on every run.
    if os.path.exists(output_path):
        try:
            with open(output_path, 'r') as f:
                existing = json.load(f)
            for y in existing.get('years', []):
                years_map[int(y['year'])] = y.get('rounds', [])
            print(f"Seeded from existing metadata.json ({len(years_map)} years).")
        except Exception as e:
            print(f"Warning: could not seed from existing metadata.json: {e}")

    if not os.path.exists(data_dir):
        print(f"No data dir found — writing seeded metadata only.")
        years_list = [{'year': yr, 'rounds': rounds} for yr, rounds in sorted(years_map.items(), reverse=True)]
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w') as f:
            json.dump({'years': years_list}, f, indent=4)
        total_sessions = sum(len(r['sessions']) for yl in years_list for r in yl['rounds'])
        print(f"Generated {output_path}: {len(years_map)} years, {len([r for yl in years_list for r in yl['rounds']])} rounds, {total_sessions} sessions")
        return

    for year_dir in os.listdir(data_dir):
        if not re.match(r'^\d{4}$', year_dir):
            continue
        
        year_path = os.path.join(data_dir, year_dir)
        if not os.path.isdir(year_path):
            continue
            
        year_int = int(year_dir)
        round_map = {}

        for r in years_map.get(year_int, []):
            key = 'test' if r['round'] == 0 else str(r['round'])
            round_map[key] = {
                'name': r.get('name'),
                'country': r.get('country'),
                'location': r.get('location'),
                'circuit': r.get('circuit'),
                'date': r.get('date'),
                'sessions': {s['code']: s['label'] for s in r.get('sessions', [])}
            }
        
        for filename in os.listdir(year_path):
            if not filename.endswith('.json'):
                continue
                
            filepath = os.path.join(year_path, filename)

            meta = None
            try:
                with open(filepath, 'r') as f:
                    meta = json.load(f)
            except Exception:
                pass

            match = re.match(r'^f1_(\d{4})_rd(\d+)_(\w+)\.json$', filename)
            if match:
                year = match.group(1)
                round_num = match.group(2)
                session_code = match.group(3)

                if round_num not in round_map:
                    session_info = meta.get('session_info', {}) if meta else {}
                    round_map[round_num] = {
                        'name': session_info.get('name', f'Round {round_num}'),
                        'country': session_info.get('country'),
                        'location': session_info.get('location'),
                        'circuit': session_info.get('circuit'),
                        'date': session_info.get('date'),
                        'sessions': {}
                    }
                elif meta:
                    session_info = meta.get('session_info', {})
                    for field in ('country', 'location', 'circuit', 'date'):
                        if session_info.get(field) and not round_map[round_num].get(field):
                            round_map[round_num][field] = session_info[field]

                round_map[round_num]['sessions'][session_code] = parse_session_label(session_code)
                continue

            test_match = re.match(r'^f1_(\d{4})_(test\d+_day\d+)\.json$', filename)
            if test_match:
                year = test_match.group(1)
                session_code = test_match.group(2)
                test_key = 'test'
                
                if test_key not in round_map:
                    session_info = meta.get('session_info', {}) if meta else {}
                    name = session_info.get('name', 'Pre-Season Testing')
                    round_map[test_key] = {
                        'name': name,
                        'country': session_info.get('country'),
                        'location': session_info.get('location'),
                        'circuit': session_info.get('circuit'),
                        'date': session_info.get('date'),
                        'sessions': {}
                    }
                
                round_map[test_key]['sessions'][session_code] = session_code.replace('_', ' ').upper()

        rounds = []
        for key, data in round_map.items():
            sessions_list = [{'code': code, 'label': label} for code, label in data['sessions'].items()]
            sessions_list.sort(key=lambda s: session_order.get(s['code'].lower(), 99))

            round_entry = {
                'round': 0 if key == 'test' else int(key),
                'name': data['name'],
                'sessions': sessions_list
            }
            for field in ('country', 'location', 'circuit', 'date'):
                if data.get(field):
                    round_entry[field] = data[field]

            rounds.append(round_entry)
            
        rounds.sort(key=lambda x: x['round'])
        
        if rounds:
            years_map[int(year_dir)] = rounds

    years_list = []
    for year, rounds in sorted(years_map.items(), reverse=True):
        years_list.append({
            'year': year,
            'rounds': rounds
        })
        
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w') as f:
        json.dump({'years': years_list}, f, indent=4)
        
    total_sessions = sum(len(r['sessions']) for yl in years_list for r in yl['rounds'])
    total_rounds = sum(len(yl['rounds']) for yl in years_list)
    print(f"Generated {output_path}: {len(years_list)} years, {total_rounds} rounds, {total_sessions} sessions")

if __name__ == '__main__':
    main()
