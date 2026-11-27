<script lang="ts">
	import { CaretDown } from "phosphor-svelte";
	import TelemetryCharts from "$lib/components/TelemetryCharts.svelte";
	import { Toggle } from "$lib/components/app";
	import type { ChartSeries } from "$lib/components/SyncedTelemetryChart.svelte";
	import type { TelemetryRow } from "$lib/types";
	import { cn, formatLapTime, getDriverAbbreviation } from "$lib/utils";
	import type { ReplayView } from "$lib/replay/replay-view.svelte";

	/**
	 * The focused driver's current lap (speed, throttle, brake, RPM)
	 * with the playhead running through it, over the previous lap as a
	 * faint ghost, one channel at a time (tabs). Hovering the chart inspects;
	 * leaving returns to the playhead. Closed, only the header row shows.
	 */
	let { view, open = $bindable(false) }: { view: ReplayView; open?: boolean } = $props();

	const CHANNELS = ["Speed", "Throttle", "Brake", "RPM"];
	let channel = $state("Speed");

	let xDomain = $state<[number, number] | null>(null);
	let hoverX = $state<number | null>(null);

	const t = $derived(view.focusedTelemetry);
	const meta = $derived(view.focusedMeta);
	const color = $derived(meta?.color || "#888");
	const tla = $derived(getDriverAbbreviation(meta, view.focusedDriver).slice(0, 3));
	const lapNumber = $derived(t?.lap_number || 1);

	/** A lap's rows with distance counted from the lap's start. */
	function fromLapStart(rows: TelemetryRow[]): TelemetryRow[] {
		const start = rows[0]?.distance ?? 0;
		return rows.map((r) => ({ ...r, distance: (r.distance ?? 0) - start }));
	}

	const current = $derived(fromLapStart(view.focusedLapData));
	const previous = $derived(
		view.focusedDriver && lapNumber > 1
			? fromLapStart(view.engine.getNormalizedLapTelemetry(view.focusedDriver, lapNumber - 1))
			: [],
	);

	const series = $derived.by<ChartSeries[]>(() => [
		...(previous.length > 0
			? [{ data: previous, color: "var(--border-strong)", label: `Lap ${lapNumber - 1}` }]
			: []),
		{ data: current, color, label: tla },
	]);

	/** Where the car is now, in the current lap's distance. */
	const playhead = $derived.by(() => {
		if (current.length === 0) return null;
		const now = t?.session_time ?? view.globalTime;
		if (!Number.isFinite(now)) return null;
		let lo = 0;
		let hi = current.length - 1;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (current[mid].session_time < now) lo = mid + 1;
			else hi = mid;
		}
		return Math.max(0, current[lo].distance ?? 0);
	});

	// A new lap starts unzoomed.
	$effect(() => {
		lapNumber;
		xDomain = null;
		hoverX = null;
	});

	const lastLap = $derived(t?._cached_last_lap ?? null);
	const currentLap = $derived(t?._cached_current_lap ?? null);
</script>

<div class="panel flex h-full min-h-0 flex-col overflow-hidden">
	<div class={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-xs text-muted-foreground", open && "border-b border-border")}>
		<button
			type="button"
			class="flex h-7 items-center gap-3 text-left transition-colors hover:text-foreground"
			onclick={() => (open = !open)}
			aria-expanded={open}
			aria-label={open ? "Hide lap traces" : "Show lap traces"}
		>
			<CaretDown size={12} class={cn("transition-transform", !open && "-rotate-90")} />
			<span class="font-medium text-foreground">Lap {lapNumber}</span>
			<span class="flex items-center gap-1.5">
				<span class="h-0.5 w-3 rounded-full" style="background:{color}"></span>{tla}
			</span>
			{#if previous.length > 0}
				<span class="flex items-center gap-1.5">
					<span class="h-0.5 w-3 rounded-full bg-border-strong"></span>Lap {lapNumber - 1}
				</span>
			{/if}
		</button>
		{#if open}
			<div class="flex items-center gap-1" role="group" aria-label="Channel">
				{#each CHANNELS as c (c)}
					<Toggle pressed={channel === c} onclick={() => (channel = c)}>{c}</Toggle>
				{/each}
			</div>
		{/if}
		<span class="ml-auto flex items-center gap-3 font-mono tabular-nums">
			<span>Current <span class="text-foreground">{formatLapTime(currentLap)}</span></span>
			<span>Last <span class="text-foreground">{formatLapTime(lastLap)}</span></span>
		</span>
	</div>
	{#if open}
		<div class="relative h-56 min-h-0 xl:h-auto xl:flex-1">
			<div class="absolute inset-0">
				{#if current.length > 0}
					<TelemetryCharts
						fill
						compact
						only={[channel]}
						{series}
						highlights={[]}
						{xDomain}
						hoverX={hoverX ?? playhead}
						onZoom={(d) => (xDomain = d)}
						onHover={(x) => (hoverX = x)}
					/>
				{:else}
					<p class="p-6 text-center text-sm text-muted-foreground">No telemetry for this lap yet.</p>
				{/if}
			</div>
		</div>
	{/if}
</div>
