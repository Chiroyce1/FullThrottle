<script lang="ts">
	import CompoundBadge from "$lib/components/CompoundBadge.svelte";
	import { formatLapTime as fmt } from "$lib/utils";
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
	class="no-scrollbar sticky top-0 z-10 w-full min-w-0 max-w-full overflow-x-auto border-b border-border bg-card/90 backdrop-blur-md"
>
	<table class="min-w-max text-left font-mono text-xs tabular-nums">
		<thead>
			<tr class="text-2xs text-muted-foreground [&>th]:px-3 [&>th]:pt-2 [&>th]:pb-1 [&>th]:font-normal">
				<th class="font-sans">Driver</th>
				<th>Lap</th>
				<th>Δ</th>
				<th>S1</th>
				<th>S2</th>
				<th>S3</th>
				<th>Tyre</th>
				{#if isHovering}<th class="text-right">Speed</th>{/if}
			</tr>
		</thead>
		<tbody>
			{#each slots as slot, i}
				{#if slot.lap}
					{@const d =
						i > 0 && slots[0].lap?.lap_time
							? delta(slot.lap.lap_time, slots[0].lap.lap_time)
							: ""}
					<tr class="[&>td]:px-3 [&>td]:py-1 [&>td]:whitespace-nowrap">
						<td class="font-sans">
							<span class="flex items-center gap-2">
								<span
									class="h-3 w-1 shrink-0 rounded-full"
									style="background:{slot.color}"
								></span>
								<span class="font-mono font-medium text-foreground">{slot.tla}</span>
							</span>
						</td>
						<td class="font-medium text-foreground">{fmt(slot.lap.lap_time)}</td>
						<td
							class={d
								? d.startsWith("-")
									? "text-emerald-500"
									: "text-red-500"
								: "text-muted-foreground"}>{d || (i === 0 ? "ref" : "–")}</td
						>
						{#each ["sector1", "sector2", "sector3"] as const as sKey, si}
							{@const isBest =
								slots.filter((s) => s.lap).length > 1 &&
								((si === 0 && i === bestS1) ||
									(si === 1 && i === bestS2) ||
									(si === 2 && i === bestS3))}
							<td class={isBest ? "font-medium text-violet-500 dark:text-violet-400" : "text-muted-foreground"}
								>{fmt(slot.lap[sKey])}</td
							>
						{/each}
						<td>
							{#if slot.lap.compound}
								<span class="flex items-center gap-1.5 text-muted-foreground">
									<CompoundBadge compound={slot.lap.compound} size={14} />
									{slot.lap.tyre_life}L
								</span>
							{/if}
						</td>
						{#if isHovering}
							<td class="text-right" style="color:{slot.color}">
								{hudRows[i] ? `${Math.round(hudRows[i]!.speed || 0)} km/h` : ""}
							</td>
						{/if}
					</tr>
				{/if}
			{/each}
		</tbody>
	</table>
	<div class="h-1.5"></div>
</div>
