<script lang="ts">
	import { cn } from "$lib/utils";

	let { class: className = "" }: { class?: string } = $props();
</script>

<span
	class={cn(
		"inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent",
		className,
	)}
	aria-hidden="true"
></span>
