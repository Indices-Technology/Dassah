import { PrismaClient } from '@prisma/client';

// Prisma singleton — prevents multiple connections in dev hot-reload.
// Always import from this file, never instantiate PrismaClient elsewhere.
//
// Performance note: if a query is slow, use prisma.$queryRaw for that
// specific query rather than switching ORM. Check ARCHITECTURE.md ADR note
// on Prisma before making changes.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
