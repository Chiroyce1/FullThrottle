<script lang="ts">
	import CompoundBadge from "$lib/components/CompoundBadge.svelte";
	import { formatLapTime, getDriverAbbreviation } from "$lib/utils";
	import type { ReplayView } from "$lib/replay/replay-view.svelte";

	/** Focused driver: identity, position, gaps, tyre and best lap. */
	let { view }: { view: ReplayView } = $props();

	const t = $derived(view.focusedTelemetry);
	const meta = $derived(view.focusedMeta);
	const id = $derived(view.focusedDriver);
	const color = $derived(meta?.color || "#888");
	const tla = $derived(getDriverAbbreviation(meta, id).slice(0, 3));
	const fullName = $derived(meta?.broadcast_name || meta?.name || tla);
	const position = $derived(t?.position ?? meta?.pos ?? null);

	const ahead = $derived(view.nearby.ahead);
	const behind = $derived(view.nearby.behind);
	const tyreLife = $derived(t?.tyre_life);

	const gap = (s: number | null) => (s != null ? ` +${s.toFixed(3)}` : "");

	const best = $derived(t?._cached_best_lap ?? null);

</script>

{#snippet stat(label: string, value: string, valueStyle = "")}
	<div class="min-w-0">
		<div class="text-2xs text-muted-foreground">{label}</div>
		<div class="truncate font-mono text-sm text-foreground tabular-nums" style={valueStyle}>{value}</div>
	</div>
{/snippet}

<div class="panel flex flex-col">
	<div class="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
		<span class="h-6 w-1 shrink-0 rounded-full" style="background-color: {color}"></span>
		<span class="font-mono text-lg font-semibold text-foreground">{tla}</span>
		<span class="truncate text-sm text-muted-foreground">{fullName}</span>
		<span class="ml-auto font-mono text-xs text-muted-foreground">#{id}</span>
	</div>

	<div class="grid grid-cols-3 gap-x-3 gap-y-3 px-3 py-3">
		{@render stat("Position", position ? `P${position}` : "–")}
		{@render stat("Lap", `${t?.lap_number || view.leaderLap}`)}
		<div class="min-w-0">
			<div class="text-2xs text-muted-foreground">Tyre</div>
			<div class="flex items-center gap-1.5 font-mono text-sm text-foreground tabular-nums">
				<CompoundBadge compound={t?.compound ?? "UNKNOWN"} size={18} />
				{#if tyreLife !== undefined}{tyreLife} {tyreLife === 1 ? "lap" : "laps"}{/if}
			</div>
		</div>
		{@render stat("Ahead", ahead ? `${ahead.tla}${gap(ahead.gapToFocused)}` : "Leader", ahead ? `color: ${ahead.color}` : "")}
		{@render stat("Behind", behind ? `${behind.tla}${gap(behind.gapToFocused)}` : "–", behind ? `color: ${behind.color}` : "")}
		{@render stat("Best", formatLapTime(best), t?._is_purple ? "color: var(--color-violet-500)" : "")}
	</div>
</div>
