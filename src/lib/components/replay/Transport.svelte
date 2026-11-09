<script lang="ts">
	import { Pause, Play } from "phosphor-svelte";
	import { formatSessionTime } from "$lib/utils";
	import { PLAYBACK_SPEEDS, type ReplayView } from "$lib/replay/replay-view.svelte";
	import TrackStatusBadge from "./TrackStatusBadge.svelte";

	/** Play/pause, playback speed, timeline scrubber and track status history. */
	let { view }: { view: ReplayView } = $props();
	const engine = $derived(view.engine);
</script>

<div class="panel flex flex-col gap-3 p-3">
	<div class="flex flex-wrap items-center gap-3">
		<button
			type="button"
			onclick={view.togglePlay}
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105 active:scale-95"
			title={view.isPlaying ? "Pause" : "Play"}
			aria-label={view.isPlaying ? "Pause" : "Play"}
		>
			{#if view.isPlaying}
				<Pause size={15} weight="fill" />
			{:else}
				<Play size={15} weight="fill" class="translate-x-px" />
			{/if}
		</button>

		<span class="font-mono text-lg font-medium tabular-nums text-foreground">
			{formatSessionTime(view.globalTime)}
		</span>

		<TrackStatusBadge status={view.trackStatus} />

		<span class="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
			Lap {view.leaderLap}{#if engine.totalLaps}<span>/{engine.totalLaps}</span>{/if}
		</span>

		<label class="flex items-center gap-2 text-xs text-muted-foreground">
			Speed
			<select
				bind:value={view.playbackSpeed}
				class="h-8 cursor-pointer rounded-md border border-border bg-background px-2 font-mono text-sm text-foreground tabular-nums focus:ring-1 focus:ring-ring focus:outline-none"
			>
				{#each PLAYBACK_SPEEDS as s (s)}
					<option value={s}>{s}×</option>
				{/each}
			</select>
		</label>
	</div>

	<div class="flex flex-col gap-1.5">
		<input
			type="range"
			aria-label="Session time"
			min={engine.minSessionTime}
			max={engine.maxSessionTime}
			value={view.globalTime}
			oninput={(e) => view.seek(parseFloat(e.currentTarget.value))}
			class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border-strong accent-primary"
		/>
		<div
			class="h-1.5 w-full overflow-hidden rounded-full opacity-80"
			style={view.trackStatusGradient}
			title="Track status over the session"
		></div>
	</div>
</div>
