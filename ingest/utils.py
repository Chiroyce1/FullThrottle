import os
import json

def get_processed_sessions(year: int) -> set:
    """
    Reads the static/metadata.json file and returns a set of all previously 
    processed session base_names (e.g. 'f1_2026_rd1_fp1') for the given year.
    This prevents the need to check Hugging Face or rely on local static/data
    files which are ignored in CI/CD.
    """
    processed = set()
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'static'))
    metadata_path = os.path.join(base_dir, 'metadata.json')
    
    if not os.path.exists(metadata_path):
        return processed

    try:
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
            
        for y_data in metadata.get('years', []):
            if y_data.get('year') == year:
                for r_data in y_data.get('rounds', []):
                    r_num = r_data.get('round')
                    is_test = (r_num == 0)
                    for s_data in r_data.get('sessions', []):
                        code = s_data.get('code')
                        if is_test:
                            processed.add(f"f1_{year}_{code}")
                        else:
                            processed.add(f"f1_{year}_rd{r_num}_{code}")
    except Exception as e:
        print(f"Warning: Failed to parse metadata.json: {e}")
        
    return processed
