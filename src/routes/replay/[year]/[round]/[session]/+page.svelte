<script lang="ts">
	import { page } from "$app/state";
	import { onDestroy } from "svelte";
	import type { PageData } from "./$types";
	import SEO from "$lib/components/SEO.svelte";
	import AppHeader from "$lib/components/AppHeader.svelte";
	import { LoadingState, Notice } from "$lib/components/app";
	import DriverPanel from "$lib/components/replay/DriverPanel.svelte";
	import LapTraces from "$lib/components/replay/LapTraces.svelte";
	import Leaderboard from "$lib/components/replay/Leaderboard.svelte";
	import MapPanel from "$lib/components/replay/MapPanel.svelte";
	import Speedometer from "$lib/components/replay/Speedometer.svelte";
	import Transport from "$lib/components/replay/Transport.svelte";
	import { ReplayView } from "$lib/replay/replay-view.svelte";
	import { settings } from "$lib/settings";
	import { cn } from "$lib/utils";

	let { data }: { data: PageData } = $props();

	const view = new ReplayView(() => page.params);
	const engine = view.engine;

	if (typeof window !== "undefined") {
		window.addEventListener("pagehide", view.teardown);
		onDestroy(() => window.removeEventListener("pagehide", view.teardown));
	}
	onDestroy(view.teardown);

	/** Width at which the page becomes a fixed three-column workspace. */
	const DESKTOP = 1280;
	let innerWidth = $state(DESKTOP);
	const isDesktop = $derived(innerWidth >= DESKTOP);

	let lapTracesOpen = $state(settings.lapTracesOpen);
	$effect(() => {
		settings.lapTracesOpen = lapTracesOpen;
	});
</script>

<SEO replay={data?.sessionMeta} />

<svelte:window bind:innerWidth />

{#snippet mapSpeedometer()}
	<Speedometer
		telemetry={view.focusedTelemetry}
		id={view.focusedDriver}
		class="h-full max-h-60 w-auto max-w-none"
	/>
{/snippet}

<div class="flex min-h-dvh flex-col bg-background text-foreground xl:h-dvh xl:overflow-hidden">
	<AppHeader variant="compact">
		{#snippet breadcrumb()}
			<span class="text-foreground">{page.params.year} · {view.sessionName}</span>
		{/snippet}
	</AppHeader>

	<main class="flex min-h-0 flex-1 flex-col gap-3 p-3">
		{#if view.telemetryIssue}
			<Notice class="rounded-md border">
				{view.telemetryIssue.message ||
					`Telemetry data has known issues for ${view.telemetryIssue.name || "this session"}.`}
			</Notice>
		{/if}

		{#if engine.isLoading}
			<LoadingState label="Loading session…" class="panel" />
		{:else if view.hasData}
			<!--
				One layout for every size. DOM order is the narrow-screen order.
				From xl: transport over the leaderboard (same column), driver over
				the map, the speedometer inside the map panel beside the track,
				lap traces under the map.
			-->
			<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,36rem)_minmax(0,1fr)]">
				<div class="grid sm:col-span-2 xl:col-span-1">
					<Transport {view} />
				</div>
				{#if view.focusedDriver}
					<DriverPanel {view} />
					{#if !isDesktop}
						<div class="panel flex items-center justify-center p-4">
							<Speedometer telemetry={view.focusedTelemetry} id={view.focusedDriver} />
						</div>
					{/if}
				{/if}
			</div>

			<section
				class="grid grid-cols-1 gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,36rem)_minmax(0,1fr)]"
			>
				<div class="flex flex-col gap-3 xl:col-start-2 xl:row-start-1 xl:min-h-0">
					<div class="aspect-square max-h-[70vh] w-full sm:aspect-video xl:aspect-auto xl:max-h-none xl:min-h-48 xl:flex-1">
						<MapPanel {view} aside={isDesktop && view.focusedDriver ? mapSpeedometer : undefined} />
					</div>

					{#if view.focusedDriver}
						<div class={cn("xl:min-h-0", lapTracesOpen && "xl:h-[min(20rem,45%)]")}>
							<LapTraces {view} bind:open={lapTracesOpen} />
						</div>
					{/if}
				</div>

				<div class="h-[70vh] min-h-0 xl:col-start-1 xl:row-start-1 xl:h-auto">
					<Leaderboard
						drivers={view.leaderboard}
						focusedDriver={view.focusedDriver}
						sessionMode={view.sessionMode}
						qualifyingData={engine.metadata?.qualifying}
						onSelect={view.focus}
					/>
				</div>
			</section>
		{:else}
			<div class="panel flex flex-1 items-center justify-center py-24">
				<p class="text-sm text-muted-foreground">Session data not available</p>
			</div>
		{/if}
	</main>
</div>
