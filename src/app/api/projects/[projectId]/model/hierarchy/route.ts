import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

interface HierarchyNode {
  id: string;
  name: string;
  category: string;
  subtype: string | null;
  parentNodeId: string | null;
  children: HierarchyNode[];
}

function buildHierarchy(nodes: HierarchyNode[]): HierarchyNode[] {
  const nodeMap = new Map<string, HierarchyNode>();
  const roots: HierarchyNode[] = [];

  nodes.forEach((node) => {
    nodeMap.set(node.id, { ...node, children: [] });
  });

  nodeMap.forEach((node) => {
    if (node.parentNodeId && nodeMap.has(node.parentNodeId)) {
      const parent = nodeMap.get(node.parentNodeId);
      if (parent) {
        parent.children.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  return roots;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await prisma.projectMembership.findUnique({
      where: { projectId_userId: { projectId: params.projectId, userId } },
    });
    if (!membership) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const nodes = await prisma.modelNode.findMany({
      where: { projectId: params.projectId },
      select: {
        id: true,
        name: true,
        category: true,
        subtype: true,
        parentNodeId: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const hierarchy = buildHierarchy(
      nodes.map((node) => ({
        ...node,
        children: [],
      }))
    );

    return NextResponse.json(hierarchy);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Get hierarchy error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
