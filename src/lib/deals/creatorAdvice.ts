import type { TermsAdvice } from "./advisor";
import { formatDays, formatMoney } from "./terms";

/**
 * The advisor's number, explained the way a manager would say it to a client.
 *
 * `TermsAdvice.reasoning` is written for the operator and the deal log: it
 * names the 3% pivot, the 25% cap and where the metrics came from, because
 * the person reading the deal page needs to be able to audit the figure. A
 * creator does not. They need to know what they would be asking for, why it
 * is that and not the number on their rate card, and what Iris will not go
 * below. Two or three sentences, no mechanism.
 *
 * Pure, so the copy can be checked without a browser.
 */
export function adviceForCreator(
  a: TermsAdvice,
  input: { format: string; usageDays: number; exclusivityDays: number },
): string[] {
  const format = input.format || "this format";
  const out: string[] = [];

  if (a.amountCents == null) {
    out.push(
      `I don't have a rate for ${format} yet, so I can't quote it. Add one to your rate card and I'll price it.`,
    );
    return out;
  }

  const amount = formatMoney(a.amountCents);

  if (a.basis === "benchmarks" && a.lowCents != null && a.highCents != null) {
    out.push(
      `Creators like you have closed ${format} deals between ${formatMoney(a.lowCents)} and ${formatMoney(a.highCents)}, so I'd open at ${amount}.`,
    );
  } else if (a.rateCardCents != null && a.amountCents > a.rateCardCents) {
    out.push(
      `Your rate card says ${formatMoney(a.rateCardCents)} for ${format}. Your audience engages well for its size, so I'd open at ${amount}.`,
    );
  } else if (a.rateCardCents != null && a.amountCents < a.rateCardCents) {
    out.push(
      `Your rate card says ${formatMoney(a.rateCardCents)} for ${format}. Engagement is running a little under average, so I'd open at ${amount} and expect to land near it.`,
    );
  } else {
    out.push(`I'd open at ${amount}, straight from your rate card.`);
  }

  if (a.floorCents != null) {
    out.push(`I won't go below ${formatMoney(a.floorCents)} without asking you.`);
  }

  const usage =
    input.usageDays === 0
      ? "They couldn't reuse the video in their own ads"
      : `They could run the video in their own channels for ${formatDays(input.usageDays).toLowerCase()}`;
  const exclusivity =
    input.exclusivityDays === 0
      ? "and you'd stay free to work with anyone else."
      : `and you'd sit out their category for ${formatDays(input.exclusivityDays).toLowerCase()}.`;
  out.push(`${usage}, ${exclusivity}`);

  return out;
}
