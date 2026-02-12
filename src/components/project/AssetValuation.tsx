'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/common/Button';

interface Asset {
  id: string;
  name: string;
  type: 'Node' | 'Edge';
}

interface AssetValue {
  id: string;
  assetType: string;
  assetId: string;
  value: number;
  comment?: string;
}

export default function AssetValuation({ projectId }: { projectId: string }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [values, setValues] = useState<Map<string, AssetValue>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [value, setValue] = useState(5);
  const [comment, setComment] = useState('');

  useEffect(() => {
    fetchAssets();
    fetchAssetValues();
  }, [projectId]);

  const fetchAssets = async () => {
    try {
      const [nodesRes, edgesRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/nodes`),
        fetch(`/api/projects/${projectId}/edges`),
      ]);

      if (!nodesRes.ok || !edgesRes.ok) throw new Error('Failed to fetch assets');

      const nodes = await nodesRes.json();
      const edges = await edgesRes.json();

      const assetList: Asset[] = [
        ...nodes.map((n: any) => ({ id: n.id, name: n.name, type: 'Node' as const })),
        ...edges.map((e: any) => ({
          id: e.id,
          name: e.name || `${e.sourceNode?.name || 'Source'} → ${e.targetNode?.name || 'Target'}`,
          type: 'Edge' as const,
        })),
      ];

      setAssets(assetList);
    } catch (error) {
      console.error('Failed to fetch assets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAssetValues = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/asset-values`);
      if (!response.ok) throw new Error('Failed to fetch values');

      const data: AssetValue[] = await response.json();
      const map = new Map(data.map((v) => [`${v.assetType}_${v.assetId}`, v]));
      setValues(map);
    } catch (error) {
      console.error('Failed to fetch values:', error);
    }
  };

  const handleSaveValue = async () => {
    if (!selectedAsset) return;

    const [type, id] = selectedAsset.split('_');

    try {
      const response = await fetch(`/api/projects/${projectId}/asset-values`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetType: type,
          assetId: id,
          value,
          comment,
        }),
      });

      if (!response.ok) throw new Error('Failed to save value');

      const saved = await response.json();
      setValues(new Map(values.set(selectedAsset, saved)));
      setComment('');
      setSelectedAsset(null);
    } catch (error) {
      console.error('Failed to save:', error);
    }
  };

  if (isLoading) {
    return <div className="text-slate-400">Loading assets...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Asset List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {assets.map((asset) => {
          const key = `${asset.type}_${asset.id}`;
          const assetValue = values.get(key);
          const riskLevel = assetValue
            ? assetValue.value >= 8
              ? 'Critical'
              : assetValue.value >= 6
              ? 'High'
              : assetValue.value >= 4
              ? 'Medium'
              : 'Low'
            : 'Not Set';

          const riskColor =
            riskLevel === 'Critical'
              ? 'text-red-400'
              : riskLevel === 'High'
              ? 'text-orange-400'
              : riskLevel === 'Medium'
              ? 'text-yellow-400'
              : 'text-green-400';

          return (
            <div
              key={key}
              onClick={() => {
                setSelectedAsset(key);
                setValue(assetValue?.value || 5);
                setComment(assetValue?.comment || '');
              }}
              className={`p-4 rounded-lg border cursor-pointer transition-all ${
                selectedAsset === key
                  ? 'border-orange-400 bg-slate-700/50'
                  : 'border-slate-600 bg-slate-800/30 hover:border-slate-500'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="text-white font-semibold">{asset.name}</h3>
                  <p className="text-xs text-slate-400">{asset.type}</p>
                </div>
                <span className={`font-bold text-lg ${riskColor}`}>{assetValue?.value || '—'}/10</span>
              </div>
              <p className={`text-xs font-semibold ${riskColor}`}>{riskLevel}</p>
              {assetValue?.comment && <p className="text-xs text-slate-400 mt-2">{assetValue.comment}</p>}
            </div>
          );
        })}
      </div>

      {/* Editor Panel */}
      {selectedAsset && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Assess: {assets.find((a) => `${a.type}_${a.id}` === selectedAsset)?.name}
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Criticality (Value): {value}/10
              </label>
              <input
                type="range"
                min="1"
                max="10"
                value={value}
                onChange={(e) => setValue(parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>Low (1)</span>
                <span>Medium (5)</span>
                <span>Critical (10)</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Rationale (optional)</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Why is this asset critical or not?"
                rows={3}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-orange-400"
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSaveValue} className="flex-1">
                Save Value
              </Button>
              <button
                onClick={() => setSelectedAsset(null)}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {values.size > 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-white mb-3">Summary</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-red-900/20 border border-red-600/30 rounded p-2 text-center">
              <p className="text-xs text-slate-400">Critical (8-10)</p>
              <p className="text-lg font-bold text-red-400">
                {Array.from(values.values()).filter((v) => v.value >= 8).length}
              </p>
            </div>
            <div className="bg-orange-900/20 border border-orange-600/30 rounded p-2 text-center">
              <p className="text-xs text-slate-400">High (6-7)</p>
              <p className="text-lg font-bold text-orange-400">
                {Array.from(values.values()).filter((v) => v.value >= 6 && v.value < 8).length}
              </p>
            </div>
            <div className="bg-yellow-900/20 border border-yellow-600/30 rounded p-2 text-center">
              <p className="text-xs text-slate-400">Medium (4-5)</p>
              <p className="text-lg font-bold text-yellow-400">
                {Array.from(values.values()).filter((v) => v.value >= 4 && v.value < 6).length}
              </p>
            </div>
            <div className="bg-green-900/20 border border-green-600/30 rounded p-2 text-center">
              <p className="text-xs text-slate-400">Low (1-3)</p>
              <p className="text-lg font-bold text-green-400">
                {Array.from(values.values()).filter((v) => v.value < 4).length}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
