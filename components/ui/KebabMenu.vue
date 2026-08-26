<script setup lang="ts">
// Row-end "⋯" dropdown (GitHub Box-row kebab menu), built on reka-ui so it gets
// keyboard nav, typeahead and click-outside for free. Declarative items:
// pass an array, listen for `select(key)` — keeps call sites free of reka-ui.
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from "reka-ui";

export interface KebabMenuItemSpec {
  key: string;
  label: string;
  /** Red text (destructive actions like Delete). */
  danger?: boolean;
  /** Render a separator above this item. */
  divider?: boolean;
  disabled?: boolean;
}

const props = defineProps<{
  items: KebabMenuItemSpec[];
  /** Accessible name for the trigger button (e.g. "Manage email …"). */
  label?: string;
}>();

const emit = defineEmits<{ select: [key: string] }>();
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger
      class="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      :aria-label="label"
    >
      <Icon spec="Ellipsis" :size="16" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        align="end"
        :side-offset="4"
        class="z-50 min-w-36 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <template v-for="it in props.items" :key="it.key">
          <div v-if="it.divider" class="-mx-1 my-1 h-px bg-border" />
          <DropdownMenuItem
            class="flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
            :class="it.danger ? 'text-red-600 dark:text-red-400' : ''"
            :disabled="it.disabled"
            @select="emit('select', it.key)"
          >
            {{ it.label }}
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
