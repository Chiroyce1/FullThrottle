[![FullThrottle](/static/banner.png)](https://fullthrottlef1.pages.dev/)

[![Svelte](https://img.shields.io/badge/Svelte-%23f1413d.svg?style=for-the-badge&logo=svelte&logoColor=white)](https://svelte.dev) [![Formula 1](https://img.shields.io/badge/Formula%201-E10600.svg?style=for-the-badge&logo=f1&logoColor=white)](https://fastf1.dev/) [![GitHub stars](https://img.shields.io/github/stars/Chiroyce1/FullThrottle.svg?style=for-the-badge&logo=github)](https://github.com/Chiroyce1/FullThrottle/stargazers)

[FullThrottle](https://fullthrottlef1.pages.dev/) is a free and fast web app providing Formula 1 telemetry charts and session replays. Compare across drivers, laps, sessions, rounds, and years right from your browser.

> [!NOTE]
> This is a hobby project and is under heavy development. If you find any bugs or want to request a feature please submit an [issue](https://github.com/Chiroyce1/FullThrottle/issues/new) or create a PR.

## Features

- **Interactive Telemetry:** Scrub through laps and watch speed, throttle, brake, RPM, and gears synced to the track map.
- **Live Track Map:** Car positions and corners for session replays and per-lap analysis.
- **Full Session Replays:** Includes leaderboards, maps, and replay for Race, Qualifying, Free Practice, and a few Pre-season testing sessions.
- **Head to Head Comparisons:** Compare different drivers for a session across laps, compounds, and even years.

## Architecture

FullThrottle is built edge-first. The goal was to efficiently get the telemetry to end users, and let the browser do all the work.

- **Frontend:** Built with [SvelteKit](https://kit.svelte.dev/) (Svelte 5) for a fast and reactive interface.
- **Visualizations:** [D3.js](https://d3js.org/) for all the telemetry visualizations
- **Data Pipeline:**
  - Raw telemetry is sourced using [FastF1](https://github.com/theOehrly/Fast-F1) in Python, then pre-processed into compressed Parquet format.
  - Parquet files and session metadata are uploaded to a [Hugging Face dataset](https://huggingface.co/datasets/fullthrottlef1/fullthrottle), which acts as the CDN origin.
  - The frontend requests `.parquet` files from Hugging Face's CDN. Each file is a few MB.
  - The client parses the data in-browser using `hyparquet`. Once a session is loaded, switching between drivers and laps is near-instant.

## Data Pipeline

The ingest pipeline runs on GitHub Actions as a **scheduled cron job** — it is not a CI/CD pipeline. There are no automated tests or deployments in this workflow. The app itself deploys via Cloudflare Pages on push to `main`.

### The three regions

Three separate locations hold data and need to stay in sync — this is the main source of complexity:

| Region | What lives there | Who writes it |
|---|---|---|
| **GitHub repo** (`static/metadata.json`) | The session index the frontend loads on startup | CI auto-commits after every ingest run |
| **Hugging Face dataset** | All `.parquet` telemetry + `.json` session metadata files | CI uploads only new files each run |
| **Local dev** (`static/data/`) | Downloaded copy of HF data for offline development | Developer, manually via `hf download` |

`static/data/` is in `.gitignore` — it is never committed. The repo only tracks `metadata.json`.

### How a run works

The workflow (`.github/workflows/telemetry.yml`) runs **hourly** and has three steps:

1. **`ingest.py 2026`** — Fetches the FastF1 event schedule, skips sessions already in `metadata.json` or not yet finished, downloads new telemetry, and writes Parquet + JSON files into `static/data/`.
2. **`build_metadata.py`** — Scans `static/data/` for new session files and rebuilds `metadata.json`. Critically, it **seeds from the existing committed `metadata.json` first**, so historical rounds are never wiped even when the CI runner has an empty `static/data/` directory.
3. **`upload.py`** — Walks `static/data/` and uploads any files not already present on Hugging Face. Skips existing files.

The ingest step has `continue-on-error: true`. If FastF1's API is flaky (common during a live race weekend), the metadata rebuild and HF upload still proceed, and the next hourly run will retry.

### Why `metadata.json` is committed to the repo

The frontend fetches `metadata.json` from the same origin as the app (not HF), so it's fast with no cold-start. It also acts as the source of truth for which sessions have been processed, letting `ingest.py` skip re-downloading sessions on a fresh runner that has no local data.

### Local development with data

For local dev with real telemetry data:

```bash
# Download all processed data from Hugging Face into static/data/
python3 -m pip install huggingface_hub
hf download fullthrottlef1/fullthrottle --repo-type dataset --local-dir ./static/data
```

To ingest a specific new session locally (e.g. round 13 qualifying):

```bash
cd ingest
python ingest.py 2026 --round 13 --session Qualifying
python build_metadata.py
```

This will write to `static/data/` and update `static/metadata.json` locally. Commit only `metadata.json` if you want to ship a session that CI hasn't picked up yet.

## Development

### Prerequisites

- Node.js (v20+, v24 LTS recommended)
- npm, pnpm, or bun
- Python/pip (to grab the Hugging Face CLI)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/Chiroyce1/FullThrottle.git
   cd FullThrottle
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:5173`.

5. _Optional:_ To have the telemetry data load instantly, you can download the .parquet files from Hugging Face and place them in the `/static/data` directory.

   > All the pre-processed .parquet telemetry and .json metadata files are on [Hugging Face](https://huggingface.co/datasets/fullthrottlef1/fullthrottle) - 2025 and 2026 data is currently available, more to come soon. The download might take a while.

   ```bash
   python3 -m pip install huggingface_hub # global install of the cli
   hf download fullthrottlef1/fullthrottle --repo-type dataset --local-dir ./static/data
   ```

### Testing

To run the telemetry algorithm tests (which execute directly against the downloaded Parquet data):

```bash
npm run test
```

## Analytics

FullThrottle uses [PostHog](https://posthog.com/) for anonymized web analytics and user feedback during the early development/testing period, alongside [Cloudflare](https://cloudflare.com/) for web hosting and analytics.

## License, Contibuting and AI

This project is licensed under the AGPLv3 License - see the [LICENSE](LICENSE) file for more information.

Consider this a starting point for the project. I expect to refactor a lot of it and I'm hoping to get contributions that will help improve the overall code quality and fix bugs that are definitely still present.

If you find any bugs or want to request a feature please submit an [issue](https://github.com/Chiroyce1/FullThrottle/issues/new) or create a PR.

Contributions are welcome! Entirely AI generated PRs can be rejected outright. It is expected that you actually understand the code changes you are introducing and have tested and verified them locally before submitting a PR.
