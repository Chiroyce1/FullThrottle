<script lang="ts">
	import { toggleMode } from "mode-watcher";
	import SunIcon from "@lucide/svelte/icons/sun";
	import MoonIcon from "@lucide/svelte/icons/moon";

	let { class: className = "" } = $props<{ class?: string }>();
</script>

<button
	onclick={toggleMode}
	class="relative flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground {className}"
	aria-label="Toggle theme"
>
	<SunIcon
		class="h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90 absolute"
	/>
	<MoonIcon
		class="h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0 absolute"
	/>
</button>
