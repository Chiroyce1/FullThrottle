<script lang="ts">
	import SessionSelects from "$lib/components/SessionSelects.svelte";
	import { Button } from "$lib/components/ui/button";
	import { ArrowCounterClockwise, Check, LinkSimple, Plus } from "phosphor-svelte";
	import DriverChip from "./DriverChip.svelte";
	import { TelemetryState, type TelemetryView, type YearEntry } from "./state";

	/**
	 * What's being compared, in one bar: the main session (picked once),
	 * a chip per driver, and the actions. Wraps onto more lines on narrow
	 * screens; the same component at every size.
	 */
	let {
		tm,
		view,
		years,
		onload,
	}: { tm: TelemetryState; view: TelemetryView; years: YearEntry[]; onload: () => void } = $props();

	const main = $derived(tm.slots[0]);
	const loaded = $derived(tm.slots.some((s) => s.hasLoaded));
	// Only while charts are showing: otherwise the empty state offers loading.
	const needsLoad = $derived(view.hasData && (tm.needsReloadAny || (!loaded && tm.canLoadData)));
</script>

<div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2">
	{#if main}
		<SessionSelects
			{years}
			year={main.year}
			round={main.round}
			session={main.session}
			onyear={(v) => tm.setMainTrack(v)}
			onround={(v) => tm.setMainTrack(main.year, v)}
			onsession={(v) => tm.setMainSession(v)}
			class="grid w-full grid-cols-[6rem_minmax(0,1fr)_8rem] gap-1.5 sm:w-auto sm:grid-cols-[6rem_15rem_8rem]"
		/>
	{/if}

	<span class="hidden h-5 w-px bg-border sm:block" aria-hidden="true"></span>

	<div class="flex min-w-0 flex-wrap items-center gap-1.5">
		{#each tm.slots as slot, sid (slot.id)}
			<DriverChip {tm} {sid} {years} />
		{/each}
		{#if tm.slots.length < TelemetryState.MAX_SLOTS}
			<Button
				variant="ghost"
				size="sm"
				class="text-muted-foreground"
				onclick={() => tm.addSlot()}
				aria-label="Add driver"
				title="Add a driver to the comparison"
			>
				<Plus size={14} /> Driver
			</Button>
		{/if}
	</div>

	<div class="ml-auto flex items-center gap-1">
		{#if needsLoad}
			<Button
				size="sm"
				onclick={onload}
				disabled={!tm.canLoadData || tm.isLoading}
				title={tm.loadHint || "Download telemetry for this selection"}
			>
				Load telemetry
			</Button>
		{/if}
		<Button
			variant="ghost"
			size="sm"
			onclick={view.copyShareLink}
			disabled={!view.canShare}
			title="Copy a link to this comparison"
			class={view.shareCopied ? "text-emerald-500 hover:text-emerald-500" : ""}
		>
			{#if view.shareCopied}
				<Check size={14} weight="bold" /> Copied
			{:else}
				<LinkSimple size={14} /> Share
			{/if}
		</Button>
		<Button
			variant="ghost"
			size="sm"
			class="text-muted-foreground"
			title="Start over with the latest session"
			onclick={() => {
				tm.reset();
				view.clearInteraction();
			}}
		>
			<ArrowCounterClockwise size={14} />
			<span class="sr-only sm:not-sr-only">Reset</span>
		</Button>
	</div>
</div>
