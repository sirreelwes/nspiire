import styles from "./Logo.module.css";

/**
 * The Nspiire logo — blueprint brand mark.
 *
 * `size` sets the font-size the whole lockup is derived from; every dimension
 * inside is in em, so one number scales the mark. Colours come from
 * `--logo-ink` and `--logo-accent`, which default to the light-ground pair —
 * override them on any ancestor to invert or to go single-colour.
 *
 * Minimum sizes: 18 for the wordmark, 28 for the mark alone. Below those the
 * handle thins to under a pixel and the diagonal's gaps close up.
 */
interface LogoProps {
  /** Font size the lockup is built from, in px. */
  size?: number;
  className?: string;
}

function cx(...parts: (string | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** The full wordmark: NSPIIRE with the handle over the II. */
export function Logo({ size = 26, className }: LogoProps) {
  return (
    <span
      role="img"
      aria-label="Nspiire"
      className={cx(styles.word, className)}
      style={{ fontSize: `${size}px` }}
    >
      <span className={styles.n}>N</span>
      SP
      <span className={styles.mark}>
        <span className={cx(styles.arc, styles.arcWord)} />
        II
      </span>
      RE
    </span>
  );
}

/**
 * The mark alone: the N wearing the handle. Two stems plus a diagonal is an N,
 * and with the diagonal held clear of both it reads as two uprights too.
 */
export function LogoMark({ size = 30, className }: LogoProps) {
  return (
    <span
      role="img"
      aria-label="Nspiire"
      className={cx(styles.word, styles.markOnly, className)}
      style={{ fontSize: `${size}px` }}
    >
      <span className={styles.mark}>
        <span className={styles.n}>N</span>
        <span className={cx(styles.arc, styles.arcMark)} />
      </span>
    </span>
  );
}
