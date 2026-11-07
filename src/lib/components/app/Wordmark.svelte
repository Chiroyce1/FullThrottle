<script lang="ts">
	import { cn } from "$lib/utils";

	/** The FullThrottle wordmark: red accent bar plus name, linking home. */
	let { class: className = "" }: { class?: string } = $props();
</script>

<a
	href="/"
	class={cn(
		"flex shrink-0 items-center gap-1.5 font-semibold tracking-tight text-foreground",
		className,
	)}
>
	<span class="h-3.5 w-1 rounded-[1px] bg-primary" aria-hidden="true"></span>
	FullThrottle
</a>
