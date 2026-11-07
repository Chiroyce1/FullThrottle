<script lang="ts">
	import type { TrackCorner } from "$lib/track-corners";
	import { cornerTally, type CornerRow, type LapIdentity } from "./state/view-derivations";

	interface Props {
		rows: CornerRow[];
		/** Laps with corner data; `i` indexes into each row's `speeds`. */
		laps: (LapIdentity & { i: number })[];
		activeCorner?: string | null;
		onSelectCorner?: (corner: TrackCorner) => void;
		onHoverCorner?: (corner: TrackCorner | null) => void;
	}

	let { rows, laps, activeCorner = null, onSelectCorner, onHoverCorner }: Props = $props();

	const lapCount = $derived(rows[0]?.speeds.length ?? 0);
	const tally = $derived(laps.length >= 2 ? cornerTally(rows, lapCount) : null);

	/** Largest head-to-head gap, for scaling the delta bars (2 laps). */
	const maxGap = $derived.by(() => {
		let max = 1;
		for (const row of rows) if (row.margin !== null) max = Math.max(max, row.margin);
		return max;
	});

	const fmt = (v: number | null | undefined) => (v == null ? "–" : `${v}`);

	const gridCols = $derived(
		laps.length === 1
			? "grid-cols-[3rem_1fr]"
			: laps.length === 2
				? "grid-cols-[3rem_1fr_1fr_1.6fr]"
				: "grid-cols-[3rem_1fr_1fr_4rem]",
	);
</script>

{#if rows.length > 0 && laps.length > 0}
	<div class="flex min-h-0 w-full flex-col select-none">
		<div
			class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-3 py-2 whitespace-nowrap"
		>
			<span class="text-xs font-medium text-foreground">Corner speeds</span>
			{#if tally}
				<span class="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tabular-nums">
					{#each laps as lap (lap.i)}
						<span class="flex items-center gap-1.5">
							<span class="h-1.5 w-1.5 rounded-full" style="background-color: {lap.color}"></span>
							<span style="color: {lap.color}">{lap.tla}</span>
							<span class="text-foreground">{tally.wins[lap.i]}</span>
						</span>
					{/each}
					{#if tally.ties > 0}
						<span class="text-muted-foreground">{tally.ties} tied</span>
					{/if}
				</span>
			{:else}
				<span class="text-2xs text-muted-foreground">km/h</span>
			{/if}
		</div>

		<div
			class="grid {gridCols} items-center gap-2 border-b border-border px-3 py-1.5 text-2xs text-muted-foreground"
		>
			<span>Turn</span>
			{#if laps.length <= 2}
				{#each laps as lap (lap.i)}
					<span class="text-right font-mono" style="color: {lap.color}">{lap.tla}</span>
				{/each}
				{#if laps.length === 2}<span class="text-right">Advantage</span>{/if}
			{:else}
				<span>Fastest</span>
				<span class="text-right">km/h</span>
				<span class="text-right">Margin</span>
			{/if}
		</div>

		<div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
			{#each rows as row (row.corner.key)}
				{@const isActive = activeCorner === row.corner.key}
				{@const lead = row.leader === null ? null : laps.find((l) => l.i === row.leader)}
				<button
					type="button"
					onclick={() => onSelectCorner?.(row.corner)}
					onmouseenter={() => onHoverCorner?.(row.corner)}
					onmouseleave={() => onHoverCorner?.(null)}
					title={row.flat ? "Taken flat out" : undefined}
					class="grid w-full {gridCols} items-center gap-2 border-b border-border/60 px-3 py-1.5 text-left font-mono text-xs tabular-nums transition-colors {isActive
						? 'bg-accent'
						: 'hover:bg-accent/60'} {row.flat ? 'opacity-60' : ''}"
				>
					<span class={isActive ? "font-medium text-foreground" : "text-muted-foreground"}
						>T{row.corner.key}</span
					>

					{#if laps.length <= 2}
						{#each laps as lap (lap.i)}
							<span
								class="text-right {laps.length === 1 || row.leader === lap.i
									? 'font-medium text-foreground'
									: 'text-muted-foreground'}">{fmt(row.speeds[lap.i])}</span
							>
						{/each}
						{#if laps.length === 2}
							{@const [a, b] = laps}
							<span class="flex items-center justify-end gap-2">
								{#if row.speeds[a.i] != null && row.speeds[b.i] != null}
									{@const pct = ((row.margin ?? 0) / maxGap) * 50}
									<span class="relative h-1.5 max-w-28 flex-1 overflow-hidden rounded-full bg-muted">
										<span class="absolute inset-y-0 left-1/2 w-px bg-border-strong"></span>
										{#if row.leader === a.i}
											<span
												class="absolute inset-y-0 rounded-l-full"
												style="right: 50%; width: {pct}%; background: {a.color}"
											></span>
										{:else if row.leader === b.i}
											<span
												class="absolute inset-y-0 left-1/2 rounded-r-full"
												style="width: {pct}%; background: {b.color}"
											></span>
										{/if}
									</span>
									<span
										class="w-8 shrink-0 text-right"
										style={lead ? `color: ${lead.color}` : ""}
										class:text-muted-foreground={!lead}>{lead ? `+${row.margin}` : "0"}</span
									>
								{:else}
									<span class="text-muted-foreground">–</span>
								{/if}
							</span>
						{/if}
					{:else}
						{@const present = row.speeds.filter((v) => v !== null)}
						{#if present.length === 0}
							<span class="col-span-3 text-center text-muted-foreground">–</span>
						{:else}
							<span class="flex min-w-0 items-center gap-1.5">
								{#if lead}
									<span class="h-1.5 w-1.5 shrink-0 rounded-full" style="background: {lead.color}"></span>
									<span class="truncate" style="color: {lead.color}">{lead.tla}</span>
								{:else}
									<span class="text-muted-foreground">{present.length > 1 ? "Tie" : "–"}</span>
								{/if}
							</span>
							<span class="text-right text-foreground">{Math.max(...(present as number[]))}</span>
							<span
								class="text-right"
								style={lead ? `color: ${lead.color}` : ""}
								class:text-muted-foreground={!lead}>{lead ? `+${row.margin}` : "–"}</span
							>
						{/if}
					{/if}
				</button>
			{/each}
		</div>
	</div>
{/if}
