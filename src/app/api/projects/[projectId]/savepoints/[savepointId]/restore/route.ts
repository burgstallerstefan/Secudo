import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { getProjectViewAccess } from '@/lib/project-access';
import { isGlobalAdmin } from '@/lib/user-role';

const SnapshotNodeSchema = z.object({
  id: z.string().optional(),
  stableId: z.string().optional(),
  name: z.string().min(1),
  category: z.string().optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  parentNodeId: z.string().nullable().optional(),
});

const SnapshotEdgeSchema = z.object({
  id: z.string().optional(),
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
  sourceHandleId: z.string().nullable().optional(),
  targetHandleId: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  direction: z.string().optional(),
  protocol: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const SnapshotDataObjectSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  dataClass: z.string().optional(),
  confidentiality: z.number().optional(),
  integrity: z.number().optional(),
  availability: z.number().optional(),
  tags: z.string().nullable().optional(),
});

const SnapshotComponentDataSchema = z.object({
  id: z.string().optional(),
  nodeId: z.string(),
  dataObjectId: z.string(),
  role: z.string().optional(),
  notes: z.string().nullable().optional(),
});

const SnapshotEdgeDataFlowSchema = z.object({
  id: z.string().optional(),
  edgeId: z.string(),
  dataObjectId: z.string(),
  direction: z.string().optional(),
  notes: z.string().nullable().optional(),
});

const SnapshotSchema = z.object({
  version: z.number().optional(),
  capturedAt: z.string().optional(),
  nodes: z.array(SnapshotNodeSchema).default([]),
  edges: z.array(SnapshotEdgeSchema).default([]),
  dataObjects: z.array(SnapshotDataObjectSchema).default([]),
  componentData: z.array(SnapshotComponentDataSchema).default([]),
  edgeDataFlows: z.array(SnapshotEdgeDataFlowSchema).default([]),
  nodePositions: z
    .record(
      z.object({
        x: z.number(),
        y: z.number(),
      })
    )
    .default({}),
  containerSizes: z
    .record(
      z.object({
        width: z.number(),
        height: z.number(),
      })
    )
    .default({}),
});

function normalizeNodeCategory(rawCategory: string | undefined): 'Container' | 'Component' {
  const value = (rawCategory || '').trim().toLowerCase();
  if (value === 'container' || value === 'system') {
    return 'Container';
  }
  return 'Component';
}

function normalizeEdgeDirection(rawDirection: string | undefined): 'A_TO_B' | 'B_TO_A' | 'BIDIRECTIONAL' {
  const value = (rawDirection || '').trim().toUpperCase();
  if (value === 'B_TO_A') return 'B_TO_A';
  if (value === 'BIDIRECTIONAL') return 'BIDIRECTIONAL';
  return 'A_TO_B';
}

function normalizeComponentDataRole(rawRole: string | undefined): 'Stores' | 'Processes' | 'Generates' | 'Receives' {
  const value = (rawRole || '').trim().toLowerCase();
  if (value === 'processes') return 'Processes';
  if (value === 'generates') return 'Generates';
  if (value === 'receives') return 'Receives';
  return 'Stores';
}

function normalizeFlowDirection(rawDirection: string | undefined): 'SourceToTarget' | 'TargetToSource' | 'Bidirectional' {
  const value = (rawDirection || '').trim().toLowerCase();
  if (value === 'targettosource') return 'TargetToSource';
  if (value === 'bidirectional') return 'Bidirectional';
  return 'SourceToTarget';
}

function safeIdFromSnapshot(rawId: string | undefined, prefix: string, index: number): string {
  const candidate = (rawId || '').trim();
  if (candidate) {
    return candidate;
  }
  return `${prefix}_${index + 1}_${randomUUID().replace(/-/g, '')}`;
}

function clampCia(value: number | undefined): number {
  if (!Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(10, Math.round(value as number)));
}

function sanitizeNodePositionMap(
  rawMap: Record<string, { x: number; y: number }>,
  idMap: Map<string, string>,
  validNodeIds: Set<string>
) {
  const result: Record<string, { x: number; y: number }> = {};
  Object.entries(rawMap).forEach(([sourceId, position]) => {
    const mappedId = idMap.get(sourceId);
    if (!mappedId || !validNodeIds.has(mappedId)) {
      return;
    }
    if (
      typeof position?.x !== 'number' ||
      typeof position?.y !== 'number' ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      return;
    }
    result[mappedId] = { x: position.x, y: position.y };
  });
  return result;
}

function sanitizeContainerSizeMap(
  rawMap: Record<string, { width: number; height: number }>,
  idMap: Map<string, string>,
  validNodeIds: Set<string>
) {
  const result: Record<string, { width: number; height: number }> = {};
  Object.entries(rawMap).forEach(([sourceId, size]) => {
    const mappedId = idMap.get(sourceId);
    if (!mappedId || !validNodeIds.has(mappedId)) {
      return;
    }
    if (
      typeof size?.width !== 'number' ||
      typeof size?.height !== 'number' ||
      !Number.isFinite(size.width) ||
      !Number.isFinite(size.height)
    ) {
      return;
    }
    result[mappedId] = {
      width: Math.max(1, Math.round(size.width)),
      height: Math.max(1, Math.round(size.height)),
    };
  });
  return result;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: { projectId: string; savepointId: string } }
) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const access = await getProjectViewAccess(params.projectId, userId, session.user?.role);
    if (!access.exists) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (
      !isGlobalAdmin(session.user?.role) &&
      (!access.membershipRole || (access.membershipRole !== 'Admin' && access.membershipRole !== 'Editor'))
    ) {
      return NextResponse.json({ error: 'Not authorized (Editor required)' }, { status: 403 });
    }

    const savepoint = await prisma.canonicalModelSavepoint.findFirst({
      where: {
        id: params.savepointId,
        projectId: params.projectId,
      },
      select: {
        id: true,
        title: true,
        modelJson: true,
        createdAt: true,
      },
    });

    if (!savepoint) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(savepoint.modelJson);
    } catch {
      return NextResponse.json({ error: 'Snapshot data is corrupted (invalid JSON)' }, { status: 422 });
    }

    const snapshot = SnapshotSchema.parse(parsedJson);

    const restoreResult = await prisma.$transaction(async (tx) => {
      await tx.edgeDataFlow.deleteMany({
        where: {
          edge: {
            projectId: params.projectId,
          },
        },
      });
      await tx.componentData.deleteMany({
        where: {
          node: {
            projectId: params.projectId,
          },
        },
      });
      await tx.modelEdge.deleteMany({ where: { projectId: params.projectId } });
      await tx.modelNode.deleteMany({ where: { projectId: params.projectId } });
      await tx.dataObject.deleteMany({ where: { projectId: params.projectId } });

      const nodeIdMap = new Map<string, string>();
      const usedNodeIds = new Set<string>();
      const usedStableIds = new Set<string>();
      const normalizedNodes = snapshot.nodes.map((node, index) => {
        const sourceId = safeIdFromSnapshot(node.id, 'snapshot_node_source', index);
        let restoredId = safeIdFromSnapshot(node.id, 'snapshot_node', index);
        if (usedNodeIds.has(restoredId)) {
          restoredId = safeIdFromSnapshot(undefined, 'snapshot_node', index);
        }
        usedNodeIds.add(restoredId);
        nodeIdMap.set(sourceId, restoredId);
        if (node.id && node.id.trim() && node.id !== sourceId) {
          nodeIdMap.set(node.id, restoredId);
        }

        let stableId = (node.stableId || '').trim();
        if (!stableId) {
          stableId = `restored_${normalizeNodeCategory(node.category).toLowerCase()}_${index + 1}_${Date.now()}`;
        }
        while (usedStableIds.has(stableId)) {
          stableId = `${stableId}_${Math.floor(Math.random() * 1000)}`;
        }
        usedStableIds.add(stableId);

        return {
          sourceId,
          restoredId,
          stableId,
          name: node.name.trim(),
          category: normalizeNodeCategory(node.category),
          description: node.description || null,
          notes: node.notes || null,
          parentSourceId: node.parentNodeId || null,
        };
      });

      for (const node of normalizedNodes) {
        await tx.modelNode.create({
          data: {
            id: node.restoredId,
            projectId: params.projectId,
            stableId: node.stableId,
            name: node.name || 'Restored Node',
            category: node.category,
            description: node.description,
            notes: node.notes,
            parentNodeId: null,
            createdByUserId: userId,
            updatedByUserId: userId,
          },
        });
      }

      for (const node of normalizedNodes) {
        if (!node.parentSourceId) {
          continue;
        }
        const mappedParentId = nodeIdMap.get(node.parentSourceId);
        if (!mappedParentId || mappedParentId === node.restoredId) {
          continue;
        }
        await tx.modelNode.update({
          where: { id: node.restoredId },
          data: {
            parentNodeId: mappedParentId,
            updatedByUserId: userId,
          },
        });
      }

      const dataObjectIdMap = new Map<string, string>();
      const usedDataObjectIds = new Set<string>();
      const usedDataObjectNames = new Set<string>();
      let dataObjectCounter = 0;

      for (let index = 0; index < snapshot.dataObjects.length; index += 1) {
        const dataObject = snapshot.dataObjects[index];
        const sourceId = safeIdFromSnapshot(dataObject.id, 'snapshot_data_source', index);
        let restoredId = safeIdFromSnapshot(dataObject.id, 'snapshot_data', index);
        if (usedDataObjectIds.has(restoredId)) {
          restoredId = safeIdFromSnapshot(undefined, 'snapshot_data', index);
        }
        usedDataObjectIds.add(restoredId);
        dataObjectIdMap.set(sourceId, restoredId);
        if (dataObject.id && dataObject.id.trim() && dataObject.id !== sourceId) {
          dataObjectIdMap.set(dataObject.id, restoredId);
        }

        let dataObjectName = dataObject.name.trim();
        if (!dataObjectName) {
          dataObjectCounter += 1;
          dataObjectName = `Restored Data ${dataObjectCounter}`;
        }
        const nameKey = dataObjectName.toLowerCase();
        if (usedDataObjectNames.has(nameKey)) {
          let suffix = 2;
          while (usedDataObjectNames.has(`${nameKey} (${suffix})`)) {
            suffix += 1;
          }
          dataObjectName = `${dataObjectName} (${suffix})`;
        }
        usedDataObjectNames.add(dataObjectName.toLowerCase());

        await tx.dataObject.create({
          data: {
            id: restoredId,
            projectId: params.projectId,
            name: dataObjectName,
            description: dataObject.description || null,
            dataClass: dataObject.dataClass || 'Other',
            confidentiality: clampCia(dataObject.confidentiality),
            integrity: clampCia(dataObject.integrity),
            availability: clampCia(dataObject.availability),
            tags: dataObject.tags || null,
          },
        });
      }

      const edgeIdMap = new Map<string, string>();
      const usedEdgeIds = new Set<string>();
      const usedSourceTargetPairs = new Set<string>();
      let skippedEdges = 0;

      for (let index = 0; index < snapshot.edges.length; index += 1) {
        const edge = snapshot.edges[index];
        const sourceNodeId = nodeIdMap.get(edge.sourceNodeId || '');
        const targetNodeId = nodeIdMap.get(edge.targetNodeId || '');
        if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) {
          skippedEdges += 1;
          continue;
        }

        const sourceTargetKey = `${sourceNodeId}::${targetNodeId}`;
        if (usedSourceTargetPairs.has(sourceTargetKey)) {
          skippedEdges += 1;
          continue;
        }
        usedSourceTargetPairs.add(sourceTargetKey);

        const sourceEdgeId = safeIdFromSnapshot(edge.id, 'snapshot_edge_source', index);
        let restoredEdgeId = safeIdFromSnapshot(edge.id, 'snapshot_edge', index);
        if (usedEdgeIds.has(restoredEdgeId)) {
          restoredEdgeId = safeIdFromSnapshot(undefined, 'snapshot_edge', index);
        }
        usedEdgeIds.add(restoredEdgeId);
        edgeIdMap.set(sourceEdgeId, restoredEdgeId);
        if (edge.id && edge.id.trim() && edge.id !== sourceEdgeId) {
          edgeIdMap.set(edge.id, restoredEdgeId);
        }

        await tx.modelEdge.create({
          data: {
            id: restoredEdgeId,
            projectId: params.projectId,
            sourceNodeId,
            targetNodeId,
            sourceHandleId: edge.sourceHandleId || null,
            targetHandleId: edge.targetHandleId || null,
            name: edge.name || null,
            direction: normalizeEdgeDirection(edge.direction),
            protocol: edge.protocol || null,
            description: edge.description || null,
            notes: edge.notes || null,
            createdByUserId: userId,
          },
        });
      }

      const usedComponentDataPairs = new Set<string>();
      const usedComponentDataIds = new Set<string>();
      let skippedComponentData = 0;
      for (let index = 0; index < snapshot.componentData.length; index += 1) {
        const componentData = snapshot.componentData[index];
        const nodeId = nodeIdMap.get(componentData.nodeId || '');
        const dataObjectId = dataObjectIdMap.get(componentData.dataObjectId || '');
        if (!nodeId || !dataObjectId) {
          skippedComponentData += 1;
          continue;
        }

        const pairKey = `${nodeId}::${dataObjectId}`;
        if (usedComponentDataPairs.has(pairKey)) {
          skippedComponentData += 1;
          continue;
        }
        usedComponentDataPairs.add(pairKey);

        let restoredComponentDataId = safeIdFromSnapshot(componentData.id, 'snapshot_component_data', index);
        while (usedComponentDataIds.has(restoredComponentDataId)) {
          restoredComponentDataId = safeIdFromSnapshot(undefined, 'snapshot_component_data', index);
        }
        usedComponentDataIds.add(restoredComponentDataId);

        await tx.componentData.create({
          data: {
            id: restoredComponentDataId,
            nodeId,
            dataObjectId,
            role: normalizeComponentDataRole(componentData.role),
            notes: componentData.notes || null,
          },
        });
      }

      const usedEdgeDataFlowPairs = new Set<string>();
      const usedEdgeDataFlowIds = new Set<string>();
      let skippedEdgeDataFlows = 0;
      for (let index = 0; index < snapshot.edgeDataFlows.length; index += 1) {
        const edgeDataFlow = snapshot.edgeDataFlows[index];
        const edgeId = edgeIdMap.get(edgeDataFlow.edgeId || '');
        const dataObjectId = dataObjectIdMap.get(edgeDataFlow.dataObjectId || '');
        if (!edgeId || !dataObjectId) {
          skippedEdgeDataFlows += 1;
          continue;
        }

        const pairKey = `${edgeId}::${dataObjectId}`;
        if (usedEdgeDataFlowPairs.has(pairKey)) {
          skippedEdgeDataFlows += 1;
          continue;
        }
        usedEdgeDataFlowPairs.add(pairKey);

        let restoredEdgeDataFlowId = safeIdFromSnapshot(edgeDataFlow.id, 'snapshot_edge_data_flow', index);
        while (usedEdgeDataFlowIds.has(restoredEdgeDataFlowId)) {
          restoredEdgeDataFlowId = safeIdFromSnapshot(undefined, 'snapshot_edge_data_flow', index);
        }
        usedEdgeDataFlowIds.add(restoredEdgeDataFlowId);

        await tx.edgeDataFlow.create({
          data: {
            id: restoredEdgeDataFlowId,
            edgeId,
            dataObjectId,
            direction: normalizeFlowDirection(edgeDataFlow.direction),
            notes: edgeDataFlow.notes || null,
          },
        });
      }

      const restoredNodeIds = new Set(normalizedNodes.map((node) => node.restoredId));
      const restoredPositions = sanitizeNodePositionMap(snapshot.nodePositions, nodeIdMap, restoredNodeIds);
      const restoredContainerSizes = sanitizeContainerSizeMap(snapshot.containerSizes, nodeIdMap, restoredNodeIds);

      const warningParts: string[] = [];
      if (skippedEdges > 0) {
        warningParts.push(`${skippedEdges} interface(s) were skipped due to invalid or duplicate references.`);
      }
      if (skippedComponentData > 0) {
        warningParts.push(`${skippedComponentData} component-data mapping(s) were skipped.`);
      }
      if (skippedEdgeDataFlows > 0) {
        warningParts.push(`${skippedEdgeDataFlows} data-flow mapping(s) were skipped.`);
      }

      return {
        restored: {
          nodes: normalizedNodes.length,
          dataObjects: snapshot.dataObjects.length,
          edges: snapshot.edges.length - skippedEdges,
          componentData: snapshot.componentData.length - skippedComponentData,
          edgeDataFlows: snapshot.edgeDataFlows.length - skippedEdgeDataFlows,
        },
        state: {
          nodePositions: restoredPositions,
          containerSizes: restoredContainerSizes,
        },
        warning: warningParts.length > 0 ? warningParts.join(' ') : null,
      };
    });

    return NextResponse.json({
      success: true,
      savepoint: {
        id: savepoint.id,
        title: savepoint.title,
        createdAt: savepoint.createdAt,
      },
      restored: restoreResult.restored,
      state: restoreResult.state,
      warning: restoreResult.warning,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid snapshot format', details: error.errors }, { status: 422 });
    }
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Restore snapshot error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
