'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/common/Button';

interface Finding {
  id: string;
  assetType: 'Node' | 'Edge';
  assetId: string;
  assetName: string;
  severity: number;
  normReference: string;
  description?: string;
}

interface Measure {
  id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  dueDate?: string;
}

export default function FindingsAndMeasures({ projectId }: { projectId: string }) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null);
  const [newMeasure, setNewMeasure] = useState({
    title: '',
    description: '',
    priority: 'Medium',
    dueDate: '',
  });

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [findingsRes, measuresRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/findings`),
        fetch(`/api/projects/${projectId}/measures`),
      ]);

      if (findingsRes.ok) {
        const data = await findingsRes.json();
        setFindings(data);
      }

      if (measuresRes.ok) {
        const data = await measuresRes.json();
        setMeasures(data);
      }
    } catch (error) {
      console.error('Failed to fetch:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAutoGenerateFindings = async () => {
    try {
      setIsGenerating(true);
      const response = await fetch(`/api/projects/${projectId}/auto-generate`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Auto-generation failed');
      }

      await fetchData();
    } catch (error) {
      console.error('Auto-generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateMeasure = async () => {
    if (!newMeasure.title || !selectedFinding) return;
    const finding = findings.find((item) => item.id === selectedFinding);
    if (!finding) return;

    try {
      const response = await fetch(`/api/projects/${projectId}/measures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          findingId: selectedFinding,
          title: newMeasure.title,
          description: newMeasure.description,
          assetType: finding.assetType,
          assetId: finding.assetId,
          priority: newMeasure.priority,
          dueDate: newMeasure.dueDate,
        }),
      });

      if (!response.ok) throw new Error('Failed to create measure');

      const measure = await response.json();
      setMeasures([...measures, measure]);
      setNewMeasure({ title: '', description: '', priority: 'Medium', dueDate: '' });
      setSelectedFinding(null);
    } catch (error) {
      console.error('Failed to create measure:', error);
    }
  };

  if (isLoading) {
    return <div className="text-slate-400">Loading findings...</div>;
  }

  const riskStats = {
    critical: findings.filter((f) => f.severity >= 8).length,
    high: findings.filter((f) => f.severity >= 6 && f.severity < 8).length,
    medium: findings.filter((f) => f.severity >= 4 && f.severity < 6).length,
    low: findings.filter((f) => f.severity < 4).length,
  };

  const measureStats = {
    open: measures.filter((m) => m.status === 'Open').length,
    inProgress: measures.filter((m) => m.status === 'InProgress').length,
    done: measures.filter((m) => m.status === 'Done').length,
  };

  return (
    <div className="space-y-6">
      {/* Risk Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-4 text-center">
          <p className="text-xs text-slate-400 mb-1">Critical</p>
          <p className="text-3xl font-bold text-red-400">{riskStats.critical}</p>
        </div>
        <div className="bg-orange-900/20 border border-orange-600/30 rounded-lg p-4 text-center">
          <p className="text-xs text-slate-400 mb-1">High</p>
          <p className="text-3xl font-bold text-orange-400">{riskStats.high}</p>
        </div>
        <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4 text-center">
          <p className="text-xs text-slate-400 mb-1">Medium</p>
          <p className="text-3xl font-bold text-yellow-400">{riskStats.medium}</p>
        </div>
        <div className="bg-green-900/20 border border-green-600/30 rounded-lg p-4 text-center">
          <p className="text-xs text-slate-400 mb-1">Low</p>
          <p className="text-3xl font-bold text-green-400">{riskStats.low}</p>
        </div>
      </div>

      {/* Auto-Generate Button */}
      {findings.length === 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 text-center">
          <p className="text-slate-300 mb-4">No findings yet. Auto-generate from assessment answers.</p>
          <Button onClick={handleAutoGenerateFindings} disabled={isGenerating}>
            {isGenerating ? 'Generating...' : '🤖 Auto-Generate Findings'}
          </Button>
        </div>
      )}

      {/* Findings List */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-white">Security Findings ({findings.length})</h3>
        {findings.map((finding) => (
          <div
            key={finding.id}
            onClick={() => setSelectedFinding(finding.id)}
            className={`p-4 rounded-lg border cursor-pointer transition-all ${
              selectedFinding === finding.id
                ? 'border-orange-400 bg-slate-700/50'
                : 'border-slate-600 bg-slate-800/30 hover:border-slate-500'
            }`}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <p className="text-white font-medium">{finding.assetName}: {finding.description}</p>
                <div className="flex gap-2 mt-2">
                  <span className="text-xs bg-slate-700 px-2 py-1 rounded">{finding.normReference}</span>
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded ${
                      finding.severity >= 8
                        ? 'bg-red-900/30 text-red-300'
                        : finding.severity >= 6
                        ? 'bg-orange-900/30 text-orange-300'
                        : finding.severity >= 4
                        ? 'bg-yellow-900/30 text-yellow-300'
                        : 'bg-green-900/30 text-green-300'
                    }`}
                  >
                    Severity: {finding.severity}/10
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Measure Editor */}
      {selectedFinding && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Create Remediation Measure</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Measure Title *</label>
              <input
                type="text"
                value={newMeasure.title}
                onChange={(e) => setNewMeasure({ ...newMeasure, title: e.target.value })}
                placeholder="e.g. Enable TLS encryption on interface"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-orange-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Description</label>
              <textarea
                value={newMeasure.description}
                onChange={(e) => setNewMeasure({ ...newMeasure, description: e.target.value })}
                placeholder="Implementation details..."
                rows={3}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-orange-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Priority</label>
                <select
                  value={newMeasure.priority}
                  onChange={(e) => setNewMeasure({ ...newMeasure, priority: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-400"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Due Date</label>
                <input
                  type="date"
                  value={newMeasure.dueDate}
                  onChange={(e) => setNewMeasure({ ...newMeasure, dueDate: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-400"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCreateMeasure} className="flex-1">
                Create Measure
              </Button>
              <button
                onClick={() => setSelectedFinding(null)}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Measures List */}
      {measures.length > 0 && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">Remediation Measures ({measures.length})</h3>
            <div className="flex gap-2 text-xs">
              <span className="bg-slate-700 px-2 py-1 rounded">Open: {measureStats.open}</span>
              <span className="bg-slate-700 px-2 py-1 rounded">In Progress: {measureStats.inProgress}</span>
              <span className="bg-slate-700 px-2 py-1 rounded">Done: {measureStats.done}</span>
            </div>
          </div>

          {measures.map((measure) => (
            <div key={measure.id} className="p-4 rounded-lg border border-slate-600 bg-slate-800/30">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="text-white font-medium">{measure.title}</p>
                  {measure.description && <p className="text-sm text-slate-400 mt-1">{measure.description}</p>}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded ${
                        measure.priority === 'Critical'
                          ? 'bg-red-900/30 text-red-300'
                          : measure.priority === 'High'
                          ? 'bg-orange-900/30 text-orange-300'
                          : measure.priority === 'Medium'
                          ? 'bg-yellow-900/30 text-yellow-300'
                          : 'bg-green-900/30 text-green-300'
                      }`}
                    >
                      {measure.priority}
                    </span>
                    <span className="text-xs bg-slate-700 px-2 py-1 rounded">{measure.status}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
