import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  CreatorOnboardingSchema,
  toCreatorRecord,
} from "@/lib/creators/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const creators = await prisma.creator.findMany({
    orderBy: { createdAt: "desc" },
    include: { socials: true },
    take: 100,
  });
  return Response.json({ creators });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const parsed = CreatorOnboardingSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", issues: z.treeifyError(parsed.error) },
      { status: 422 },
    );
  }
  const input = parsed.data;
  const { rateCard, guardrails, voiceProfile, approvalPolicy } =
    toCreatorRecord(input);

  try {
    const creator = await prisma.creator.create({
      data: {
        name: input.name,
        email: input.email,
        niche: input.niche,
        rateCard,
        guardrails,
        voiceProfile,
        approvalPolicy,
        socials: {
          create: input.socials.map((s) => ({
            platform: s.platform,
            handle: s.handle,
            followerCount: s.followerCount ?? null,
          })),
        },
      },
      include: { socials: true },
    });
    return Response.json({ creator }, { status: 201 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Creator.email is unique; SocialAccount is unique on (platform, handle).
      const target = (err.meta?.target as string[] | undefined)?.join(", ");
      return Response.json(
        {
          error: target?.includes("email")
            ? "A creator with that email already exists."
            : "That social handle is already linked to a creator.",
        },
        { status: 409 },
      );
    }
    throw err;
  }
}
