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

## 🏗️ Architecture

FullThrottle is built edge-first. The goal was to efficiently get the telemetry to end users, and let the browser do all the work.

- **Frontend:** Built with [SvelteKit](https://kit.svelte.dev/) (Svelte 5) for a fast and reactive interface.
- **Visualizations:** [D3.js](https://d3js.org/) for all the telemetry visualizations
- **Data Pipeline:**
  - Raw telemetry is sourced using [FastF1](https://github.com/theOehrly/Fast-F1) in Python, then pre-processed into compressed Parquet format.
  - This telemetry is processed and uploaded to a Huggingface dataset manually for now. This will be automated and moved to Cloudflare R2 in the future.
  - The frontend requests these `.parquet` files from Huggingface's CDN, with each file being a few megabytes in size.
  - The client parses the data in-browser using `hyparquet`. So once a session is loaded, users can switch between drivers and laps almost instantly.

## 🛠️ Development

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

2. Download the telemetry data from Hugging Face

   > All the pre-processed .parquet telemetry and .json metadata files are on [Hugging Face](https://huggingface.co/datasets/fullthrottlef1/fullthrottle) - 2025 and 2026 data is currently available, more to come soon. The download might take a while.

   ```bash
   python3 -m pip install huggingface_hub # global install of the cli
   hf download fullthrottlef1/fullthrottle --repo-type dataset --local-dir ./static/data
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:5173`.

### Testing

To run the telemetry algorithm tests (which execute directly against the downloaded Parquet data):

```bash
npm run test
```

## 📊 Analytics

FullThrottle uses [PostHog](https://posthog.com/) for anonymized web analytics and user feedback during the early development/testing period, alongside [Cloudflare](https://cloudflare.com/) for web hosting and analytics.

## 📄 License

This project is licensed under the AGPLv3 License - see the [LICENSE](LICENSE) file for more information.

## 🤝 Contributing & AI Use

Consider this a starting point for the project. I expect to refactor a lot of it and I'm hoping to get contributions that will help improve the overall code quality and fix bugs that are definitely still present.

If you find any bugs or want to request a feature please submit an [issue](https://github.com/Chiroyce1/FullThrottle/issues/new) or create a PR.

Contributions are welcome! Entirely AI generated PRs can be rejected outright. It is expected that you actually understand the code changes you are introducing and have tested and verified them locally before submitting a PR.
