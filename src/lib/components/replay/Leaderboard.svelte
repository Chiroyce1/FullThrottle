<script lang="ts">
	import type { LeaderboardEntry, QualiPhaseEntry, SectorStatus } from "$lib/types";
	import {
		type SessionMode,
		formatLapTime,
		formatSectorTime,
		getDriverAbbreviation,
	} from "$lib/utils";
	import CompoundBadge from "$lib/components/CompoundBadge.svelte";

	let {
		drivers = [],
		focusedDriver = "",
		sessionMode = "race",
		qualifyingData = {},
		onSelect,
	}: {
		drivers: LeaderboardEntry[];
		focusedDriver: string;
		sessionMode?: SessionMode;
		qualifyingData?: Record<string, QualiPhaseEntry>;
		onSelect: (id: string) => void;
	} = $props();

	const isRace = $derived(sessionMode === "race");
	const isQualifying = $derived(sessionMode === "qualifying");

	const title = $derived(
		isQualifying ? "Qualifying order" : isRace ? "Live timing" : "Session order",
	);

	// Column templates: mobile drops lap times and sectors.
	const cols = $derived(
		isQualifying
			? "grid-cols-[1.5rem_minmax(0,1fr)_2.5rem_4.5rem]"
			: isRace
				? "grid-cols-[1.5rem_minmax(0,1fr)_4rem_4rem_3.25rem] sm:grid-cols-[1.5rem_minmax(0,1fr)_3.75rem_3.75rem_4.5rem_8rem_3.25rem]"
				: "grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_3.25rem] sm:grid-cols-[1.75rem_minmax(0,1fr)_4.5rem_8rem_3.5rem]",
	);

	function position(entry: LeaderboardEntry, index: number) {
		const { row, meta } = entry;
		if (isQualifying) return meta?.pos && meta.pos > 0 ? meta.pos : index + 1;
		if (!isRace) return index + 1;
		return row.position ?? meta?.pos ?? "–";
	}

	function name(entry: LeaderboardEntry) {
		const { meta, id } = entry;
		return meta?.last_name || meta?.name?.split(" ").pop() || meta?.abbreviation || id;
	}

	function highestPhase(q: QualiPhaseEntry | undefined) {
		if (!q) return null;
		if (q.q3 !== null) return { phase: "Q3", time: q.q3 };
		if (q.q2 !== null) return { phase: "Q2", time: q.q2 };
		return { phase: "Q1", time: q.q1 };
	}

	const sectorBar: Record<SectorStatus, string> = {
		purple: "bg-violet-500",
		green: "bg-emerald-500",
		yellow: "bg-yellow-400",
		none: "bg-muted",
	};
	const sectorText: Record<SectorStatus, string> = {
		purple: "text-violet-600 dark:text-violet-400",
		green: "text-emerald-600 dark:text-emerald-400",
		yellow: "text-amber-600 dark:text-yellow-300",
		none: "text-muted-foreground",
	};
</script>

<div class="panel flex h-full w-full flex-col overflow-hidden">
	<div class="flex shrink-0 items-center border-b border-border px-3 py-2">
		<h3 class="text-xs font-medium text-foreground">{title}</h3>
	</div>

	<div
		class="grid {cols} shrink-0 items-center gap-x-2 border-b border-border px-3 py-1.5 text-2xs text-muted-foreground"
	>
		<span>Pos</span>
		<span>Driver</span>
		{#if isQualifying}
			<span>Q</span>
			<span class="text-right">Time</span>
		{:else}
			{#if isRace}
				<span class="text-right">Gap</span>
				<span class="text-right">Int</span>
			{/if}
			<span class="text-right {isRace ? 'hidden sm:block' : ''}">Best / last</span>
			<span class="hidden text-right sm:block">Sectors</span>
			<span class="text-right">Tyre</span>
		{/if}
	</div>

	<div class="no-scrollbar min-h-0 flex-1 overflow-y-auto">
		{#each drivers as entry, index (entry.id)}
			{@const { id, row, meta } = entry}
			{@const focused = focusedDriver === id}
			<button
				type="button"
				onclick={() => onSelect(id)}
				aria-pressed={focused}
				class="grid w-full {cols} items-center gap-x-2 border-b border-border/50 px-3 py-1.5 text-left transition-colors {focused
					? 'bg-accent'
					: 'hover:bg-accent/50'}"
			>
				<span class="font-mono text-xs text-muted-foreground tabular-nums">{position(entry, index)}</span>

				<span class="flex min-w-0 items-center gap-2">
					<span class="h-4 w-1 shrink-0 rounded-full" style="background-color: {meta?.color || '#888'}"></span>
					<span class="truncate text-sm font-medium text-foreground">
						<span class="font-mono sm:hidden">{getDriverAbbreviation(meta, id).slice(0, 3)}</span>
						<span class="hidden sm:inline">{name(entry)}</span>
					</span>
					{#if !isQualifying && row.drs > 8}
						<span class="rounded-sm bg-emerald-500/15 px-1 font-mono text-2xs font-medium text-emerald-600 dark:text-emerald-400">DRS</span>
					{/if}
				</span>

				{#if isQualifying}
					{@const q = highestPhase(qualifyingData?.[id])}
					<span class="font-mono text-xs text-muted-foreground">{q?.phase ?? "–"}</span>
					<span class="text-right font-mono text-xs text-foreground tabular-nums">{formatLapTime(q?.time)}</span>
				{:else if isRace && row.position === 0 && row.distance > 0}
					<span class="text-right text-xs text-muted-foreground" style="grid-column: 3 / -1">Retired</span>
				{:else}
					{#if isRace}
						<span class="text-right font-mono text-xs tabular-nums {index === 0 ? 'text-muted-foreground' : 'text-foreground'}">
							{index === 0 ? "Leader" : row.gap_to_leader !== undefined ? `+${row.gap_to_leader.toFixed(3)}` : "–"}
						</span>
						<span class="text-right font-mono text-xs tabular-nums {index === 0 ? 'text-muted-foreground' : 'text-foreground'}">
							{index === 0 ? "–" : row.time_gap !== undefined ? `+${row.time_gap.toFixed(3)}` : "–"}
						</span>
					{/if}

					<span class="text-right font-mono text-xs leading-tight tabular-nums {isRace ? 'hidden sm:block' : ''}">
						<span class="block {row._is_purple ? 'text-violet-600 dark:text-violet-400' : 'text-foreground'}">{formatLapTime(row._cached_best_lap)}</span>
						<span class="block text-muted-foreground">{formatLapTime(row._cached_last_lap)}</span>
					</span>

					<span class="hidden flex-col items-end gap-0.5 sm:flex">
						<span class="flex gap-0.5">
							{#each [row._sector1_state, row._sector2_state, row._sector3_state] as st, i (i)}
								<span class="h-1 w-10 rounded-full {sectorBar[st ?? 'none']}"></span>
							{/each}
						</span>
						<span class="flex gap-0.5 font-mono text-2xs tabular-nums">
							{#each [[row._sector1_state, row._sector1_time], [row._sector2_state, row._sector2_time], [row._sector3_state, row._sector3_time]] as [st, t], i (i)}
								<span class="w-10 text-center {sectorText[(st as SectorStatus) ?? 'none']}">{formatSectorTime(t as number | null | undefined)}</span>
							{/each}
						</span>
					</span>

					<span class="flex items-center justify-end gap-1 font-mono text-2xs text-muted-foreground tabular-nums">
						<CompoundBadge compound={row.compound || "UNKNOWN"} size={18} />
						{#if row.tyre_life !== undefined}{row.tyre_life}L{/if}
					</span>
				{/if}
			</button>
		{/each}
	</div>
</div>
