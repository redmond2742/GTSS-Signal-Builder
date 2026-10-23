/**
 * Item classes for a segmented `ToggleGroup`.
 *
 * shadcn's stock "on" state is `bg-accent`, which in this theme is a hair off
 * white — a selected segment was indistinguishable from an unselected one. The
 * selected mode has to be readable at a glance.
 */
export const SEGMENT_ITEM_CLASS =
  "h-7 px-2 text-xs data-[state=on]:bg-blue-600 data-[state=on]:text-white data-[state=on]:hover:bg-blue-700 data-[state=on]:hover:text-white";
