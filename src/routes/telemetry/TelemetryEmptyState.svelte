<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Spinner } from "$lib/components/app";

	interface SlotState {
		hasLoaded: boolean;
	}

	interface Props {
		slots: SlotState[];
		slotColors: (sid: number) => string;
		slotBadge: (sid: number) => string;
		slotDriverName: (sid: number) => string;
		errorMessage?: string;
		onload?: () => void;
		canLoad?: boolean;
		isLoading?: boolean;
	}

	let {
		slots,
		slotColors,
		slotBadge,
		slotDriverName,
		errorMessage = "",
		onload,
		canLoad = true,
		isLoading = false,
	}: Props = $props();
</script>

<div class="flex flex-1 items-start justify-center px-4 py-16 sm:py-24">
	<div class="flex w-full max-w-sm flex-col items-center gap-6 text-center">
		<div class="flex flex-wrap items-center justify-center gap-2">
			{#each slots as _, sid}
				<span
					class="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm"
				>
					<span class="h-3.5 w-1 rounded-full" style="background:{slotColors(sid)}"></span>
					<span class="font-mono text-xs text-muted-foreground">{slotBadge(sid)}</span>
					<span class="text-foreground">{slotDriverName(sid)}</span>
				</span>
			{/each}
		</div>

		{#if errorMessage}
			<p class="max-w-xs text-sm text-red-500">{errorMessage}</p>
		{:else}
			<p class="text-sm text-muted-foreground">
				Pick a session, driver and lap for each row, then load. Compare up to 4
				drivers.
			</p>
		{/if}

		{#if onload}
			<Button onclick={onload} disabled={!canLoad || isLoading} size="lg">
				{#if isLoading}
					<Spinner />
					Loading…
				{:else}
					Load telemetry
				{/if}
			</Button>
		{/if}
	</div>
</div>
