/**
 * The arch — the logo's handle, applied to controls.
 *
 * The mark's arc is `border-bottom: none` with rounded top corners, and this
 * is the same construction at button scale: stroked on top, left and right,
 * open along the bottom. One definition, because the shape now belongs to the
 * brand and hunting six files to change it is how a system drifts.
 *
 * Red is deliberately NOT the default. The logo spends oxblood exactly twice —
 * one diagonal, one arc — which is what makes it read as chosen rather than
 * decorative. If every button were red the accent would become wallpaper, so
 * `primary` gets it and everything else stays neutral.
 *
 * Note the radius is `9999px` on the top corners only: CSS clamps it to half
 * the width horizontally and the full height vertically, which yields an
 * elliptical arch spanning the button. A true half circle like the logo's
 * would be 170px tall on a phone-width button — this rhymes with the mark
 * rather than reproducing it.
 */

export type ArchVariant = "primary" | "secondary";
export type ArchSize = "md" | "lg";

const BASE =
  "inline-flex items-center justify-center rounded-b-none border-2 border-b-0 font-medium";

/*
 * The top radius has to be stated, not left to `9999px`. CSS clamps a corner's
 * vertical radius to the box height only when the opposite corner is 0 — which
 * is exactly our case, bottom corners being square — so `rounded-t-full` curves
 * over the FULL height and domes. Half the height is what makes it read as a
 * pill with its lower half removed, so each size fixes its height and takes
 * exactly half of it.
 */
const SIZES: Record<ArchSize, string> = {
  // Chip proportions, matching the pipeline pills: 48px tall, 24px shoulder.
  md: "h-12 px-5 text-base rounded-t-[24px]",
  // The home page pair, unchanged — a deeper cap carries a wide button.
  lg: "px-7 py-5 text-lg rounded-t-[4rem]",
};

const VARIANTS: Record<ArchVariant, string> = {
  primary:
    "border-[var(--logo-accent)] text-[var(--logo-accent)]",
  secondary:
    "border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300",
};

/** Class string for an arch control — use on <Link>, <button> or <a> alike. */
export function arch(
  variant: ArchVariant = "secondary",
  size: ArchSize = "md",
  extra?: string,
): string {
  return [BASE, SIZES[size], VARIANTS[variant], extra].filter(Boolean).join(" ");
}
