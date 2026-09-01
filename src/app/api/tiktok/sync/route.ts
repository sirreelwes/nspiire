import { syncAccount } from "@/lib/tiktok/sync";
import { isOperator } from "@/lib/auth/operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The console's API surface is operator-only, same gate as its pages. */
async function denyIfPublic(): Promise<Response | null> {
  if (await isOperator()) return null;
  return Response.json({ error: "unauthorized" }, { status: 401 });
}


/** Re-pull metrics for one connected account. */
export async function POST(request: Request) {
  const denied = await denyIfPublic();
  if (denied) return denied;

  let body: { accountId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body" }, { status: 400 });
  }
  if (!body.accountId) {
    return Response.json({ error: "accountId is required" }, { status: 400 });
  }

  try {
    return Response.json({ synced: await syncAccount(body.accountId) });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 502 },
    );
  }
}
