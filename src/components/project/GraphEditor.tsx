'use client';

import { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  Connection,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import AIModelGenerator from '@/components/project/AIModelGenerator';

interface ApiNode {
  id: string;
  name: string;
  category: 'Component' | 'Human' | 'System';
}

interface ApiEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  name?: string | null;
  direction: 'A_TO_B' | 'B_TO_A' | 'BIDIRECTIONAL';
}

interface GraphEditorProps {
  projectId: string;
}

type GraphNodeData = {
  label: string;
};

type GraphNode = Node<GraphNodeData>;
type GraphEdge = Edge;

export default function GraphEditor({ projectId }: GraphEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeCategory, setNewNodeCategory] = useState<'Component' | 'Human' | 'System'>('Component');
  const [showAIGenerator, setShowAIGenerator] = useState(false);

  const fetchModelData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');

      const [nodesRes, edgesRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/nodes`),
        fetch(`/api/projects/${projectId}/edges`),
      ]);

      if (!nodesRes.ok || !edgesRes.ok) {
        throw new Error('Model data could not be loaded');
      }

      const modelNodes = (await nodesRes.json()) as ApiNode[];
      const modelEdges = (await edgesRes.json()) as ApiEdge[];

      const rfNodes: GraphNode[] = modelNodes.map((node, index) => ({
        id: node.id,
        data: {
          label: `${node.name} (${node.category})`,
        },
        position: {
          x: 120 + (index % 4) * 220,
          y: 80 + Math.floor(index / 4) * 160,
        },
      }));

      const rfEdges: GraphEdge[] = modelEdges.map((edge) => ({
        id: edge.id,
        source: edge.sourceNodeId,
        target: edge.targetNodeId,
        label: edge.name || edge.direction,
      }));

      setNodes(rfNodes);
      setEdges(rfEdges);
    } catch (fetchError) {
      setError((fetchError as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, setEdges, setNodes]);

  useEffect(() => {
    void fetchModelData();
  }, [fetchModelData]);

  const handleAddNode = async () => {
    if (!newNodeName.trim()) {
      setError('Node name is required');
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      const response = await fetch(`/api/projects/${projectId}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newNodeName.trim(),
          category: newNodeCategory,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Node could not be created');
      }

      const createdNode = (await response.json()) as ApiNode;
      setNodes((currentNodes) => [
        ...currentNodes,
        {
          id: createdNode.id,
          data: { label: `${createdNode.name} (${createdNode.category})` },
          position: { x: 160 + currentNodes.length * 20, y: 120 + currentNodes.length * 20 },
        },
      ]);
      setNewNodeName('');
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const onConnect = async (connection: Connection) => {
    if (!connection.source || !connection.target) {
      return;
    }

    try {
      setError('');
      const response = await fetch(`/api/projects/${projectId}/edges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceNodeId: connection.source,
          targetNodeId: connection.target,
          direction: 'A_TO_B',
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Edge could not be created');
      }

      const createdEdge = (await response.json()) as ApiEdge;
      setEdges((currentEdges) => [
        ...currentEdges,
        {
          id: createdEdge.id,
          source: createdEdge.sourceNodeId,
          target: createdEdge.targetNodeId,
          label: createdEdge.name || createdEdge.direction,
        },
      ]);
    } catch (connectError) {
      setError((connectError as Error).message);
    }
  };

  if (isLoading) {
    return <div className="flex h-96 items-center justify-center text-slate-400">Loading graph...</div>;
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded border border-red-600/40 bg-red-900/20 p-3 text-sm text-red-200">{error}</div>}

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

      <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-800/50 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Add Node</h3>
          <button
            onClick={() => setShowAIGenerator((prev) => !prev)}
            className="rounded bg-orange-500/20 px-3 py-1 text-xs font-semibold text-orange-300 transition-colors hover:bg-orange-500/30"
            type="button"
          >
            {showAIGenerator ? 'Hide AI' : 'Use AI'}
          </button>
        </div>
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            type="text"
            value={newNodeName}
            onChange={(event) => setNewNodeName(event.target.value)}
            placeholder="Node name"
            className="flex-1 rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none"
          />
          <select
            value={newNodeCategory}
            onChange={(event) => setNewNodeCategory(event.target.value as 'Component' | 'Human' | 'System')}
            className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-white focus:border-orange-400 focus:outline-none"
          >
            <option value="Component">Component</option>
            <option value="Human">Human</option>
            <option value="System">System</option>
          </select>
          <button
            onClick={handleAddNode}
            disabled={isSaving}
            className="rounded-lg bg-orange-500 px-6 py-2 text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
            type="button"
          >
            {isSaving ? 'Saving...' : 'Add'}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-800/50" style={{ height: '600px' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
