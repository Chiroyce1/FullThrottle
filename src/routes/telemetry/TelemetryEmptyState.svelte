<script lang="ts">
	import CompoundBadge from "$lib/components/CompoundBadge.svelte";

	interface SlotState {
		hasLoaded: boolean;
	}

	interface Props {
		slots: SlotState[];
		slotColors: (sid: number) => string;
		slotBadge: (sid: number) => string;
		slotDriverName: (sid: number) => string;
	}

	let { slots, slotColors, slotBadge, slotDriverName }: Props = $props();
</script>

<div class="flex flex-1 items-center justify-center rounded-xl bg-surface py-48">
	<div class="flex flex-col items-center gap-5 text-center">
		<div class="flex items-center gap-3">
			{#each slots as _, sid}
				<div
					class="flex items-center gap-1.5 rounded-lg border border-divider bg-surface-raised px-3 py-2"
				>
					<span
						class="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded font-mono text-[8px] font-black"
						style="background:{slotColors(sid)}30; color:{slotColors(sid)}"
					>{slotBadge(sid)}</span>
					<span class="font-mono text-[10px] text-on-surface-muted"
						>{slotDriverName(sid)}</span
					>
				</div>
			{/each}
		</div>

		<p class="max-w-xs font-mono text-xs leading-relaxed text-on-surface-muted">
			Pick sessions and drivers above for selected rows, then hit <span
				class="text-foreground">Load Data</span
			>.
		</p>
		<div class="flex items-center gap-3">
			{#each ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE"] as c}
				<CompoundBadge compound={c} size={36} />
			{/each}
		</div>
	</div>
</div>
