<script lang="ts">
	import type { Snippet } from "svelte";

	/** Small pressed/unpressed button for view options (e.g. "Corners"). */
	let {
		pressed,
		onclick,
		children,
	}: { pressed: boolean; onclick: () => void; children: Snippet } = $props();
</script>

<button
	type="button"
	{onclick}
	aria-pressed={pressed}
	class="h-7 rounded-md px-2.5 text-xs transition-colors {pressed
		? 'bg-accent text-foreground'
		: 'text-muted-foreground hover:text-foreground'}"
>
	{@render children()}
</button>
