import styles from "./Button.module.css";

/**
 * The arch — the logo's handle, applied to controls.
 *
 * The mark's arc rides above the two uprights without touching them, and this
 * is the same relationship at button scale: the top half of a pill's outline,
 * ending at the vertical middle of the label. See Button.module.css for why
 * that shape needs a clipped pseudo-element rather than a border.
 *
 * Red is not the default. The logo spends oxblood exactly twice — one diagonal,
 * one arc — which is what makes it read as chosen rather than decorative. If
 * every button were red the accent would become wallpaper, so `primary` gets it
 * and everything else stays neutral.
 */

export type ArchVariant = "primary" | "secondary";
export type ArchSize = "md" | "lg";

const BASE = `${styles.arch} inline-flex items-center justify-center font-medium`;

/* Height is set rather than derived from padding: the outline is cut at 50%,
   so the box height is what decides where the stroke ends relative to the
   label. Leaving it to line-height plus padding would move that cut around. */
const SIZES: Record<ArchSize, string> = {
  md: "h-12 px-6 text-base",
  lg: "h-16 px-8 text-lg",
};

const VARIANTS: Record<ArchVariant, string> = {
  primary: "text-[var(--logo-accent)] [--arch-line:var(--logo-accent)]",
  secondary:
    "text-neutral-700 [--arch-line:var(--color-neutral-400)] dark:text-neutral-300 dark:[--arch-line:var(--color-neutral-600)]",
};

/** Class string for an arch control — use on <Link>, <button> or <a> alike. */
export function arch(
  variant: ArchVariant = "secondary",
  size: ArchSize = "md",
  extra?: string,
): string {
  return [BASE, SIZES[size], VARIANTS[variant], extra].filter(Boolean).join(" ");
}
