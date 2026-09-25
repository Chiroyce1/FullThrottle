<script lang="ts">
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

<div
	class="flex flex-1 items-start justify-center rounded-xl bg-surface px-4 py-16 sm:py-24"
>
	<div class="flex w-full max-w-md flex-col items-center gap-8 text-center">
		<!-- Driver slot pills -->
		<div class="flex flex-wrap items-center justify-center gap-2">
			{#each slots as _, sid}
				<div
					class="flex items-center gap-1.5 rounded-md border border-divider bg-surface-raised px-3 py-2"
				>
					<span
						class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[9px] font-black"
						style="background:{slotColors(sid)}28; color:{slotColors(sid)}"
						>{slotBadge(sid)}</span
					>
					<span class="font-mono text-[11px] text-on-surface-muted"
						>{slotDriverName(sid)}</span
					>
				</div>
			{/each}
		</div>

		{#if errorMessage}
			<p class="max-w-xs font-mono text-xs leading-relaxed text-red-400">
				{errorMessage}
			</p>
		{:else}
			<p
				class="font-mono text-[10px] tracking-widest text-on-surface-subtle uppercase"
			>
				Up to 4 drivers can be compared simultaneously
			</p>
		{/if}

		{#if onload}
			<button
				onclick={onload}
				disabled={!canLoad || isLoading}
				class="inline-flex items-center justify-center gap-2 rounded-md border border-primary bg-primary px-6 py-2.5 font-mono text-xs font-black tracking-widest text-primary-foreground uppercase shadow-xs transition-all hover:bg-transparent hover:text-primary active:scale-95 disabled:opacity-40"
			>
				{#if isLoading}
					<div
						class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
					></div>
					Loading…
				{:else}
					Load Telemetry
				{/if}
			</button>
		{/if}
	</div>
</div>
