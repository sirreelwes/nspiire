"use client";

import { useFormStatus } from "react-dom";
import { arch, type ArchSize, type ArchVariant } from "@/components/Button";

/**
 * A submit button that says what it is doing.
 *
 * Every creator action is a server action behind a full round trip, and
 * "Pursue this deal" makes a model call on top of that. A button that sits
 * there unchanged for ten seconds reads as broken on a phone, and a second tap
 * runs the action twice. This swaps the label while the form is in flight and
 * refuses the second tap.
 *
 * Client component only because useFormStatus needs to be one; it renders
 * nothing the server version could not, so it is safe anywhere a form is.
 */
export function SubmitButton({
  children,
  pending,
  variant = "primary",
  size = "md",
  className,
  name,
  value,
}: {
  children: React.ReactNode;
  /** Label while the form is submitting, e.g. "Writing the email…". */
  pending: string;
  variant?: ArchVariant;
  size?: ArchSize;
  className?: string;
  name?: string;
  value?: string;
}) {
  const status = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={status.pending}
      aria-busy={status.pending || undefined}
      className={arch(variant, size, `disabled:opacity-60 ${className ?? ""}`)}
    >
      {status.pending ? pending : children}
    </button>
  );
}
