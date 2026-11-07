<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Toggle } from "$lib/components/app";
	import type { TelemetryView } from "./state";

	/** View toggles + zoom reset above the charts. */
	let { view }: { view: TelemetryView } = $props();
</script>

<div class="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-1.5">
	<div class="flex items-center gap-1">
		<Toggle pressed={view.showCorners} onclick={() => (view.showCorners = !view.showCorners)}
			>Corners</Toggle
		>
		<Toggle
			pressed={view.showCornerSpeeds}
			onclick={() => (view.showCornerSpeeds = !view.showCornerSpeeds)}>Min speeds</Toggle
		>
	</div>
	<div class="flex items-center gap-3">
		<span class="hidden text-xs text-muted-foreground sm:inline">Drag to zoom · double-click to reset</span>
		{#if view.xDomain}
			<Button variant="secondary" size="sm" onclick={view.resetZoom}>Reset zoom</Button>
		{/if}
	</div>
</div>
