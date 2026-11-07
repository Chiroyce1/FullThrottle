<script lang="ts">
	import * as Popover from "$lib/components/ui/popover";
	import SearchableSelect from "$lib/components/SearchableSelect.svelte";
	import SessionSelects from "$lib/components/SessionSelects.svelte";
	import { Button } from "$lib/components/ui/button";
	import { ArrowCounterClockwise, CaretDown, Trash } from "phosphor-svelte";
	import { MAX_LAP_TIME_SECONDS } from "$lib/constants";
	import type { DriverMeta } from "$lib/types";
	import { formatDriverNameWithAbbr, formatLapTime, getDriverAbbreviation } from "$lib/utils";
	import type { TelemetryState, YearEntry } from "./state";

	/**
	 * One compared lap as a compact chip: colour, driver, lap. Opens a
	 * popover to change driver, lap, colour, or (for drivers after the
	 * first) to compare from another session.
	 */
	let { tm, sid, years }: { tm: TelemetryState; sid: number; years: YearEntry[] } = $props();

	let open = $state(false);
	let otherSession = $state(false);

	const slot = $derived(tm.slots[sid]);
	const color = $derived(tm.color(sid));
	const laps = $derived(tm.driverLaps(sid));
	const onMain = $derived(tm.isOnMain(sid));
	const tla = $derived(tm.driverTla(sid));

	const yearData = $derived(years.find((y) => y.year.toString() === slot.year));
	const roundData = $derived(yearData?.rounds.find((r) => r.round.toString() === slot.round));
	const sessionTag = $derived(
		`${slot.year} ${roundData?.location ?? roundData?.name ?? ""} ${slot.session.toUpperCase()}`.trim(),
	);

	const lap = $derived(laps.find((l) => l.lap === slot.lap) ?? null);
	const stale = $derived(!!slot.loadedKey && !slot.hasLoaded && !slot.metaLoading);

	const drivers = $derived.by(() => {
		const all: DriverMeta[] = Object.values(slot.meta?.drivers ?? {});
		const name = (d: DriverMeta) => `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() || d.name || "";
		return all
			.sort((a, b) => name(a).localeCompare(name(b)))
			.map((d) => ({
				value: d.driver_number.toString(),
				label: formatDriverNameWithAbbr(d, d.driver_number.toString()),
				keywords: `${name(d)} ${getDriverAbbreviation(d, d.driver_number.toString())} ${d.driver_number}`,
				colorDot: d.color || "#fff",
			}));
	});

	const lapOptions = $derived.by(() => {
		const valid = laps.filter((l) => l.time > 0 && l.time < MAX_LAP_TIME_SECONDS);
		const best = Math.min(...valid.map((l) => l.time), Infinity);
		return laps.map((l) => ({
			value: l.lap.toString(),
			label: `Lap ${l.lap} · ${formatLapTime(l.time, "--:--.---")}`,
			keywords: `${l.lap} ${l.compound} ${formatLapTime(l.time, "")}`,
			compound: l.compound,
			rightLabel: l.time === best && l.time > 0 ? "Fastest" : undefined,
		}));
	});

	const triggerClass =
		"h-8 w-full rounded-md border-border bg-background text-sm font-normal text-foreground hover:border-border-strong";
</script>

<Popover.Root bind:open onOpenChange={(o) => (otherSession = o && !onMain)}>
	<Popover.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				type="button"
				class="flex h-8 max-w-full items-center gap-2 rounded-md border border-border bg-background pr-2 pl-1.5 text-sm transition-colors hover:border-border-strong data-[state=open]:border-border-strong"
				aria-label="Driver {String.fromCharCode(65 + sid)}: {tla || 'not set'}"
			>
				<span
					class="h-4 w-1 shrink-0 rounded-[1px]"
					style="background:{color}; opacity:{slot.hasLoaded ? 1 : 0.4}"
				></span>
				<span class="font-mono font-medium text-foreground">{tla || "Driver"}</span>
				{#if lap}
					<span class="font-mono text-xs text-muted-foreground tabular-nums"
						>L{lap.lap} · {formatLapTime(lap.time, "--:--.---")}</span
					>
				{:else if slot.metaLoading}
					<span class="text-xs text-muted-foreground">Loading…</span>
				{/if}
				{#if !onMain}
					<span class="truncate rounded-sm bg-muted px-1 text-2xs text-muted-foreground"
						>{sessionTag}</span
					>
				{/if}
				{#if stale}
					<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title="Changed: load to update"
					></span>
				{:else if slot.loadError}
					<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" title={slot.loadError}></span>
				{/if}
				<CaretDown size={12} class="shrink-0 text-muted-foreground" />
			</button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content align="start" class="flex w-80 flex-col gap-3 border-border bg-popover p-3">
		<div class="flex flex-col gap-1.5">
			<span class="text-xs text-muted-foreground">Driver</span>
			<SearchableSelect
				value={slot.driver}
				options={drivers}
				placeholder={slot.metaLoading ? "Loading drivers…" : "Pick a driver"}
				searchPlaceholder="Search driver…"
				emptyText={drivers.length === 0 ? "Pick a session first" : "No driver found."}
				disabled={slot.metaLoading || drivers.length === 0}
				onchange={(v) => tm.setDriver(slot.id, v)}
				{triggerClass}
				contentClass="max-h-72 border-border bg-popover"
				listClass="max-h-72"
			/>
		</div>

		<div class="flex flex-col gap-1.5">
			<span class="text-xs text-muted-foreground">Lap</span>
			<SearchableSelect
				value={slot.lap?.toString() ?? ""}
				options={lapOptions}
				placeholder={slot.hasLoaded ? "Pick a lap" : "Load the session to pick a lap"}
				searchPlaceholder="Search lap…"
				emptyText="No laps available"
				disabled={!slot.hasLoaded || laps.length === 0}
				onchange={(v) => tm.setLap(slot.id, v ? parseInt(v, 10) : null)}
				triggerClass="{triggerClass} font-mono tabular-nums"
				contentClass="max-h-72 border-border bg-popover"
				listClass="max-h-72"
			/>
		</div>

		{#if sid > 0}
			{#if otherSession}
				<div class="flex flex-col gap-1.5 border-t border-border pt-3">
					<div class="flex items-center justify-between">
						<span class="text-xs text-muted-foreground">Session</span>
						{#if !onMain}
							<button
								type="button"
								class="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
								onclick={() => {
									tm.useMainSession(slot.id);
									otherSession = false;
								}}>Use main session</button
							>
						{/if}
					</div>
					<SessionSelects
						{years}
						year={slot.year}
						round={slot.round}
						session={slot.session}
						onyear={(v) => tm.setTrack(slot.id, v)}
						onround={(v) => tm.setTrack(slot.id, slot.year, v)}
						onsession={(v) => tm.setSession(slot.id, v)}
						class="flex flex-col gap-1.5"
					/>
				</div>
			{:else}
				<button
					type="button"
					class="self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
					onclick={() => (otherSession = true)}>Compare from another session…</button
				>
			{/if}
		{/if}

		<div class="flex items-center justify-between border-t border-border pt-3">
			<label class="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
				<span class="relative h-4 w-4 rounded-full ring-1 ring-border-strong" style="background:{color}">
					<input
						type="color"
						value={color}
						onchange={(e) => (slot.color = e.currentTarget.value)}
						class="absolute inset-0 cursor-pointer opacity-0"
						aria-label="Trace colour"
					/>
				</span>
				Colour
				{#if slot.color}
					<button
						type="button"
						class="text-muted-foreground hover:text-foreground"
						title="Back to team colour"
						aria-label="Back to team colour"
						onclick={() => (slot.color = "")}><ArrowCounterClockwise size={12} /></button
					>
				{/if}
			</label>
			{#if tm.slots.length > 1}
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground hover:text-red-500"
					onclick={() => {
						open = false;
						tm.removeSlot(sid);
					}}
				>
					<Trash size={14} /> Remove
				</Button>
			{/if}
		</div>
	</Popover.Content>
</Popover.Root>
