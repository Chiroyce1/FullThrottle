[![FullThrottle](/static/banner.png)](https://fullthrottle.chiroyce.dev/)

[![Svelte](https://img.shields.io/badge/Svelte-%23f1413d.svg?style=for-the-badge&logo=svelte&logoColor=white)](https://svelte.dev) [![Formula 1](https://img.shields.io/badge/Formula%201-E10600.svg?style=for-the-badge&logo=f1&logoColor=white)](https://fastf1.dev/) [![GitHub stars](https://img.shields.io/github/stars/Chiroyce1/FullThrottle.svg?style=for-the-badge&logo=github)](https://github.com/Chiroyce1/FullThrottle/stargazers)

**[FullThrottle](https://fullthrottle.chiroyce.dev/)** is a fast, free, and open-source Formula 1 telemetry visualizer and session replay tool that runs entirely in your browser.

---

## Features

- **Interactive Telemetry Traces:** Scrub anywhere along a lap to see speed, throttle percentage, braking, RPM, gear shifts, and with a track map showing the delta with another lap.
- **Lift & Coast (LiCO) Detection:** Highlights segments where drivers lift off the throttle early to save tyres or charge the battery.
- **Head-to-Head Comparisons:** Overlay upto 4 drivers side-by-side across laps, tyre compounds, sessions, and even across different years to see where lap time was won or lost.
- **Interactive Session Replays:** Watch full Grand Prix races, Qualifying, Free Practice and Pre-Season testing sessions with telemetry and synced positions.

---

## How it works under the hood

FullThrottle is built **edge-first and client-driven**. Instead of relying on a heavy server to slice data for every query, the browser does the heavy lifting:

- **Frontend:** Built with [SvelteKit](https://kit.svelte.dev/) (Svelte 5) for a fast and reactive interface.
- **Visualizations:** [D3.js](https://d3js.org/) for all the telemetry visualizations
- **Data Pipeline:**
  - Telemetry is primarily sourced using [OpenF1](https://openf1.org), an open REST API for Formula 1 data.
  - Raw car telemetry and location streams are synchronized using time-weighted interpolation and pre-processed into compressed Parquet format at ~8 Hz effective frequency.
  - Compressed parquet files and session metadata are uploaded to a [Hugging Face dataset](https://huggingface.co/datasets/fullthrottlef1/fullthrottle)
  - The frontend requests `.parquet` files from Hugging Face's CDN. Each file is a few MB.
  - The client parses the data in-browser using `hyparquet`. Once a session is loaded, switching between drivers and laps is near-instant.

## Data Pipeline

FullThrottle uses **OpenF1** by default for automated telemetry ingestion, eliminating the need for F1 TV subscription credentials or dealing with bot-detection gates on cloud CI runners:

```bash
cd ingest

# Ingest new sessions using OpenF1, apply enrichment patches, and rebuild metadata
python3 sync.py 2026

# Run sync and upload fresh parquet files directly to Hugging Face
python3 sync.py 2026 --upload
```

### Using FastF1 Locally

If you have an active F1 TV subscription and prefer sourcing telemetry via [FastF1](https://github.com/theOehrly/Fast-F1), you can run the pipeline locally with the `--fastf1` flag:

```bash
# Ingest using FastF1 (automatically falls back to OpenF1 if F1 TV auth fails)
python3 sync.py 2026 --fastf1
```

> **Note:** FastF1 access for recent sessions requires F1 TV authentication. Automated CI runs always default to OpenF1 because cloud/datacenter runners get blocked by F1 TV's Cloudflare and Akamai bot gates.

To backfill new telemetry enrichments (like weather time-series, pit stop timelines, and quali segment breakdowns) without re-downloading everything:

```bash
python3 backfill.py --year 2026
```

---

## Running Locally

### Prerequisites

- [Bun](https://bun.sh/) (recommended) or Node.js v20+
- Python 3.10+ (if running ingestion scripts or downloading datasets)

### Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.com/Chiroyce1/FullThrottle.git
   cd FullThrottle
   ```

2. **Install dependencies:**

   ```bash
   bun install
   ```

3. **Start the local dev server:**

   ```bash
   bun dev
   ```

   Open `http://localhost:5173` in your browser.

4. _(Optional) Cache telemetry locally for offline dev:_
   ```bash
   pip install huggingface_hub
   hf download fullthrottlef1/fullthrottle --repo-type dataset --local-dir ./static/data
   ```

### Tests

To test the telemetry processing algorithms directly against parquet datasets:

```bash
bun test
```

---

## Contributing & Community

FullThrottle is an open project built by [chiroyce](https://chiroyce.dev).

If you spot bugs, want to improve the telemetry systems, or have an idea for a cool new metric, feedback and contributions are very welcome!

- Found a bug or have a suggestion? Open an [issue](https://github.com/Chiroyce1/FullThrottle/issues/new).
- Want to contribute code? Submit a PR! Please make sure to test your changes locally and mention what was changed and why it was changed

---

## Disclaimer

FullThrottle is an unofficial, non-commercial fan project. It is not associated, endorsed, or affiliated in any way with Formula 1, FIA, Liberty Media, or Formula One Management. F1, FORMULA ONE, FORMULA 1, FIA FORMULA ONE WORLD CHAMPIONSHIP, GRAND PRIX and related marks are registered trademarks of Formula One Licensing B.V.

Licensed under [AGPLv3](LICENSE).
