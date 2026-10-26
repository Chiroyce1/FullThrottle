import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
"""
Unit tests for the modular OpenF1 ingestion pipeline.
Tests telemetry outer-join, linear interpolation, metric integrations,
session code normalization, and metadata builders.
"""

import unittest
from datetime import datetime, timezone
import numpy as np
import pandas as pd

from openf1.constants import get_session_code, TYPE_MAP, ESSENTIAL_COLUMNS
from openf1.telemetry import build_driver_telemetry
from openf1.formatter import (
    build_driver_metadata,
    build_weather_metadata,
    build_classification
)


class MockOpenF1Client:
    """Mock client returning synthetic car data and location endpoints."""
    def __init__(self, car_data=None, location_data=None):
        self.car_data = car_data or []
        self.location_data = location_data or []

    def get(self, url, params=None):
        if "car_data" in url:
            return self.car_data
        if "location" in url:
            return self.location_data
        return None


class TestOpenF1Pipeline(unittest.TestCase):

    def test_session_code_mapping(self):
        """Test normalization of session names into standard FullThrottle session codes."""
        test_cases = [
            ({"session_name": "Practice 1"}, "fp1"),
            ({"session_name": "FP1"}, "fp1"),
            ({"session_name": "Practice 2"}, "fp2"),
            ({"session_name": "Practice 3"}, "fp3"),
            ({"session_name": "Sprint Qualifying"}, "sq"),
            ({"session_name": "Sprint Shootout"}, "sq"),
            ({"session_name": "Sprint"}, "s"),
            ({"session_name": "Qualifying"}, "q"),
            ({"session_name": "Race"}, "r"),
            ({"session_name": "Grand Prix"}, "r"),
        ]
        for session_dict, expected in test_cases:
            with self.subTest(session=session_dict):
                self.assertEqual(get_session_code(session_dict), expected)

    def test_weather_metadata_builder(self):
        """Test weather series and average summary calculations."""
        session_start = datetime(2026, 10, 25, 19, 0, 0, tzinfo=timezone.utc)
        raw_weather = [
            {
                "date": "2026-10-25T19:00:00+00:00",
                "air_temperature": 28.0,
                "track_temperature": 38.0,
                "humidity": 45.0,
                "pressure": 1012.0,
                "wind_speed": 3.5,
                "wind_direction": 180,
                "rainfall": 0
            },
            {
                "date": "2026-10-25T19:30:00+00:00",
                "air_temperature": 30.0,
                "track_temperature": 42.0,
                "humidity": 41.0,
                "pressure": 1011.0,
                "wind_speed": 4.5,
                "wind_direction": 190,
                "rainfall": 0
            }
        ]

        summary, series = build_weather_metadata(raw_weather, session_start)

        self.assertEqual(series["t"], [0, 1800])
        self.assertEqual(series["air_temp"], [28.0, 30.0])
        self.assertEqual(summary["air_temp"], 29.0)
        self.assertEqual(summary["track_temp"], 40.0)
        self.assertFalse(summary["rainfall"])

    def test_classification_builder(self):
        """Test parsing of Jolpica Ergast race results."""
        jolpica_results = [
            {
                "number": "12",
                "position": "1",
                "points": 25.0,
                "status": "Finished",
                "Time": {"time": "1:32:15.500"},
                "laps": 56,
                "FastestLap": {"lap": 48, "Time": {"time": "1:34.200"}}
            },
            {
                "number": "16",
                "position": "2",
                "points": 18.0,
                "status": "Finished",
                "Time": {"time": "+13.078"},
                "laps": 56,
                "FastestLap": {"lap": 50, "Time": {"time": "1:34.800"}}
            }
        ]

        classification = build_classification(jolpica_results)
        self.assertEqual(len(classification), 2)
        self.assertEqual(classification[0]["driver"], "12")
        self.assertEqual(classification[0]["position"], "1")
        self.assertEqual(classification[0]["points"], 25.0)
        self.assertEqual(classification[1]["gap_to_leader"], "+13.078")

    def test_telemetry_outer_join_and_interpolation(self):
        """
        Test the ~8Hz outer join, linear interpolation of coordinates/speed,
        discrete forward fill for gears/brakes, and cumulative distance integration.
        """
        session_start = datetime(2026, 10, 25, 19, 0, 0, tzinfo=timezone.utc)

        # Car data at t=0.0s and t=0.5s (~2Hz)
        car_data = [
            {"date": "2026-10-25T19:00:00.000Z", "speed": 100, "rpm": 10000, "n_gear": 3, "throttle": 50, "brake": 0, "drs": 0},
            {"date": "2026-10-25T19:00:00.500Z", "speed": 150, "rpm": 11000, "n_gear": 4, "throttle": 100, "brake": 0, "drs": 1},
        ]
        # Location data interleaved at t=0.0s, t=0.25s, and t=0.5s (~4Hz)
        location_data = [
            {"date": "2026-10-25T19:00:00.000Z", "x": 10.0, "y": 20.0, "z": 0.0},
            {"date": "2026-10-25T19:00:00.250Z", "x": 20.0, "y": 30.0, "z": 0.0},
            {"date": "2026-10-25T19:00:00.500Z", "x": 30.0, "y": 40.0, "z": 0.0},
        ]

        client = MockOpenF1Client(car_data=car_data, location_data=location_data)

        df = build_driver_telemetry(
            client=client,
            session_key=9999,
            driver={"driver_number": 12},
            session_start=session_start,
            laps_df=pd.DataFrame(),
            stints_df=pd.DataFrame(),
            intervals_df=pd.DataFrame(),
            pos_df=pd.DataFrame()
        )

        # Outer join should retain all 3 timestamp points
        self.assertEqual(len(df), 3)

        # Check linear interpolation at t=0.25s (midway between 100 and 150 km/h)
        mid_row = df.iloc[1]
        self.assertAlmostEqual(mid_row["session_time"], 0.25, places=2)
        self.assertAlmostEqual(mid_row["speed"], 125.0, places=1)
        self.assertAlmostEqual(mid_row["rpm"], 10500.0, places=1)
        self.assertAlmostEqual(mid_row["throttle"], 75.0, places=1)
        self.assertEqual(mid_row["x"], 20.0)
        self.assertEqual(mid_row["y"], 30.0)

        # Cumulative distance should be monotonically increasing
        self.assertGreater(df.iloc[-1]["distance"], df.iloc[0]["distance"])
        self.assertGreater(df.iloc[-1]["distance"], 0.0)


if __name__ == "__main__":
    unittest.main()
