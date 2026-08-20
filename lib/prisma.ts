import { PrismaClient } from "@prisma/client";

// Singleton pour éviter l'épuisement des connexions en dev (hot reload Next.js).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
