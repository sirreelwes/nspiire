-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "voice" JSONB NOT NULL DEFAULT '{}',
    "bio" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Persona_name_key" ON "Persona"("name");

-- AlterTable
ALTER TABLE "Creator" ADD COLUMN     "personaId" TEXT;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "personaId" TEXT;

-- AlterTable
ALTER TABLE "Interaction" ADD COLUMN     "personaId" TEXT,
ADD COLUMN     "audience" TEXT NOT NULL DEFAULT 'creator';

-- CreateIndex
CREATE INDEX "Interaction_dealId_audience_createdAt_idx" ON "Interaction"("dealId", "audience", "createdAt");

-- AddForeignKey
ALTER TABLE "Creator" ADD CONSTRAINT "Creator_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the first virtual agent. This is reference data, not user data: the app
-- resolves a persona for every deal and needs at least one to exist, on every
-- environment, before anyone touches the console. Idempotent so re-running a
-- migration on a database that already has her is a no-op.
INSERT INTO "Persona" ("id", "name", "title", "bio", "voice", "isActive", "createdAt", "updatedAt")
VALUES (
    'persona_iris',
    'Iris',
    'Partnerships, Nspiire',
    'Runs outreach and brings deals back. Direct, unhurried, allergic to hype.',
    '{"tone":"Warm but businesslike. Unhurried. Says the number without flinching.","traits":["Specific over enthusiastic — one real audience figure beats three adjectives.","Comfortable with a plain no, and with silence after a question.","Short sentences. Reads like a person typing, not a template."],"avoid":["I hope this finds you well","reaching out","synergy","excited to partner","exclamation marks","em-dash pile-ups","calling the creator a brand or an asset"],"signOff":"Iris"}',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;
