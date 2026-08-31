import { GuardrailsSchema, type Guardrails } from "@/lib/agents/types";
import type { DealTerms } from "@/lib/deals/terms";
import { formatMoney } from "@/lib/deals/terms";

/**
 * Mechanical guardrail check for a set of deal terms.
 *
 * Blueprint hard rule: the Negotiator may never accept terms outside the
 * creator's guardrails, and `gateOutsideGuardrails` cannot be disabled. This
 * function is the check behind that gate. It lives here — not in the
 * Negotiator — so the dashboard, the approval queue, and the agent all decide
 * "outside guardrails" the same way. It is deliberately dumb and total: no
 * model call, no judgement, just comparisons.
 *
 * An empty result means "inside the boundaries the creator set", not
 * "good deal".
 */

export interface GuardrailViolation {
  /** Which term tripped it — used to highlight the field in the UI. */
  field: "format" | "amountCents" | "usageDays" | "exclusivityDays" | "brand";
  message: string;
}

export interface GuardrailCheckInput {
  terms: DealTerms;
  guardrails: unknown; // Creator.guardrails Json column
  brandName?: string;
  brandCategory?: string | null;
}

/** Read the Creator.guardrails Json column. Missing/garbage -> schema defaults. */
export function parseGuardrails(value: unknown): Guardrails {
  const parsed = GuardrailsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : GuardrailsSchema.parse({});
}

export function checkDealGuardrails(
  input: GuardrailCheckInput,
): GuardrailViolation[] {
  const g = parseGuardrails(input.guardrails);
  const { terms } = input;
  const out: GuardrailViolation[] = [];

  // Do-not-work-with is absolute: it matches the brand name or its category.
  const blocked = g.doNotWorkWith.map((b) => b.trim().toLowerCase()).filter(Boolean);
  for (const candidate of [input.brandName, input.brandCategory]) {
    const value = candidate?.trim().toLowerCase();
    if (!value) continue;
    const hit = blocked.find((b) => value === b || value.includes(b));
    if (hit) {
      out.push({
        field: "brand",
        message: `${input.brandName ?? "This brand"} matches "${hit}" on the do-not-work-with list.`,
      });
      break;
    }
  }

  // Only flag an unlisted format once the creator has actually listed some.
  if (terms.format && g.offeredFormats.length > 0) {
    const offered = g.offeredFormats.map((f) => f.toLowerCase());
    if (!offered.includes(terms.format.toLowerCase())) {
      out.push({
        field: "format",
        message: `"${terms.format}" isn't a format on the rate card.`,
      });
    }
  }

  // Floor rate is per format, so an unlisted format has no floor to check.
  if (terms.amountCents != null && terms.format) {
    const floor = lookupFloor(g, terms.format);
    if (floor != null && terms.amountCents < floor) {
      out.push({
        field: "amountCents",
        message: `${formatMoney(terms.amountCents, terms.currency)} is under the ${formatMoney(floor, terms.currency)} floor for ${terms.format}.`,
      });
    }
  }

  if (terms.usageDays != null && terms.usageDays > g.maxUsageDays) {
    out.push({
      field: "usageDays",
      message: `${terms.usageDays} days of usage exceeds the ${g.maxUsageDays}-day limit.`,
    });
  }

  if (
    terms.exclusivityDays != null &&
    terms.exclusivityDays > g.maxExclusivityDays
  ) {
    out.push({
      field: "exclusivityDays",
      message:
        g.maxExclusivityDays === 0
          ? `${terms.exclusivityDays} days of exclusivity — the creator agreed to none.`
          : `${terms.exclusivityDays} days of exclusivity exceeds the ${g.maxExclusivityDays}-day limit.`,
    });
  }

  return out;
}

/** Rate-card keys are creator-typed, so match case-insensitively. */
function lookupFloor(g: Guardrails, format: string): number | null {
  const wanted = format.trim().toLowerCase();
  for (const [key, cents] of Object.entries(g.floorRatesCents)) {
    if (key.trim().toLowerCase() === wanted) return cents;
  }
  return null;
}
