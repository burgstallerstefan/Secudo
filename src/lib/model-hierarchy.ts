import { prisma } from '@/lib/prisma';

export async function wouldCreateHierarchyCycle(
  projectId: string,
  nodeId: string,
  candidateParentId: string
): Promise<boolean> {
  if (nodeId === candidateParentId) {
    return true;
  }

  let currentParentId: string | null = candidateParentId;
  while (currentParentId) {
    if (currentParentId === nodeId) {
      return true;
    }

    const parentNode: { id: string; projectId: string; parentNodeId: string | null } | null =
      await prisma.modelNode.findUnique({
      where: { id: currentParentId },
      select: { id: true, projectId: true, parentNodeId: true },
      });

    if (!parentNode || parentNode.projectId !== projectId) {
      return true;
    }

    currentParentId = parentNode.parentNodeId;
  }

  return false;
}
