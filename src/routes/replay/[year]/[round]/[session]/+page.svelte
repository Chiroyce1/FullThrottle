<script lang="ts">
	import { page } from "$app/state";
	import { onDestroy } from "svelte";
	import type { PageData } from "./$types";
	import SEO from "$lib/components/SEO.svelte";
	import { TelemetryEngine } from "$lib/TelemetryEngine.svelte";
	import TrackMap from "$lib/components/TrackMap.svelte";
	import TelemetryHud from "$lib/components/TelemetryHud.svelte";
	import Leaderboard from "$lib/components/Leaderboard.svelte";
	import TrackStatus from "$lib/components/TrackStatus.svelte";
	import ModeToggle from "$lib/components/ModeToggle.svelte";
	import WeatherWidget from "$lib/components/WeatherWidget.svelte";
	import {
		buildActiveDots,
		buildTrackStatusGradient,
		getFocusedNearbyDrivers,
		getReplayFilename,
		sampleWeatherAtTime,
		sortLiveLeaderboard,
		TRACK_STATUS_SAFE,
	} from "$lib/replay/replay-utils";
	import { loadTrackCorners, type TrackCorner } from "$lib/track-corners";
	import type {
		DriverMeta,
		TelemetryFrameRow,
		LeaderboardEntry,
	} from "$lib/types";
	import { deriveSessionMode, formatSessionTime } from "$lib/utils";
	import { Home, AlertTriangle } from "lucide-svelte";
	import { generateJsonUrl, generateParquetUrl } from "$lib";
	import { getTelemetryIssue } from "$lib/telemetry-issues";

	const engine = new TelemetryEngine();
	let preparedSessionKey = "";

	function teardownSession() {
		isPlaying = false;
		if (typeof cancelAnimationFrame === "function") {
			cancelAnimationFrame(reqFrameId);
		}
		lastFrameTime = 0;
		lastCommitTime = 0;
		preciseTime = 0;
		globalTime = 0;
		focusedDriver = "";
		engine.dispose();
	}

	if (typeof window !== "undefined") {
		const onPageHide = () => teardownSession();
		window.addEventListener("pagehide", onPageHide);
		onDestroy(() => window.removeEventListener("pagehide", onPageHide));
	}

	$effect(() => {
		const { year, round, session } = page.params;
		if (!year || !round || !session) return;
		const sessionKey = `${year}/${round}/${session}`;

		if (preparedSessionKey && preparedSessionKey !== sessionKey) {
			teardownSession();
		}
		preparedSessionKey = sessionKey;

		const filename = getReplayFilename(year, round, session);
		const parquetUrl = generateParquetUrl(year, filename);
		const jsonUrl = generateJsonUrl(year, filename);
		engine.prepare(parquetUrl, jsonUrl);
	});

	$effect(() => {
		if (
			engine.awaitingPreset &&
			!engine.isLoading &&
			typeof window !== "undefined"
		) {
			import("$lib/settings").then(({ settings }) => {
				engine.load(settings.dataFrequency);
			});
		}
	});

	onDestroy(() => {
		teardownSession();
	});

	// Replay State
	let globalTime = $state<number>(0);
	let isPlaying = $state<boolean>(false);
	let lastFrameTime = 0;
	let playbackSpeed = $state<number>(1);
	let reqFrameId = 0;
	let focusedDriver = $state<string>("");
	let mapRotation = $state<number>(0);
	let showOnlySelectedOnMap = $state<boolean>(false);
	let showCornersOnMap = $state<boolean>(false);
	let trackCorners = $state<TrackCorner[]>([]);
	let lastCornerLocation = $state("");
	let mobileTab = $state<"map" | "leaderboard" | "both">("map");

	// Ensure global time initializes safely when data loads
	$effect(() => {
		if (
			engine.minSessionTime !== Infinity &&
			globalTime === 0 &&
			!engine.isLoading
		) {
			globalTime = engine.minSessionTime;
		}
	});

	// Auto-select a focused driver once metadata loads
	$effect(() => {
		if (engine.metadata?.drivers && focusedDriver === "") {
			const drivers: DriverMeta[] = Object.values(engine.metadata.drivers);
			const winner: DriverMeta | undefined = drivers.find(
				(d: DriverMeta) => d.pos === 1,
			);
			focusedDriver = winner
				? winner.driver_number.toString()
				: engine.driverList[0];
		}
	});

	// Derived frame state representing all 20 drivers at the current `globalTime`
	const currentFrameData = $derived(engine.getFrame(globalTime));

	const sessionMode = $derived.by(() =>
		deriveSessionMode(engine.metadata?.session_info?.type, page.params.session),
	);
	const isQualifying = $derived(sessionMode === "qualifying");
	const telemetryIssue = $derived(
		getTelemetryIssue(page.params.year, page.params.round, page.params.session),
	);
	const currentWeather = $derived(
		sampleWeatherAtTime(engine.metadata?.session_info, globalTime),
	);

	// Convert current frame into a format suitable for the TrackMap component
	const activeDots = $derived.by(() =>
		buildActiveDots(currentFrameData, engine.metadata),
	);
	const mapDots = $derived.by(() =>
		showOnlySelectedOnMap && focusedDriver
			? activeDots.filter((dot) => dot.id === focusedDriver)
			: activeDots,
	);

	// Derived array of current frame data sorted for the live leaderboard
	const liveLeaderboard = $derived.by((): LeaderboardEntry[] => {
		const entries: LeaderboardEntry[] = Object.entries(currentFrameData).map(
			([id, row]: [string, TelemetryFrameRow]) => ({
				id,
				row,
				meta: engine.metadata?.drivers?.[id],
			}),
		);

		return sortLiveLeaderboard(entries, sessionMode, isQualifying);
	});

	const focusedNearbyDrivers = $derived.by(() =>
		getFocusedNearbyDrivers(liveLeaderboard, focusedDriver),
	);

	// Focused driver's frame row. getFrame() mutates frameRows in-place for
	// performance, so we shallow-copy to give Svelte a new reference each
	// commit (~30 Hz after throttle). One spread of ~20 keys is negligible.
	const focusedTelemetry = $derived.by(() => {
		const row = currentFrameData[focusedDriver];
		return row ? { ...row } : undefined;
	});
	const focusedMeta = $derived(
		focusedDriver && engine.metadata?.drivers
			? engine.metadata.drivers[focusedDriver]
			: null,
	);

	const currentLapNumber = $derived(focusedTelemetry?.lap_number || 1);
	const lapData = $derived(
		focusedDriver
			? engine.getNormalizedLapTelemetry(focusedDriver, currentLapNumber)
			: [],
	);

	// Track Status resolves globally. Often we look at the leader's track_status since flags are usually global.
	const currentTrackStatus = $derived.by(() => {
		if (liveLeaderboard.length > 0) {
			const leaderRow = liveLeaderboard[0].row;
			return leaderRow.track_status ?? TRACK_STATUS_SAFE;
		}
		return TRACK_STATUS_SAFE;
	});

	$effect(() => {
		const location = engine.metadata?.session_info?.location || "";
		if (!location || location === lastCornerLocation) return;
		lastCornerLocation = location;
		loadTrackCorners(location).then((data) => {
			trackCorners = data?.corners ?? [];
		});
	});

	// Build a CSS linear-gradient from the track status timeline segments
	const trackStatusGradient = $derived.by(() => {
		return buildTrackStatusGradient(
			engine.trackStatusTimeline,
			engine.minSessionTime,
			engine.maxSessionTime,
		);
	});

	// Playback Loop. Throttled to ~30Hz state commits: getFrame() re-derives
	// all 20 driver cursors + neighbor gaps per commit, so 60fps commits are
	// pure GC churn for no visible gain. Session time stays exact — only the
	// reactive commit is coalesced.
	let lastCommitTime = 0;
	let preciseTime = 0;
	function loop(timestamp: number) {
		if (!isPlaying) return;

		// Calculate delta purely in terms of actual F1 session seconds
		// timestamp is ms from page load, sessionTime is raw seconds.
		if (lastFrameTime === 0) lastFrameTime = timestamp;
		const deltaSeconds = (timestamp - lastFrameTime) / 1000;
		lastFrameTime = timestamp;

		preciseTime += deltaSeconds * playbackSpeed;

		if (preciseTime >= engine.maxSessionTime) {
			preciseTime = engine.maxSessionTime;
			globalTime = preciseTime;
			isPlaying = false;
			return;
		}

		if (timestamp - lastCommitTime >= 33 || playbackSpeed > 2) {
			globalTime = preciseTime;
			lastCommitTime = timestamp;
		}

		if (isPlaying) {
			reqFrameId = requestAnimationFrame(loop);
		}
	}

	function togglePlay() {
		isPlaying = !isPlaying;
		if (isPlaying) {
			preciseTime = globalTime;
			lastCommitTime = performance.now();
			lastFrameTime = performance.now();
			reqFrameId = requestAnimationFrame(loop);
		} else {
			cancelAnimationFrame(reqFrameId);
		}
	}

	function handleScrub(e: Event) {
		const target = e.target as HTMLInputElement;
		globalTime = parseFloat(target.value);
		preciseTime = globalTime;
	}

	let { data }: { data: PageData } = $props();
</script>

<SEO replay={data?.sessionMeta} />

<div
	class="flex min-h-screen flex-col bg-background text-foreground selection:bg-red-900/40 selection:text-foreground"
	style="font-family: 'IBM Plex Sans', sans-serif;"
>
	<!-- Top navbar -->
	<header
		class="flex shrink-0 items-center justify-between border-b border-divider/60 bg-surface/50 px-4 py-2.5 sm:px-3 sm:py-1.5"
	>
		<div class="flex items-center gap-2">
			<a
				href="/"
				class="flex h-8 w-8 items-center justify-center rounded-md -ml-1 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground active:scale-95"
				title="Back to Home"
			>
				<Home class="h-4 w-4" />
			</a>
			<span class="text-border/60">/</span>
			<span
				class="font-mono text-xs sm:text-[11px] font-bold tracking-wider text-foreground uppercase truncate max-w-50 sm:max-w-none"
			>
				{page.params.year} · {engine.metadata?.session_info?.name ||
					(page.params.session ?? "").toUpperCase()}
			</span>
		</div>

		<div class="flex items-center">
			<ModeToggle
				class="border-0 p-1.5 hover:bg-surface-raised"
			/>
		</div>
	</header>

	<div class="flex min-h-0 flex-1 flex-col p-3 sm:p-4">
		{#if telemetryIssue}
			<div
				class="mb-3 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-600 dark:text-amber-400 shadow-xs"
			>
				<AlertTriangle class="h-5 w-5 shrink-0 text-amber-500" />
				<div
					class="flex flex-col text-xs sm:flex-row sm:items-center sm:gap-2 sm:text-sm"
				>
					<span
						>{telemetryIssue.message ||
							`Telemetry data has known issues for ${telemetryIssue.name || "this session"}.`}</span
					>
				</div>
			</div>
		{/if}

		<!-- TOP SECTION -->
		<div class="mb-3 flex flex-col gap-3">
			{#if engine.totalRows > 0}
				<div class="flex flex-col gap-3 bg-background px-1 py-1">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div class="flex items-center gap-3">
							<button
								onclick={togglePlay}
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105 active:scale-95"
								title={isPlaying ? "Pause" : "Play"}
							>
								{#if isPlaying}
									<svg
										width="15"
										height="15"
										viewBox="0 0 24 24"
										fill="currentColor"
										><rect x="6" y="4" width="4" height="16" /><rect
											x="14"
											y="4"
											width="4"
											height="16"
										/></svg
									>
								{:else}
									<svg
										width="15"
										height="15"
										viewBox="0 0 24 24"
										fill="currentColor"
										class="translate-x-0.5"
										><polygon points="5 3 19 12 5 21 5 3" /></svg
									>
								{/if}
							</button>

							<TrackStatus status={currentTrackStatus} />
						</div>

						<div class="flex shrink-0 items-center gap-2 pl-0 sm:pl-4">
							<label
								for="speed-select"
								class="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase"
								>Speed</label
							>
							<select
								id="speed-select"
								bind:value={playbackSpeed}
								class="cursor-pointer rounded-md border border-divider bg-background px-2 py-1 font-mono text-sm text-foreground focus:border-red-600 focus:outline-none"
							>
								<option value={1}>1x</option>
								<option value={2}>2x</option>
								<option value={5}>5x</option>
								<option value={10}>10x</option>
								<option value={20}>20x</option>
								<option value={50}>50x</option>
								<option value={100}>100x</option>
							</select>
						</div>
					</div>

					<div class="flex w-full flex-col justify-center pt-2">
						<div class="mb-1.5 flex items-end justify-between">
							<span
								class="font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-wider"
								>START</span
							>
							<span
								class="font-mono text-xs font-bold text-red-600 tabular-nums tracking-widest"
							>
								{formatSessionTime(globalTime)}
							</span>
							<span
								class="font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-wider"
								>END</span
							>
						</div>
						<input
							type="range"
							min={engine.minSessionTime}
							max={engine.maxSessionTime}
							value={globalTime}
							oninput={handleScrub}
							class="h-1.5 w-full cursor-crosshair appearance-none rounded-full bg-surface-overlay accent-red-600"
						/>
						<!-- Track Status Timeline Bar -->
						<div
							class="mt-2 h-3 w-full overflow-hidden rounded-full opacity-80"
							style={trackStatusGradient}
						></div>
					</div>

					{#if !engine.isLoading && focusedDriver}
						<div class="pt-1">
							<TelemetryHud
								compact={true}
								telemetry={focusedTelemetry}
								meta={focusedMeta}
								driverId={focusedDriver}
								bind:showOnlySelectedOnMap
								bind:showCornersOnMap
								{globalTime}
								leaderLap={liveLeaderboard[0]?.row?.lap_number || 1}
								totalLaps={engine.metadata?.session_info?.totalLaps}
								sessionInfo={engine.metadata?.session_info}
								year={page.params.year}
								round={page.params.round}
								{lapData}
								carAheadInfo={focusedNearbyDrivers.ahead}
								carBehindInfo={focusedNearbyDrivers.behind}
							/>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		{#if engine.isLoading}
			<!-- Loading Spinner -->
			<div
				class="flex flex-1 flex-col items-center justify-center rounded-xl border border-divider bg-surface shadow-2xl"
			>
				<div
					class="mb-6 h-10 w-10 animate-spin rounded-full border-2 border-divider border-t-foreground"
				></div>
				<p
					class="animate-pulse font-mono text-xs text-muted-foreground uppercase"
				>
					Loading telemetry…
				</p>
			</div>
		{:else if engine.totalRows > 0}
			<!-- Mobile View Tabs (< xl) -->
			<div
				class="flex xl:hidden items-center justify-center p-1 rounded-lg bg-surface-raised/70 border border-divider/60 mb-1 gap-1"
			>
				<button
					onclick={() => (mobileTab = "map")}
					class="flex-1 py-1.5 px-3 rounded-md font-mono text-[11px] font-bold uppercase tracking-wider transition-all {mobileTab ===
					'map'
						? 'bg-surface shadow-xs text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Track Map
				</button>
				<button
					onclick={() => (mobileTab = "leaderboard")}
					class="flex-1 py-1.5 px-3 rounded-md font-mono text-[11px] font-bold uppercase tracking-wider transition-all {mobileTab ===
					'leaderboard'
						? 'bg-surface shadow-xs text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Leaderboard
				</button>
				<button
					onclick={() => (mobileTab = "both")}
					class="flex-1 py-1.5 px-3 rounded-md font-mono text-[11px] font-bold uppercase tracking-wider transition-all {mobileTab ===
					'both'
						? 'bg-surface shadow-xs text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Split
				</button>
			</div>

			<!-- Main Replay Interface -->
			<div class="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row">
				<!-- Left Sidebar: Vertical Live Leaderboard -->
				<div
					class="w-full min-h-0 shrink-0 flex-col xl:flex xl:h-auto xl:w-[50vw] xl:max-w-[50vw] {mobileTab ===
					'leaderboard'
						? 'flex flex-1 h-[60vh] sm:h-[65vh]'
						: mobileTab === 'both'
							? 'flex h-88 sm:h-104'
							: 'hidden xl:flex'}"
				>
					<Leaderboard
						drivers={liveLeaderboard}
						{focusedDriver}
						{sessionMode}
						qualifyingData={engine.metadata?.qualifying}
						onSelect={(id) => (focusedDriver = id)}
					/>
				</div>

				<!-- Center/Right: Track Map -->
				<div
					class="relative aspect-square w-full max-h-[60vh] flex-col overflow-hidden rounded-lg border border-divider bg-surface sm:max-h-[65vh] xl:flex xl:w-[50vw] xl:max-w-[50vw] xl:max-h-[calc(100vh-200px)] {mobileTab ===
						'map' || mobileTab === 'both'
						? 'flex'
						: 'hidden xl:flex'}"
				>
					<!-- Track Map Header: Weather (separate line on mobile) + Corners toggle & Rotation -->
					<div
						class="flex shrink-0 flex-col sm:flex-row sm:items-center justify-between gap-x-3 gap-y-2 border-b border-divider bg-surface-raised/40 px-3 py-2 sm:py-1.5"
					>
						<!-- Weather: on its own line on mobile -->
						{#if currentWeather}
							<div class="flex items-center min-w-0 overflow-x-auto">
								<WeatherWidget
									weather={currentWeather}
									class="bg-transparent px-0 py-0"
								/>
							</div>
						{/if}

						<!-- Controls: Corners toggle (left on mobile, right on desktop) + Rotation Slider -->
						<div
							class="flex items-center justify-between sm:justify-end gap-3 shrink-0"
						>
							<!-- Corners toggle -->
							<button
								onclick={() => (showCornersOnMap = !showCornersOnMap)}
								title={showCornersOnMap
									? "Hide corner numbers"
									: "Show corner numbers"}
								class="flex items-center gap-1.5 rounded border border-divider/60 bg-surface-overlay/50 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-widest transition-colors hover:text-foreground {showCornersOnMap
									? 'border-primary/50 text-foreground shadow-xs'
									: 'text-muted-foreground/70'}"
							>
								<span
									class="inline-block size-1.5 rounded-full {showCornersOnMap
										? 'bg-primary'
										: 'bg-muted-foreground/30'}"
								></span>
								Corners
							</button>

							<!-- Rotation Slider -->
							<div class="flex items-center gap-2 shrink-0">
								<span
									class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase"
									>Rotation</span
								>
								<input
									type="range"
									min="0"
									max="360"
									step="1"
									bind:value={mapRotation}
									class="h-1.5 w-20 cursor-ew-resize appearance-none rounded-full bg-surface-overlay accent-primary sm:w-24"
								/>
								<span
									class="w-7 text-right font-mono text-[10px] text-foreground"
									>{mapRotation}°</span
								>
							</div>
						</div>
					</div>

					<div class="relative w-full flex-1">
						<div class="absolute inset-0">
							<TrackMap
								trackPath={engine.trackPath}
								activeDots={mapDots}
								corners={showCornersOnMap ? trackCorners : []}
								bind:rotation={mapRotation}
								showRotationGUI={false}
							/>
						</div>
					</div>
				</div>
			</div>

			<!-- Bottom Bar: Timeline Controls -->
		{:else}
			<!-- Empty State -->
			<div
				class="flex flex-1 items-center justify-center rounded-xl border border-divider bg-surface"
			>
				<p
					class="flex items-center justify-center gap-3 text-sm font-semibold tracking-widest text-muted-foreground uppercase"
				>
					Session Data Not Available
				</p>
			</div>
		{/if}
	</div>
</div>
