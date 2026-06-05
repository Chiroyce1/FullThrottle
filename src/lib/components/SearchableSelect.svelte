<script lang="ts">
	import { tick } from "svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Command from "$lib/components/ui/command";
	import * as Popover from "$lib/components/ui/popover";
	import { cn } from "$lib/utils";
	import { ChevronsUpDown, Check } from "lucide-svelte";
	import CompoundBadge from "$lib/components/CompoundBadge.svelte";

	export interface SearchableSelectOption {
		value: string;
		label: string;
		keywords?: string;
		rightLabel?: string;
		colorDot?: string;
		compound?: string;
	}

	let {
		value = $bindable(""),
		options = [],
		placeholder = "Select an option",
		searchPlaceholder = "Search...",
		emptyText = "No results found.",
		disabled = false,
		triggerClass = "",
		contentClass = "",
		listClass = "",
	}: {
		value?: string;
		options?: SearchableSelectOption[];
		placeholder?: string;
		searchPlaceholder?: string;
		emptyText?: string;
		disabled?: boolean;
		triggerClass?: string;
		contentClass?: string;
		listClass?: string;
	} = $props();

	let open = $state(false);
	let triggerRef = $state<HTMLButtonElement | null>(null);
	const selected = $derived(options.find((opt) => opt.value === value) ?? null);

	function closeAndFocusTrigger() {
		open = false;
		tick().then(() => {
			triggerRef?.focus();
		});
	}

	function selectOption(nextValue: string) {
		value = nextValue;
		closeAndFocusTrigger();
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger bind:ref={triggerRef}>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				{disabled}
				class={cn("justify-between", triggerClass)}
				role="combobox"
				aria-expanded={open}
			>
				{#if selected}
					<span class="flex min-w-0 items-center gap-2">
						{#if selected.compound}
							<CompoundBadge compound={selected.compound} size={14} />
						{:else if selected.colorDot}
							<span
								class="h-2 w-2 shrink-0 rounded-full"
								style={`background:${selected.colorDot}`}
							></span>
						{/if}
						<span class="truncate">{selected.label}</span>
					</span>
				{:else}
					<span class="truncate text-on-surface-subtle">{placeholder}</span>
				{/if}
				<ChevronsUpDown class="ms-2 size-4 shrink-0 opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class={cn("w-[--bits-anchor-width] p-0", contentClass)}>
		<Command.Root>
			<Command.Input placeholder={searchPlaceholder} />
			<Command.List class={listClass}>
				<Command.Empty>{emptyText}</Command.Empty>
				<Command.Group>
					{#each options as option (option.value)}
						<Command.Item
							value={`${option.label} ${option.keywords ?? ""}`}
							onSelect={() => selectOption(option.value)}
							class="group"
						>
							{#if option.compound}
								<CompoundBadge compound={option.compound} size={14} />
							{:else if option.colorDot}
								<span
									class="h-2 w-2 shrink-0 rounded-full"
									style={`background:${option.colorDot}`}
								></span>
							{/if}
							<span class="truncate">{option.label}</span>
							{#if option.rightLabel}
								<span
									class="ml-auto font-mono text-[10px] text-on-surface-subtle"
								>
									{option.rightLabel}
								</span>
							{/if}
							<Check
								class={cn(
									"ml-2 size-4 shrink-0",
									value === option.value ? "opacity-100" : "opacity-0",
								)}
							/>
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
