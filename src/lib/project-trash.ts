import { prisma } from '@/lib/prisma';

export const PROJECT_TRASH_RETENTION_DAYS = 30;
let supportsProjectDeletedAtCache: boolean | null = null;

export function supportsProjectDeletedAt(): boolean {
  if (supportsProjectDeletedAtCache !== null) {
    return supportsProjectDeletedAtCache;
  }

  const runtimeModel = (prisma as unknown as { _runtimeDataModel?: { models?: Record<string, { fields?: Array<{ name?: string }> }> } })
    ._runtimeDataModel?.models?.Project;
  const fields = Array.isArray(runtimeModel?.fields) ? runtimeModel.fields : [];
  supportsProjectDeletedAtCache = fields.some((field) => field?.name === 'deletedAt');
  return supportsProjectDeletedAtCache;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function getProjectTrashExpiry(deletedAt: Date): Date {
  return addDays(deletedAt, PROJECT_TRASH_RETENTION_DAYS);
}

export function getProjectTrashCutoff(now = new Date()): Date {
  return addDays(now, -PROJECT_TRASH_RETENTION_DAYS);
}

export async function purgeExpiredDeletedProjects(now = new Date()): Promise<number> {
  if (!supportsProjectDeletedAt()) {
    return 0;
  }

  const cutoff = getProjectTrashCutoff(now);
  const result = await prisma.project.deleteMany({
    where: {
      deletedAt: {
        not: null,
        lte: cutoff,
      },
    },
  });
  return result.count;
}
