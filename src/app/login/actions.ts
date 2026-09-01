"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  issueSessionValue,
  operatorGateConfigured,
  operatorIdentityAllowed,
  passwordMatches,
} from "@/lib/auth/operator";

/**
 * Sign in to the operator console.
 *
 * Brute force is not rate-limited here — with a serverless runtime an
 * in-memory counter is per-instance and would be security theatre. The
 * protection is that NSPIIRE_OPERATOR_PASSWORD is meant to be a long random
 * string, and the comparison is constant-time. If this ever serves more than
 * one operator it needs real accounts and real throttling.
 */
export async function signIn(formData: FormData): Promise<void> {
  const attempt = formData.get("password");
  const next = formData.get("next");
  const target = typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/dashboard";

  if (!operatorGateConfigured()) {
    redirect("/login?error=unconfigured");
  }

  // Identity and secret are checked together, and the failure is the same
  // message either way — saying "no such operator" would confirm which
  // addresses are on the allowlist.
  const identity = formData.get("email");
  const identityOk =
    typeof identity === "string" && operatorIdentityAllowed(identity);

  if (typeof attempt !== "string" || !passwordMatches(attempt) || !identityOk) {
    redirect(`/login?error=denied&next=${encodeURIComponent(target)}`);
  }

  const { value, maxAge } = issueSessionValue();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });

  redirect(target);
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/");
}
