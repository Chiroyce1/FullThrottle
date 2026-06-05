<script lang="ts">
	import SearchableSelect from "$lib/components/SearchableSelect.svelte";
	import { TrashIcon } from "lucide-svelte";
	import { COMPOUND_COLORS } from "$lib/types";
	import type { LapTimingEntry, TelemetryMeta } from "$lib/types";
	import { formatDriverNameWithAbbr, getDriverAbbreviation } from "$lib/utils";

	// ─── Types shared with parent ────────────────────────────────────────
	import type {
		SessionEntry,
		RoundEntry,
		YearEntry,
		SlotState as SlotStateType,
	} from "$lib/metadata-types";
	import { MAX_LAP_TIME_SECONDS } from "$lib/constants";

	type SlotState = SlotStateType;

	// ─── Props ───────────────────────────────────────────────────────────
	interface Props {
		slot: SlotState;
		sid: number;
		years: YearEntry[];
		laps: LapTimingEntry[];
		color: string;
		isLast: boolean;
		isOnly: boolean;
		onremove: () => void;
	}

	let {
		slot = $bindable(),
		sid,
		years,
		laps,
		color,
		isLast,
		isOnly,
		onremove,
	}: Props = $props();

	// ─── Derived helpers ─────────────────────────────────────────────────

	function slotBadge(id: number): string {
		if (id >= 0 && id < 26) return String.fromCharCode(65 + id);
		return `${id + 1}`;
	}

	const yearData = $derived(years.find((y) => y.year.toString() === slot.year));
	const roundData = $derived(
		yearData?.rounds.find((r) => r.round.toString() === slot.round),
	);
	const sortedDrivers = $derived.by(() => {
		const meta = slot.meta;
		if (!meta?.drivers) return [];
		return Object.values(meta.drivers).sort((a, b) => {
			const na =
				`${a.first_name || ""} ${a.last_name || ""}`.trim() || a.name || "";
			const nb =
				`${b.first_name || ""} ${b.last_name || ""}`.trim() || b.name || "";
			return na.localeCompare(nb);
		});
	});

	const driverMeta = $derived(
		slot.driver && slot.meta ? (slot.meta.drivers[slot.driver] ?? null) : null,
	);
	const driverName = $derived(
		driverMeta
			? formatDriverNameWithAbbr(driverMeta, slot.driver)
			: sid === 0
				? "Driver A"
				: "Driver B",
	);

	function formatLapTime(seconds: number): string {
		if (!seconds || seconds <= 0 || seconds > MAX_LAP_TIME_SECONDS)
			return "--:--.---";
		const mins = Math.floor(seconds / 60);
		const secs = (seconds % 60).toFixed(3).padStart(6, "0");
		return mins > 0 ? `${mins}:${secs}` : secs;
	}

	function lapDotColors(
		lap: LapTimingEntry,
		bestOverall: number,
		driverBest: number,
	) {
		const isOverall = lap.time === bestOverall && lap.time > 0;
		const isDriverBest = lap.time === driverBest && lap.time > 0 && !isOverall;
		return {
			badge: isOverall ? "purple" : isDriverBest ? "green" : "",
		};
	}

	const bestAll = $derived(
		Math.min(
			...laps
				.filter((l) => l.time > 0 && l.time < MAX_LAP_TIME_SECONDS)
				.map((l) => l.time),
			Infinity,
		),
	);
	const driverBest = $derived(bestAll); // same set in this slot

	const lapLabel = $derived.by(() => {
		if (slot.lap === null) return "Pick Lap";
		const lap = laps.find((l) => l.lap === slot.lap);
		if (!lap) return `Lap ${slot.lap}`;
		return `Lap ${lap.lap} - ${formatLapTime(lap.time)}`;
	});

	const slotNeedsReload = $derived.by(() => {
		const key =
			slot.year && slot.round && slot.session
				? `${slot.year}|${slot.round}|${slot.session}`
				: "";
		return !!slot.lastLoadedKey && !!key && key !== slot.lastLoadedKey;
	});

	function driverOptionLabel(d: {
		first_name: string | null;
		last_name: string | null;
		name: string | null;
		broadcast_name: string | null;
		abbreviation: string | null;
		driver_number: number;
	}): string {
		return formatDriverNameWithAbbr(d, d.driver_number.toString());
	}

	function driverOptionKeywords(d: {
		first_name: string | null;
		last_name: string | null;
		name: string | null;
		abbreviation: string | null;
		driver_number: number;
	}): string {
		const full =
			`${d.first_name || ""} ${d.last_name || ""}`.trim() || d.name || "";
		return `${full} ${getDriverAbbreviation(d, d.driver_number.toString())} ${d.driver_number}`;
	}
</script>

<div
	class={`grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 px-3 py-3 sm:px-4 sm:py-2.5${!isLast ? " border-b border-divider" : ""}`}
>
	<div class="col-span-2 sm:col-span-1 flex items-center gap-2">
	<!-- Slot letter badge -->
		<span
			class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded font-mono text-[10px] font-black"
			style="background:{color}18; color:{color}; border: 1px solid {color}35"
			>{slotBadge(sid)}</span
		>
		<!-- Load status micro-badge -->
		{#if slot.hasLoaded}
			<span class="font-mono text-[9px] text-green-500 uppercase">✓ Loaded</span>
		{:else if slotNeedsReload}
			<span class="font-mono text-[9px] text-amber-400 uppercase"
				>Load data again</span
			>
		{:else if slot.loadError}
			<span
				class="font-mono text-[9px] text-red-400 uppercase"
				title={slot.loadError}>✕ Error</span
			>
		{/if}
	</div>

	<!-- Year -->
	<SearchableSelect
		bind:value={slot.year}
		options={years.map((y) => ({
			value: y.year.toString(),
			label: y.year.toString(),
		}))}
		placeholder={slot.year || "Year"}
		searchPlaceholder="Search year..."
		triggerClass="h-9 w-full sm:w-auto sm:min-w-18 border-divider bg-surface-raised/60 font-mono text-xs text-on-surface"
		contentClass="border-divider bg-surface"
	/>

	<!-- Round -->
	<SearchableSelect
		bind:value={slot.round}
		options={(yearData?.rounds || []).map((r) => ({
			value: r.round.toString(),
			label: r.name,
			keywords: `${r.location || ""} ${r.country || ""}`,
			rightLabel: (r.location || r.country || "").toUpperCase(),
		}))}
		placeholder={roundData?.name || "Round"}
		searchPlaceholder="Search round..."
		disabled={sid !== 0}
		triggerClass="h-9 w-full sm:w-auto sm:max-w-65 sm:min-w-45 border-divider bg-surface-raised/60 text-xs text-on-surface"
		contentClass="max-h-80 border-divider bg-surface"
		listClass="max-h-80"
	/>

	<!-- Session -->
	<SearchableSelect
		bind:value={slot.session}
		options={(roundData?.sessions || []).map((sess) => ({
			value: sess.code,
			label: sess.label,
			keywords: sess.code,
		}))}
		placeholder={roundData?.sessions.find((s2) => s2.code === slot.session)
			?.label || "Session"}
		searchPlaceholder="Search session..."
		triggerClass="h-9 w-full sm:w-auto sm:min-w-27.5 border-divider bg-surface-raised/60 font-mono text-xs text-on-surface"
		contentClass="border-divider bg-surface"
	/>

	<!-- Driver -->
	{#if slot.metaLoading}
		<SearchableSelect
			value={slot.driver}
			options={[]}
			placeholder="Loading drivers..."
			emptyText="Loading drivers..."
			disabled={true}
			triggerClass="h-9 w-full sm:w-auto sm:min-w-42.5 border-divider bg-surface-raised/60 text-xs text-on-surface "
			contentClass="max-h-72 border-divider bg-surface "
		/>
	{:else}
		<SearchableSelect
			bind:value={slot.driver}
			options={sortedDrivers.map((d) => ({
				value: d.driver_number.toString(),
				label: driverOptionLabel(d),
				keywords: driverOptionKeywords(d),
				colorDot: d.color || "#fff",
			}))}
			placeholder={driverName}
			searchPlaceholder="Search driver..."
			emptyText={sortedDrivers.length === 0
				? "Select a session first"
				: "No driver found."}
			disabled={sortedDrivers.length === 0}
			triggerClass="h-9 w-full sm:w-auto sm:min-w-42.5 border-divider bg-surface-raised/60 text-xs text-on-surface"
			contentClass="max-h-72 border-divider bg-surface "
			listClass="max-h-72 "
		/>
	{/if}

	<!-- Lap -->
	<SearchableSelect
		bind:value={
			() => slot.lap?.toString() ?? "",
			(v) => {
				slot.lap = v ? parseInt(v, 10) : null;
			}
		}
		options={laps.map((lap) => {
			const ll = `Lap ${lap.lap} - ${formatLapTime(lap.time)}`;
			const dc = lapDotColors(lap, bestAll, driverBest);
			return {
				value: lap.lap.toString(),
				label: ll,
				keywords: `${lap.lap} ${lap.compound} ${formatLapTime(lap.time)}`,
				compound: lap.compound,
				rightLabel:
					dc.badge === "purple"
						? "BEST"
						: dc.badge === "green"
							? "PB"
							: undefined,
			};
		})}
		placeholder={lapLabel}
		searchPlaceholder="Search lap..."
		emptyText="No laps available"
		disabled={!slot.hasLoaded || laps.length === 0}
		triggerClass="h-9 w-full sm:w-auto sm:min-w-42.5 border-divider bg-surface-raised/60 font-mono text-xs text-on-surface"
		contentClass="max-h-72 border-divider bg-surface"
		listClass="max-h-72"
	/>

	<!-- Color picker + reset -->
	<div class="col-span-2 sm:col-span-1 flex items-center justify-between sm:justify-start gap-2">
		<div class="flex items-center gap-1">
			<input
			type="color"
			value={color}
			onchange={(e) => {
				slot.color = (e.currentTarget as HTMLInputElement).value;
			}}
			class="h-9 w-9 cursor-pointer rounded border border-divider bg-surface-raised/60 p-1"
			title="Override driver color"
		/>
		{#if slot.color}
			<button
				onclick={() => {
					slot.color = "";
				}}
				title="Reset to driver colour"
				class="flex h-9 w-9 items-center justify-center rounded border border-divider text-on-surface-subtle transition-colors hover:border-on-surface-muted hover:text-on-surface"
			>
				<svg
					width="13"
					height="13"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
					<path d="M3 3v5h5" />
				</svg>
			</button>
		{/if}
	</div>

	<!-- Remove button -->
	{#if !isOnly}
		<button
			onclick={onremove}
			title="Remove row"
			class="ml-auto flex h-9 w-9 items-center justify-center rounded border border-divider text-on-surface-subtle transition-colors hover:border-red-500 hover:text-red-400"
		>
			<TrashIcon size={16} />
		</button>
	{/if}
	</div>
</div>
