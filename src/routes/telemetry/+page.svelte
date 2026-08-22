<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { slide } from "svelte/transition";
	import TrackMap from "$lib/components/TrackMap.svelte";
	import type {
		ChartHighlight,
		ChartSeries,
	} from "$lib/components/SyncedTelemetryChart.svelte";
	import { Button } from "$lib/components/ui/button";
	import ModeToggle from "$lib/components/ModeToggle.svelte";
	import { settings } from "$lib/settings";
	import {
		LICO_THROTTLE_THRESHOLD,
		LICO_MIN_DISTANCE,
		LICO_COLOR,
	} from "$lib/constants";
	import SlotRow from "./SlotRow.svelte";
	import TelemetryHUD from "./TelemetryHUD.svelte";
	import TelemetryCharts from "./TelemetryCharts.svelte";
	import TelemetryEmptyState from "./TelemetryEmptyState.svelte";
	import { loadTrackCorners, type TrackCorner } from "$lib/track-corners";

	import { TelemetryState, type YearEntry } from "./state";
	import { rowAtDist, buildSpeedDeltaSegmentsN } from "./telemetry-utils";

	let years = $state<YearEntry[]>([]);
	let innerWidth = $state(1024);
	let selectorsExpanded = $state(true);

	onMount(() => {
		selectorsExpanded = window.innerWidth >= 768;

		fetch("/metadata.json")
			.then((r) => r.json() as Promise<{ years: YearEntry[] }>)
			.then((d) => {
				years = d.years;
			});

		const onPageHide = () => tm.dispose();
		window.addEventListener("pagehide", onPageHide);
		return () => {
			window.removeEventListener("pagehide", onPageHide);
		};
	});

	const tm = new TelemetryState(() => years);
	onDestroy(() => tm.dispose());

	let xDomain = $state<[number, number] | null>(null);
	let hoverDist = $state<number | null>(null);

	function loadData() {
		if (!tm.canLoadData) return;
		hoverDist = null;
		xDomain = null;
		tm.load(settings.dataFrequency);
	}

	let trackCorners = $state<TrackCorner[]>([]);
	let lastCornerLocation = $state("");
	let showCorners = $state(true);

	$effect(() => {
		const rd = tm.roundData(0);
		const location = rd?.location || "";
		if (location === lastCornerLocation) return;
		lastCornerLocation = location;

		if (!location) {
			trackCorners = [];
			return;
		}

		loadTrackCorners(location).then((data) => {
			trackCorners = data?.corners ?? [];
		});
	});

	const allSeries = $derived<ChartSeries[]>(
		tm.slots
			.map((_, sid) => ({
				data: tm.lapData(sid),
				color: tm.color(sid),
				label: tm.driverTla(sid),
			}))
			.filter((s) => s.data.length > 0),
	);

	const allLico = $derived.by<ChartHighlight[]>(() => {
		const out: ChartHighlight[] = [];
		for (const data of allSeries.map((s) => s.data)) {
			let cur: ChartHighlight | null = null;
			for (const row of data) {
				const isLico =
					(row.throttle || 0) < LICO_THROTTLE_THRESHOLD && !row.brake;
				if (isLico) {
					const d = row.distance ?? 0;
					if (!cur)
						cur = { start: d, end: d, color: LICO_COLOR, label: "LiCO" };
					else cur.end = d;
				} else if (cur) {
					if (cur.end - cur.start > LICO_MIN_DISTANCE) out.push(cur);
					cur = null;
				}
			}
			if (cur && cur.end - cur.start > LICO_MIN_DISTANCE) out.push(cur);
		}
		return out;
	});

	const speedDeltaSegments = $derived.by(() => {
		const datasets = tm.slots
			.map((_, sid) => ({ data: tm.lapData(sid), color: tm.color(sid) }))
			.filter((d) => d.data.length >= 2);

		if (datasets.length < 2) return [];
		return buildSpeedDeltaSegmentsN(datasets);
	});

	const hudRows = $derived(
		tm.slots.map((_, sid) => rowAtDist(tm.lapData(sid), hoverDist)),
	);
	const slotColors = $derived(tm.slots.map((_, sid) => tm.color(sid)));
	const slotTlas = $derived(tm.slots.map((_, sid) => tm.driverTla(sid)));

	const activeDots = $derived.by(() => {
		if (hoverDist === null) return [];

		const samples = tm.slots
			.map((_, sid) => {
				const data = tm.lapData(sid);
				const row = rowAtDist(data, hoverDist);
				if (!row || !Number.isFinite(row.x) || !Number.isFinite(row.y))
					return null;
				if (row.x === 0 && row.y === 0) return null;
				return { sid, row, speed: row.speed ?? 0 };
			})
			.filter((s): s is NonNullable<typeof s> => s !== null);

		if (samples.length === 0) return [];

		const winner = samples.reduce(
			(fastest, s) => (s.speed > fastest.speed ? s : fastest),
			samples[0],
		);
		const speeds = samples.map((s) => s.speed);
		const speedGap = Math.round(Math.max(...speeds) - Math.min(...speeds));

		const label =
			samples.length === 1 || speedGap === 0
				? tm.driverTla(winner.sid)
				: `${tm.driverTla(winner.sid)} +${speedGap}km/h`;

		return [
			{
				id: "hover-cursor",
				label,
				x: winner.row.x,
				y: winner.row.y,
				z: winner.row.z,
				color: "#ffffff",
			},
		];
	});

	// ── Load button label + class logic ──────────────────────────────────

	const loadButtonLabel = $derived.by(() => {
		if (tm.loadFeedback === "loading" || tm.isLoading) return "Loading…";
		if (tm.loadFeedback === "success") return "✓ Loaded";
		if (tm.loadFeedback === "error") return "✕ Error";
		return "Load Data";
	});

	const loadButtonClass = $derived.by(() => {
		const base =
			"h-8 border px-5 font-mono text-xs font-black tracking-widest uppercase transition-all";
		if (tm.loadFeedback === "success")
			return `${base} border-green-500 bg-green-500/15 text-green-400`;
		if (tm.loadFeedback === "error")
			return `${base} border-red-500 bg-red-500/15 text-red-400`;
		return `${base} border-primary bg-primary text-primary-foreground hover:bg-transparent hover:text-primary disabled:opacity-40`;
	});

	// ── Add Driver button label + class logic ────────────────────────────

	const addDriverLabel = $derived(
		tm.addDriverFeedback === "added" ? "✓ Added" : "Add Driver",
	);

	const addDriverClass = $derived.by(() => {
		const base =
			"h-8 border px-3 font-mono text-xs font-black tracking-widest uppercase transition-all duration-200";
		if (tm.addDriverFeedback === "added")
			return `${base} border-green-500 bg-green-500/15 text-green-400`;
		return `${base} border-divider bg-surface text-on-surface hover:border-primary hover:bg-primary/10 hover:text-primary`;
	});
</script>

<svelte:head>
	<title>FullThrottle - Telemetry</title>
</svelte:head>

<svelte:window bind:innerWidth />

<div class="flex min-h-screen w-full flex-col bg-surface text-foreground">
	<!-- ── HEADER ──────────────────────────────────────────────────────── -->
	<header class="shrink-0 border-b border-divider bg-surface">
		<!-- Top bar -->
		<div
			class="flex flex-col md:flex-row md:items-center justify-between border-b border-divider px-4 py-2.5 gap-3 md:gap-0"
		>
			<div
				class="font text-xl font-bold text-primary flex justify-between md:justify-start gap-4 items-center"
			>
				<a href="/">FullThrottle</a>
				<ModeToggle />
			</div>

			<div class="flex flex-wrap items-center gap-3">
				{#if tm.needsReloadAny && !tm.isLoading}
					<span
						class="font-mono text-[10px] text-amber-400 uppercase animate-pulse"
					>
						Selection changed — hit Load Data
					</span>
				{/if}
				{#if tm.isLoading}
					<div class="flex items-center gap-2">
						<div
							class="h-3 w-3 animate-spin rounded-full border border-divider border-t-foreground"
						></div>
						<span class="font-mono text-[10px] text-on-surface-subtle uppercase"
							>{settings.dataFrequency} Hz…</span
						>
					</div>
				{/if}
				<label
					class="flex cursor-pointer items-center gap-1.5 select-none mr-2"
				>
					<input
						type="checkbox"
						bind:checked={showCorners}
						class="h-3.5 w-3.5 rounded border-divider accent-primary"
					/>
					<span class="font-mono text-sm font-bold text-on-surface uppercase"
						>Corners</span
					>
				</label>
				<Button
					onclick={loadData}
					disabled={!tm.canLoadData ||
						tm.isLoading ||
						tm.loadFeedback === "success"}
					class={loadButtonClass}
					>{loadButtonLabel}</Button
				>
				<Button
					onclick={() => tm.addSlot()}
					variant="outline"
					class={addDriverClass}
					>{addDriverLabel}</Button
				>
				<Button
					onclick={() => {
						tm.reset();
						hoverDist = null;
						xDomain = null;
					}}
					variant="outline"
					class="h-8 border-divider bg-surface px-3 font-mono text-xs font-black tracking-widest text-on-surface-subtle uppercase transition-colors hover:border-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
					>Reset</Button
				>
			</div>
		</div>

		<!-- Slot rows Toggle -->
		<button
			class="w-full flex items-center justify-between px-4 py-2 text-xs font-mono font-bold uppercase border-b border-divider hover:bg-surface-raised transition-colors"
			onclick={() => (selectorsExpanded = !selectorsExpanded)}
		>
			<span class="flex items-center gap-2">
				<span
					>{selectorsExpanded
						? "Hide Configuration"
						: "Show Configuration"}</span
				>
				{#if !selectorsExpanded && slotTlas.length > 0}
					<span class="text-on-surface-subtle"
						>({slotTlas.filter(Boolean).join(" vs ")})</span
					>
				{/if}
			</span>
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				class:rotate-180={selectorsExpanded}
				class="transition-transform"
			>
				<path d="M6 9l6 6 6-6" />
			</svg>
		</button>

		<!-- Slot rows -->
		{#if selectorsExpanded}
			<div
				class="max-h-[42vh] overflow-y-auto custom-scrollbar"
				transition:slide={{ duration: 200 }}
			>
				{#each tm.slots as _, sid}
					<SlotRow
						bind:slot={tm.slots[sid]}
						{sid}
						{years}
						laps={tm.driverLaps(sid)}
						color={tm.color(sid)}
						isLoaded={tm.slots[sid].hasLoaded}
						isLast={sid === tm.slots.length - 1}
						isOnly={tm.slots.length === 1}
						onremove={() => tm.removeSlot(sid)}
					/>
				{/each}
			</div>
		{/if}
	</header>

	<!-- ── CHARTS + MAP ─────────────────────────────────────────────────── -->
	<main class="flex min-h-0 flex-1 flex-col md:flex-row items-start gap-3 p-3">
		{#if tm.isLoading}
			<div
				class="flex flex-1 items-center justify-center rounded-xl bg-surface py-48"
			>
				<div class="flex flex-col items-center gap-4">
					<div
						class="h-10 w-10 animate-spin rounded-full border-2 border-divider border-t-foreground"
					></div>
					<p
						class="font-mono text-xs tracking-[0.3em] text-on-surface-subtle uppercase"
					>
						Loading telemetry…
					</p>
				</div>
			</div>
		{:else if allSeries.length > 0}
			<!-- Charts panel -->
			<div
				class="custom-scrollbar max-h-none md:max-h-[calc(100dvh-13rem)] min-h-0 w-full md:flex-1 overflow-y-auto rounded-xl border border-divider bg-surface"
			>
				<TelemetryHUD {hudRows} {slotColors} {slotTlas} />
				<TelemetryCharts
					series={allSeries}
					highlights={allLico}
					{xDomain}
					hoverX={hoverDist}
					onZoom={(d) => {
						xDomain = d;
					}}
					onHover={(x) => {
						hoverDist = x;
					}}
					corners={showCorners ? trackCorners : []}
				/>
			</div>

			<!-- Track Map -->
			<div
				class="relative md:sticky top-3 h-100 md:h-[calc(100dvh-13rem)] w-full md:w-[320px] shrink-0 overflow-hidden rounded-xl border border-divider bg-surface xl:w-100"
			>
				<TrackMap
					trackPath={tm.trackPath}
					{activeDots}
					speedDeltaMode={tm.slots.length > 1 &&
						tm.lapData(0).length > 0 &&
						tm.lapData(1).length > 0}
					{speedDeltaSegments}
					rotation={0}
					showLabels={false}
					corners={showCorners ? trackCorners : []}
				/>
			</div>
		{:else}
			<TelemetryEmptyState
				slots={tm.slots}
				slotColors={(sid) => tm.color(sid)}
				slotBadge={(sid) => tm.badge(sid)}
				slotDriverName={(sid) => tm.driverName(sid)}
			/>
		{/if}
	</main>
</div>

<style>
	.custom-scrollbar::-webkit-scrollbar {
		width: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: var(--divider);
		border-radius: 2px;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background: var(--surface-overlay);
	}
</style>
