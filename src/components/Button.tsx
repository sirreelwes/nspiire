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
 * No straight vertical sides — the stroke is all shoulder.
 *
 * A corner's straight side is whatever height the radius does not cover, so a
 * radius below the box height leaves the sides running down past the middle of
 * the label. The radius therefore has to be at least the full height.
 *
 * CSS clamps a corner's vertical radius to the box height when the opposite
 * corner is square, which is our case, so the two sizes differ only in how far
 * the shoulder reaches horizontally:
 *
 *   lg  `9999px` also clamps HORIZONTALLY to half the width, so a wide button
 *       sweeps one continuous curve edge to edge. This is the home page pair.
 *   md  the radius is pinned to the height instead, giving tight quarter-circle
 *       shoulders with a flat top between them — the same rule, but it does not
 *       balloon when the button is only as wide as its label. This is the
 *       dashboard nav, where several sit in a row at different widths.
 */
const SIZES: Record<ArchSize, string> = {
  md: "h-12 px-5 text-base rounded-t-[48px]",
  lg: "px-7 py-5 text-lg rounded-t-[9999px]",
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
