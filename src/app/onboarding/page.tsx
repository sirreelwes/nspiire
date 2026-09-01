import { requireOperator } from "@/lib/auth/operator";
import { OnboardingForm } from "./form";

export const dynamic = "force-dynamic";

/**
 * Onboarding is an operator action, so it has to be gated — but the form is a
 * client component and requireOperator() reads cookies on the server. Hence
 * the split: this server page is the gate, ./form.tsx is the interactive part.
 */
export default async function OnboardingPage() {
  await requireOperator("/onboarding");
  return <OnboardingForm />;
}
