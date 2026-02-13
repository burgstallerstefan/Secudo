'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  ConnectionMode,
  Connection,
  Controls,
  Edge,
  EdgeMouseHandler,
  Handle,
  MarkerType,
  Node,
  NodeProps,
  NodeMouseHandler,
  Position,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import AIModelGenerator from '@/components/project/AIModelGenerator';

type NodeCategory = 'Container' | 'Component';
type EdgeDirection = 'A_TO_B' | 'B_TO_A' | 'BIDIRECTIONAL';
type DataClass =
  | 'Credentials'
  | 'PersonalData'
  | 'SafetyRelevant'
  | 'ProductionData'
  | 'Telemetry'
  | 'Logs'
  | 'IntellectualProperty'
  | 'Configuration'
  | 'Other';

interface ApiNode {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  notes?: string | null;
  parentNodeId?: string | null;
}

interface ApiEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandleId?: string | null;
  targetHandleId?: string | null;
  name?: string | null;
  direction: EdgeDirection;
  protocol?: string | null;
  description?: string | null;
  notes?: string | null;
}

interface ApiDataObject {
  id: string;
  name: string;
  dataClass: DataClass;
  description?: string | null;
  confidentiality: number;
  integrity: number;
  availability: number;
}

interface ApiComponentData {
  id: string;
  nodeId: string;
  dataObjectId: string;
  role: 'Stores' | 'Processes' | 'Generates' | 'Receives';
  notes?: string | null;
  dataObject?: ApiDataObject;
}

interface ApiEdgeDataFlow {
  id: string;
  edgeId: string;
  dataObjectId: string;
  direction: 'SourceToTarget' | 'TargetToSource' | 'Bidirectional';
  notes?: string | null;
  dataObject?: ApiDataObject;
}

interface ApiModelSnapshotSummary {
  id: string;
  title: string;
  createdAt: string;
  createdBy?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
}

interface ApiModelSnapshotRestoreResponse {
  success: boolean;
  restored?: {
    nodes: number;
    edges: number;
    dataObjects: number;
    componentData: number;
    edgeDataFlows: number;
  };
  state?: {
    nodePositions?: Record<string, { x: number; y: number }>;
    containerSizes?: Record<string, { width: number; height: number }>;
  };
  warning?: string | null;
  error?: string;
}

interface GraphEditorProps {
  projectId: string;
  canEdit?: boolean;
}

type GraphNodeData = {
  label: React.ReactNode;
};

type GraphNode = Node<GraphNodeData>;
type GraphEdge = Edge;
type NodePosition = { x: number; y: number };
type NodePositionMap = Record<string, NodePosition>;
type NodeSize = { width: number; height: number };
type ContainerSizeMap = Record<string, NodeSize>;
type ActiveResizeState = {
  nodeId: string;
  startClientX: number;
  startClientY: number;
  startWidth: number;
  startHeight: number;
};

type HistoryAction = {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

type DataTransferMode = 'A_SENDS_TO_B' | 'A_FETCHES_FROM_B';
type DataTransferDraft = {
  componentAId: string;
  componentBId: string;
  mode: DataTransferMode;
};
type DataMappingMode = 'Stores' | 'Processes' | 'Generates' | 'Receives' | 'SendsTo' | 'FetchesFrom';

const DATA_CLASSES: DataClass[] = [
  'Credentials',
  'PersonalData',
  'SafetyRelevant',
  'ProductionData',
  'Telemetry',
  'Logs',
  'IntellectualProperty',
  'Configuration',
  'Other',
];

const DIRECTION_LABEL: Record<EdgeDirection, string> = {
  A_TO_B: '->',
  B_TO_A: '<-',
  BIDIRECTIONAL: '<->',
};

const sortByNameWithGlobalFirst = (a: { name: string }, b: { name: string }) => {
  const aIsGlobal = a.name.trim().toLowerCase() === 'global';
  const bIsGlobal = b.name.trim().toLowerCase() === 'global';
  if (aIsGlobal && !bIsGlobal) {
    return -1;
  }
  if (!aIsGlobal && bIsGlobal) {
    return 1;
  }
  return a.name.localeCompare(b.name);
};

const COMPONENT_DATA_ROLES: Array<'Generates' | 'Processes' | 'Stores' | 'Receives'> = [
  'Generates',
  'Processes',
  'Stores',
  'Receives',
];

const GLOBAL_PARENT_SENTINEL = '__GLOBAL__';
const NODE_POSITION_STORAGE_PREFIX = 'secudo.graph.positions.';
const CONTAINER_SIZE_STORAGE_PREFIX = 'secudo.graph.container-sizes.';
const ROOT_GRID_COLS = 4;
const ROOT_GRID_X = 80;
const ROOT_GRID_Y = 80;
const ROOT_GRID_X_STEP = 320;
const ROOT_GRID_Y_STEP = 240;
const DEFAULT_CONTAINER_WIDTH = 520;
const DEFAULT_CONTAINER_HEIGHT = 320;
const COMPONENT_WIDTH = 220;
const COMPONENT_HEIGHT = 96;
const MIN_CONTAINER_DIMENSION = 1;
const DEFAULT_DATA_TRANSFER_DRAFT: DataTransferDraft = {
  componentAId: '',
  componentBId: '',
  mode: 'A_SENDS_TO_B',
};

const HANDLE_POINTS: Array<{
  id: string;
  type: 'source';
  position: Position;
  xRatio: number;
  yRatio: number;
  style: {
    left?: string;
    top?: string;
    right?: string;
    bottom?: string;
    transform?: string;
  };
}> = [
  {
    id: 'top-in',
    type: 'source',
    position: Position.Top,
    xRatio: 0.2,
    yRatio: 0,
    style: { left: '20%', top: '0%', transform: 'translate(-50%, -50%)' },
  },
  {
    id: 'top-mid',
    type: 'source',
    position: Position.Top,
    xRatio: 0.5,
    yRatio: 0,
    style: { left: '50%', top: '0%', transform: 'translate(-50%, -50%)' },
  },
  {
    id: 'top-out',
    type: 'source',
    position: Position.Top,
    xRatio: 0.8,
    yRatio: 0,
    style: { left: '80%', top: '0%', transform: 'translate(-50%, -50%)' },
  },
  {
    id: 'right-in',
    type: 'source',
    position: Position.Right,
    xRatio: 1,
    yRatio: 0.2,
    style: { right: '0%', top: '20%', transform: 'translate(50%, -50%)' },
  },
  {
    id: 'right-mid',
    type: 'source',
    position: Position.Right,
    xRatio: 1,
    yRatio: 0.5,
    style: { right: '0%', top: '50%', transform: 'translate(50%, -50%)' },
  },
  {
    id: 'right-out',
    type: 'source',
    position: Position.Right,
    xRatio: 1,
    yRatio: 0.8,
    style: { right: '0%', top: '80%', transform: 'translate(50%, -50%)' },
  },
  {
    id: 'bottom-in',
    type: 'source',
    position: Position.Bottom,
    xRatio: 0.2,
    yRatio: 1,
    style: { left: '20%', bottom: '0%', transform: 'translate(-50%, 50%)' },
  },
  {
    id: 'bottom-mid',
    type: 'source',
    position: Position.Bottom,
    xRatio: 0.5,
    yRatio: 1,
    style: { left: '50%', bottom: '0%', transform: 'translate(-50%, 50%)' },
  },
  {
    id: 'bottom-out',
    type: 'source',
    position: Position.Bottom,
    xRatio: 0.8,
    yRatio: 1,
    style: { left: '80%', bottom: '0%', transform: 'translate(-50%, 50%)' },
  },
  {
    id: 'left-in',
    type: 'source',
    position: Position.Left,
    xRatio: 0,
    yRatio: 0.2,
    style: { left: '0%', top: '20%', transform: 'translate(-50%, -50%)' },
  },
  {
    id: 'left-mid',
    type: 'source',
    position: Position.Left,
    xRatio: 0,
    yRatio: 0.5,
    style: { left: '0%', top: '50%', transform: 'translate(-50%, -50%)' },
  },
  {
    id: 'left-out',
    type: 'source',
    position: Position.Left,
    xRatio: 0,
    yRatio: 0.8,
    style: { left: '0%', top: '80%', transform: 'translate(-50%, -50%)' },
  },
];

const HANDLE_POINT_BY_ID = new Map(HANDLE_POINTS.map((handle) => [handle.id, handle]));
const IN_HANDLE_IDS = HANDLE_POINTS.map((handle) => handle.id);
const OUT_HANDLE_IDS = HANDLE_POINTS.map((handle) => handle.id);
const DEFAULT_SOURCE_HANDLE_ID = 'right-mid';
const DEFAULT_TARGET_HANDLE_ID = 'left-mid';

const isInHandleId = (handleId: string | null | undefined) =>
  Boolean(handleId && HANDLE_POINT_BY_ID.has(handleId));

const isOutHandleId = (handleId: string | null | undefined) =>
  Boolean(handleId && HANDLE_POINT_BY_ID.has(handleId));

function EightHandleNode({ data }: NodeProps<GraphNodeData>) {
  return (
    <div className="relative h-full w-full">
      {HANDLE_POINTS.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type={handle.type}
          position={handle.position}
          style={handle.style}
          className="!h-1.5 !w-1.5 !rounded-full !border !border-slate-100/80 !bg-slate-700"
        />
      ))}
      {data.label}
    </div>
  );
}

const getRect = (position: NodePosition, size: NodeSize) => ({
  left: position.x,
  top: position.y,
  right: position.x + size.width,
  bottom: position.y + size.height,
});

const rectsTouchOrOverlap = (
  aPosition: NodePosition,
  aSize: NodeSize,
  bPosition: NodePosition,
  bSize: NodeSize
) => {
  const a = getRect(aPosition, aSize);
  const b = getRect(bPosition, bSize);
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
};

const overlapArea = (aPosition: NodePosition, aSize: NodeSize, bPosition: NodePosition, bSize: NodeSize) => {
  const a = getRect(aPosition, aSize);
  const b = getRect(bPosition, bSize);
  const overlapWidth = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const overlapHeight = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return overlapWidth * overlapHeight;
};

export default function GraphEditor({ projectId, canEdit = false }: GraphEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<GraphEdge>([]);
  const [modelNodes, setModelNodes] = useState<ApiNode[]>([]);
  const [modelEdges, setModelEdges] = useState<ApiEdge[]>([]);
  const [dataObjects, setDataObjects] = useState<ApiDataObject[]>([]);
  const [componentData, setComponentData] = useState<ApiComponentData[]>([]);
  const [edgeDataFlows, setEdgeDataFlows] = useState<ApiEdgeDataFlow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [newContainerName, setNewContainerName] = useState('');
  const [newComponentName, setNewComponentName] = useState('');
  const [newComponentDescription, setNewComponentDescription] = useState('');

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [selectedDataObjectId, setSelectedDataObjectId] = useState<string | null>(null);
  const [isSelectionActionBusy, setIsSelectionActionBusy] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [inlineNodeName, setInlineNodeName] = useState('');
  const [inlineEdgeName, setInlineEdgeName] = useState('');
  const [nodePositionMap, setNodePositionMap] = useState<NodePositionMap>({});
  const [positionsReady, setPositionsReady] = useState(false);
  const [containerSizeMap, setContainerSizeMap] = useState<ContainerSizeMap>({});
  const [containerSizesReady, setContainerSizesReady] = useState(false);
  const [activeResize, setActiveResize] = useState<ActiveResizeState | null>(null);

  const [newDataObjectName, setNewDataObjectName] = useState('');
  const [newDataObjectClass, setNewDataObjectClass] = useState<DataClass>('Other');
  const [newDataObjectDescription, setNewDataObjectDescription] = useState('');
  const [newComponentDataObjectId, setNewComponentDataObjectId] = useState('');
  const [newComponentDataRole, setNewComponentDataRole] = useState<'Stores' | 'Processes' | 'Generates' | 'Receives'>('Stores');
  const [newEdgeDataObjectId, setNewEdgeDataObjectId] = useState('');
  const [newEdgeDataDirection, setNewEdgeDataDirection] = useState<'SourceToTarget' | 'TargetToSource' | 'Bidirectional'>('SourceToTarget');
  const [dataSidebarObjectId, setDataSidebarObjectId] = useState('');
  const [dataSidebarRole, setDataSidebarRole] = useState<DataMappingMode>('Generates');
  const [dataSidebarComponentId, setDataSidebarComponentId] = useState('');
  const [dataSidebarFromComponentId, setDataSidebarFromComponentId] = useState('');
  const [dataTransferDrafts, setDataTransferDrafts] = useState<Record<string, DataTransferDraft>>({});
  const [activeDataTransferObjectId, setActiveDataTransferObjectId] = useState<string | null>(null);
  const [editingDataObjectId, setEditingDataObjectId] = useState<string | null>(null);
  const [inlineDataObjectName, setInlineDataObjectName] = useState('');

  const [editNodeName, setEditNodeName] = useState('');
  const [editNodeDescription, setEditNodeDescription] = useState('');
  const [editNodeNotes, setEditNodeNotes] = useState('');
  const [editNodeParentId, setEditNodeParentId] = useState('');

  const [editEdgeName, setEditEdgeName] = useState('');
  const [editEdgeDirection, setEditEdgeDirection] = useState<EdgeDirection>('A_TO_B');
  const [editEdgeProtocol, setEditEdgeProtocol] = useState('');
  const [editEdgeDescription, setEditEdgeDescription] = useState('');
  const [editEdgeNotes, setEditEdgeNotes] = useState('');

  const [editDataObjectName, setEditDataObjectName] = useState('');
  const [editDataObjectClass, setEditDataObjectClass] = useState<DataClass>('Other');
  const [editDataObjectDescription, setEditDataObjectDescription] = useState('');

  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [undoStack, setUndoStack] = useState<HistoryAction[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryAction[]>([]);
  const [isHistoryBusy, setIsHistoryBusy] = useState(false);
  const [savepointTitle, setSavepointTitle] = useState('');
  const [savepoints, setSavepoints] = useState<ApiModelSnapshotSummary[]>([]);
  const [isSavepointsLoading, setIsSavepointsLoading] = useState(false);
  const [isCreatingSavepoint, setIsCreatingSavepoint] = useState(false);
  const [restoringSavepointId, setRestoringSavepointId] = useState<string | null>(null);
  const [deletingSavepointId, setDeletingSavepointId] = useState<string | null>(null);
  const [savepointError, setSavepointError] = useState('');

  const nodeById = useMemo(() => new Map(modelNodes.map((node) => [node.id, node])), [modelNodes]);
  const edgeById = useMemo(() => new Map(modelEdges.map((edge) => [edge.id, edge])), [modelEdges]);
  const dataObjectById = useMemo(() => new Map(dataObjects.map((item) => [item.id, item])), [dataObjects]);
  const nodeTypes = useMemo(() => ({ eightHandleNode: EightHandleNode }), []);
  const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const selectedEdgeIdSet = useMemo(() => new Set(selectedEdgeIds), [selectedEdgeIds]);

  const selectedNode = useMemo(
    () => (selectedNodeId ? modelNodes.find((node) => node.id === selectedNodeId) || null : null),
    [modelNodes, selectedNodeId]
  );

  const selectedEdge = useMemo(
    () => (selectedEdgeId ? modelEdges.find((edge) => edge.id === selectedEdgeId) || null : null),
    [modelEdges, selectedEdgeId]
  );

  const selectedDataObject = useMemo(
    () =>
      selectedDataObjectId
        ? dataObjects.find((dataObject) => dataObject.id === selectedDataObjectId) || null
        : null,
    [dataObjects, selectedDataObjectId]
  );

  const selectedNodeBreadcrumb = useMemo(() => {
    if (!selectedNode) {
      return '';
    }

    const chain: string[] = [];
    let current: ApiNode | undefined = selectedNode;
    const visited = new Set<string>();

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      chain.unshift(current.name);
      current = current.parentNodeId ? nodeById.get(current.parentNodeId) : undefined;
    }

    return chain.join(' > ');
  }, [nodeById, selectedNode]);

  const isContainerNode = useCallback((node: ApiNode) => {
    const normalized = node.category.toLowerCase();
    return normalized === 'container' || normalized === 'system';
  }, []);

  const containerNodes = useMemo(
    () =>
      modelNodes
        .filter((node) => isContainerNode(node))
        .sort(sortByNameWithGlobalFirst),
    [isContainerNode, modelNodes]
  );

  const componentNodes = useMemo(
    () =>
      modelNodes
        .filter((node) => !isContainerNode(node))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [isContainerNode, modelNodes]
  );

  const dataObjectComponentStatements = useMemo(() => {
    const grouped = new Map<string, string[]>();
    dataObjects.forEach((dataObject) => grouped.set(dataObject.id, []));

    componentData.forEach((record) => {
      const entries = grouped.get(record.dataObjectId);
      if (!entries) {
        return;
      }
      const componentName = nodeById.get(record.nodeId)?.name || 'Unknown component';
      entries.push(`${componentName} ${record.role.toLowerCase()} data`);
    });

    grouped.forEach((entries, key) => {
      const uniqueEntries = Array.from(new Set(entries)).sort((a, b) => a.localeCompare(b));
      grouped.set(key, uniqueEntries);
    });

    return grouped;
  }, [componentData, dataObjects, nodeById]);

  const dataObjectTransferSummaries = useMemo(() => {
    const grouped = new Map<string, Array<{ edgeId: string; label: string }>>();
    dataObjects.forEach((dataObject) => grouped.set(dataObject.id, []));

    edgeDataFlows.forEach((flow) => {
      const edge = edgeById.get(flow.edgeId);
      if (!edge) {
        return;
      }

      const sourceName = nodeById.get(edge.sourceNodeId)?.name || 'Unknown component';
      const targetName = nodeById.get(edge.targetNodeId)?.name || 'Unknown component';
      const entries = grouped.get(flow.dataObjectId);
      if (!entries) {
        return;
      }

      if (flow.direction === 'SourceToTarget') {
        entries.push({ edgeId: edge.id, label: `${sourceName} sends to ${targetName}` });
        return;
      }

      if (flow.direction === 'TargetToSource') {
        entries.push({ edgeId: edge.id, label: `${targetName} sends to ${sourceName}` });
        return;
      }

      entries.push({ edgeId: edge.id, label: `${sourceName} exchanges with ${targetName}` });
    });

    grouped.forEach((entries, key) => {
      const deduplicated = new Map<string, { edgeId: string; label: string }>();
      entries.forEach((entry) => {
        deduplicated.set(`${entry.edgeId}:${entry.label}`, entry);
      });
      grouped.set(
        key,
        Array.from(deduplicated.values()).sort((a, b) => a.label.localeCompare(b.label))
      );
    });

    return grouped;
  }, [dataObjects, edgeById, edgeDataFlows, nodeById]);

  const updateDataTransferDraft = useCallback(
    (dataObjectId: string, patch: Partial<DataTransferDraft>) => {
      setDataTransferDrafts((current) => ({
        ...current,
        [dataObjectId]: {
          ...(current[dataObjectId] || DEFAULT_DATA_TRANSFER_DRAFT),
          ...patch,
        },
      }));
    },
    []
  );

  const getDataTransferDraft = useCallback(
    (dataObjectId: string): DataTransferDraft =>
      dataTransferDrafts[dataObjectId] || DEFAULT_DATA_TRANSFER_DRAFT,
    [dataTransferDrafts]
  );

  const globalContainerId = useMemo(() => {
    const globalContainer = containerNodes.find((node) => node.name.trim().toLowerCase() === 'global');
    return globalContainer?.id || null;
  }, [containerNodes]);

  const userContainers = useMemo(
    () => containerNodes.filter((node) => !globalContainerId || node.id !== globalContainerId),
    [containerNodes, globalContainerId]
  );

  const resolveNearestDirectionalHandles = useCallback(
    (sourceNodeId: string, targetNodeId: string): { sourceHandleId: string; targetHandleId: string } => {
      const resolveNodePosition = (nodeId: string): NodePosition => {
        const known = nodePositionMap[nodeId];
        if (known) {
          return known;
        }
        const fallbackIndex = modelNodes.findIndex((node) => node.id === nodeId);
        if (fallbackIndex < 0) {
          return { x: ROOT_GRID_X, y: ROOT_GRID_Y };
        }
        return {
          x: ROOT_GRID_X + (fallbackIndex % ROOT_GRID_COLS) * ROOT_GRID_X_STEP,
          y: ROOT_GRID_Y + Math.floor(fallbackIndex / ROOT_GRID_COLS) * ROOT_GRID_Y_STEP,
        };
      };

      const sourceNode = nodeById.get(sourceNodeId);
      const targetNode = nodeById.get(targetNodeId);
      const sourcePosition = resolveNodePosition(sourceNodeId);
      const targetPosition = resolveNodePosition(targetNodeId);
      const sourceSize =
        sourceNode && isContainerNode(sourceNode)
          ? containerSizeMap[sourceNodeId] || { width: DEFAULT_CONTAINER_WIDTH, height: DEFAULT_CONTAINER_HEIGHT }
          : { width: COMPONENT_WIDTH, height: COMPONENT_HEIGHT };
      const targetSize =
        targetNode && isContainerNode(targetNode)
          ? containerSizeMap[targetNodeId] || { width: DEFAULT_CONTAINER_WIDTH, height: DEFAULT_CONTAINER_HEIGHT }
          : { width: COMPONENT_WIDTH, height: COMPONENT_HEIGHT };

      let bestPair:
        | {
            sourceHandleId: string;
            targetHandleId: string;
            distanceSquared: number;
          }
        | null = null;

      for (const sourceHandleId of OUT_HANDLE_IDS) {
        const sourceHandle = HANDLE_POINT_BY_ID.get(sourceHandleId);
        if (!sourceHandle) {
          continue;
        }

        const sourcePoint = {
          x: sourcePosition.x + sourceSize.width * sourceHandle.xRatio,
          y: sourcePosition.y + sourceSize.height * sourceHandle.yRatio,
        };

        for (const targetHandleId of IN_HANDLE_IDS) {
          const targetHandle = HANDLE_POINT_BY_ID.get(targetHandleId);
          if (!targetHandle) {
            continue;
          }

          const targetPoint = {
            x: targetPosition.x + targetSize.width * targetHandle.xRatio,
            y: targetPosition.y + targetSize.height * targetHandle.yRatio,
          };
          const dx = sourcePoint.x - targetPoint.x;
          const dy = sourcePoint.y - targetPoint.y;
          const distanceSquared = dx * dx + dy * dy;

          if (!bestPair || distanceSquared < bestPair.distanceSquared) {
            bestPair = {
              sourceHandleId,
              targetHandleId,
              distanceSquared,
            };
          }
        }
      }

      if (!bestPair) {
        return {
          sourceHandleId: DEFAULT_SOURCE_HANDLE_ID,
          targetHandleId: DEFAULT_TARGET_HANDLE_ID,
        };
      }

      return {
        sourceHandleId: bestPair.sourceHandleId,
        targetHandleId: bestPair.targetHandleId,
      };
    },
    [containerSizeMap, isContainerNode, modelNodes, nodeById, nodePositionMap]
  );

  useEffect(() => {
    setDataTransferDrafts((current) => {
      const validIds = new Set(dataObjects.map((item) => item.id));
      const next = Object.fromEntries(
        Object.entries(current).filter(([dataObjectId]) => validIds.has(dataObjectId))
      ) as Record<string, DataTransferDraft>;
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [dataObjects]);

  const registerHistoryAction = useCallback((action: HistoryAction) => {
    setUndoStack((prev) => [...prev, action]);
    setRedoStack([]);
  }, []);

  const applyNodeUpdate = useCallback(
    async (
      nodeId: string,
      payload: {
        name?: string | null;
        description?: string | null;
        notes?: string | null;
        parentNodeId?: string | null;
      }
    ) => {
      const response = await fetch(`/api/projects/${projectId}/nodes/${nodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Node update failed');
      }
    },
    [projectId]
  );

  const applyEdgeUpdate = useCallback(
    async (
      edgeId: string,
      payload: {
        name?: string | null;
        direction?: EdgeDirection;
        protocol?: string | null;
        description?: string | null;
        notes?: string | null;
        sourceHandleId?: string | null;
        targetHandleId?: string | null;
      }
    ) => {
      const response = await fetch(`/api/projects/${projectId}/edges/${edgeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Edge update failed');
      }
    },
    [projectId]
  );

  const applyDataObjectUpdate = useCallback(
    async (
      dataObjectId: string,
      payload: {
        name?: string;
        dataClass?: DataClass;
        description?: string | null;
        confidentiality?: number;
        integrity?: number;
        availability?: number;
      }
    ) => {
      const response = await fetch(`/api/projects/${projectId}/data-objects/${dataObjectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Data object update failed');
      }
    },
    [projectId]
  );

  const buildUniqueDataObjectName = useCallback(
    (baseName: string) => {
      const normalizedBaseName = baseName.trim();
      if (!normalizedBaseName) {
        return 'Data object';
      }

      const existingNames = new Set(dataObjects.map((item) => item.name.trim().toLowerCase()));
      if (!existingNames.has(normalizedBaseName.toLowerCase())) {
        return normalizedBaseName;
      }

      let suffix = 2;
      let candidate = `${normalizedBaseName} (${suffix})`;
      while (existingNames.has(candidate.toLowerCase())) {
        suffix += 1;
        candidate = `${normalizedBaseName} (${suffix})`;
      }
      return candidate;
    },
    [dataObjects]
  );

  const fetchModelData = useCallback(async () => {
    try {
      if (!hasLoadedOnce) {
        setIsLoading(true);
      }
      setError('');
      setWarning('');

      const [nodesRes, edgesRes, dataObjectsRes, componentDataRes, edgeDataFlowsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/nodes`),
        fetch(`/api/projects/${projectId}/edges`),
        fetch(`/api/projects/${projectId}/data-objects`),
        fetch(`/api/projects/${projectId}/component-data`),
        fetch(`/api/projects/${projectId}/edge-data-flows`),
      ]);

      if (!nodesRes.ok || !edgesRes.ok) {
        throw new Error('Model data could not be loaded');
      }

      const nextNodes = (await nodesRes.json()) as ApiNode[];
      const nextEdges = (await edgesRes.json()) as ApiEdge[];
      const nextDataObjects = dataObjectsRes.ok ? ((await dataObjectsRes.json()) as ApiDataObject[]) : [];
      const nextComponentData = componentDataRes.ok ? ((await componentDataRes.json()) as ApiComponentData[]) : [];
      const nextEdgeDataFlows = edgeDataFlowsRes.ok
        ? ((await edgeDataFlowsRes.json()) as ApiEdgeDataFlow[])
        : [];

      if (!dataObjectsRes.ok || !componentDataRes.ok || !edgeDataFlowsRes.ok) {
        setWarning('Core model loaded, but data object details are partially unavailable for this user.');
      }

      setModelNodes(nextNodes);
      setModelEdges(nextEdges);
      setDataObjects(nextDataObjects);
      setComponentData(nextComponentData);
      setEdgeDataFlows(nextEdgeDataFlows);
    } catch (fetchError) {
      setError((fetchError as Error).message);
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  }, [hasLoadedOnce, projectId]);

  useEffect(() => {
    void fetchModelData();
  }, [fetchModelData]);

  useEffect(() => {
    setHasLoadedOnce(false);
    setIsLoading(true);
  }, [projectId]);

  const fetchSavepoints = useCallback(async () => {
    try {
      setIsSavepointsLoading(true);
      setSavepointError('');
      const response = await fetch(`/api/projects/${projectId}/savepoints`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Savepoints could not be loaded');
      }
      const data = (await response.json()) as ApiModelSnapshotSummary[];
      setSavepoints(data);
    } catch (fetchError) {
      setSavepointError((fetchError as Error).message);
    } finally {
      setIsSavepointsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchSavepoints();
  }, [fetchSavepoints]);

  useEffect(() => {
    setPositionsReady(false);

    try {
      const raw = window.localStorage.getItem(`${NODE_POSITION_STORAGE_PREFIX}${projectId}`);
      if (!raw) {
        setNodePositionMap({});
        return;
      }

      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const sanitized: NodePositionMap = {};
      Object.entries(parsed).forEach(([nodeId, value]) => {
        if (typeof value !== 'object' || value === null) {
          return;
        }

        const position = value as { x?: unknown; y?: unknown };
        if (typeof position.x === 'number' && Number.isFinite(position.x) && typeof position.y === 'number' && Number.isFinite(position.y)) {
          sanitized[nodeId] = { x: position.x, y: position.y };
        }
      });
      setNodePositionMap(sanitized);
    } catch {
      setNodePositionMap({});
    } finally {
      setPositionsReady(true);
    }
  }, [projectId]);

  useEffect(() => {
    if (!positionsReady) {
      return;
    }

    try {
      window.localStorage.setItem(`${NODE_POSITION_STORAGE_PREFIX}${projectId}`, JSON.stringify(nodePositionMap));
    } catch {
      // Ignore persistence errors (e.g., storage limits/private mode).
    }
  }, [nodePositionMap, positionsReady, projectId]);

  useEffect(() => {
    setContainerSizesReady(false);

    try {
      const raw = window.localStorage.getItem(`${CONTAINER_SIZE_STORAGE_PREFIX}${projectId}`);
      if (!raw) {
        setContainerSizeMap({});
        return;
      }

      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const sanitized: ContainerSizeMap = {};
      Object.entries(parsed).forEach(([nodeId, value]) => {
        if (typeof value !== 'object' || value === null) {
          return;
        }

        const size = value as { width?: unknown; height?: unknown };
        if (
          typeof size.width === 'number' &&
          Number.isFinite(size.width) &&
          size.width > 0 &&
          typeof size.height === 'number' &&
          Number.isFinite(size.height) &&
          size.height > 0
        ) {
          sanitized[nodeId] = {
            width: size.width,
            height: size.height,
          };
        }
      });
      setContainerSizeMap(sanitized);
    } catch {
      setContainerSizeMap({});
    } finally {
      setContainerSizesReady(true);
    }
  }, [projectId]);

  useEffect(() => {
    if (!containerSizesReady) {
      return;
    }

    try {
      window.localStorage.setItem(`${CONTAINER_SIZE_STORAGE_PREFIX}${projectId}`, JSON.stringify(containerSizeMap));
    } catch {
      // Ignore persistence errors (e.g., storage limits/private mode).
    }
  }, [containerSizeMap, containerSizesReady, projectId]);

  useEffect(() => {
    if (!activeResize) {
      return;
    }

    const onMouseMove = (event: MouseEvent) => {
      const width = Math.max(
        MIN_CONTAINER_DIMENSION,
        Math.round(activeResize.startWidth + (event.clientX - activeResize.startClientX))
      );
      const height = Math.max(
        MIN_CONTAINER_DIMENSION,
        Math.round(activeResize.startHeight + (event.clientY - activeResize.startClientY))
      );

      setContainerSizeMap((current) => {
        const previous = current[activeResize.nodeId];
        if (previous && previous.width === width && previous.height === height) {
          return current;
        }
        return {
          ...current,
          [activeResize.nodeId]: { width, height },
        };
      });
    };

    const onMouseUp = () => {
      setActiveResize(null);
    };

    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [activeResize]);

  const startContainerResize = useCallback(
    (
      event: React.MouseEvent<HTMLButtonElement>,
      containerId: string,
      currentSize: NodeSize
    ) => {
      if (!canEdit) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setSelectedNodeId(containerId);
      setSelectedEdgeId(null);
      setSelectedDataObjectId(null);
      setActiveResize({
        nodeId: containerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startWidth: currentSize.width,
        startHeight: currentSize.height,
      });
    },
    [canEdit]
  );

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0 || isHistoryBusy) {
      return;
    }

    const action = undoStack[undoStack.length - 1];

    try {
      setIsHistoryBusy(true);
      setError('');
      await action.undo();
      setUndoStack((prev) => prev.slice(0, -1));
      setRedoStack((prev) => [...prev, action]);
      await fetchModelData();
    } catch (undoError) {
      setError((undoError as Error).message);
    } finally {
      setIsHistoryBusy(false);
    }
  }, [fetchModelData, isHistoryBusy, undoStack]);

  const handleRedo = useCallback(async () => {
    if (redoStack.length === 0 || isHistoryBusy) {
      return;
    }

    const action = redoStack[redoStack.length - 1];

    try {
      setIsHistoryBusy(true);
      setError('');
      await action.redo();
      setRedoStack((prev) => prev.slice(0, -1));
      setUndoStack((prev) => [...prev, action]);
      await fetchModelData();
    } catch (redoError) {
      setError((redoError as Error).message);
    } finally {
      setIsHistoryBusy(false);
    }
  }, [fetchModelData, isHistoryBusy, redoStack]);

  const startInlineNodeRename = useCallback(
    (nodeId: string, currentName: string) => {
      if (!canEdit) {
        return;
      }
      setEditingNodeId(nodeId);
      setEditingEdgeId(null);
      setInlineNodeName(currentName);
      setSelectedNodeId(nodeId);
      setSelectedEdgeId(null);
      setSelectedDataObjectId(null);
    },
    [canEdit]
  );

  const cancelInlineNodeRename = useCallback(() => {
    setEditingNodeId(null);
    setInlineNodeName('');
  }, []);

  const commitInlineNodeRename = useCallback(async (): Promise<boolean> => {
    if (!canEdit || !editingNodeId) {
      return false;
    }

    const currentNode = modelNodes.find((node) => node.id === editingNodeId);
    if (!currentNode) {
      cancelInlineNodeRename();
      return false;
    }

    const nextName = inlineNodeName.trim();
    if (!nextName) {
      setError('Node name is required');
      return false;
    }

    if (nextName === currentNode.name) {
      cancelInlineNodeRename();
      return false;
    }

    try {
      setError('');
      await applyNodeUpdate(currentNode.id, { name: nextName });
      registerHistoryAction({
        label: `Rename node "${currentNode.name}"`,
        undo: async () => applyNodeUpdate(currentNode.id, { name: currentNode.name }),
        redo: async () => applyNodeUpdate(currentNode.id, { name: nextName }),
      });
      cancelInlineNodeRename();
      await fetchModelData();
      setSelectedNodeId(currentNode.id);
      setSelectedEdgeId(null);
      setSelectedDataObjectId(null);
      return true;
    } catch (renameError) {
      setError((renameError as Error).message);
      return false;
    }
  }, [
    applyNodeUpdate,
    canEdit,
    cancelInlineNodeRename,
    editingNodeId,
    fetchModelData,
    inlineNodeName,
    modelNodes,
    registerHistoryAction,
  ]);

  const startInlineEdgeRename = useCallback(
    (edgeId: string, currentName: string | null) => {
      if (!canEdit) {
        return;
      }
      setEditingEdgeId(edgeId);
      setEditingNodeId(null);
      setInlineEdgeName(currentName || '');
      setSelectedEdgeId(edgeId);
      setSelectedNodeId(null);
      setSelectedDataObjectId(null);
    },
    [canEdit]
  );

  const cancelInlineEdgeRename = useCallback(() => {
    setEditingEdgeId(null);
    setInlineEdgeName('');
  }, []);

  const commitInlineEdgeRename = useCallback(async (): Promise<boolean> => {
    if (!canEdit || !editingEdgeId) {
      return false;
    }

    const currentEdge = modelEdges.find((edge) => edge.id === editingEdgeId);
    if (!currentEdge) {
      cancelInlineEdgeRename();
      return false;
    }

    const nextName = inlineEdgeName.trim() || null;
    const previousName = currentEdge.name || null;
    if (nextName === previousName) {
      cancelInlineEdgeRename();
      return false;
    }

    try {
      setError('');
      await applyEdgeUpdate(currentEdge.id, { name: nextName });
      registerHistoryAction({
        label: 'Rename interface',
        undo: async () => applyEdgeUpdate(currentEdge.id, { name: previousName }),
        redo: async () => applyEdgeUpdate(currentEdge.id, { name: nextName }),
      });
      cancelInlineEdgeRename();
      await fetchModelData();
      setSelectedEdgeId(currentEdge.id);
      setSelectedNodeId(null);
      setSelectedDataObjectId(null);
      return true;
    } catch (renameError) {
      setError((renameError as Error).message);
      return false;
    }
  }, [
    applyEdgeUpdate,
    canEdit,
    cancelInlineEdgeRename,
    editingEdgeId,
    fetchModelData,
    inlineEdgeName,
    modelEdges,
    registerHistoryAction,
  ]);

  const startInlineDataObjectRename = useCallback(
    (dataObjectId: string, currentName: string) => {
      if (!canEdit) {
        return;
      }
      setEditingDataObjectId(dataObjectId);
      setInlineDataObjectName(currentName);
      setSelectedDataObjectId(dataObjectId);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    },
    [canEdit]
  );

  const cancelInlineDataObjectRename = useCallback(() => {
    setEditingDataObjectId(null);
    setInlineDataObjectName('');
  }, []);

  const commitInlineDataObjectRename = useCallback(async (): Promise<boolean> => {
    if (!canEdit || !editingDataObjectId) {
      return false;
    }

    const currentDataObject = dataObjects.find((item) => item.id === editingDataObjectId);
    if (!currentDataObject) {
      cancelInlineDataObjectRename();
      return false;
    }

    const nextName = inlineDataObjectName.trim();
    if (!nextName) {
      setError('Data object name is required');
      return false;
    }

    if (nextName === currentDataObject.name) {
      cancelInlineDataObjectRename();
      return false;
    }

    try {
      setError('');
      await applyDataObjectUpdate(currentDataObject.id, { name: nextName });
      registerHistoryAction({
        label: `Rename data object "${currentDataObject.name}"`,
        undo: async () => applyDataObjectUpdate(currentDataObject.id, { name: currentDataObject.name }),
        redo: async () => applyDataObjectUpdate(currentDataObject.id, { name: nextName }),
      });
      cancelInlineDataObjectRename();
      await fetchModelData();
      setSelectedDataObjectId(currentDataObject.id);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      return true;
    } catch (renameError) {
      setError((renameError as Error).message);
      return false;
    }
  }, [
    applyDataObjectUpdate,
    canEdit,
    cancelInlineDataObjectRename,
    dataObjects,
    editingDataObjectId,
    fetchModelData,
    inlineDataObjectName,
    registerHistoryAction,
  ]);

  useEffect(() => {
    if (!positionsReady || !containerSizesReady) {
      return;
    }

    const visibleNodes = modelNodes.filter((node) => !(isContainerNode(node) && node.id === globalContainerId));
    const visibleNodeById = new Map(visibleNodes.map((node) => [node.id, node]));
    const visibleEdges = modelEdges.filter(
      (edge) => visibleNodeById.has(edge.sourceNodeId) && visibleNodeById.has(edge.targetNodeId)
    );

    const hasRenderableContainerParent = (node: ApiNode) => {
      if (!node.parentNodeId) {
        return false;
      }
      const parentNode = visibleNodeById.get(node.parentNodeId);
      return Boolean(parentNode && isContainerNode(parentNode));
    };

    const childrenByParentId = new Map<string, ApiNode[]>();
    visibleNodes.forEach((node) => {
      if (!hasRenderableContainerParent(node) || !node.parentNodeId) {
        return;
      }
      const children = childrenByParentId.get(node.parentNodeId) || [];
      children.push(node);
      childrenByParentId.set(node.parentNodeId, children);
    });
    childrenByParentId.forEach((children) => children.sort((a, b) => a.name.localeCompare(b.name)));

    const nextPositionMap: NodePositionMap = {};
    visibleNodes.forEach((node) => {
      const existing = nodePositionMap[node.id];
      if (existing) {
        nextPositionMap[node.id] = { x: existing.x, y: existing.y };
      }
    });

    const nextContainerSizeMap: ContainerSizeMap = {};
    visibleNodes.forEach((node) => {
      if (!isContainerNode(node)) {
        return;
      }

      const existingSize = containerSizeMap[node.id];
      nextContainerSizeMap[node.id] = existingSize
        ? {
            width: existingSize.width > 0 ? existingSize.width : DEFAULT_CONTAINER_WIDTH,
            height: existingSize.height > 0 ? existingSize.height : DEFAULT_CONTAINER_HEIGHT,
          }
        : { width: DEFAULT_CONTAINER_WIDTH, height: DEFAULT_CONTAINER_HEIGHT };
    });

    const nextRootPosition = (index: number): NodePosition => ({
      x: ROOT_GRID_X + (index % ROOT_GRID_COLS) * ROOT_GRID_X_STEP,
      y: ROOT_GRID_Y + Math.floor(index / ROOT_GRID_COLS) * ROOT_GRID_Y_STEP,
    });

    const rootNodes = visibleNodes
      .filter((node) => !hasRenderableContainerParent(node))
      .sort(sortByNameWithGlobalFirst);

    let nextRootIndex = 0;
    rootNodes.forEach((node) => {
      if (nextPositionMap[node.id]) {
        return;
      }
      nextPositionMap[node.id] = nextRootPosition(nextRootIndex);
      nextRootIndex += 1;
    });

    childrenByParentId.forEach((children, parentId) => {
      const parentPosition = nextPositionMap[parentId];
      if (!parentPosition) {
        return;
      }

      let localIndex = 0;
      children.forEach((child) => {
        if (nextPositionMap[child.id]) {
          return;
        }

        nextPositionMap[child.id] = {
          x: parentPosition.x + 30 + (localIndex % 3) * 240,
          y: parentPosition.y + 70 + Math.floor(localIndex / 3) * 140,
        };
        localIndex += 1;
      });
    });

    const rfNodes: GraphNode[] = visibleNodes.map((node) => {
      const isSelected = selectedNodeIdSet.has(node.id) || node.id === selectedNodeId;
      const isContainer = isContainerNode(node);
      const childCount = (childrenByParentId.get(node.id) || []).length;
      const nodePosition = nextPositionMap[node.id] || { x: ROOT_GRID_X, y: ROOT_GRID_Y };
      const containerSize = isContainer
        ? nextContainerSizeMap[node.id] || { width: DEFAULT_CONTAINER_WIDTH, height: DEFAULT_CONTAINER_HEIGHT }
        : null;

      return {
        id: node.id,
        type: 'eightHandleNode',
        data: {
          label: (
            <div
              className={`relative flex h-full flex-col items-center ${
                isContainer ? 'justify-start pt-1' : 'justify-center'
              } gap-0.5 px-2 pb-5 text-center`}
            >
              {canEdit && editingNodeId === node.id ? (
                <input
                  autoFocus
                  type="text"
                  value={inlineNodeName}
                  onChange={(event) => setInlineNodeName(event.target.value)}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                  onBlur={() => {
                    void commitInlineNodeRename();
                  }}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      cancelInlineNodeRename();
                    }
                  }}
                  className="nodrag nopan w-full rounded border border-amber-300 bg-slate-900/95 px-1.5 py-0.5 text-center text-sm font-semibold text-white outline-none focus:border-amber-400"
                />
              ) : (
                <p className="text-sm font-semibold text-white">{node.name}</p>
              )}
              <p className="text-[10px] uppercase tracking-wide text-slate-300">
                {isContainer ? 'Container' : 'Component'}
                {isContainer && childCount > 0 ? ` / ${childCount} assigned` : ''}
              </p>
              {!isContainer && node.description ? (
                <p className="line-clamp-2 text-[11px] text-slate-300">{node.description}</p>
              ) : null}
              {canEdit && node.id !== globalContainerId ? (
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDeleteNodeById(node.id);
                  }}
                  className="nodrag nopan absolute bottom-0.5 left-0.5 flex h-4 w-4 items-center justify-center rounded-sm border border-red-200/60 bg-red-500/90 text-[10px] font-bold text-white hover:bg-red-400"
                  title={`Delete ${node.name}`}
                  aria-label={`Delete ${node.name}`}
                >
                  x
                </button>
              ) : null}
              {isContainer && canEdit && containerSize ? (
                <button
                  type="button"
                  onMouseDown={(event) => startContainerResize(event, node.id, containerSize)}
                  className="nodrag nopan absolute bottom-0.5 right-0.5 flex h-4 w-4 cursor-nwse-resize items-center justify-center rounded-sm border border-cyan-200/70 bg-cyan-400/85 hover:bg-cyan-300"
                  title="Drag to resize"
                  aria-label={`Resize container ${node.name}`}
                >
                  <svg viewBox="0 0 16 16" className="h-3 w-3 text-slate-900" aria-hidden="true">
                    <path d="M4.5 11.5L11.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M8.25 11.5H11.5V8.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : null}
            </div>
          ),
        },
        position: nodePosition,
        style: {
          borderRadius: isContainer ? 14 : 12,
          border: `2px solid ${isSelected ? '#f59e0b' : isContainer ? '#22d3ee' : '#475569'}`,
          background: isContainer
            ? 'linear-gradient(180deg, rgba(30,41,59,0.72) 0%, rgba(15,23,42,0.55) 100%)'
            : '#1e293b',
          minWidth: isContainer ? containerSize?.width : COMPONENT_WIDTH,
          width: isContainer ? containerSize?.width : COMPONENT_WIDTH,
          minHeight: isContainer ? containerSize?.height : COMPONENT_HEIGHT,
          height: isContainer ? containerSize?.height : COMPONENT_HEIGHT,
          paddingTop: isContainer ? 4 : undefined,
          boxShadow: isContainer ? 'inset 0 0 0 1px rgba(34,211,238,0.25)' : undefined,
          zIndex: isContainer ? 0 : 10,
        },
      };
    });

    const rfEdges: GraphEdge[] = visibleEdges.map((edge) => {
      const isSelected = selectedEdgeIdSet.has(edge.id) || edge.id === selectedEdgeId;
      const nearestHandles = resolveNearestDirectionalHandles(edge.sourceNodeId, edge.targetNodeId);
      const sourceHandle = isOutHandleId(edge.sourceHandleId) ? edge.sourceHandleId : nearestHandles.sourceHandleId;
      const targetHandle = isInHandleId(edge.targetHandleId) ? edge.targetHandleId : nearestHandles.targetHandleId;
      return {
        id: edge.id,
        source: edge.sourceNodeId,
        target: edge.targetNodeId,
        sourceHandle,
        targetHandle,
        label:
          canEdit && editingEdgeId === edge.id ? (
            <input
              autoFocus
              type="text"
              value={inlineEdgeName}
              onChange={(event) => setInlineEdgeName(event.target.value)}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onBlur={() => {
                void commitInlineEdgeRename();
              }}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelInlineEdgeRename();
                }
              }}
              className="nodrag nopan w-40 rounded border border-amber-300 bg-slate-900/95 px-1.5 py-0.5 text-xs font-semibold text-white outline-none focus:border-amber-400"
              placeholder="Interface"
            />
          ) : (
            <div className="nodrag nopan flex items-center gap-1 rounded border border-slate-600/70 bg-slate-900/90 px-1 py-0.5">
              <span className="text-[11px] font-semibold text-slate-100">
                {`${edge.name || edge.protocol || 'Interface'} (${DIRECTION_LABEL[edge.direction]})`}
              </span>
              {canEdit ? (
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDeleteEdgeById(edge.id);
                  }}
                  className="nodrag nopan flex h-4 w-4 items-center justify-center rounded-full border border-red-200/70 bg-red-500/90 text-[10px] font-bold text-white hover:bg-red-400"
                  title="Delete interface"
                  aria-label="Delete interface"
                >
                  x
                </button>
              ) : null}
            </div>
          ),
        labelStyle: {
          pointerEvents: 'all',
        },
        style: {
          stroke: isSelected ? '#f59e0b' : '#cbd5e1',
          strokeWidth: isSelected ? 2.5 : 2,
        },
        markerEnd:
          edge.direction === 'A_TO_B' || edge.direction === 'BIDIRECTIONAL'
            ? { type: MarkerType.ArrowClosed }
            : undefined,
        markerStart:
          edge.direction === 'B_TO_A' || edge.direction === 'BIDIRECTIONAL'
            ? { type: MarkerType.ArrowClosed }
            : undefined,
      };
    });

    setNodes(rfNodes);
    setEdges(rfEdges);

    const isPositionMapChanged = (() => {
      const nextIds = Object.keys(nextPositionMap);
      const currentIds = Object.keys(nodePositionMap);
      if (nextIds.length !== currentIds.length) {
        return true;
      }
      return nextIds.some((nodeId) => {
        const nextPosition = nextPositionMap[nodeId];
        const currentPosition = nodePositionMap[nodeId];
        return !currentPosition || currentPosition.x !== nextPosition.x || currentPosition.y !== nextPosition.y;
      });
    })();
    if (isPositionMapChanged) {
      setNodePositionMap(nextPositionMap);
    }

    const isContainerSizeMapChanged = (() => {
      const nextIds = Object.keys(nextContainerSizeMap);
      const currentIds = Object.keys(containerSizeMap);
      if (nextIds.length !== currentIds.length) {
        return true;
      }
      return nextIds.some((nodeId) => {
        const nextSize = nextContainerSizeMap[nodeId];
        const currentSize = containerSizeMap[nodeId];
        return !currentSize || currentSize.width !== nextSize.width || currentSize.height !== nextSize.height;
      });
    })();
    if (isContainerSizeMapChanged) {
      setContainerSizeMap(nextContainerSizeMap);
    }
  }, [
    canEdit,
    cancelInlineEdgeRename,
    cancelInlineNodeRename,
    commitInlineEdgeRename,
    commitInlineNodeRename,
    containerSizeMap,
    containerSizesReady,
    editingEdgeId,
    editingNodeId,
    globalContainerId,
    hoveredEdgeId,
    inlineEdgeName,
    inlineNodeName,
    isContainerNode,
    modelEdges,
    modelNodes,
    nodePositionMap,
    positionsReady,
    resolveNearestDirectionalHandles,
    selectedEdgeId,
    selectedEdgeIdSet,
    selectedNodeId,
    selectedNodeIdSet,
    setEdges,
    setNodes,
    startContainerResize,
  ]);

  useEffect(() => {
    if (!selectedNode) return;
    setEditNodeName(selectedNode.name);
    setEditNodeDescription(selectedNode.description || '');
    setEditNodeNotes(selectedNode.notes || '');
    if (isContainerNode(selectedNode)) {
      setEditNodeParentId(selectedNode.parentNodeId || '');
    } else if (!selectedNode.parentNodeId || selectedNode.parentNodeId === globalContainerId) {
      setEditNodeParentId(GLOBAL_PARENT_SENTINEL);
    } else {
      setEditNodeParentId(selectedNode.parentNodeId);
    }
  }, [globalContainerId, isContainerNode, selectedNode]);

  useEffect(() => {
    if (!selectedEdge) return;
    setEditEdgeName(selectedEdge.name || '');
    setEditEdgeDirection(selectedEdge.direction);
    setEditEdgeProtocol(selectedEdge.protocol || '');
    setEditEdgeDescription(selectedEdge.description || '');
    setEditEdgeNotes(selectedEdge.notes || '');
  }, [selectedEdge]);

  useEffect(() => {
    if (!selectedDataObject) return;
    setEditDataObjectName(selectedDataObject.name);
    setEditDataObjectClass(selectedDataObject.dataClass);
    setEditDataObjectDescription(selectedDataObject.description || '');
  }, [selectedDataObject]);

  useEffect(() => {
    if (!selectedNode || isContainerNode(selectedNode)) {
      return;
    }
    setDataSidebarComponentId(selectedNode.id);
  }, [isContainerNode, selectedNode]);

  useEffect(() => {
    if (!['Receives', 'SendsTo', 'FetchesFrom'].includes(dataSidebarRole)) {
      setDataSidebarFromComponentId('');
    }
  }, [dataSidebarRole]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        void handleUndo();
      }

      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        void handleRedo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleRedo, handleUndo]);

  const createNode = async (payload: {
    name: string;
    category: NodeCategory;
    description?: string;
    parentNodeId?: string | null;
  }) => {
    if (!canEdit) {
      return;
    }

    if (!payload.name.trim()) {
      setError('Node name is required');
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      const createPayload = {
        name: payload.name.trim(),
        category: payload.category,
        description: payload.description?.trim() || undefined,
        parentNodeId: payload.parentNodeId ?? null,
      };
      const response = await fetch(`/api/projects/${projectId}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Node could not be created');
      }

      const createdNode = (await response.json()) as ApiNode;
      let currentNodeId = createdNode.id;

      registerHistoryAction({
        label: `Create node "${createPayload.name}"`,
        undo: async () => {
          await fetch(`/api/projects/${projectId}/nodes/${currentNodeId}`, {
            method: 'DELETE',
          });
        },
        redo: async () => {
          const redoResponse = await fetch(`/api/projects/${projectId}/nodes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(createPayload),
          });
          if (!redoResponse.ok) {
            const body = (await redoResponse.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error || 'Redo for node creation failed');
          }
          const redoNode = (await redoResponse.json()) as ApiNode;
          currentNodeId = redoNode.id;
        },
      });

      setSelectedNodeId(currentNodeId);
      setSelectedEdgeId(null);
      setSelectedDataObjectId(null);
      await fetchModelData();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddContainer = async () => {
    await createNode({
      name: newContainerName,
      category: 'Container',
      parentNodeId: null,
    });
    setNewContainerName('');
  };

  const handleAddComponent = async () => {
    await createNode({
      name: newComponentName,
      category: 'Component',
      description: newComponentDescription,
      parentNodeId: null,
    });
    setNewComponentName('');
    setNewComponentDescription('');
  };

  const handleAddDataObject = async () => {
    if (!canEdit) {
      return;
    }

    const normalizedDataObjectName =
      typeof newDataObjectName === 'string' ? newDataObjectName.trim() : '';

    if (!normalizedDataObjectName) {
      setError('Data object name is required');
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      const createPayload = {
        name: normalizedDataObjectName,
        dataClass: newDataObjectClass,
        description: newDataObjectDescription.trim() || undefined,
      };
      const response = await fetch(`/api/projects/${projectId}/data-objects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Data object could not be created');
      }

      const created = (await response.json()) as ApiDataObject;
      let currentDataObjectId = created.id;

      registerHistoryAction({
        label: `Create data object "${createPayload.name}"`,
        undo: async () => {
          await fetch(`/api/projects/${projectId}/data-objects/${currentDataObjectId}`, {
            method: 'DELETE',
          });
        },
        redo: async () => {
          const redoResponse = await fetch(`/api/projects/${projectId}/data-objects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(createPayload),
          });
          if (!redoResponse.ok) {
            const body = (await redoResponse.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error || 'Redo for data object creation failed');
          }
          const redoDataObject = (await redoResponse.json()) as ApiDataObject;
          currentDataObjectId = redoDataObject.id;
        },
      });

      setNewDataObjectName('');
      setNewDataObjectClass('Other');
      setNewDataObjectDescription('');
      setSelectedDataObjectId(currentDataObjectId);
      setDataSidebarObjectId(currentDataObjectId);
      await fetchModelData();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateSavepoint = async () => {
    if (!canEdit) {
      return;
    }

    const normalizedTitle = savepointTitle.trim();
    if (!normalizedTitle) {
      setSavepointError('Snapshot title is required');
      return;
    }

    try {
      setIsCreatingSavepoint(true);
      setSavepointError('');
      const snapshot = {
        version: 1,
        capturedAt: new Date().toISOString(),
        nodes: modelNodes,
        edges: modelEdges,
        dataObjects,
        componentData,
        edgeDataFlows,
        nodePositions: nodePositionMap,
        containerSizes: containerSizeMap,
      };

      const response = await fetch(`/api/projects/${projectId}/savepoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: normalizedTitle,
          snapshot,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Savepoint could not be created');
      }

      const created = (await response.json()) as ApiModelSnapshotSummary;
      setSavepoints((current) => [created, ...current]);
      setSavepointTitle('');
    } catch (saveError) {
      setSavepointError((saveError as Error).message);
    } finally {
      setIsCreatingSavepoint(false);
    }
  };

  const handleRestoreSavepoint = async (savepoint: ApiModelSnapshotSummary) => {
    if (!canEdit || restoringSavepointId || deletingSavepointId) {
      return;
    }

    const confirmed = window.confirm(
      `Restore snapshot "${savepoint.title}"?\n\nThis will replace the current canonical model in this project.`
    );
    if (!confirmed) {
      return;
    }

    try {
      setRestoringSavepointId(savepoint.id);
      setSavepointError('');

      const response = await fetch(`/api/projects/${projectId}/savepoints/${savepoint.id}/restore`, {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => ({}))) as ApiModelSnapshotRestoreResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Snapshot could not be restored');
      }

      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setSelectedDataObjectId(null);
      setSelectedNodeIds([]);
      setSelectedEdgeIds([]);
      setNodePositionMap(payload.state?.nodePositions || {});
      setContainerSizeMap(payload.state?.containerSizes || {});

      await fetchModelData();
      setWarning(payload.warning || '');
    } catch (restoreError) {
      setSavepointError((restoreError as Error).message);
    } finally {
      setRestoringSavepointId(null);
    }
  };

  const handleDeleteSavepoint = async (savepoint: ApiModelSnapshotSummary) => {
    if (!canEdit || restoringSavepointId || deletingSavepointId) {
      return;
    }

    try {
      setDeletingSavepointId(savepoint.id);
      setSavepointError('');

      const response = await fetch(`/api/projects/${projectId}/savepoints/${savepoint.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Snapshot could not be deleted');
      }

      setSavepoints((current) => current.filter((currentSavepoint) => currentSavepoint.id !== savepoint.id));
    } catch (deleteError) {
      setSavepointError((deleteError as Error).message);
    } finally {
      setDeletingSavepointId(null);
    }
  };

  const resolveOrCreateEdgeForFlow = async (
    sourceNodeId: string,
    targetNodeId: string
  ): Promise<{
    edge: ApiEdge;
    flowDirection: 'SourceToTarget' | 'TargetToSource' | 'Bidirectional';
    created: boolean;
  }> => {
    let resolvedEdge =
      modelEdges.find((edge) => edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId) || null;
    let flowDirection: 'SourceToTarget' | 'TargetToSource' | 'Bidirectional' = 'SourceToTarget';
    let created = false;

    if (!resolvedEdge) {
      resolvedEdge =
        modelEdges.find((edge) => edge.sourceNodeId === targetNodeId && edge.targetNodeId === sourceNodeId) || null;
      if (resolvedEdge) {
        flowDirection = 'TargetToSource';
      }
    }

    if (!resolvedEdge) {
      const sourceName = nodeById.get(sourceNodeId)?.name || 'Source';
      const targetName = nodeById.get(targetNodeId)?.name || 'Target';
      const nearestHandles = resolveNearestDirectionalHandles(sourceNodeId, targetNodeId);
      const createEdgeResponse = await fetch(`/api/projects/${projectId}/edges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceNodeId,
          targetNodeId,
          sourceHandleId: nearestHandles.sourceHandleId,
          targetHandleId: nearestHandles.targetHandleId,
          direction: 'A_TO_B',
          name: `${sourceName} --> ${targetName}`,
        }),
      });
      if (!createEdgeResponse.ok) {
        const payload = (await createEdgeResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Interface could not be created');
      }
      resolvedEdge = (await createEdgeResponse.json()) as ApiEdge;
      created = true;
      flowDirection = 'SourceToTarget';
    }

    if (resolvedEdge && (!isOutHandleId(resolvedEdge.sourceHandleId) || !isInHandleId(resolvedEdge.targetHandleId))) {
      const nearestHandles = resolveNearestDirectionalHandles(resolvedEdge.sourceNodeId, resolvedEdge.targetNodeId);
      try {
        await applyEdgeUpdate(resolvedEdge.id, {
          sourceHandleId: nearestHandles.sourceHandleId,
          targetHandleId: nearestHandles.targetHandleId,
        });
        resolvedEdge = {
          ...resolvedEdge,
          sourceHandleId: nearestHandles.sourceHandleId,
          targetHandleId: nearestHandles.targetHandleId,
        };
      } catch {
        resolvedEdge = {
          ...resolvedEdge,
          sourceHandleId: nearestHandles.sourceHandleId,
          targetHandleId: nearestHandles.targetHandleId,
        };
      }
    }

    return { edge: resolvedEdge, flowDirection, created };
  };

  const createDataObject = async (payload: {
    name: string;
    description?: string;
    dataClass?: DataClass;
    confidentiality?: number;
    integrity?: number;
    availability?: number;
  }): Promise<ApiDataObject> => {
    const createDataResponse = await fetch(`/api/projects/${projectId}/data-objects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: payload.name,
        description: payload.description,
        dataClass: payload.dataClass || 'Other',
        confidentiality: payload.confidentiality ?? 5,
        integrity: payload.integrity ?? 5,
        availability: payload.availability ?? 5,
      }),
    });

    if (!createDataResponse.ok) {
      const payloadBody = (await createDataResponse.json().catch(() => ({}))) as { error?: string };
      throw new Error(payloadBody.error || 'Data object could not be created');
    }

    return (await createDataResponse.json()) as ApiDataObject;
  };

  const assignDataFlowToEdge = async (payload: {
    edgeId: string;
    dataObjectId: string;
    direction: 'SourceToTarget' | 'TargetToSource' | 'Bidirectional';
  }) => {
    const assignFlowResponse = await fetch(`/api/projects/${projectId}/edge-data-flows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!assignFlowResponse.ok) {
      const payloadBody = (await assignFlowResponse.json().catch(() => ({}))) as { error?: string };
      throw new Error(payloadBody.error || 'Data flow could not be saved');
    }
  };

  const onConnect = async (connection: Connection) => {
    if (!canEdit || !connection.source || !connection.target) {
      return;
    }

    try {
      setError('');
      setWarning('');
      const existingDirectedEdge = modelEdges.find(
        (edge) => edge.sourceNodeId === connection.source && edge.targetNodeId === connection.target
      );
      if (existingDirectedEdge) {
        setWarning('Interface already exists for this direction.');
        setSelectedEdgeId(existingDirectedEdge.id);
        setSelectedNodeId(null);
        setSelectedDataObjectId(null);
        return;
      }

      const sourceName = nodeById.get(connection.source)?.name || 'Source';
      const targetName = nodeById.get(connection.target)?.name || 'Target';
      const nearestHandles = resolveNearestDirectionalHandles(connection.source, connection.target);
      const sourceHandleId = isOutHandleId(connection.sourceHandle)
        ? connection.sourceHandle
        : nearestHandles.sourceHandleId;
      const targetHandleId = isInHandleId(connection.targetHandle)
        ? connection.targetHandle
        : nearestHandles.targetHandleId;
      const createPayload = {
        sourceNodeId: connection.source,
        targetNodeId: connection.target,
        sourceHandleId,
        targetHandleId,
        direction: 'A_TO_B' as EdgeDirection,
        name: `${sourceName} --> ${targetName}`,
      };
      const response = await fetch(`/api/projects/${projectId}/edges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Edge could not be created');
      }

      const createdEdge = (await response.json()) as ApiEdge;
      let currentEdgeId = createdEdge.id;
      const autoDataObjectName = buildUniqueDataObjectName(`${sourceName} --> ${targetName}`);
      const autoDataObjectDescription = `${sourceName} sends data to ${targetName}.`;
      let currentDataObjectId = '';

      try {
        const createdDataObject = await createDataObject({
          name: autoDataObjectName,
          description: autoDataObjectDescription,
          dataClass: 'Other',
        });
        currentDataObjectId = createdDataObject.id;

        await assignDataFlowToEdge({
          edgeId: currentEdgeId,
          dataObjectId: currentDataObjectId,
          direction: 'SourceToTarget',
        });
      } catch (autoDataError) {
        if (currentDataObjectId) {
          await fetch(`/api/projects/${projectId}/data-objects/${currentDataObjectId}`, { method: 'DELETE' });
        }
        await fetch(`/api/projects/${projectId}/edges/${currentEdgeId}`, { method: 'DELETE' });
        throw autoDataError;
      }

      registerHistoryAction({
        label: 'Create interface',
        undo: async () => {
          await fetch(`/api/projects/${projectId}/edges/${currentEdgeId}`, { method: 'DELETE' });
          await fetch(`/api/projects/${projectId}/data-objects/${currentDataObjectId}`, { method: 'DELETE' });
        },
        redo: async () => {
          const redoResponse = await fetch(`/api/projects/${projectId}/edges`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(createPayload),
          });
          if (!redoResponse.ok) {
            const body = (await redoResponse.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error || 'Redo for edge creation failed');
          }
          const redoEdge = (await redoResponse.json()) as ApiEdge;
          currentEdgeId = redoEdge.id;

          const redoDataObject = await createDataObject({
            name: autoDataObjectName,
            description: autoDataObjectDescription,
            dataClass: 'Other',
          });
          currentDataObjectId = redoDataObject.id;

          await assignDataFlowToEdge({
            edgeId: currentEdgeId,
            dataObjectId: currentDataObjectId,
            direction: 'SourceToTarget',
          });
        },
      });

      await fetchModelData();
      setSelectedDataObjectId(currentDataObjectId);
      setDataSidebarObjectId(currentDataObjectId);
      startInlineEdgeRename(currentEdgeId, createdEdge.name || null);
    } catch (connectError) {
      setError((connectError as Error).message);
    }
  };

  const onNodeDragStop: NodeMouseHandler = (_event, node) => {
    if (!canEdit) {
      return;
    }

    const droppedPosition: NodePosition = { x: node.position.x, y: node.position.y };

    setNodePositionMap((current) => ({
      ...current,
      [node.id]: droppedPosition,
    }));

    const movedNode = modelNodes.find((item) => item.id === node.id);
    if (!movedNode || isContainerNode(movedNode)) {
      return;
    }

    const movedNodeSize: NodeSize = {
      width: typeof node.width === 'number' ? node.width : COMPONENT_WIDTH,
      height: typeof node.height === 'number' ? node.height : COMPONENT_HEIGHT,
    };

    const touchedContainers = userContainers
      .map((container) => {
        const containerPosition = nodePositionMap[container.id] || { x: ROOT_GRID_X, y: ROOT_GRID_Y };
        const containerSize = containerSizeMap[container.id] || {
          width: DEFAULT_CONTAINER_WIDTH,
          height: DEFAULT_CONTAINER_HEIGHT,
        };
        const isTouching = rectsTouchOrOverlap(droppedPosition, movedNodeSize, containerPosition, containerSize);
        if (!isTouching) {
          return null;
        }
        return {
          id: container.id,
          area: overlapArea(droppedPosition, movedNodeSize, containerPosition, containerSize),
        };
      })
      .filter((container): container is { id: string; area: number } => Boolean(container))
      .sort((a, b) => b.area - a.area);

    const resolvedParentNodeId = touchedContainers[0]?.id || null;
    const currentParentNodeId = movedNode.parentNodeId && movedNode.parentNodeId !== globalContainerId ? movedNode.parentNodeId : null;

    if (resolvedParentNodeId === currentParentNodeId) {
      return;
    }

    void (async () => {
      try {
        setError('');
        await applyNodeUpdate(node.id, { parentNodeId: resolvedParentNodeId });
        await fetchModelData();
      } catch (dragError) {
        setError((dragError as Error).message);
      }
    })();
  };

  const onNodeClick: NodeMouseHandler = (event, node) => {
    const isMultiSelectionClick = event.ctrlKey || event.metaKey || event.shiftKey;
    setSelectedNodeId(node.id);
    setSelectedDataObjectId(null);
    if (!isMultiSelectionClick) {
      setSelectedNodeIds([node.id]);
      setSelectedEdgeIds([]);
      setSelectedEdgeId(null);
    }
  };

  const onNodeDoubleClick: NodeMouseHandler = (_event, node) => {
    if (!canEdit) {
      return;
    }
    const modelNode = modelNodes.find((item) => item.id === node.id);
    if (!modelNode) {
      return;
    }
    startInlineNodeRename(modelNode.id, modelNode.name);
  };

  const onEdgeClick: EdgeMouseHandler = (event, edge) => {
    const isMultiSelectionClick = event.ctrlKey || event.metaKey || event.shiftKey;
    setSelectedEdgeId(edge.id);
    setSelectedDataObjectId(null);
    if (!isMultiSelectionClick) {
      setSelectedEdgeIds([edge.id]);
      setSelectedNodeIds([]);
      setSelectedNodeId(null);
    }
  };

  const onEdgeMouseEnter: EdgeMouseHandler = (_event, edge) => {
    setHoveredEdgeId(edge.id);
  };

  const onEdgeMouseLeave: EdgeMouseHandler = (_event, edge) => {
    setHoveredEdgeId((current) => (current === edge.id ? null : current));
  };

  const onSelectionChange = useCallback((selection: { nodes: GraphNode[]; edges: GraphEdge[] }) => {
    const nextNodeIds = selection.nodes.map((node) => node.id);
    const nextEdgeIds = selection.edges.map((edge) => edge.id);

    setSelectedNodeIds(nextNodeIds);
    setSelectedEdgeIds(nextEdgeIds);

    if (nextNodeIds.length > 0 || nextEdgeIds.length > 0) {
      setSelectedDataObjectId(null);
    }

    setSelectedNodeId((current) => {
      if (nextNodeIds.length === 0) return null;
      if (current && nextNodeIds.includes(current)) return current;
      return nextNodeIds[0];
    });

    setSelectedEdgeId((current) => {
      if (nextEdgeIds.length === 0) return null;
      if (current && nextEdgeIds.includes(current)) return current;
      return nextEdgeIds[0];
    });
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setHoveredEdgeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
  }, []);

  const onEdgeDoubleClick: EdgeMouseHandler = (_event, edge) => {
    if (!canEdit) {
      return;
    }
    const modelEdge = modelEdges.find((item) => item.id === edge.id);
    if (!modelEdge) {
      return;
    }
    startInlineEdgeRename(modelEdge.id, modelEdge.name || null);
  };

  const handleSaveNode = async () => {
    if (!canEdit || !selectedNode) return;

    try {
      setIsSaving(true);
      setError('');
      const normalizedEditedParentNodeId = isContainerNode(selectedNode)
        ? editNodeParentId || null
        : editNodeParentId === GLOBAL_PARENT_SENTINEL
          ? null
          : editNodeParentId || null;
      const beforePayload = {
        name: selectedNode.name,
        description: selectedNode.description || null,
        notes: selectedNode.notes || null,
        parentNodeId: selectedNode.parentNodeId || null,
      };
      const afterPayload = {
        name: editNodeName.trim(),
        description: editNodeDescription.trim() || null,
        notes: editNodeNotes.trim() || null,
        parentNodeId: normalizedEditedParentNodeId,
      };

      await applyNodeUpdate(selectedNode.id, afterPayload);

      registerHistoryAction({
        label: `Update node "${afterPayload.name}"`,
        undo: async () => applyNodeUpdate(selectedNode.id, beforePayload),
        redo: async () => applyNodeUpdate(selectedNode.id, afterPayload),
      });

      await fetchModelData();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdge = async () => {
    if (!canEdit || !selectedEdge) return;

    try {
      setIsSaving(true);
      setError('');
      const beforePayload = {
        name: selectedEdge.name || null,
        direction: selectedEdge.direction,
        protocol: selectedEdge.protocol || null,
        description: selectedEdge.description || null,
        notes: selectedEdge.notes || null,
      };
      const afterPayload = {
        name: editEdgeName.trim() || null,
        direction: editEdgeDirection,
        protocol: editEdgeProtocol.trim() || null,
        description: editEdgeDescription.trim() || null,
        notes: editEdgeNotes.trim() || null,
      };

      await applyEdgeUpdate(selectedEdge.id, afterPayload);

      registerHistoryAction({
        label: 'Update interface',
        undo: async () => applyEdgeUpdate(selectedEdge.id, beforePayload),
        redo: async () => applyEdgeUpdate(selectedEdge.id, afterPayload),
      });

      await fetchModelData();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDataObject = async () => {
    if (!canEdit || !selectedDataObject) return;

    try {
      setIsSaving(true);
      setError('');
      const beforePayload = {
        name: selectedDataObject.name,
        dataClass: selectedDataObject.dataClass,
        description: selectedDataObject.description || null,
      };
      const afterPayload = {
        name: editDataObjectName.trim(),
        dataClass: editDataObjectClass,
        description: editDataObjectDescription.trim() || null,
      };

      await applyDataObjectUpdate(selectedDataObject.id, afterPayload);

      registerHistoryAction({
        label: `Update data object "${afterPayload.name}"`,
        undo: async () => applyDataObjectUpdate(selectedDataObject.id, beforePayload),
        redo: async () => applyDataObjectUpdate(selectedDataObject.id, afterPayload),
      });

      await fetchModelData();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNodeById = async (nodeId: string) => {
    if (!canEdit) return;
    const nodeToDelete = modelNodes.find((node) => node.id === nodeId);
    if (!nodeToDelete) return;
    if (nodeToDelete.id === globalContainerId) {
      setError('Global container cannot be deleted');
      return;
    }
    try {
      const response = await fetch(`/api/projects/${projectId}/nodes/${nodeToDelete.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Node could not be deleted');
      }
      if (selectedNodeId === nodeToDelete.id) {
        setSelectedNodeId(null);
      }
      setSelectedNodeIds((current) => current.filter((id) => id !== nodeToDelete.id));
      setSelectedEdgeId(null);
      setSelectedEdgeIds([]);
      await fetchModelData();
    } catch (deleteError) {
      setError((deleteError as Error).message);
    }
  };

  const handleDeleteNode = async () => {
    if (!selectedNode) return;
    await handleDeleteNodeById(selectedNode.id);
  };

  const handleDeleteEdgeById = async (edgeId: string) => {
    if (!canEdit) return;
    const edgeToDelete = modelEdges.find((edge) => edge.id === edgeId);
    if (!edgeToDelete) return;
    try {
      const response = await fetch(`/api/projects/${projectId}/edges/${edgeToDelete.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Edge could not be deleted');
      }
      if (selectedEdgeId === edgeToDelete.id) {
        setSelectedEdgeId(null);
      }
      setSelectedEdgeIds((current) => current.filter((id) => id !== edgeToDelete.id));
      await fetchModelData();
    } catch (deleteError) {
      setError((deleteError as Error).message);
    }
  };

  const handleDeleteEdge = async () => {
    if (!selectedEdge) return;
    await handleDeleteEdgeById(selectedEdge.id);
  };

  const handleDeleteSelectedGraphElements = useCallback(async () => {
    if (!canEdit || isSelectionActionBusy) {
      return;
    }

    const uniqueNodeIds = Array.from(new Set(selectedNodeIds));
    const uniqueEdgeIds = Array.from(new Set(selectedEdgeIds));
    if (uniqueNodeIds.length === 0 && uniqueEdgeIds.length === 0) {
      setError('Select at least one component, container, or interface to delete.');
      return;
    }

    const includesGlobalContainer = Boolean(globalContainerId && uniqueNodeIds.includes(globalContainerId));
    const nodeIdsToDelete = uniqueNodeIds.filter((nodeId) => nodeId !== globalContainerId);
    const nodeDeleteSet = new Set(nodeIdsToDelete);
    const edgeIdsToDelete = uniqueEdgeIds.filter((edgeId) => {
      const edge = modelEdges.find((candidate) => candidate.id === edgeId);
      if (!edge) return false;
      // Edges connected to deleted nodes are removed by cascade automatically.
      return !nodeDeleteSet.has(edge.sourceNodeId) && !nodeDeleteSet.has(edge.targetNodeId);
    });

    if (nodeIdsToDelete.length === 0 && edgeIdsToDelete.length === 0) {
      if (includesGlobalContainer) {
        setError('Global container cannot be deleted.');
      }
      return;
    }

    try {
      setIsSelectionActionBusy(true);
      setError('');

      for (const edgeId of edgeIdsToDelete) {
        const response = await fetch(`/api/projects/${projectId}/edges/${edgeId}`, { method: 'DELETE' });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || 'One or more interfaces could not be deleted');
        }
      }

      for (const nodeId of nodeIdsToDelete) {
        const response = await fetch(`/api/projects/${projectId}/nodes/${nodeId}`, { method: 'DELETE' });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || 'One or more nodes could not be deleted');
        }
      }

      if (includesGlobalContainer) {
        setWarning('Global container was skipped because it cannot be deleted.');
      }

      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setSelectedNodeIds([]);
      setSelectedEdgeIds([]);
      await fetchModelData();
    } catch (deleteError) {
      setError((deleteError as Error).message);
    } finally {
      setIsSelectionActionBusy(false);
    }
  }, [
    canEdit,
    fetchModelData,
    globalContainerId,
    isSelectionActionBusy,
    modelEdges,
    projectId,
    selectedEdgeIds,
    selectedNodeIds,
  ]);

  const handleCopySelectedGraphElements = useCallback(async () => {
    if (!canEdit || isSelectionActionBusy) {
      return;
    }

    const uniqueNodeIds = Array.from(new Set(selectedNodeIds));
    const uniqueEdgeIds = Array.from(new Set(selectedEdgeIds));
    if (uniqueNodeIds.length === 0 && uniqueEdgeIds.length === 0) {
      setError('Select at least one component, container, or interface to copy.');
      return;
    }
    if (uniqueNodeIds.length === 0) {
      setError('To copy interfaces, also select their connected nodes.');
      return;
    }

    const selectedNodes = modelNodes.filter((node) => uniqueNodeIds.includes(node.id));
    if (selectedNodes.length === 0) {
      setError('Selected nodes could not be resolved.');
      return;
    }
    if (globalContainerId && selectedNodes.some((node) => node.id === globalContainerId)) {
      setError('Global container cannot be copied.');
      return;
    }

    const selectedNodeSet = new Set(selectedNodes.map((node) => node.id));
    const depthCache = new Map<string, number>();
    const resolveDepth = (node: ApiNode): number => {
      const cachedDepth = depthCache.get(node.id);
      if (cachedDepth !== undefined) {
        return cachedDepth;
      }
      if (!node.parentNodeId || !selectedNodeSet.has(node.parentNodeId)) {
        depthCache.set(node.id, 0);
        return 0;
      }
      const parent = modelNodes.find((candidate) => candidate.id === node.parentNodeId);
      if (!parent) {
        depthCache.set(node.id, 0);
        return 0;
      }
      const depth = resolveDepth(parent) + 1;
      depthCache.set(node.id, depth);
      return depth;
    };

    const sortedNodes = [...selectedNodes].sort((a, b) => {
      const aIsContainer = isContainerNode(a);
      const bIsContainer = isContainerNode(b);
      if (aIsContainer !== bIsContainer) {
        return aIsContainer ? -1 : 1;
      }
      return resolveDepth(a) - resolveDepth(b);
    });

    const oldToNewNodeId = new Map<string, string>();
    const copiedNodeIds: string[] = [];
    const copiedNodePositions: NodePositionMap = {};
    const copiedContainerSizes: ContainerSizeMap = {};
    const selectedEdgeSet = new Set(uniqueEdgeIds);
    const skippedEdgeIds: string[] = [];

    try {
      setIsSelectionActionBusy(true);
      setError('');
      setWarning('');

      for (const node of sortedNodes) {
        const mappedParentNodeId = node.parentNodeId ? oldToNewNodeId.get(node.parentNodeId) || node.parentNodeId : null;
        const response = await fetch(`/api/projects/${projectId}/nodes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `${node.name} Copy`,
            category: isContainerNode(node) ? 'Container' : 'Component',
            description: node.description || undefined,
            notes: node.notes || undefined,
            parentNodeId: mappedParentNodeId,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || `Node "${node.name}" could not be copied`);
        }

        const createdNode = (await response.json()) as ApiNode;
        oldToNewNodeId.set(node.id, createdNode.id);
        copiedNodeIds.push(createdNode.id);

        const currentPosition = nodePositionMap[node.id] || { x: ROOT_GRID_X, y: ROOT_GRID_Y };
        copiedNodePositions[createdNode.id] = {
          x: currentPosition.x + 80,
          y: currentPosition.y + 80,
        };

        if (isContainerNode(node)) {
          const currentSize = containerSizeMap[node.id] || {
            width: DEFAULT_CONTAINER_WIDTH,
            height: DEFAULT_CONTAINER_HEIGHT,
          };
          copiedContainerSizes[createdNode.id] = {
            width: currentSize.width,
            height: currentSize.height,
          };
        }
      }

      const candidateEdges = modelEdges.filter(
        (edge) =>
          selectedNodeSet.has(edge.sourceNodeId) &&
          selectedNodeSet.has(edge.targetNodeId) &&
          (selectedEdgeSet.has(edge.id) || selectedNodeSet.size > 1)
      );

      const copiedEdgeIds: string[] = [];

      for (const edge of candidateEdges) {
        const mappedSourceNodeId = oldToNewNodeId.get(edge.sourceNodeId);
        const mappedTargetNodeId = oldToNewNodeId.get(edge.targetNodeId);
        if (!mappedSourceNodeId || !mappedTargetNodeId) {
          skippedEdgeIds.push(edge.id);
          continue;
        }

        const response = await fetch(`/api/projects/${projectId}/edges`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceNodeId: mappedSourceNodeId,
            targetNodeId: mappedTargetNodeId,
            sourceHandleId: edge.sourceHandleId || undefined,
            targetHandleId: edge.targetHandleId || undefined,
            name: edge.name || undefined,
            direction: edge.direction,
            protocol: edge.protocol || undefined,
            description: edge.description || undefined,
            notes: edge.notes || undefined,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || 'One or more interfaces could not be copied');
        }

        const createdEdge = (await response.json()) as ApiEdge;
        copiedEdgeIds.push(createdEdge.id);
      }

      await fetchModelData();
      setNodePositionMap((current) => ({
        ...current,
        ...copiedNodePositions,
      }));
      setContainerSizeMap((current) => ({
        ...current,
        ...copiedContainerSizes,
      }));
      setSelectedNodeIds(copiedNodeIds);
      setSelectedEdgeIds(copiedEdgeIds);
      setSelectedNodeId(copiedNodeIds[0] || null);
      setSelectedEdgeId(copiedEdgeIds.length === 1 ? copiedEdgeIds[0] : null);
      setSelectedDataObjectId(null);

      if (skippedEdgeIds.length > 0) {
        setWarning('Some interfaces were skipped because both endpoints must be copied together.');
      }
    } catch (copyError) {
      setError((copyError as Error).message);
    } finally {
      setIsSelectionActionBusy(false);
    }
  }, [
    canEdit,
    containerSizeMap,
    fetchModelData,
    globalContainerId,
    isContainerNode,
    isSelectionActionBusy,
    modelEdges,
    modelNodes,
    nodePositionMap,
    projectId,
    selectedEdgeIds,
    selectedNodeIds,
  ]);

  const handleDeleteDataObjectById = async (dataObjectId: string) => {
    if (!canEdit) return;
    const dataObjectToDelete = dataObjects.find((item) => item.id === dataObjectId);
    if (!dataObjectToDelete) return;
    try {
      setError('');

      const linkedFlowEdgeIds = Array.from(
        new Set(
          edgeDataFlows
            .filter((record) => record.dataObjectId === dataObjectToDelete.id)
            .map((record) => record.edgeId)
        )
      );
      const edgeIdsToDelete = linkedFlowEdgeIds.filter((edgeId) =>
        edgeDataFlows.every(
          (record) => record.edgeId !== edgeId || record.dataObjectId === dataObjectToDelete.id
        )
      );

      for (const edgeId of edgeIdsToDelete) {
        const edgeDeleteResponse = await fetch(`/api/projects/${projectId}/edges/${edgeId}`, { method: 'DELETE' });
        if (!edgeDeleteResponse.ok) {
          const payload = (await edgeDeleteResponse.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || 'Linked interface could not be deleted');
        }
      }

      const response = await fetch(`/api/projects/${projectId}/data-objects/${dataObjectToDelete.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Data object could not be deleted');
      }
      if (selectedDataObjectId === dataObjectToDelete.id) {
        setSelectedDataObjectId(null);
      }
      if (editingDataObjectId === dataObjectToDelete.id) {
        cancelInlineDataObjectRename();
      }
      if (dataSidebarObjectId === dataObjectToDelete.id) {
        setDataSidebarObjectId('');
      }
      setSelectedEdgeId((current) =>
        current && linkedFlowEdgeIds.includes(current) ? null : current
      );
      setSelectedEdgeIds((current) =>
        current.filter((edgeId) => !linkedFlowEdgeIds.includes(edgeId))
      );
      await fetchModelData();
    } catch (deleteError) {
      setError((deleteError as Error).message);
    }
  };

  const handleDeleteDataObject = async () => {
    if (!selectedDataObject) return;
    await handleDeleteDataObjectById(selectedDataObject.id);
  };

  const handleAssignDataToNode = async () => {
    if (!canEdit || !selectedNode || isContainerNode(selectedNode) || !newComponentDataObjectId) return;

    try {
      const createPayload = {
        nodeId: selectedNode.id,
        dataObjectId: newComponentDataObjectId,
        role: newComponentDataRole,
      };

      const response = await fetch(`/api/projects/${projectId}/component-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Data assignment failed');
      }

      registerHistoryAction({
        label: 'Assign data-at-rest',
        undo: async () => {
          await fetch(`/api/projects/${projectId}/component-data`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nodeId: createPayload.nodeId,
              dataObjectId: createPayload.dataObjectId,
            }),
          });
        },
        redo: async () => {
          await fetch(`/api/projects/${projectId}/component-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(createPayload),
          });
        },
      });
      setNewComponentDataObjectId('');
      await fetchModelData();
    } catch (assignmentError) {
      setError((assignmentError as Error).message);
    }
  };

  const handleAssignDataFromSidebar = async (dataObjectIdOverride?: string) => {
    const mappingDataObjectId = dataObjectIdOverride || dataSidebarObjectId;
    if (!canEdit || !mappingDataObjectId || !dataSidebarComponentId) return;
    const mappingNeedsCounterparty = ['Receives', 'SendsTo', 'FetchesFrom'].includes(dataSidebarRole);
    const mappingCounterpartyLabel = dataSidebarRole === 'SendsTo' ? 'To component' : 'From component';

    if (mappingNeedsCounterparty && !dataSidebarFromComponentId) {
      setError(`Select a component in "${mappingCounterpartyLabel}".`);
      return;
    }
    if (mappingNeedsCounterparty && dataSidebarFromComponentId === dataSidebarComponentId) {
      setError('Source and target components must be different.');
      return;
    }

    try {
      setError('');
      const mappedRole: 'Stores' | 'Processes' | 'Generates' | 'Receives' =
        dataSidebarRole === 'SendsTo'
          ? 'Generates'
          : dataSidebarRole === 'FetchesFrom'
            ? 'Receives'
            : dataSidebarRole;
      const createPayload = {
        nodeId: dataSidebarComponentId,
        dataObjectId: mappingDataObjectId,
        role: mappedRole,
      };

      const response = await fetch(`/api/projects/${projectId}/component-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Data assignment failed');
      }

      let resolvedEdgeId: string | null = null;
      if (dataSidebarRole === 'Receives' && dataSidebarFromComponentId) {
        const resolved = await resolveOrCreateEdgeForFlow(dataSidebarFromComponentId, dataSidebarComponentId);
        resolvedEdgeId = resolved.edge.id;
        await assignDataFlowToEdge({
          edgeId: resolved.edge.id,
          dataObjectId: mappingDataObjectId,
          direction: resolved.flowDirection,
        });
      } else if (dataSidebarRole === 'SendsTo' && dataSidebarFromComponentId) {
        const resolved = await resolveOrCreateEdgeForFlow(dataSidebarComponentId, dataSidebarFromComponentId);
        resolvedEdgeId = resolved.edge.id;
        await assignDataFlowToEdge({
          edgeId: resolved.edge.id,
          dataObjectId: mappingDataObjectId,
          direction: resolved.flowDirection,
        });
      } else if (dataSidebarRole === 'FetchesFrom' && dataSidebarFromComponentId) {
        const resolved = await resolveOrCreateEdgeForFlow(dataSidebarFromComponentId, dataSidebarComponentId);
        resolvedEdgeId = resolved.edge.id;
        await assignDataFlowToEdge({
          edgeId: resolved.edge.id,
          dataObjectId: mappingDataObjectId,
          direction: resolved.flowDirection,
        });
      }

      registerHistoryAction({
        label: 'Assign data-at-rest',
        undo: async () => {
          await fetch(`/api/projects/${projectId}/component-data`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nodeId: createPayload.nodeId,
              dataObjectId: createPayload.dataObjectId,
            }),
          });
        },
        redo: async () => {
          await fetch(`/api/projects/${projectId}/component-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(createPayload),
          });
        },
      });

      if (resolvedEdgeId) {
        setSelectedEdgeId(resolvedEdgeId);
        setSelectedNodeId(null);
      } else {
        setSelectedNodeId(createPayload.nodeId);
        setSelectedEdgeId(null);
      }
      if (!dataObjectIdOverride) {
        setDataSidebarObjectId('');
      } else {
        setDataSidebarObjectId(dataObjectIdOverride);
      }
      setDataSidebarFromComponentId('');
      await fetchModelData();
    } catch (assignmentError) {
      setError((assignmentError as Error).message);
    }
  };

  const handleAssignDataTransferForDataObject = async (dataObjectId: string) => {
    if (!canEdit || activeDataTransferObjectId) {
      return;
    }

    const draft = getDataTransferDraft(dataObjectId);
    const componentAId = draft.componentAId;
    const componentBId = draft.componentBId;
    if (!componentAId || !componentBId) {
      setError('Select both components for data transfer.');
      return;
    }
    if (componentAId === componentBId) {
      setError('Source and target components must be different.');
      return;
    }

    const dataSourceNodeId = draft.mode === 'A_SENDS_TO_B' ? componentAId : componentBId;
    const dataTargetNodeId = draft.mode === 'A_SENDS_TO_B' ? componentBId : componentAId;

    try {
      setError('');
      setActiveDataTransferObjectId(dataObjectId);

      const resolved = await resolveOrCreateEdgeForFlow(dataSourceNodeId, dataTargetNodeId);

      const assignFlowResponse = await fetch(`/api/projects/${projectId}/edge-data-flows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edgeId: resolved.edge.id,
          dataObjectId,
          direction: resolved.flowDirection,
        }),
      });

      if (!assignFlowResponse.ok) {
        const payload = (await assignFlowResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Data transfer could not be saved');
      }

      await fetchModelData();
    } catch (transferError) {
      setError((transferError as Error).message);
    } finally {
      setActiveDataTransferObjectId(null);
    }
  };

  const handleAssignDataToEdge = async () => {
    if (!canEdit || !selectedEdge || !newEdgeDataObjectId) return;

    try {
      const createPayload = {
        edgeId: selectedEdge.id,
        dataObjectId: newEdgeDataObjectId,
        direction: newEdgeDataDirection,
      };

      const response = await fetch(`/api/projects/${projectId}/edge-data-flows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Data flow assignment failed');
      }

      registerHistoryAction({
        label: 'Assign data-in-transit',
        undo: async () => {
          await fetch(`/api/projects/${projectId}/edge-data-flows`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              edgeId: createPayload.edgeId,
              dataObjectId: createPayload.dataObjectId,
            }),
          });
        },
        redo: async () => {
          await fetch(`/api/projects/${projectId}/edge-data-flows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(createPayload),
          });
        },
      });
      setNewEdgeDataObjectId('');
      await fetchModelData();
    } catch (assignmentError) {
      setError((assignmentError as Error).message);
    }
  };

  const removeDataFromNode = async (nodeId: string, dataObjectId: string) => {
    if (!canEdit) return;
    const existingRecord =
      componentData.find((record) => record.nodeId === nodeId && record.dataObjectId === dataObjectId) || null;
    await fetch(`/api/projects/${projectId}/component-data`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, dataObjectId }),
    });

    if (existingRecord) {
      registerHistoryAction({
        label: 'Remove data-at-rest',
        undo: async () => {
          await fetch(`/api/projects/${projectId}/component-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nodeId: existingRecord.nodeId,
              dataObjectId: existingRecord.dataObjectId,
              role: existingRecord.role,
              notes: existingRecord.notes || undefined,
            }),
          });
        },
        redo: async () => {
          await fetch(`/api/projects/${projectId}/component-data`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nodeId: existingRecord.nodeId,
              dataObjectId: existingRecord.dataObjectId,
            }),
          });
        },
      });
    }

    await fetchModelData();
  };

  const removeDataFromEdge = async (edgeId: string, dataObjectId: string) => {
    if (!canEdit) return;
    const existingRecord =
      edgeDataFlows.find((record) => record.edgeId === edgeId && record.dataObjectId === dataObjectId) || null;
    await fetch(`/api/projects/${projectId}/edge-data-flows`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edgeId, dataObjectId }),
    });

    if (existingRecord) {
      registerHistoryAction({
        label: 'Remove data-in-transit',
        undo: async () => {
          await fetch(`/api/projects/${projectId}/edge-data-flows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              edgeId: existingRecord.edgeId,
              dataObjectId: existingRecord.dataObjectId,
              direction: existingRecord.direction,
              notes: existingRecord.notes || undefined,
            }),
          });
        },
        redo: async () => {
          await fetch(`/api/projects/${projectId}/edge-data-flows`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              edgeId: existingRecord.edgeId,
              dataObjectId: existingRecord.dataObjectId,
            }),
          });
        },
      });
    }

    await fetchModelData();
  };

  useEffect(() => {
    if (!canEdit) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select') {
          return;
        }
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && (selectedNodeIds.length > 0 || selectedEdgeIds.length > 0)) {
        event.preventDefault();
        void handleDeleteSelectedGraphElements();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && selectedNodeIds.length > 0) {
        event.preventDefault();
        void handleCopySelectedGraphElements();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    canEdit,
    handleCopySelectedGraphElements,
    handleDeleteSelectedGraphElements,
    selectedEdgeIds.length,
    selectedNodeIds.length,
  ]);

  const selectedNodeIsContainer = Boolean(selectedNode && isContainerNode(selectedNode));
  const selectedNodeDataLinks =
    selectedNode && !selectedNodeIsContainer
      ? componentData.filter((record) => record.nodeId === selectedNode.id)
      : [];
  const selectedEdgeDataFlows = selectedEdge
    ? edgeDataFlows.filter((record) => record.edgeId === selectedEdge.id)
    : [];
  const availableDataObjectsForNode = selectedNode && !selectedNodeIsContainer
    ? dataObjects.filter(
        (item) => !selectedNodeDataLinks.some((existing) => existing.dataObjectId === item.id)
      )
    : dataObjects;
  const availableDataObjectsForEdge = selectedEdge
    ? dataObjects.filter(
        (item) => !selectedEdgeDataFlows.some((existing) => existing.dataObjectId === item.id)
      )
    : dataObjects;
  const selectedGraphElementsCount = selectedNodeIds.length + selectedEdgeIds.length;
  const hasGraphSelection = selectedGraphElementsCount > 0;

  if (isLoading) {
    return <div className="flex h-96 items-center justify-center text-slate-400">Loading graph...</div>;
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded border border-red-600/40 bg-red-900/20 p-3 text-sm text-red-200">{error}</div>}
      {warning && <div className="rounded border border-yellow-600/40 bg-yellow-900/20 p-3 text-sm text-yellow-100">{warning}</div>}
      {!canEdit && (
        <div className="rounded border border-slate-600 bg-slate-800/70 p-3 text-sm text-slate-300">
          Read-only mode: you can inspect the model but cannot edit.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleUndo()}
          disabled={undoStack.length === 0 || isHistoryBusy}
          className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          title={undoStack.length ? `Undo: ${undoStack[undoStack.length - 1].label}` : 'Nothing to undo'}
        >
          {'Undo'}
        </button>
        <button
          type="button"
          onClick={() => void handleRedo()}
          disabled={redoStack.length === 0 || isHistoryBusy}
          className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          title={redoStack.length ? `Redo: ${redoStack[redoStack.length - 1].label}` : 'Nothing to redo'}
        >
          {'Redo'}
        </button>
        <button
          type="button"
          onClick={() => void handleCopySelectedGraphElements()}
          disabled={!canEdit || isSelectionActionBusy || selectedNodeIds.length === 0}
          className="rounded border border-cyan-500/60 bg-cyan-500/20 px-3 py-1.5 text-sm text-cyan-100 transition-colors hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          title="Copy selected nodes and their internal interfaces (Ctrl/Cmd + C)"
        >
          Copy selected
        </button>
        <button
          type="button"
          onClick={() => void handleDeleteSelectedGraphElements()}
          disabled={!canEdit || isSelectionActionBusy || !hasGraphSelection}
          className="rounded border border-red-500/60 bg-red-500/20 px-3 py-1.5 text-sm text-red-100 transition-colors hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          title="Delete selected graph elements (Delete / Backspace)"
        >
          Delete selected
        </button>
        <p className="text-xs text-slate-400">
          Selected in graph: {selectedGraphElementsCount}
        </p>
      </div>

      {showAIGenerator && (
        <div className="rounded-lg border border-orange-400/50 bg-slate-800/80 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">AI Model Generator</h3>
            <button
              onClick={() => setShowAIGenerator(false)}
              className="text-slate-400 transition-colors hover:text-white"
              type="button"
            >
              Close
            </button>
          </div>
          <AIModelGenerator projectId={projectId} onImported={fetchModelData} />
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[250px,minmax(0,1fr)] 2xl:grid-cols-[270px,minmax(0,1fr)]">
        <aside className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Canonical Model</h3>
            <button
              onClick={() => setShowAIGenerator((prev) => !prev)}
              className={`ai-use-button relative overflow-hidden rounded-md border px-3 py-2 text-xs font-semibold transition-all ${
                showAIGenerator
                  ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30'
                  : 'border-orange-400/60 bg-orange-500/20 text-orange-100 hover:bg-orange-500/30'
              }`}
              type="button"
            >
              <span className="relative z-10 tracking-wide">{showAIGenerator ? 'Hide AI' : 'Use AI'}</span>
            </button>
          </div>

          <div className="space-y-2 rounded border border-slate-700 bg-slate-900/40 p-3">
            <h4 className="text-sm font-semibold text-white">Container</h4>
            <input
              type="text"
              value={newContainerName}
              onChange={(event) => setNewContainerName(event.target.value)}
              placeholder="Container name"
              disabled={!canEdit}
              className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-xs text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none disabled:opacity-60"
            />
            <button
              onClick={() => void handleAddContainer()}
              disabled={!canEdit || isSaving}
              className="w-full rounded bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
              type="button"
            >
              {isSaving ? 'Saving...' : 'Add container'}
            </button>

          </div>

          <div className="space-y-2 rounded border border-slate-700 bg-slate-900/40 p-3">
            <h4 className="text-sm font-semibold text-white">Component</h4>
            <input
              type="text"
              value={newComponentName}
              onChange={(event) => setNewComponentName(event.target.value)}
              placeholder="Component name"
              disabled={!canEdit}
              className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-xs text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none disabled:opacity-60"
            />
            <input
              type="text"
              value={newComponentDescription}
              onChange={(event) => setNewComponentDescription(event.target.value)}
              placeholder="Description"
              disabled={!canEdit}
              className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-xs text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none disabled:opacity-60"
            />
            <button
              onClick={() => void handleAddComponent()}
              disabled={!canEdit || isSaving}
              className="w-full rounded bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
              type="button"
            >
              {isSaving ? 'Saving...' : 'Add component'}
            </button>

          </div>

          <div className="space-y-2 rounded border border-slate-700 bg-slate-900/40 p-3">
            <div>
              <h4 className="text-sm font-semibold text-white">Model Snapshots</h4>
              <p className="mt-1 text-[11px] text-slate-400">
                Save titled checkpoints of the canonical model.
              </p>
            </div>

            {savepointError && (
              <div className="rounded border border-red-600/40 bg-red-900/20 p-2 text-xs text-red-200">{savepointError}</div>
            )}

            <div className="space-y-2">
              <input
                type="text"
                value={savepointTitle}
                onChange={(event) => setSavepointTitle(event.target.value)}
                placeholder="Snapshot title"
                disabled={!canEdit || isCreatingSavepoint || Boolean(restoringSavepointId) || Boolean(deletingSavepointId)}
                className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-xs text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => void handleCreateSavepoint()}
                disabled={!canEdit || isCreatingSavepoint || Boolean(restoringSavepointId) || Boolean(deletingSavepointId)}
                className="w-full rounded bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
              >
                {isCreatingSavepoint ? 'Saving...' : 'Save Snapshot'}
              </button>
            </div>

            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {isSavepointsLoading ? (
                <p className="text-xs text-slate-400">Loading snapshots...</p>
              ) : savepoints.length === 0 ? (
                <p className="text-xs text-slate-400">No snapshots yet.</p>
              ) : (
                savepoints.map((savepoint) => (
                  <div key={savepoint.id} className="rounded border border-slate-700 bg-slate-900/40 p-2">
                    <p className="text-xs font-semibold text-slate-100">{savepoint.title}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {new Date(savepoint.createdAt).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      by {savepoint.createdBy?.name || savepoint.createdBy?.email || 'Unknown'}
                    </p>
                    {canEdit ? (
                      <div className="mt-2 space-y-2">
                        <button
                          type="button"
                          onClick={() => void handleRestoreSavepoint(savepoint)}
                          disabled={Boolean(restoringSavepointId) || Boolean(deletingSavepointId)}
                          className="w-full rounded border border-cyan-500/50 bg-cyan-500/20 px-2 py-1 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-60"
                        >
                          {restoringSavepointId === savepoint.id ? 'Restoring...' : 'Restore Snapshot'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteSavepoint(savepoint)}
                          disabled={Boolean(restoringSavepointId) || Boolean(deletingSavepointId)}
                          className="w-full rounded border border-red-500/50 bg-red-900/25 px-2 py-1 text-xs font-semibold text-red-200 hover:bg-red-900/40 disabled:opacity-60"
                        >
                          {deletingSavepointId === savepoint.id ? 'Deleting...' : 'Delete Snapshot'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <section className="grid gap-2 lg:grid-cols-[minmax(0,1fr),270px] 2xl:grid-cols-[minmax(0,1fr),290px]">
          <div
            className="overflow-hidden rounded-lg border border-slate-700 bg-slate-800/50 lg:col-start-1 lg:row-start-1"
            style={{ height: 'calc(100vh - 240px)', minHeight: 760 }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              onNodeDragStop={onNodeDragStop}
              onEdgeClick={onEdgeClick}
              onEdgeMouseEnter={onEdgeMouseEnter}
              onEdgeMouseLeave={onEdgeMouseLeave}
              onEdgeDoubleClick={onEdgeDoubleClick}
              onSelectionChange={onSelectionChange}
              onPaneClick={onPaneClick}
              onConnect={onConnect}
              elementsSelectable
              selectionOnDrag
              connectionMode={ConnectionMode.Loose}
              multiSelectionKeyCode={['Control', 'Meta']}
              selectionKeyCode="Shift"
              deleteKeyCode={null}
              nodesDraggable={canEdit}
              nodesConnectable={canEdit}
              fitView
              fitViewOptions={{ padding: 0.2 }}
            >
              <Background />
              <Controls />
            </ReactFlow>
          </div>
          <p className="text-xs text-slate-400 lg:col-start-1 lg:row-start-2">
            Node positions remain fixed after placement. Resize containers with the mouse handle (bottom-right). Multi-select with Ctrl/Cmd or Shift, then copy with Ctrl/Cmd + C or delete with Delete/Backspace.
          </p>

          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 lg:col-start-2 lg:row-start-1 lg:row-span-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-white">Data</h4>
              <div className="flex items-center gap-2">
                <p className="text-xs text-slate-400">{dataObjects.length} objects</p>
              </div>
            </div>

            {canEdit ? (
              <div className="mb-3 space-y-2 rounded border border-emerald-500/30 bg-emerald-900/10 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Create data object</p>
                <input
                  type="text"
                  value={newDataObjectName}
                  onChange={(event) => setNewDataObjectName(event.target.value)}
                  placeholder="Data object name"
                  disabled={!canEdit || isSaving}
                  className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-xs text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none disabled:opacity-60"
                />
                <select
                  value={newDataObjectClass}
                  onChange={(event) => setNewDataObjectClass(event.target.value as DataClass)}
                  disabled={!canEdit || isSaving}
                  className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-xs text-white focus:border-orange-400 focus:outline-none disabled:opacity-60"
                >
                  {DATA_CLASSES.map((dataClass) => (
                    <option key={dataClass} value={dataClass}>
                      {dataClass}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newDataObjectDescription}
                  onChange={(event) => setNewDataObjectDescription(event.target.value)}
                  placeholder="Description (optional)"
                  disabled={!canEdit || isSaving}
                  className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-xs text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none disabled:opacity-60"
                />
                <button
                  onClick={() => void handleAddDataObject()}
                  disabled={!canEdit || isSaving}
                  className="w-full rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  type="button"
                >
                  {isSaving ? 'Saving...' : 'Create data object'}
                </button>
              </div>
            ) : null}

            {dataObjects.length === 0 ? (
              <p className="text-xs text-slate-400">No data objects yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {dataObjects.map((dataObject) => {
                  const componentStatements = dataObjectComponentStatements.get(dataObject.id) || [];
                  const transferSummaries = dataObjectTransferSummaries.get(dataObject.id) || [];
                  const componentMappings = componentData
                    .filter((record) => record.dataObjectId === dataObject.id)
                    .map((record) => ({
                      nodeId: record.nodeId,
                      role: record.role,
                      nodeName: nodeById.get(record.nodeId)?.name || 'Unknown component',
                    }))
                    .sort((a, b) => a.nodeName.localeCompare(b.nodeName));
                  const isSelectedDataObject = selectedDataObjectId === dataObject.id;
                  return (
                    <div
                      key={dataObject.id}
                      onClick={() => {
                        if (editingDataObjectId === dataObject.id) {
                          return;
                        }
                        setSelectedDataObjectId(dataObject.id);
                        setDataSidebarObjectId(dataObject.id);
                      }}
                      className={`rounded border p-3 ${isSelectedDataObject ? 'border-orange-400 bg-orange-500/10' : 'border-slate-700 bg-slate-900/40'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          {canEdit && editingDataObjectId === dataObject.id ? (
                            <input
                              autoFocus
                              type="text"
                              value={inlineDataObjectName}
                              onChange={(event) => setInlineDataObjectName(event.target.value)}
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={(event) => event.stopPropagation()}
                              onBlur={() => {
                                void commitInlineDataObjectRename();
                              }}
                              onKeyDown={(event) => {
                                event.stopPropagation();
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  event.currentTarget.blur();
                                }
                                if (event.key === 'Escape') {
                                  event.preventDefault();
                                  cancelInlineDataObjectRename();
                                }
                              }}
                              className="w-full rounded border border-amber-300 bg-slate-900/95 px-1.5 py-0.5 text-sm font-semibold text-white outline-none focus:border-amber-400"
                              placeholder="Data object name"
                            />
                          ) : (
                            <p
                              className="text-sm font-semibold text-white"
                              onDoubleClick={(event) => {
                                event.stopPropagation();
                                startInlineDataObjectRename(dataObject.id, dataObject.name);
                              }}
                              title={canEdit ? 'Double-click to rename' : undefined}
                            >
                              {dataObject.name}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-400">{dataObject.dataClass}</p>
                        </div>
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDeleteDataObjectById(dataObject.id);
                            }}
                            className="rounded border border-red-500/50 bg-red-900/30 px-2 py-1 text-[11px] font-semibold text-red-200 hover:bg-red-900/45"
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>

                      <p className="mt-2 text-xs text-slate-300">
                        Description: {dataObject.description?.trim() ? dataObject.description : 'No description'}
                      </p>
                      <p className="mt-1 text-xs text-slate-300">
                        {componentStatements.length > 0
                          ? componentStatements.join('; ')
                          : 'No component ownership mapped yet.'}
                      </p>

                      <div className="mt-2 rounded border border-slate-700/80 bg-slate-800/60 p-2">
                        <p className="text-[11px] font-semibold text-slate-200">Data sends to</p>
                        {transferSummaries.length === 0 ? (
                          <p className="mt-1 text-[11px] text-slate-400">No transfer configured yet.</p>
                        ) : (
                          <div className="mt-1 space-y-1">
                            {transferSummaries.map((summary) => (
                              <div key={`${dataObject.id}:${summary.edgeId}:${summary.label}`} className="flex items-center justify-between gap-2">
                                <p className="text-[11px] text-slate-300">{summary.label}</p>
                                {canEdit ? (
                                  <button
                                    type="button"
                                    onClick={() => void removeDataFromEdge(summary.edgeId, dataObject.id)}
                                    className="rounded border border-red-500/50 bg-red-900/25 px-1.5 py-0.5 text-[10px] font-semibold text-red-200 hover:bg-red-900/40"
                                  >
                                    x
                                  </button>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {isSelectedDataObject ? (
                        <div className="mt-3 space-y-3 border-t border-slate-600 pt-3" onClick={(event) => event.stopPropagation()}>
                          <div className="space-y-2 rounded border border-slate-700/80 bg-slate-900/50 p-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Data settings</p>
                            <input
                              type="text"
                              value={editDataObjectName}
                              onChange={(event) => setEditDataObjectName(event.target.value)}
                              placeholder="Data object name"
                              disabled={!canEdit || isSaving}
                              className="w-full rounded border border-slate-600 bg-slate-700 px-2 py-1.5 text-xs text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none disabled:opacity-60"
                            />
                            <select
                              value={editDataObjectClass}
                              onChange={(event) => setEditDataObjectClass(event.target.value as DataClass)}
                              disabled={!canEdit || isSaving}
                              className="w-full rounded border border-slate-600 bg-slate-700 px-2 py-1.5 text-xs text-white focus:border-orange-400 focus:outline-none disabled:opacity-60"
                            >
                              {DATA_CLASSES.map((dataClass) => (
                                <option key={dataClass} value={dataClass}>
                                  {dataClass}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={editDataObjectDescription}
                              onChange={(event) => setEditDataObjectDescription(event.target.value)}
                              placeholder="Description"
                              disabled={!canEdit || isSaving}
                              className="w-full rounded border border-slate-600 bg-slate-700 px-2 py-1.5 text-xs text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none disabled:opacity-60"
                            />
                            <button
                              type="button"
                              onClick={() => void handleSaveDataObject()}
                              disabled={!canEdit || isSaving}
                              className="w-full rounded bg-orange-500 px-2 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
                            >
                              {isSaving ? 'Saving...' : 'Save data settings'}
                            </button>
                          </div>

                          <div className="space-y-2 rounded border border-slate-700/80 bg-slate-900/50 p-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Mapping</p>
                            <select
                              value={dataSidebarComponentId}
                              onChange={(event) => setDataSidebarComponentId(event.target.value)}
                              disabled={!canEdit || isSaving}
                              className="w-full rounded border border-slate-600 bg-slate-700 px-2 py-1.5 text-xs text-white disabled:opacity-60"
                            >
                              <option value="">Select component</option>
                              {componentNodes.map((node) => (
                                <option key={node.id} value={node.id}>
                                  {node.name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={dataSidebarRole}
                              onChange={(event) => setDataSidebarRole(event.target.value as DataMappingMode)}
                              disabled={!canEdit || isSaving}
                              className="w-full rounded border border-slate-600 bg-slate-700 px-2 py-1.5 text-xs text-white disabled:opacity-60"
                            >
                              <option value="Generates">Generates</option>
                              <option value="Processes">Processes</option>
                              <option value="Stores">Stores</option>
                              <option value="Receives">Receives</option>
                              <option value="SendsTo">Sends to</option>
                              <option value="FetchesFrom">Fetches from</option>
                            </select>
                            {['Receives', 'SendsTo', 'FetchesFrom'].includes(dataSidebarRole) ? (
                              <select
                                value={dataSidebarFromComponentId}
                                onChange={(event) => setDataSidebarFromComponentId(event.target.value)}
                                disabled={!canEdit || isSaving}
                                className="w-full rounded border border-slate-600 bg-slate-700 px-2 py-1.5 text-xs text-white disabled:opacity-60"
                              >
                                <option value="">
                                  {dataSidebarRole === 'SendsTo' ? 'To component' : 'From component'}
                                </option>
                                {componentNodes
                                  .filter((node) => node.id !== dataSidebarComponentId)
                                  .map((node) => (
                                    <option key={node.id} value={node.id}>
                                      {node.name}
                                    </option>
                                  ))}
                              </select>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void handleAssignDataFromSidebar(dataObject.id)}
                              disabled={
                                !canEdit ||
                                isSaving ||
                                !dataSidebarComponentId ||
                                (['Receives', 'SendsTo', 'FetchesFrom'].includes(dataSidebarRole) &&
                                  !dataSidebarFromComponentId)
                              }
                              className="w-full rounded bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              Save mapping
                            </button>
                          </div>

                          <div className="space-y-2 rounded border border-slate-700/80 bg-slate-900/50 p-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Component mappings</p>
                            {componentMappings.length === 0 ? (
                              <p className="text-[11px] text-slate-400">No component mappings yet.</p>
                            ) : (
                              <div className="space-y-1">
                                {componentMappings.map((mapping) => (
                                  <div key={`${dataObject.id}:${mapping.nodeId}`} className="flex items-center justify-between gap-2">
                                    <p className="text-[11px] text-slate-300">
                                      {mapping.nodeName} {mapping.role.toLowerCase()} data
                                    </p>
                                    {canEdit ? (
                                      <button
                                        type="button"
                                        onClick={() => void removeDataFromNode(mapping.nodeId, dataObject.id)}
                                        className="rounded border border-red-500/50 bg-red-900/25 px-1.5 py-0.5 text-[10px] font-semibold text-red-200 hover:bg-red-900/40"
                                      >
                                        x
                                      </button>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
