import { PrismaClient } from "@prisma/client";

/**
 * Singleton — Next dev/HMR would otherwise open a new pool per reload.
 * Import this everywhere; never `new PrismaClient()` in a route.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** True once a Postgres URL is configured. Pages use this to render an
 *  honest "not connected yet" state instead of a 500 during setup. */
export const hasDatabase = Boolean(process.env.DATABASE_URL);
