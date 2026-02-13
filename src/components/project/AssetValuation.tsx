'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '@/components/common/Button';

interface NodeAsset {
  id: string;
  name: string;
  category: string;
  parentNodeId: string | null;
}

interface EdgeAsset {
  id: string;
  name: string | null;
  direction: 'A_TO_B' | 'B_TO_A' | 'BIDIRECTIONAL';
  sourceNodeId: string;
  targetNodeId: string;
  sourceNode?: { id: string; name: string } | null;
  targetNode?: { id: string; name: string } | null;
}

interface DataObject {
  id: string;
  name: string;
  dataClass: string;
  description?: string | null;
  confidentiality: number;
  integrity: number;
  availability: number;
}

interface ComponentDataRecord {
  id: string;
  nodeId: string;
  dataObjectId: string;
  role: 'Stores' | 'Processes' | 'Generates' | 'Receives';
  node?: NodeAsset;
  dataObject?: DataObject;
}

interface EdgeDataFlowRecord {
  id: string;
  edgeId: string;
  dataObjectId: string;
  direction: 'SourceToTarget' | 'TargetToSource' | 'Bidirectional';
  edge?: EdgeAsset;
  dataObject?: DataObject;
}

interface AssetValue {
  id: string;
  assetType: 'Node' | 'Edge' | 'DataObject';
  assetId: string;
  value: number;
  comment?: string;
}

type AssetBucket = 'Component' | 'Interface' | 'Data';
type RateType = 'Node' | 'Edge' | 'DataObject';

interface ViewAsset {
  key: string;
  bucket: AssetBucket;
  title: string;
  subtitle: string;
  details: string[];
  rateType: RateType;
  rateId: string;
  defaultValue: number;
}

interface ContainerGroup {
  id: string;
  title: string;
  components: ViewAsset[];
  interfaces: ViewAsset[];
  data: ViewAsset[];
}

type NodePosition = { x: number; y: number };
type NodeSize = { width: number; height: number };
type NodePositionMap = Record<string, NodePosition>;
type ContainerSizeMap = Record<string, NodeSize>;

const GLOBAL_GROUP_ID = '__GLOBAL__';
const GLOBAL_GROUP_TITLE = 'Global';
const NODE_POSITION_STORAGE_PREFIX = 'secudo.graph.positions.';
const CONTAINER_SIZE_STORAGE_PREFIX = 'secudo.graph.container-sizes.';
const DEFAULT_CONTAINER_WIDTH = 520;
const DEFAULT_CONTAINER_HEIGHT = 320;
const COMPONENT_WIDTH = 220;
const COMPONENT_HEIGHT = 96;

const clampScore = (value: number) => Math.min(10, Math.max(1, Math.round(value)));
const dataObjectCriticality = (dataObject: Pick<DataObject, 'confidentiality' | 'integrity' | 'availability'>) =>
  Math.max(dataObject.confidentiality, dataObject.integrity, dataObject.availability);

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

const overlapArea = (
  aPosition: NodePosition,
  aSize: NodeSize,
  bPosition: NodePosition,
  bSize: NodeSize
) => {
  const a = getRect(aPosition, aSize);
  const b = getRect(bPosition, bSize);
  const overlapWidth = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const overlapHeight = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return overlapWidth * overlapHeight;
};

function isContainerNode(node: NodeAsset): boolean {
  const normalized = node.category.toLowerCase();
  return normalized === 'container' || normalized === 'system';
}

function riskLevel(value: number | null): { label: string; color: string } {
  if (value === null) return { label: 'Not Set', color: 'text-slate-300' };
  if (value >= 8) return { label: 'Critical', color: 'text-red-400' };
  if (value >= 6) return { label: 'High', color: 'text-orange-400' };
  if (value >= 4) return { label: 'Medium', color: 'text-yellow-400' };
  return { label: 'Low', color: 'text-green-400' };
}

function formatEdgeFlowLabel(
  edge: EdgeAsset,
  direction: EdgeDataFlowRecord['direction'],
  sourceName: string,
  targetName: string
) {
  if (direction === 'SourceToTarget') {
    return `${sourceName} -> ${targetName}`;
  }
  if (direction === 'TargetToSource') {
    return `${targetName} -> ${sourceName}`;
  }
  if (edge.direction === 'B_TO_A') {
    return `${targetName} <-> ${sourceName}`;
  }
  return `${sourceName} <-> ${targetName}`;
}

function pushUniqueAsset(target: ViewAsset[], asset: ViewAsset) {
  if (!target.some((item) => item.key === asset.key)) {
    target.push(asset);
  }
}

function valueKey(assetType: RateType, assetId: string) {
  return `${assetType}_${assetId}`;
}

export default function AssetValuation({
  projectId,
  canEdit = false,
}: {
  projectId: string;
  canEdit?: boolean;
}) {
  const [nodes, setNodes] = useState<NodeAsset[]>([]);
  const [edges, setEdges] = useState<EdgeAsset[]>([]);
  const [dataObjects, setDataObjects] = useState<DataObject[]>([]);
  const [componentData, setComponentData] = useState<ComponentDataRecord[]>([]);
  const [edgeDataFlows, setEdgeDataFlows] = useState<EdgeDataFlowRecord[]>([]);
  const [values, setValues] = useState<Map<string, AssetValue>>(new Map());

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [selectedAssetKey, setSelectedAssetKey] = useState<string | null>(null);
  const [value, setValue] = useState(5);
  const [comment, setComment] = useState('');
  const [dataConfidentiality, setDataConfidentiality] = useState(5);
  const [dataIntegrity, setDataIntegrity] = useState(5);
  const [dataAvailability, setDataAvailability] = useState(5);
  const [isSavingDataCia, setIsSavingDataCia] = useState(false);
  const [dataCiaSaveStatus, setDataCiaSaveStatus] = useState('');
  const dataCiaSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setLoadError('');

      const [nodesRes, edgesRes, dataObjectsRes, valuesRes, componentDataRes, edgeDataFlowsRes] =
        await Promise.all([
          fetch(`/api/projects/${projectId}/nodes`),
          fetch(`/api/projects/${projectId}/edges`),
          fetch(`/api/projects/${projectId}/data-objects`),
          fetch(`/api/projects/${projectId}/asset-values`),
          fetch(`/api/projects/${projectId}/component-data`),
          fetch(`/api/projects/${projectId}/edge-data-flows`),
        ]);

      if (!nodesRes.ok || !edgesRes.ok || !dataObjectsRes.ok || !valuesRes.ok) {
        throw new Error('Failed to fetch assets');
      }

      const nextNodes = (await nodesRes.json()) as NodeAsset[];
      const nextEdges = (await edgesRes.json()) as EdgeAsset[];
      const nextDataObjects = (await dataObjectsRes.json()) as DataObject[];
      const nextValues = (await valuesRes.json()) as AssetValue[];
      const nextComponentData = componentDataRes.ok
        ? ((await componentDataRes.json()) as ComponentDataRecord[])
        : [];
      const nextEdgeDataFlows = edgeDataFlowsRes.ok
        ? ((await edgeDataFlowsRes.json()) as EdgeDataFlowRecord[])
        : [];

      setNodes(nextNodes);
      setEdges(nextEdges);
      setDataObjects(nextDataObjects);
      setComponentData(nextComponentData);
      setEdgeDataFlows(nextEdgeDataFlows);
      setValues(new Map(nextValues.map((entry) => [valueKey(entry.assetType, entry.assetId), entry])));
    } catch (fetchError) {
      setLoadError((fetchError as Error).message || 'Loading assets failed');
    } finally {
      setIsLoading(false);
    }
  };

  const { groupedAssets, assetLookup, rateTargets } = useMemo(() => {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const edgeMap = new Map(edges.map((edge) => [edge.id, edge]));
    const groups = new Map<string, ContainerGroup>();
    const targets = new Set<string>();

    const containerNodes = nodes.filter((node) => isContainerNode(node));
    const globalContainer = containerNodes.find(
      (node) => node.name.trim().toLowerCase() === GLOBAL_GROUP_TITLE.toLowerCase()
    );
    const userContainers = containerNodes.filter((node) => node.id !== globalContainer?.id);

    const readNodePositionMap = (): NodePositionMap => {
      if (typeof window === 'undefined') {
        return {};
      }
      try {
        const raw = window.localStorage.getItem(`${NODE_POSITION_STORAGE_PREFIX}${projectId}`);
        if (!raw) {
          return {};
        }
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const sanitized: NodePositionMap = {};
        Object.entries(parsed).forEach(([nodeId, value]) => {
          if (typeof value !== 'object' || value === null) {
            return;
          }
          const position = value as { x?: unknown; y?: unknown };
          if (
            typeof position.x === 'number' &&
            Number.isFinite(position.x) &&
            typeof position.y === 'number' &&
            Number.isFinite(position.y)
          ) {
            sanitized[nodeId] = { x: position.x, y: position.y };
          }
        });
        return sanitized;
      } catch {
        return {};
      }
    };

    const readContainerSizeMap = (): ContainerSizeMap => {
      if (typeof window === 'undefined') {
        return {};
      }
      try {
        const raw = window.localStorage.getItem(`${CONTAINER_SIZE_STORAGE_PREFIX}${projectId}`);
        if (!raw) {
          return {};
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
            sanitized[nodeId] = { width: size.width, height: size.height };
          }
        });
        return sanitized;
      } catch {
        return {};
      }
    };

    const positionMap = readNodePositionMap();
    const containerSizeMap = readContainerSizeMap();

    const ensureGroup = (groupId: string, title: string): ContainerGroup => {
      const existing = groups.get(groupId);
      if (existing) return existing;
      const created: ContainerGroup = {
        id: groupId,
        title,
        components: [],
        interfaces: [],
        data: [],
      };
      groups.set(groupId, created);
      return created;
    };

    ensureGroup(GLOBAL_GROUP_ID, GLOBAL_GROUP_TITLE);

    const getNodePosition = (nodeId: string): NodePosition | null => positionMap[nodeId] || null;

    const getContainerSize = (nodeId: string): NodeSize =>
      containerSizeMap[nodeId] || { width: DEFAULT_CONTAINER_WIDTH, height: DEFAULT_CONTAINER_HEIGHT };

    const resolveParentContainer = (nodeId: string): NodeAsset | null => {
      const node = nodeMap.get(nodeId);
      if (!node) {
        return null;
      }
      let current: NodeAsset | undefined = node;
      const visited = new Set<string>();
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        if (isContainerNode(current)) {
          return current.id === globalContainer?.id ? null : current;
        }
        current = current.parentNodeId ? nodeMap.get(current.parentNodeId) : undefined;
      }
      return null;
    };

    const resolveTouchedContainer = (nodeId: string): NodeAsset | null => {
      const node = nodeMap.get(nodeId);
      if (!node || isContainerNode(node)) {
        return null;
      }

      const nodePosition = getNodePosition(node.id);
      if (!nodePosition) {
        return null;
      }

      const nodeSize: NodeSize = { width: COMPONENT_WIDTH, height: COMPONENT_HEIGHT };
      const touchedContainers = userContainers
        .map((container) => {
          const containerPosition = getNodePosition(container.id);
          if (!containerPosition) {
            return null;
          }
          const containerSize = getContainerSize(container.id);
          const isTouching = rectsTouchOrOverlap(nodePosition, nodeSize, containerPosition, containerSize);
          if (!isTouching) {
            return null;
          }
          return {
            node: container,
            area: overlapArea(nodePosition, nodeSize, containerPosition, containerSize),
          };
        })
        .filter((entry): entry is { node: NodeAsset; area: number } => Boolean(entry))
        .sort((a, b) => b.area - a.area);

      return touchedContainers[0]?.node || null;
    };

    const resolvedGroupByNodeId = new Map<string, { id: string; title: string }>();
    const resolveGroupForNode = (nodeId: string): { id: string; title: string } => {
      const cached = resolvedGroupByNodeId.get(nodeId);
      if (cached) {
        return cached;
      }

      const node = nodeMap.get(nodeId);
      if (!node) {
        const fallback = { id: GLOBAL_GROUP_ID, title: GLOBAL_GROUP_TITLE };
        resolvedGroupByNodeId.set(nodeId, fallback);
        return fallback;
      }

      if (isContainerNode(node)) {
        const resolved =
          node.id === globalContainer?.id
            ? { id: GLOBAL_GROUP_ID, title: GLOBAL_GROUP_TITLE }
            : { id: node.id, title: node.name };
        resolvedGroupByNodeId.set(nodeId, resolved);
        return resolved;
      }

      const touchedContainer = resolveTouchedContainer(nodeId);
      if (touchedContainer) {
        const resolved = { id: touchedContainer.id, title: touchedContainer.name };
        resolvedGroupByNodeId.set(nodeId, resolved);
        return resolved;
      }

      const parentContainer = resolveParentContainer(nodeId);
      if (parentContainer) {
        const resolved = { id: parentContainer.id, title: parentContainer.name };
        resolvedGroupByNodeId.set(nodeId, resolved);
        return resolved;
      }

      const resolved = { id: GLOBAL_GROUP_ID, title: GLOBAL_GROUP_TITLE };
      resolvedGroupByNodeId.set(nodeId, resolved);
      return resolved;
    };

    nodes
      .filter((node) => !isContainerNode(node))
      .forEach((node) => {
        const groupRef = resolveGroupForNode(node.id);
        const group = ensureGroup(groupRef.id, groupRef.title);
        pushUniqueAsset(group.components, {
          key: `${group.id}__Component_Node_${node.id}`,
          bucket: 'Component',
          title: node.name,
          subtitle: 'Component',
          details: [],
          rateType: 'Node',
          rateId: node.id,
          defaultValue: 5,
        });
        targets.add(valueKey('Node', node.id));
      });

    edges.forEach((edge) => {
      const sourceGroup = resolveGroupForNode(edge.sourceNodeId);
      const targetGroup = resolveGroupForNode(edge.targetNodeId);
      const edgeGroupRefs = new Map<string, { id: string; title: string }>([
        [sourceGroup.id, sourceGroup],
        [targetGroup.id, targetGroup],
      ]);

      if (edgeGroupRefs.size === 0) {
        edgeGroupRefs.set(GLOBAL_GROUP_ID, { id: GLOBAL_GROUP_ID, title: GLOBAL_GROUP_TITLE });
      }

      const sourceName = edge.sourceNode?.name || nodeMap.get(edge.sourceNodeId)?.name || 'Source';
      const targetName = edge.targetNode?.name || nodeMap.get(edge.targetNodeId)?.name || 'Target';
      const title = edge.name?.trim() ? edge.name : `${sourceName} -> ${targetName}`;

      edgeGroupRefs.forEach((groupRef) => {
        const group = ensureGroup(groupRef.id, groupRef.title);
        pushUniqueAsset(group.interfaces, {
          key: `${group.id}__Interface_Edge_${edge.id}`,
          bucket: 'Interface',
          title,
          subtitle: `${sourceName} -> ${targetName}`,
          details: [],
          rateType: 'Edge',
          rateId: edge.id,
          defaultValue: 5,
        });
      });

      targets.add(valueKey('Edge', edge.id));
    });

    dataObjects.forEach((dataObject) => {
      const componentLinks = componentData.filter((record) => record.dataObjectId === dataObject.id);
      const flowLinks = edgeDataFlows.filter((record) => record.dataObjectId === dataObject.id);
      const groupRefs = new Map<string, { id: string; title: string }>();

      componentLinks.forEach((record) => {
        const groupRef = resolveGroupForNode(record.nodeId);
        groupRefs.set(groupRef.id, groupRef);
      });

      flowLinks.forEach((record) => {
        const edge = record.edge || edgeMap.get(record.edgeId);
        if (!edge) {
          return;
        }
        const sourceGroup = resolveGroupForNode(edge.sourceNodeId);
        const targetGroup = resolveGroupForNode(edge.targetNodeId);
        groupRefs.set(sourceGroup.id, sourceGroup);
        groupRefs.set(targetGroup.id, targetGroup);
      });

      if (groupRefs.size === 0) {
        groupRefs.set(GLOBAL_GROUP_ID, { id: GLOBAL_GROUP_ID, title: GLOBAL_GROUP_TITLE });
      }

      const ownershipStatements = componentLinks
        .map((record) => {
          const nodeName = record.node?.name || nodeMap.get(record.nodeId)?.name || 'Unknown component';
          return `${nodeName} ${record.role.toLowerCase()}`;
        })
        .filter((statement, index, source) => source.indexOf(statement) === index);

      const transferStatements = flowLinks
        .map((record) => {
          const edge = record.edge || edgeMap.get(record.edgeId);
          if (!edge) {
            return null;
          }
          const sourceName = edge.sourceNode?.name || nodeMap.get(edge.sourceNodeId)?.name || 'Source';
          const targetName = edge.targetNode?.name || nodeMap.get(edge.targetNodeId)?.name || 'Target';
          return formatEdgeFlowLabel(edge, record.direction, sourceName, targetName);
        })
        .filter((statement): statement is string => Boolean(statement))
        .filter((statement, index, source) => source.indexOf(statement) === index);

      const details: string[] = [];
      if (ownershipStatements.length > 0) {
        details.push(`At rest: ${ownershipStatements.join('; ')}`);
      }
      if (transferStatements.length > 0) {
        details.push(`In transit: ${transferStatements.join('; ')}`);
      }
      if (details.length === 0) {
        details.push('No mapping yet.');
      }

      const recommendedValue = clampScore(dataObjectCriticality(dataObject));
      const subtitle = `${dataObject.dataClass} | CIA C${dataObject.confidentiality} I${dataObject.integrity} A${dataObject.availability}`;

      groupRefs.forEach((groupRef) => {
        const group = ensureGroup(groupRef.id, groupRef.title);
        pushUniqueAsset(group.data, {
          key: `${group.id}__Data_DataObject_${dataObject.id}`,
          bucket: 'Data',
          title: dataObject.name,
          subtitle,
          details,
          rateType: 'DataObject',
          rateId: dataObject.id,
          defaultValue: recommendedValue,
        });
      });

      targets.add(valueKey('DataObject', dataObject.id));
    });

    const sortedGroups = Array.from(groups.values())
      .map((group) => ({
        ...group,
        components: [...group.components].sort((a, b) => a.title.localeCompare(b.title)),
        interfaces: [...group.interfaces].sort((a, b) => a.title.localeCompare(b.title)),
        data: [...group.data].sort((a, b) => a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => {
        if (a.id === GLOBAL_GROUP_ID) return -1;
        if (b.id === GLOBAL_GROUP_ID) return 1;
        return a.title.localeCompare(b.title);
      });

    const lookup = new Map<string, ViewAsset>();
    sortedGroups.forEach((group) => {
      [...group.components, ...group.interfaces, ...group.data].forEach((asset) => {
        lookup.set(`${asset.rateType}_${asset.rateId}_${asset.key}`, asset);
      });
    });

    return {
      groupedAssets: sortedGroups,
      assetLookup: lookup,
      rateTargets: targets,
    };
  }, [componentData, dataObjects, edgeDataFlows, edges, nodes, projectId]);

  const selectedAsset = useMemo(() => {
    if (!selectedAssetKey) return null;
    return assetLookup.get(selectedAssetKey) || null;
  }, [assetLookup, selectedAssetKey]);

  const selectedDataObject = useMemo(() => {
    if (!selectedAsset || selectedAsset.rateType !== 'DataObject') {
      return null;
    }
    return dataObjects.find((item) => item.id === selectedAsset.rateId) || null;
  }, [dataObjects, selectedAsset]);

  const ratedCount = useMemo(() => {
    let count = 0;
    Array.from(values.keys()).forEach((key) => {
      if (rateTargets.has(key)) {
        count += 1;
      }
    });
    return count;
  }, [rateTargets, values]);

  const handleSelectAsset = (asset: ViewAsset) => {
    setSaveError('');
    const key = valueKey(asset.rateType, asset.rateId);
    const existing = values.get(key);
    const isDataAsset = asset.rateType === 'DataObject';
    const dataObjectForAsset = isDataAsset
      ? dataObjects.find((item) => item.id === asset.rateId) || null
      : null;
    const nextSelectedAssetKey = `${asset.rateType}_${asset.rateId}_${asset.key}`;
    if (selectedAssetKey === nextSelectedAssetKey) {
      setSelectedAssetKey(null);
      return;
    }
    setSelectedAssetKey(nextSelectedAssetKey);
    setValue(
      dataObjectForAsset
        ? dataObjectCriticality(dataObjectForAsset)
        : existing?.value || asset.defaultValue || 5
    );
    setComment(isDataAsset ? '' : existing?.comment || '');
  };

  useEffect(() => {
    if (!selectedDataObject) {
      return;
    }
    if (dataCiaSaveTimeoutRef.current) {
      clearTimeout(dataCiaSaveTimeoutRef.current);
      dataCiaSaveTimeoutRef.current = null;
    }
    setDataConfidentiality(selectedDataObject.confidentiality);
    setDataIntegrity(selectedDataObject.integrity);
    setDataAvailability(selectedDataObject.availability);
    setDataCiaSaveStatus('');
  }, [selectedDataObject]);

  useEffect(() => {
    return () => {
      if (dataCiaSaveTimeoutRef.current) {
        clearTimeout(dataCiaSaveTimeoutRef.current);
        dataCiaSaveTimeoutRef.current = null;
      }
    };
  }, []);

  const persistDataCia = async (
    dataObjectId: string,
    confidentiality: number,
    integrity: number,
    availability: number
  ) => {
    if (!canEdit) {
      return;
    }

    try {
      setIsSavingDataCia(true);
      setDataCiaSaveStatus('Saving...');
      setSaveError('');
      const response = await fetch(`/api/projects/${projectId}/data-objects/${dataObjectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confidentiality,
          integrity,
          availability,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Failed to save CIA values');
      }

      const updated = (await response.json()) as DataObject;
      const derivedCriticality = dataObjectCriticality(updated);
      setDataObjects((current) =>
        current.map((item) =>
          item.id === updated.id
            ? {
                ...item,
                confidentiality: updated.confidentiality,
                integrity: updated.integrity,
                availability: updated.availability,
              }
            : item
        )
      );
      setValues((current) => {
        const next = new Map(current);
        const key = valueKey('DataObject', updated.id);
        const existing = next.get(key);
        next.set(key, {
          id: existing?.id || `derived_${updated.id}`,
          assetType: 'DataObject',
          assetId: updated.id,
          value: derivedCriticality,
          comment: '',
        });
        return next;
      });
      setValue(derivedCriticality);
      setComment('');
      setDataCiaSaveStatus('Saved');
    } catch (saveCiaError) {
      setDataCiaSaveStatus('');
      setSaveError((saveCiaError as Error).message);
    } finally {
      setIsSavingDataCia(false);
    }
  };

  const scheduleDataCiaSave = (nextConfidentiality: number, nextIntegrity: number, nextAvailability: number) => {
    if (!canEdit || !selectedDataObject) {
      return;
    }

    if (dataCiaSaveTimeoutRef.current) {
      clearTimeout(dataCiaSaveTimeoutRef.current);
      dataCiaSaveTimeoutRef.current = null;
    }

    setDataCiaSaveStatus('Saving...');
    const selectedDataObjectId = selectedDataObject.id;
    dataCiaSaveTimeoutRef.current = setTimeout(() => {
      dataCiaSaveTimeoutRef.current = null;
      void persistDataCia(selectedDataObjectId, nextConfidentiality, nextIntegrity, nextAvailability);
    }, 350);
  };

  const handleSaveValue = async () => {
    if (!selectedAsset || !canEdit || selectedAsset.rateType === 'DataObject') return;

    try {
      setSaveError('');
      const response = await fetch(`/api/projects/${projectId}/asset-values`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetType: selectedAsset.rateType,
          assetId: selectedAsset.rateId,
          value,
          comment: comment.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Failed to save value');
      }

      const saved = (await response.json()) as AssetValue;
      setValues((current) => new Map(current).set(valueKey(saved.assetType, saved.assetId), saved));
      setValue(saved.value);
      setComment(saved.comment || '');
    } catch (saveValueError) {
      setSaveError((saveValueError as Error).message);
    }
  };

  if (isLoading) {
    return <div className="text-slate-400">Loading assets...</div>;
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-red-700/40 bg-red-900/20 p-4 text-sm text-red-200">
        {loadError}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Legend</h3>
        <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-5">
          <div className="rounded border border-red-600/30 bg-red-900/20 px-3 py-2 text-red-300">
            <span className="font-semibold">Critical</span> (8-10)
          </div>
          <div className="rounded border border-orange-600/30 bg-orange-900/20 px-3 py-2 text-orange-300">
            <span className="font-semibold">High</span> (6-7)
          </div>
          <div className="rounded border border-yellow-600/30 bg-yellow-900/20 px-3 py-2 text-yellow-300">
            <span className="font-semibold">Medium</span> (4-5)
          </div>
          <div className="rounded border border-green-600/30 bg-green-900/20 px-3 py-2 text-green-300">
            <span className="font-semibold">Low</span> (1-3)
          </div>
          <div className="rounded border border-slate-600 bg-slate-700/40 px-3 py-2 text-slate-300">
            <span className="font-semibold">Not Set</span> (-)
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Coverage: {ratedCount}/{rateTargets.size} assets rated.
        </p>
      </div>

      {!canEdit && (
        <div className="rounded-lg border border-slate-600 bg-slate-800/70 p-3 text-sm text-slate-300">
          Read-only mode: viewers can inspect asset ratings but cannot modify them.
        </div>
      )}

      {groupedAssets.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 text-slate-400">
          No assets found yet.
        </div>
      ) : (
        <div className="space-y-4">
          {groupedAssets.map((group) => (
            <div key={group.id} className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <h3 className="mb-3 text-lg font-semibold text-white">{group.title}</h3>

              {[
                { title: 'Component', items: group.components },
                { title: 'Interface', items: group.interfaces },
                { title: 'Data', items: group.data },
              ].map((section) => (
                <div key={section.title} className="mb-4 last:mb-0">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                    {section.title}
                  </p>
                  {section.items.length === 0 ? (
                    <p className="text-xs text-slate-500">No entries.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {section.items.map((asset) => {
                        const entry = values.get(valueKey(asset.rateType, asset.rateId)) || null;
                        const dataObjectForCard =
                          asset.rateType === 'DataObject'
                            ? dataObjects.find((item) => item.id === asset.rateId) || null
                            : null;
                        const effectiveValue = dataObjectForCard
                          ? dataObjectCriticality(dataObjectForCard)
                          : entry?.value ?? null;
                        const risk = riskLevel(effectiveValue);
                        const currentKey = `${asset.rateType}_${asset.rateId}_${asset.key}`;
                        const isSelected = selectedAssetKey === currentKey;
                        const isSelectedDataObject = isSelected && asset.rateType === 'DataObject';

                        return (
                          <div
                            key={asset.key}
                            className={`rounded border p-3 text-left transition-colors ${
                              isSelected
                                ? 'border-orange-400 bg-slate-700/60'
                                : 'border-slate-700 bg-slate-700/30 hover:border-slate-500'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleSelectAsset(asset)}
                              className="w-full text-left"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-white">{asset.title}</p>
                                  <p className="text-xs text-slate-400">{asset.subtitle}</p>
                                </div>
                                <span className={`text-sm font-bold ${risk.color}`}>
                                  {effectiveValue ?? '-'}/10
                                </span>
                              </div>
                              <p className={`mt-1 text-xs font-semibold ${risk.color}`}>{risk.label}</p>
                              {asset.details.slice(0, 2).map((detail) => (
                                <p key={`${asset.key}:${detail}`} className="mt-1 text-[11px] text-slate-400">
                                  {detail}
                                </p>
                              ))}
                              {asset.rateType !== 'DataObject' && entry?.comment && (
                                <p className="mt-1 text-xs italic text-slate-400">"{entry.comment}"</p>
                              )}
                            </button>

                            {isSelected && (
                              <div className="mt-3 border-t border-slate-600 pt-3">
                                <p className="mb-3 text-xs text-slate-300">
                                  Type: {asset.bucket} | Recommended: {asset.defaultValue}/10
                                </p>

                                {saveError && (
                                  <div className="mb-3 rounded border border-red-700/40 bg-red-900/20 p-2 text-xs text-red-200">
                                    {saveError}
                                  </div>
                                )}

                                <div className="space-y-3">
                                  {isSelectedDataObject && selectedDataObject ? (
                                    <div className="space-y-3 rounded-lg border border-cyan-500/30 bg-cyan-900/15 p-3">
                                      <p className="text-xs font-semibold uppercase tracking-wide text-cyan-100">
                                        CIA Assessment
                                      </p>
                                      <p className="text-xs text-cyan-100">
                                        Criticality is derived automatically: max(Confidentiality, Integrity,
                                        Availability) ={' '}
                                        <span className="font-semibold">
                                          {Math.max(dataConfidentiality, dataIntegrity, dataAvailability)}/10
                                        </span>
                                      </p>
                                      <div className="grid gap-3 md:grid-cols-3">
                                        <label className="text-xs text-slate-300">
                                          Confidentiality (C): {dataConfidentiality}
                                          <input
                                            type="range"
                                            min="1"
                                            max="10"
                                            value={dataConfidentiality}
                                            onChange={(event) => {
                                              const nextValue = parseInt(event.target.value, 10);
                                              setDataConfidentiality(nextValue);
                                              scheduleDataCiaSave(nextValue, dataIntegrity, dataAvailability);
                                            }}
                                            disabled={!canEdit || isSavingDataCia}
                                            className="mt-1 w-full accent-cyan-500 disabled:opacity-70"
                                          />
                                        </label>
                                        <label className="text-xs text-slate-300">
                                          Integrity (I): {dataIntegrity}
                                          <input
                                            type="range"
                                            min="1"
                                            max="10"
                                            value={dataIntegrity}
                                            onChange={(event) => {
                                              const nextValue = parseInt(event.target.value, 10);
                                              setDataIntegrity(nextValue);
                                              scheduleDataCiaSave(dataConfidentiality, nextValue, dataAvailability);
                                            }}
                                            disabled={!canEdit || isSavingDataCia}
                                            className="mt-1 w-full accent-cyan-500 disabled:opacity-70"
                                          />
                                        </label>
                                        <label className="text-xs text-slate-300">
                                          Availability (A): {dataAvailability}
                                          <input
                                            type="range"
                                            min="1"
                                            max="10"
                                            value={dataAvailability}
                                            onChange={(event) => {
                                              const nextValue = parseInt(event.target.value, 10);
                                              setDataAvailability(nextValue);
                                              scheduleDataCiaSave(dataConfidentiality, dataIntegrity, nextValue);
                                            }}
                                            disabled={!canEdit || isSavingDataCia}
                                            className="mt-1 w-full accent-cyan-500 disabled:opacity-70"
                                          />
                                        </label>
                                      </div>
                                      {canEdit ? (
                                        <p className="text-[11px] text-cyan-100/90">
                                          {dataCiaSaveStatus || 'CIA saves automatically.'}
                                        </p>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <>
                                      <div>
                                        <label className="mb-1 block text-xs font-medium text-slate-300">
                                          Criticality: {value}/10
                                        </label>
                                        <input
                                          type="range"
                                          min="1"
                                          max="10"
                                          value={value}
                                          onChange={(event) => setValue(parseInt(event.target.value, 10))}
                                          disabled={!canEdit}
                                          className="w-full disabled:opacity-70"
                                        />
                                      </div>

                                      <div>
                                        <label className="mb-1 block text-xs font-medium text-slate-300">
                                          Rationale (optional)
                                        </label>
                                        <textarea
                                          value={comment}
                                          onChange={(event) => setComment(event.target.value)}
                                          placeholder="Why this rating?"
                                          rows={3}
                                          disabled={!canEdit}
                                          className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none disabled:opacity-70"
                                        />
                                      </div>
                                    </>
                                  )}

                                  <div className="flex gap-2">
                                    {canEdit && !isSelectedDataObject ? (
                                      <Button onClick={handleSaveValue} className="flex-1">
                                        Save Value
                                      </Button>
                                    ) : null}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedAssetKey(null);
                                        setSaveError('');
                                      }}
                                      className={`${canEdit && !isSelectedDataObject ? 'flex-1' : 'w-full'} rounded-lg bg-slate-700 px-4 py-2 text-white transition-colors hover:bg-slate-600`}
                                    >
                                      Close
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {values.size > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <h4 className="mb-3 text-sm font-semibold text-white">Summary</h4>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded border border-red-600/30 bg-red-900/20 p-2 text-center">
              <p className="text-xs text-slate-400">Critical (8-10)</p>
              <p className="text-lg font-bold text-red-400">
                {Array.from(values.values()).filter((entry) => entry.value >= 8).length}
              </p>
            </div>
            <div className="rounded border border-orange-600/30 bg-orange-900/20 p-2 text-center">
              <p className="text-xs text-slate-400">High (6-7)</p>
              <p className="text-lg font-bold text-orange-400">
                {Array.from(values.values()).filter((entry) => entry.value >= 6 && entry.value < 8).length}
              </p>
            </div>
            <div className="rounded border border-yellow-600/30 bg-yellow-900/20 p-2 text-center">
              <p className="text-xs text-slate-400">Medium (4-5)</p>
              <p className="text-lg font-bold text-yellow-400">
                {Array.from(values.values()).filter((entry) => entry.value >= 4 && entry.value < 6).length}
              </p>
            </div>
            <div className="rounded border border-green-600/30 bg-green-900/20 p-2 text-center">
              <p className="text-xs text-slate-400">Low (1-3)</p>
              <p className="text-lg font-bold text-green-400">
                {Array.from(values.values()).filter((entry) => entry.value < 4).length}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
