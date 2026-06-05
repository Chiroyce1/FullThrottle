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

	import { SlotManager, type YearEntry } from "./slot-manager.svelte";
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

		const onPageHide = () => sm.dispose();
		window.addEventListener("pagehide", onPageHide);
		return () => {
			window.removeEventListener("pagehide", onPageHide);
		};
	});

	const sm = new SlotManager(() => years);
	onDestroy(() => sm.dispose());

	let xDomain = $state<[number, number] | null>(null);
	let hoverDist = $state<number | null>(null);

	function loadData() {
		if (!sm.canLoadData) return;
		hoverDist = null;
		xDomain = null;
		sm.load(settings.dataFrequency);
	}

	let trackCorners = $state<TrackCorner[]>([]);
	let lastCornerLocation = $state("");
	let showCorners = $state(true);

	$effect(() => {
		const rd = sm.roundData(0);
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
		sm.slots
			.map((_, sid) => ({
				data: sm.lapData(sid),
				color: sm.color(sid),
				label: sm.driverTla(sid),
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
		const datasets = sm.slots
			.map((_, sid) => ({ data: sm.lapData(sid), color: sm.color(sid) }))
			.filter((d) => d.data.length >= 2);

		if (datasets.length < 2) return [];
		return buildSpeedDeltaSegmentsN(datasets);
	});

	const hudRows = $derived(
		sm.slots.map((_, sid) => rowAtDist(sm.lapData(sid), hoverDist)),
	);
	const slotColors = $derived(sm.slots.map((_, sid) => sm.color(sid)));
	const slotTlas = $derived(sm.slots.map((_, sid) => sm.driverTla(sid)));

	const activeDots = $derived.by(() => {
		if (hoverDist === null) return [];

		const samples = sm.slots
			.map((_, sid) => {
				const data = sm.lapData(sid);
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
				? sm.driverTla(winner.sid)
				: `${sm.driverTla(winner.sid)} +${speedGap}km/h`;

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
				{#if sm.needsReloadAny && !sm.isLoading}
					<span class="font-mono text-[10px] text-amber-400 uppercase">
						Selection changed. Hit Load Data again.
					</span>
				{/if}
				{#if sm.isLoading}
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
					disabled={!sm.canLoadData || sm.isLoading}
					class="h-8 border border-primary bg-primary px-5 font-mono text-xs font-black tracking-widest text-primary-foreground uppercase transition-all hover:bg-transparent hover:text-primary disabled:opacity-40"
					>{sm.isLoading ? "Loading…" : "Load Data"}</Button
				>
				<Button
					onclick={() => sm.addSlot()}
					variant="outline"
					class="h-8 border-divider bg-surface px-3 font-mono text-xs font-black tracking-widest text-on-surface uppercase transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary"
					>Add Driver</Button
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
				{#each sm.slots as _, sid}
					<SlotRow
						bind:slot={sm.slots[sid]}
						{sid}
						{years}
						laps={sm.driverLaps(sid)}
						color={sm.color(sid)}
						isLast={sid === sm.slots.length - 1}
						isOnly={sm.slots.length === 1}
						onremove={() => sm.removeSlot(sid)}
					/>
				{/each}
			</div>
		{/if}
	</header>

	<!-- ── CHARTS + MAP ─────────────────────────────────────────────────── -->
	<main class="flex min-h-0 flex-1 flex-col md:flex-row items-start gap-3 p-3">
		{#if sm.isLoading}
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
					trackPath={sm.trackPath}
					{activeDots}
					speedDeltaMode={sm.slots.length > 1 &&
						sm.lapData(0).length > 0 &&
						sm.lapData(1).length > 0}
					{speedDeltaSegments}
					rotation={0}
					showLabels={false}
					corners={showCorners ? trackCorners : []}
				/>
			</div>
		{:else}
			<TelemetryEmptyState
				slots={sm.slots}
				slotColors={(sid) => sm.color(sid)}
				slotBadge={(sid) => sm.badge(sid)}
				slotDriverName={(sid) => sm.driverName(sid)}
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
