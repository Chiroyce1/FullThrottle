<script lang="ts">
	import CompoundBadge from "$lib/components/CompoundBadge.svelte";
	import type { ValidLap, TelemetryRow } from "$lib/types";

	interface SlotStat {
		tla: string;
		color: string;
		lap: ValidLap | null;
	}

	interface Props {
		slots: SlotStat[];
		// HUD: hover speed rows, one per slot (null when not hovering)
		hudRows?: (TelemetryRow | null)[];
	}

	let { slots, hudRows = [] }: Props = $props();

	function fmt(s: number | null | undefined): string {
		if (!s || s <= 0) return "–";
		const m = Math.floor(s / 60);
		const rem = (s % 60).toFixed(3).padStart(6, "0");
		return m > 0 ? `${m}:${rem}` : rem;
	}

	// Delta string: positive = slot is slower, negative = faster than reference
	function delta(
		a: number | null | undefined,
		b: number | null | undefined,
	): string {
		if (!a || !b || a <= 0 || b <= 0) return "";
		const d = a - b;
		return (d >= 0 ? "+" : "") + d.toFixed(3);
	}

	// Best sector index across all slots (0-based) for purple highlighting
	function bestIdx(key: "sector1" | "sector2" | "sector3"): number {
		let best = Infinity;
		let idx = -1;
		slots.forEach((s, i) => {
			const v = s.lap?.[key];
			if (v && v > 0 && v < best) {
				best = v;
				idx = i;
			}
		});
		return idx;
	}

	const bestS1 = $derived(bestIdx("sector1"));
	const bestS2 = $derived(bestIdx("sector2"));
	const bestS3 = $derived(bestIdx("sector3"));

	const isHovering = $derived(hudRows.some((r) => r !== null));
	const visible = $derived(slots.some((s) => s.lap !== null));
</script>

<div
	class="sticky top-0 z-10 flex w-full min-w-0 max-w-full items-center justify-between gap-2 border-b border-divider bg-surface-raised/80 px-2 sm:px-4 py-1.5 backdrop-blur-md"
>
	<!-- Per-slot stats (lap time + sectors + delta + compound) -->
	<div
		class="no-scrollbar flex min-w-0 flex-1 flex-col gap-1 overflow-x-auto md:overflow-visible"
	>
		{#each slots as slot, i}
			{#if slot.lap}
				<div
					class="flex flex-nowrap items-center gap-x-1.5 sm:gap-x-2.5 whitespace-nowrap"
				>
					<!-- Driver TLA -->
					<span
						class="font-mono text-[10px] font-black tracking-wider shrink-0"
						style="color:{slot.color}">{slot.tla}</span
					>

					<!-- Lap time -->
					<span
						class="font-mono text-[11px] sm:text-xs font-semibold text-on-surface tabular-nums shrink-0"
						>{fmt(slot.lap.lap_time)}</span
					>

					<!-- Hover speed — only shows while scrubbing -->
					{#if isHovering && hudRows[i]}
						<span
							class="font-mono text-[10px] sm:text-xs tabular-nums shrink-0"
							style="color:{slot.color}"
						>
							{Math.round(hudRows[i]!.speed || 0)} km/h
						</span>
					{/if}

					<!-- Sectors -->
					{#each ["sector1", "sector2", "sector3"] as const as sKey, si}
						{@const isBest =
							(si === 0 && i === bestS1) ||
							(si === 1 && i === bestS2) ||
							(si === 2 && i === bestS3)}
						{@const val = slot.lap[sKey]}
						<div class="flex items-center gap-0.5 sm:gap-1 shrink-0">
							<span
								class="font-mono text-[8px] sm:text-[9px] text-on-surface-muted uppercase"
								>S{si + 1}</span
							>
							<span
								class="font-mono text-[10px] sm:text-[11px] tabular-nums"
								class:text-amber-700={isBest}
								class:dark:text-yellow-400={isBest}
								class:font-bold={isBest}
								class:font-medium={!isBest}>{fmt(val)}</span
							>
						</div>
					{/each}

					<!-- Compound (hidden on mobile to prevent S3 truncation) -->
					{#if slot.lap.compound}
						<div class="hidden sm:flex items-center gap-1 shrink-0">
							<CompoundBadge compound={slot.lap.compound} size={14} />
							<span
								class="font-mono text-[8px] sm:text-[9px] text-on-surface-muted"
								>L{slot.lap.tyre_life}</span
							>
						</div>
					{/if}

					<!-- Delta vs slot 0 -->
					{#if i > 0 && slot.lap.lap_time && slots[0].lap?.lap_time}
						{@const d = delta(slot.lap.lap_time, slots[0].lap.lap_time)}
						{#if d}
							<span
								class="font-mono text-[9px] sm:text-[10px] tabular-nums shrink-0 font-medium"
								class:text-red-500={!d.startsWith("-")}
								class:text-emerald-500={d.startsWith("-")}>{d}</span
							>
						{/if}
					{/if}
				</div>
			{/if}
		{/each}
	</div>

	<!-- Zoom hint — right-aligned, only on desktop -->
	<span
		class="hidden md:block font-mono text-[9px] text-on-surface-muted uppercase shrink-0"
	>
		drag to zoom · dbl-click reset
	</span>
</div>
