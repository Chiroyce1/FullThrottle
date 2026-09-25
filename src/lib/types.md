# Telemetry data types

These types document the data exported by the scripts in `ingest/` (mainly `core.py`).

Each `.parquet` file ships with an identically named `.json` sidecar holding the session metadata.

## Parquet row (`TelemetryRow`)

The parquet file holds an array of rows, sampled at roughly 10 Hz per driver. These are the columns after processing:

| Column                     | Type      | Description                                                      |
| -------------------------- | --------- | ---------------------------------------------------------------- |
| `session_time`             | `number`  | Float seconds since the session started.                         |
| `distance`                 | `number`  | Total distance covered by the driver in meters.                  |
| `speed`                    | `number`  | Current speed in km/h (`uint16`).                                |
| `rpm`                      | `number`  | Engine RPM (`uint16`).                                           |
| `n_gear`                   | `number`  | Current gear, 0-8 (`uint8`).                                     |
| `throttle`                 | `number`  | Throttle pedal percentage 0-100 (`uint8`).                       |
| `brake`                    | `boolean` | Brake pedal applied (True/False).                                |
| `drs`                      | `number`  | DRS status indicator (0-14, usually >8 means active).            |
| `x`, `y`, `z`              | `number`  | 3D coordinate space coordinates (`float32`).                     |
| `driver_number`            | `number`  | The driver's car number (`uint8`).                               |
| `distance_to_driver_ahead` | `number`  | Distance to the car ahead (`float32`).                           |
| `time_gap`                 | `number`  | Calculated gap to car ahead (`float32`).                         |
| `lap_number`               | `number`  | Current lap.                                                     |
| `stint`                    | `number`  | Current tyre stint.                                              |
| `compound`                 | `string`  | Tyre compound string ('SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET'). |
| `tyre_life`                | `number`  | Laps completed on the current tyre.                              |
| `track_status`             | `number`  | Global track condition flag (1=Clear, 4=SC, etc).                |
| `position`                 | `number`  | Leaderboard position at this timestamp.                          |

## Metadata JSON (`TelemetryMeta`)

The sidecar `.json` file holds:

```typescript
{
  session_info: {
    name: string; // "Bahrain Grand Prix"
    type: string; // "Race", "Qualifying", "TESTING"
    round?: number;
    year?: number;
    country?: string;
    location?: string;
    circuit?: string;
    date?: string;
    session_name?: string; // "R", "Q", "FP1" ...
    session_code?: string; // lowercase variant
    totalLaps?: number; // computed at ingest
    weather?: {
      air_temp: number | null;
      track_temp: number | null;
      humidity: number | null;
      wind_speed: number | null;
      rainfall: boolean;
    };
    test_number?: number; // testing sessions only
    day?: number; // testing sessions only
  };
  drivers: {
    [driverId: string]: {
      driver_number: number;
      name: string; // "Max Verstappen"
      team: string; // "Red Bull Racing"
      color: string; // "#3671C6"
      grid: number;
      pos: number; // final classified position
      valid_laps: ValidLap[]; // lap times, sectors, compound, tyre life
    };
  };
}
```
