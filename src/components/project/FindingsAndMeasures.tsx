'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import Button from '@/components/common/Button';

type AssetType = 'Node' | 'Edge';
type MeasurePriority = 'Low' | 'Medium' | 'High' | 'Critical';
type MeasureStatus = 'Open' | 'InProgress' | 'Done';
type SeverityFilter = 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type FindingsSort = 'SEVERITY_DESC' | 'SEVERITY_ASC' | 'NEWEST' | 'OLDEST';
type MeasuresSort = 'PRIORITY_DESC' | 'PRIORITY_ASC' | 'DUE_ASC' | 'DUE_DESC' | 'NEWEST' | 'OLDEST';
type RiskLevel = 'Unknown' | 'Low' | 'Medium' | 'High' | 'Critical';
type QuestionSort = 'FULFILLMENT_ASC' | 'FULFILLMENT_DESC' | 'ASSET_RATING_DESC' | 'LATEST_ANSWER';

interface Finding {
  id: string;
  assetType: AssetType;
  assetId: string;
  assetName: string;
  questionText: string;
  severity: number;
  normReference: string;
  description?: string | null;
  createdAt?: string;
}

interface Measure {
  id: string;
  findingId: string;
  title: string;
  description?: string | null;
  priority: MeasurePriority;
  status: MeasureStatus;
  dueDate?: string | null;
  assignedTo?: string | null;
  createdAt?: string;
}

interface AssetValue {
  assetType: 'Node' | 'Edge' | 'DataObject';
  assetId: string;
  value: number;
}

interface NodeOption {
  id: string;
  name: string;
  category?: string | null;
}

interface EdgeOption {
  id: string;
  name?: string | null;
  protocol?: string | null;
  sourceNode?: { id: string; name: string };
  targetNode?: { id: string; name: string };
}

interface QuestionAnswer {
  id: string;
  answerValue?: string | null;
  targetType?: 'Component' | 'Edge' | 'DataObject' | 'None' | null;
  targetId?: string | null;
  createdAt?: string;
}

interface Question {
  id: string;
  text: string;
  normReference: string;
  targetType: 'Component' | 'Edge' | 'DataObject' | 'None';
  answers?: QuestionAnswer[];
}

interface QuestionInsight {
  questionId: string;
  questionText: string;
  normReference: string;
  targetType: 'Component' | 'Edge' | 'DataObject' | 'None';
  fulfillmentAverage: number | null;
  fulfillmentCount: number;
  maxAssetValue: number | null;
  latestAnswerTs: number;
  candidateAssetType: AssetType | null;
  candidateAssetId: string | null;
  candidateAssetName: string;
}

interface FindingsAndMeasuresProps {
  projectId: string;
  canEdit?: boolean;
}

interface NewMeasureForm {
  title: string;
  description: string;
  priority: MeasurePriority;
  status: MeasureStatus;
  dueDate: string;
  assignedTo: string;
}

interface FindingEditForm {
  questionText: string;
  normReference: string;
  severity: number;
  description: string;
}

const priorityRank: Record<MeasurePriority, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

const severityBadgeClass = (severity: number): string => {
  if (severity >= 8) return 'bg-red-900/30 text-red-300';
  if (severity >= 6) return 'bg-orange-900/30 text-orange-300';
  if (severity >= 4) return 'bg-yellow-900/30 text-yellow-300';
  return 'bg-green-900/30 text-green-300';
};

const priorityBadgeClass = (priority: MeasurePriority): string => {
  if (priority === 'Critical') return 'bg-red-900/30 text-red-300';
  if (priority === 'High') return 'bg-orange-900/30 text-orange-300';
  if (priority === 'Medium') return 'bg-yellow-900/30 text-yellow-300';
  return 'bg-green-900/30 text-green-300';
};

const statusBadgeClass = (status: MeasureStatus): string => {
  if (status === 'Done') return 'bg-green-900/30 text-green-300';
  if (status === 'InProgress') return 'bg-orange-900/30 text-orange-300';
  return 'bg-slate-700 text-slate-200';
};

const riskBadgeClass = (level: RiskLevel): string => {
  if (level === 'Critical') return 'bg-red-900/30 text-red-300';
  if (level === 'High') return 'bg-orange-900/30 text-orange-300';
  if (level === 'Medium') return 'bg-yellow-900/30 text-yellow-300';
  if (level === 'Low') return 'bg-green-900/30 text-green-300';
  return 'bg-slate-700 text-slate-200';
};

const severityLabel = (severity: number): 'Critical' | 'High' | 'Medium' | 'Low' => {
  if (severity >= 8) return 'Critical';
  if (severity >= 6) return 'High';
  if (severity >= 4) return 'Medium';
  return 'Low';
};

const toDateInputValue = (value?: string | null): string => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

const isContainerCategory = (value: string | null | undefined): boolean => {
  const normalized = (value || '').toLowerCase().trim();
  return normalized === 'container' || normalized === 'system';
};

const edgeLabel = (edge: EdgeOption): string => {
  if (edge.name && edge.name.trim()) return edge.name;
  const sourceName = edge.sourceNode?.name || 'Source';
  const targetName = edge.targetNode?.name || 'Target';
  return `${sourceName} -> ${targetName}`;
};

const parseFulfillmentValue = (value?: string | null): number | null => {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === 'N/A') return null;
  if (normalized === 'YES') return 10;
  if (normalized === 'NO') return 0;
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10) return null;
  return parsed;
};

const clampSeverity = (value: number): number => Math.max(1, Math.min(10, Math.round(value)));

export default function FindingsAndMeasures({ projectId, canEdit = true }: FindingsAndMeasuresProps) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [assetValues, setAssetValues] = useState<AssetValue[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [nodes, setNodes] = useState<NodeOption[]>([]);
  const [edges, setEdges] = useState<EdgeOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingMeasure, setIsSavingMeasure] = useState(false);
  const [isSavingFinding, setIsSavingFinding] = useState(false);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [showCreateFinding, setShowCreateFinding] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [findingsFilterText, setFindingsFilterText] = useState('');
  const [findingsSeverityFilter, setFindingsSeverityFilter] = useState<SeverityFilter>('ALL');
  const [findingsSort, setFindingsSort] = useState<FindingsSort>('SEVERITY_DESC');
  const [measuresFilterText, setMeasuresFilterText] = useState('');
  const [measuresStatusFilter, setMeasuresStatusFilter] = useState<'ALL' | MeasureStatus>('ALL');
  const [measuresPriorityFilter, setMeasuresPriorityFilter] = useState<'ALL' | MeasurePriority>('ALL');
  const [measuresSort, setMeasuresSort] = useState<MeasuresSort>('PRIORITY_DESC');
  const [questionFilterText, setQuestionFilterText] = useState('');
  const [questionSort, setQuestionSort] = useState<QuestionSort>('FULFILLMENT_ASC');
  const [questionMinAssetValue, setQuestionMinAssetValue] = useState(7);
  const [onlyHighRatedQuestionAssets, setOnlyHighRatedQuestionAssets] = useState(true);
  const [selectedQuestionTemplateId, setSelectedQuestionTemplateId] = useState('');
  const [editingFindingId, setEditingFindingId] = useState<string | null>(null);
  const [newFinding, setNewFinding] = useState({
    assetType: 'Node' as AssetType,
    assetId: '',
    questionText: '',
    normReference: 'IEC 62443',
    severity: 6,
    description: '',
  });
  const [findingEdit, setFindingEdit] = useState<FindingEditForm>({
    questionText: '',
    normReference: '',
    severity: 6,
    description: '',
  });
  const [newMeasure, setNewMeasure] = useState<NewMeasureForm>({
    title: '',
    description: '',
    priority: 'Medium',
    status: 'Open',
    dueDate: '',
    assignedTo: '',
  });

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setActionError('');
      const [findingsRes, measuresRes, assetValuesRes, nodesRes, edgesRes, questionsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/findings`),
        fetch(`/api/projects/${projectId}/measures`),
        fetch(`/api/projects/${projectId}/asset-values`),
        fetch(`/api/projects/${projectId}/nodes`),
        fetch(`/api/projects/${projectId}/edges`),
        fetch(`/api/projects/${projectId}/questions`),
      ]);

      if (!findingsRes.ok || !measuresRes.ok || !assetValuesRes.ok || !nodesRes.ok || !edgesRes.ok || !questionsRes.ok) {
        throw new Error('Failed to load findings and measures data');
      }

      const [findingsData, measuresData, assetValuesData, nodesData, edgesData, questionsData] = await Promise.all([
        findingsRes.json() as Promise<Finding[]>,
        measuresRes.json() as Promise<Measure[]>,
        assetValuesRes.json() as Promise<AssetValue[]>,
        nodesRes.json() as Promise<NodeOption[]>,
        edgesRes.json() as Promise<EdgeOption[]>,
        questionsRes.json() as Promise<Question[]>,
      ]);

      setFindings(Array.isArray(findingsData) ? findingsData : []);
      setMeasures(Array.isArray(measuresData) ? measuresData : []);
      setAssetValues(Array.isArray(assetValuesData) ? assetValuesData : []);
      setNodes(Array.isArray(nodesData) ? nodesData : []);
      setEdges(Array.isArray(edgesData) ? edgesData : []);
      setQuestions(Array.isArray(questionsData) ? questionsData : []);
    } catch (fetchError) {
      setActionError((fetchError as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [projectId]);

  useEffect(() => {
    if (!selectedFindingId) return;
    if (!findings.some((finding) => finding.id === selectedFindingId)) {
      setSelectedFindingId(null);
    }
  }, [findings, selectedFindingId]);

  const findingById = useMemo(() => {
    return new Map(findings.map((finding) => [finding.id, finding]));
  }, [findings]);

  const selectedFinding = selectedFindingId ? findingById.get(selectedFindingId) || null : null;

  const nodeAssetOptions = useMemo(
    () => nodes.filter((node) => !isContainerCategory(node.category)).sort((a, b) => a.name.localeCompare(b.name)),
    [nodes]
  );

  const edgeAssetOptions = useMemo(
    () => [...edges].sort((a, b) => edgeLabel(a).localeCompare(edgeLabel(b))),
    [edges]
  );

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const edgeById = useMemo(() => new Map(edges.map((edge) => [edge.id, edge])), [edges]);

  const newFindingAssetOptions = useMemo(() => {
    if (newFinding.assetType === 'Node') {
      return nodeAssetOptions.map((node) => ({ id: node.id, label: node.name }));
    }
    return edgeAssetOptions.map((edge) => ({ id: edge.id, label: edgeLabel(edge) }));
  }, [newFinding.assetType, nodeAssetOptions, edgeAssetOptions]);

  useEffect(() => {
    if (newFindingAssetOptions.length === 0) {
      if (newFinding.assetId !== '') {
        setNewFinding((prev) => ({ ...prev, assetId: '' }));
      }
      return;
    }
    const hasAsset = newFindingAssetOptions.some((asset) => asset.id === newFinding.assetId);
    if (!hasAsset) {
      setNewFinding((prev) => ({ ...prev, assetId: newFindingAssetOptions[0].id }));
    }
  }, [newFindingAssetOptions, newFinding.assetId]);

  const measuresByFindingId = useMemo(() => {
    const map = new Map<string, Measure[]>();
    measures.forEach((measure) => {
      const list = map.get(measure.findingId) || [];
      list.push(measure);
      map.set(measure.findingId, list);
    });
    return map;
  }, [measures]);

  const assetValueByAssetKey = useMemo(() => {
    const map = new Map<string, number>();
    assetValues.forEach((assetValue) => {
      if (assetValue.assetType !== 'Node' && assetValue.assetType !== 'Edge') {
        return;
      }
      map.set(`${assetValue.assetType}:${assetValue.assetId}`, assetValue.value);
    });
    return map;
  }, [assetValues]);

  const questionInsights = useMemo(() => {
    const insights: QuestionInsight[] = questions.map((question) => {
      const answers = question.answers || [];
      const numericFulfillmentValues = answers
        .map((answer) => parseFulfillmentValue(answer.answerValue))
        .filter((value): value is number => typeof value === 'number');

      const fulfillmentAverage =
        numericFulfillmentValues.length > 0
          ? numericFulfillmentValues.reduce((sum, value) => sum + value, 0) / numericFulfillmentValues.length
          : null;

      const latestAnswerTs = answers.reduce((latest, answer) => {
        const ts = answer.createdAt ? new Date(answer.createdAt).getTime() : 0;
        return Number.isFinite(ts) ? Math.max(latest, ts) : latest;
      }, 0);

      const answerAssetRefs = answers
        .map((answer) => {
          if (!answer.targetId) return null;
          if (answer.targetType === 'Component') {
            const node = nodeById.get(answer.targetId);
            if (!node || isContainerCategory(node.category)) return null;
            return {
              assetType: 'Node' as const,
              assetId: answer.targetId,
              assetName: node.name,
              assetValue: assetValueByAssetKey.get(`Node:${answer.targetId}`) ?? null,
            };
          }
          if (answer.targetType === 'Edge') {
            const edge = edgeById.get(answer.targetId);
            if (!edge) return null;
            return {
              assetType: 'Edge' as const,
              assetId: answer.targetId,
              assetName: edgeLabel(edge),
              assetValue: assetValueByAssetKey.get(`Edge:${answer.targetId}`) ?? null,
            };
          }
          return null;
        })
        .filter(
          (
            ref
          ): ref is { assetType: AssetType; assetId: string; assetName: string; assetValue: number | null } =>
            Boolean(ref)
        );

      const bestAssetRef =
        answerAssetRefs
          .slice()
          .sort((a, b) => {
            const aValue = typeof a.assetValue === 'number' ? a.assetValue : -1;
            const bValue = typeof b.assetValue === 'number' ? b.assetValue : -1;
            if (bValue !== aValue) return bValue - aValue;
            return a.assetName.localeCompare(b.assetName);
          })[0] || null;

      const maxAssetValue =
        answerAssetRefs.length > 0
          ? answerAssetRefs.reduce((max, ref) => {
              if (typeof ref.assetValue !== 'number') return max;
              return max === null ? ref.assetValue : Math.max(max, ref.assetValue);
            }, null as number | null)
          : null;

      return {
        questionId: question.id,
        questionText: question.text,
        normReference: question.normReference,
        targetType: question.targetType,
        fulfillmentAverage,
        fulfillmentCount: numericFulfillmentValues.length,
        maxAssetValue,
        latestAnswerTs,
        candidateAssetType: bestAssetRef?.assetType || null,
        candidateAssetId: bestAssetRef?.assetId || null,
        candidateAssetName: bestAssetRef?.assetName || 'No mapped asset',
      };
    });

    return insights;
  }, [assetValueByAssetKey, edgeById, nodeById, questions]);

  const questionInsightById = useMemo(() => {
    return new Map(questionInsights.map((insight) => [insight.questionId, insight]));
  }, [questionInsights]);

  const findingRisk = (finding: Finding): { score: number | null; level: RiskLevel } => {
    const assetValue = assetValueByAssetKey.get(`${finding.assetType}:${finding.assetId}`);
    if (typeof assetValue !== 'number') {
      return { score: null, level: 'Unknown' };
    }
    const score = Math.max(1, Math.min(100, Math.round(assetValue * finding.severity)));
    const level: RiskLevel = score >= 81 ? 'Critical' : score >= 51 ? 'High' : score >= 21 ? 'Medium' : 'Low';
    return { score, level };
  };

  const handleAutoGenerateFindings = async () => {
    if (!canEdit) {
      return;
    }

    try {
      setIsGenerating(true);
      setActionError('');
      setActionMessage('');
      const response = await fetch(`/api/projects/${projectId}/auto-generate`, {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        findingsGenerated?: number;
        measuresGenerated?: number;
      };
      if (!response.ok) {
        throw new Error(payload.error || 'Auto-generation failed');
      }

      setActionMessage(
        `Generated ${payload.findingsGenerated || 0} finding(s) and ${payload.measuresGenerated || 0} measure(s).`
      );
      await fetchData();
    } catch (generateError) {
      setActionError((generateError as Error).message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateFinding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) return;
    const questionText = newFinding.questionText.trim();
    const normReference = newFinding.normReference.trim();
    if (!newFinding.assetId || !questionText || !normReference) {
      setActionError('Asset, question text and norm reference are required.');
      return;
    }

    try {
      setIsSavingFinding(true);
      setActionError('');
      setActionMessage('');
      const response = await fetch(`/api/projects/${projectId}/findings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetType: newFinding.assetType,
          assetId: newFinding.assetId,
          questionText,
          normReference,
          severity: Math.max(1, Math.min(10, Math.round(newFinding.severity))),
          description: newFinding.description.trim() || undefined,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as Finding & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Failed to create finding');
      setActionMessage('Finding created.');
      setShowCreateFinding(false);
      setSelectedFindingId(payload.id);
      setNewFinding((prev) => ({
        ...prev,
        questionText: '',
        description: '',
      }));
      setSelectedQuestionTemplateId('');
      await fetchData();
    } catch (createError) {
      setActionError((createError as Error).message);
    } finally {
      setIsSavingFinding(false);
    }
  };

  const handleUseQuestionForFinding = (insight: QuestionInsight) => {
    if (!canEdit || !insight.candidateAssetType || !insight.candidateAssetId) {
      return;
    }

    const fulfillmentPenalty =
      insight.fulfillmentAverage === null ? 4 : Math.max(0, 10 - insight.fulfillmentAverage);
    const assetPressure = insight.maxAssetValue || 5;
    const recommendedSeverity = clampSeverity((fulfillmentPenalty + assetPressure) / 2);

    setShowCreateFinding(true);
    setSelectedQuestionTemplateId(insight.questionId);
    setNewFinding((prev) => ({
      ...prev,
      assetType: insight.candidateAssetType,
      assetId: insight.candidateAssetId,
      questionText: insight.questionText,
      normReference: insight.normReference || prev.normReference,
      severity: recommendedSeverity,
    }));

    setActionMessage('Question applied to finding draft.');
    setActionError('');
  };

  const handleSelectQuestionTemplate = (questionId: string) => {
    setSelectedQuestionTemplateId(questionId);
    const insight = questionInsightById.get(questionId);
    if (!insight) {
      return;
    }

    const fulfillmentPenalty =
      insight.fulfillmentAverage === null ? 4 : Math.max(0, 10 - insight.fulfillmentAverage);
    const assetPressure = insight.maxAssetValue || 5;
    const recommendedSeverity = clampSeverity((fulfillmentPenalty + assetPressure) / 2);

    setNewFinding((prev) => ({
      ...prev,
      assetType: insight.candidateAssetType || prev.assetType,
      assetId: insight.candidateAssetId || prev.assetId,
      questionText: insight.questionText,
      normReference: insight.normReference || prev.normReference,
      severity: recommendedSeverity,
    }));
  };

  const handleCreateMeasure = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || !newMeasure.title.trim() || !selectedFindingId) return;
    const finding = findings.find((item) => item.id === selectedFindingId);
    if (!finding) return;

    try {
      setIsSavingMeasure(true);
      setActionError('');
      setActionMessage('');
      const response = await fetch(`/api/projects/${projectId}/measures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          findingId: selectedFindingId,
          title: newMeasure.title,
          description: newMeasure.description,
          assetType: finding.assetType,
          assetId: finding.assetId,
          priority: newMeasure.priority,
          status: newMeasure.status,
          assignedTo: newMeasure.assignedTo || undefined,
          dueDate: newMeasure.dueDate || undefined,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Failed to create measure');

      setNewMeasure({
        title: '',
        description: '',
        priority: 'Medium',
        status: 'Open',
        dueDate: '',
        assignedTo: '',
      });
      setSelectedFindingId(null);
      setActionMessage('Measure created.');
      await fetchData();
    } catch (createError) {
      setActionError((createError as Error).message);
    } finally {
      setIsSavingMeasure(false);
    }
  };

  const startFindingEdit = (finding: Finding) => {
    setEditingFindingId(finding.id);
    setFindingEdit({
      questionText: finding.questionText,
      normReference: finding.normReference,
      severity: finding.severity,
      description: finding.description || '',
    });
  };

  const handleUpdateFinding = async (findingId: string) => {
    if (!canEdit) return;
    try {
      setIsSavingFinding(true);
      setActionError('');
      setActionMessage('');
      const response = await fetch(`/api/projects/${projectId}/findings/${findingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionText: findingEdit.questionText.trim(),
          normReference: findingEdit.normReference.trim(),
          severity: Math.max(1, Math.min(10, Math.round(findingEdit.severity))),
          description: findingEdit.description.trim() || undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Failed to update finding');
      setEditingFindingId(null);
      setActionMessage('Finding updated.');
      await fetchData();
    } catch (updateError) {
      setActionError((updateError as Error).message);
    } finally {
      setIsSavingFinding(false);
    }
  };

  const handleDeleteFinding = async (findingId: string) => {
    if (!canEdit) return;
    if (!window.confirm('Delete this finding and all linked measures?')) return;
    try {
      setActionError('');
      setActionMessage('');
      const response = await fetch(`/api/projects/${projectId}/findings/${findingId}`, {
        method: 'DELETE',
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Failed to delete finding');
      if (selectedFindingId === findingId) {
        setSelectedFindingId(null);
      }
      setActionMessage('Finding deleted.');
      await fetchData();
    } catch (deleteError) {
      setActionError((deleteError as Error).message);
    }
  };

  const handleQuickMeasureStatus = async (measure: Measure, nextStatus: MeasureStatus) => {
    if (!canEdit || measure.status === nextStatus) return;
    try {
      setActionError('');
      const response = await fetch(`/api/projects/${projectId}/measures/${measure.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Failed to update measure status');
      setMeasures((prev) => prev.map((entry) => (entry.id === measure.id ? { ...entry, status: nextStatus } : entry)));
    } catch (statusError) {
      setActionError((statusError as Error).message);
    }
  };

  const handleEditMeasure = async (measure: Measure) => {
    if (!canEdit) return;

    const nextTitle = window.prompt('Measure title', measure.title);
    if (nextTitle === null) return;

    const nextDescription = window.prompt('Description', measure.description || '');
    if (nextDescription === null) return;

    const nextPriority = window.prompt('Priority (Low, Medium, High, Critical)', measure.priority);
    if (nextPriority === null) return;
    if (!['Low', 'Medium', 'High', 'Critical'].includes(nextPriority)) {
      setActionError('Invalid priority. Allowed: Low, Medium, High, Critical.');
      return;
    }

    const nextAssignedTo = window.prompt('Assigned To (empty clears)', measure.assignedTo || '');
    if (nextAssignedTo === null) return;

    const nextDueDate = window.prompt('Due Date YYYY-MM-DD (empty clears)', toDateInputValue(measure.dueDate));
    if (nextDueDate === null) return;

    try {
      setActionError('');
      setActionMessage('');
      const response = await fetch(`/api/projects/${projectId}/measures/${measure.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: nextTitle.trim(),
          description: nextDescription.trim() || undefined,
          priority: nextPriority,
          assignedTo: nextAssignedTo.trim() || '',
          dueDate: nextDueDate.trim() || null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Failed to update measure');
      setActionMessage('Measure updated.');
      await fetchData();
    } catch (updateError) {
      setActionError((updateError as Error).message);
    }
  };

  const handleDeleteMeasure = async (measureId: string) => {
    if (!canEdit) return;
    if (!window.confirm('Delete this measure?')) return;
    try {
      setActionError('');
      setActionMessage('');
      const response = await fetch(`/api/projects/${projectId}/measures/${measureId}`, {
        method: 'DELETE',
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Failed to delete measure');
      setActionMessage('Measure deleted.');
      await fetchData();
    } catch (deleteError) {
      setActionError((deleteError as Error).message);
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
    completionRate:
      measures.length > 0 ? Math.round((measures.filter((m) => m.status === 'Done').length / measures.length) * 100) : 0,
  };

  const filteredQuestionInsights = questionInsights
    .filter((insight) => {
      if (!insight.candidateAssetType || !insight.candidateAssetId) {
        return false;
      }

      if (onlyHighRatedQuestionAssets) {
        if (typeof insight.maxAssetValue !== 'number' || insight.maxAssetValue < questionMinAssetValue) {
          return false;
        }
      }

      const search = questionFilterText.trim().toLowerCase();
      if (!search) return true;

      const haystack = [
        insight.questionText,
        insight.normReference,
        insight.candidateAssetName,
        insight.targetType,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    })
    .sort((a, b) => {
      if (questionSort === 'FULFILLMENT_ASC') {
        const aValue = a.fulfillmentAverage ?? Number.POSITIVE_INFINITY;
        const bValue = b.fulfillmentAverage ?? Number.POSITIVE_INFINITY;
        return aValue - bValue;
      }
      if (questionSort === 'FULFILLMENT_DESC') {
        const aValue = a.fulfillmentAverage ?? Number.NEGATIVE_INFINITY;
        const bValue = b.fulfillmentAverage ?? Number.NEGATIVE_INFINITY;
        return bValue - aValue;
      }
      if (questionSort === 'ASSET_RATING_DESC') {
        const aValue = a.maxAssetValue ?? Number.NEGATIVE_INFINITY;
        const bValue = b.maxAssetValue ?? Number.NEGATIVE_INFINITY;
        return bValue - aValue;
      }
      return b.latestAnswerTs - a.latestAnswerTs;
    });

  const filteredFindings = findings
    .filter((finding) => {
      if (findingsSeverityFilter !== 'ALL') {
        const label = severityLabel(finding.severity);
        if (
          (findingsSeverityFilter === 'CRITICAL' && label !== 'Critical') ||
          (findingsSeverityFilter === 'HIGH' && label !== 'High') ||
          (findingsSeverityFilter === 'MEDIUM' && label !== 'Medium') ||
          (findingsSeverityFilter === 'LOW' && label !== 'Low')
        ) {
          return false;
        }
      }

      const search = findingsFilterText.trim().toLowerCase();
      if (!search) return true;
      const haystack = [finding.assetName, finding.questionText, finding.description || '', finding.normReference]
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    })
    .sort((a, b) => {
      if (findingsSort === 'SEVERITY_DESC') return b.severity - a.severity;
      if (findingsSort === 'SEVERITY_ASC') return a.severity - b.severity;
      const aTs = new Date(a.createdAt || 0).getTime();
      const bTs = new Date(b.createdAt || 0).getTime();
      if (findingsSort === 'NEWEST') return bTs - aTs;
      return aTs - bTs;
    });

  const filteredMeasures = measures
    .filter((measure) => {
      if (measuresStatusFilter !== 'ALL' && measure.status !== measuresStatusFilter) return false;
      if (measuresPriorityFilter !== 'ALL' && measure.priority !== measuresPriorityFilter) return false;
      if (selectedFindingId && measure.findingId !== selectedFindingId) return false;

      const search = measuresFilterText.trim().toLowerCase();
      if (!search) return true;
      const parentFinding = findingById.get(measure.findingId);
      const haystack = [measure.title, measure.description || '', measure.assignedTo || '', parentFinding?.assetName || '']
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    })
    .sort((a, b) => {
      if (measuresSort === 'PRIORITY_DESC') return priorityRank[b.priority] - priorityRank[a.priority];
      if (measuresSort === 'PRIORITY_ASC') return priorityRank[a.priority] - priorityRank[b.priority];
      if (measuresSort === 'DUE_ASC') {
        const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        return aDue - bDue;
      }
      if (measuresSort === 'DUE_DESC') {
        const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        return bDue - aDue;
      }
      const aTs = new Date(a.createdAt || 0).getTime();
      const bTs = new Date(b.createdAt || 0).getTime();
      if (measuresSort === 'NEWEST') return bTs - aTs;
      return aTs - bTs;
    });

  return (
    <div className="space-y-6">
      {actionError && (
        <div className="rounded border border-red-600/40 bg-red-900/20 p-3 text-sm text-red-200">{actionError}</div>
      )}
      {actionMessage && (
        <div className="rounded border border-green-600/40 bg-green-900/20 p-3 text-sm text-green-200">{actionMessage}</div>
      )}
      {!canEdit && (
        <div className="rounded border border-slate-600 bg-slate-800/40 p-3 text-xs text-slate-300">
          Read-only mode: findings and measures can be viewed but not edited.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
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
        <div className="rounded-lg border border-slate-600 bg-slate-800/50 p-4 text-center">
          <p className="mb-1 text-xs text-slate-400">Open</p>
          <p className="text-3xl font-bold text-slate-200">{measureStats.open}</p>
        </div>
        <div className="rounded-lg border border-slate-600 bg-slate-800/50 p-4 text-center">
          <p className="mb-1 text-xs text-slate-400">In Progress</p>
          <p className="text-3xl font-bold text-slate-200">{measureStats.inProgress}</p>
        </div>
        <div className="rounded-lg border border-slate-600 bg-slate-800/50 p-4 text-center">
          <p className="mb-1 text-xs text-slate-400">Done</p>
          <p className="text-3xl font-bold text-slate-200">{measureStats.done}</p>
        </div>
        <div className="rounded-lg border border-slate-600 bg-slate-800/50 p-4 text-center">
          <p className="mb-1 text-xs text-slate-400">Completion</p>
          <p className="text-3xl font-bold text-slate-200">{measureStats.completionRate}%</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void fetchData()} disabled={isLoading || isGenerating}>
          Refresh
        </Button>
        <Button onClick={handleAutoGenerateFindings} disabled={isGenerating || !canEdit}>
          {isGenerating ? 'Generating...' : 'Auto-Generate Findings'}
        </Button>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowCreateFinding((prev) => !prev)}
            className="rounded-md border border-slate-600 bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-600"
          >
            {showCreateFinding ? 'Cancel New Finding' : 'Create Finding'}
          </button>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-white">Question Inputs For Findings ({filteredQuestionInsights.length})</h3>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={questionFilterText}
              onChange={(event) => setQuestionFilterText(event.target.value)}
              placeholder="Search questions"
              className="rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white"
            />
            <select
              value={questionSort}
              onChange={(event) => setQuestionSort(event.target.value as QuestionSort)}
              className="rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white"
            >
              <option value="FULFILLMENT_ASC">Fulfillment asc</option>
              <option value="FULFILLMENT_DESC">Fulfillment desc</option>
              <option value="ASSET_RATING_DESC">Asset rating desc</option>
              <option value="LATEST_ANSWER">Latest answer</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={onlyHighRatedQuestionAssets}
              onChange={(event) => setOnlyHighRatedQuestionAssets(event.target.checked)}
            />
            Only high-rated assets
          </label>
          <label className="inline-flex items-center gap-2">
            Min asset rating: <span className="font-semibold text-slate-100">{questionMinAssetValue}</span>
            <input
              type="range"
              min={1}
              max={10}
              value={questionMinAssetValue}
              onChange={(event) => setQuestionMinAssetValue(Number.parseInt(event.target.value, 10))}
              className="w-36 accent-orange-500"
              disabled={!onlyHighRatedQuestionAssets}
            />
          </label>
        </div>

        {filteredQuestionInsights.length === 0 ? (
          <div className="rounded border border-slate-700 bg-slate-900/40 p-3 text-sm text-slate-400">
            No question candidates match your filter.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredQuestionInsights.map((insight) => (
              <div key={insight.questionId} className="rounded border border-slate-700 bg-slate-900/40 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{insight.questionText}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Asset: {insight.candidateAssetName} ({insight.candidateAssetType === 'Node' ? 'Component' : 'Interface'})
                    </p>
                    <p className="text-xs text-slate-500">Norm: {insight.normReference || 'n/a'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-slate-700 px-2 py-1 text-slate-200">
                      Fulfillment:{' '}
                      {typeof insight.fulfillmentAverage === 'number'
                        ? `${insight.fulfillmentAverage.toFixed(1)}/10`
                        : 'n/a'}
                    </span>
                    <span className="rounded bg-slate-700 px-2 py-1 text-slate-200">
                      Asset Rating: {typeof insight.maxAssetValue === 'number' ? `${insight.maxAssetValue}/10` : 'n/a'}
                    </span>
                    <span className="rounded bg-slate-700 px-2 py-1 text-slate-200">
                      Answers: {insight.fulfillmentCount}
                    </span>
                  </div>
                </div>
                {canEdit && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => handleUseQuestionForFinding(insight)}
                      className="rounded bg-orange-500 px-3 py-1 text-xs font-semibold text-white hover:bg-orange-600"
                    >
                      Use for Finding
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateFinding && canEdit && (
        <form onSubmit={handleCreateFinding} className="space-y-4 rounded-lg border border-slate-700 bg-slate-800/40 p-4">
          <h3 className="text-lg font-semibold text-white">Create Finding</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Asset Type</label>
              <select
                value={newFinding.assetType}
                onChange={(event) =>
                  setNewFinding((prev) => ({ ...prev, assetType: event.target.value as AssetType, assetId: '' }))
                }
                className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white"
              >
                <option value="Node">Component</option>
                <option value="Edge">Interface</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Asset</label>
              <select
                value={newFinding.assetId}
                onChange={(event) => setNewFinding((prev) => ({ ...prev, assetId: event.target.value }))}
                className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white"
              >
                {newFindingAssetOptions.length === 0 && <option value="">No assets available</option>}
                {newFindingAssetOptions.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">Question Template</label>
            <select
              value={selectedQuestionTemplateId}
              onChange={(event) => handleSelectQuestionTemplate(event.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white"
            >
              <option value="">Manual entry</option>
              {questionInsights.map((insight) => (
                <option key={insight.questionId} value={insight.questionId}>
                  {insight.questionText}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">Question Text</label>
            <input
              type="text"
              value={newFinding.questionText}
              onChange={(event) => setNewFinding((prev) => ({ ...prev, questionText: event.target.value }))}
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Norm Reference</label>
              <input
                type="text"
                value={newFinding.normReference}
                onChange={(event) => setNewFinding((prev) => ({ ...prev, normReference: event.target.value }))}
                className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Severity (1-10)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={newFinding.severity}
                onChange={(event) => setNewFinding((prev) => ({ ...prev, severity: Number(event.target.value) || 1 }))}
                className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white"
              />
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">Description</label>
            <textarea
              rows={3}
              value={newFinding.description}
              onChange={(event) => setNewFinding((prev) => ({ ...prev, description: event.target.value }))}
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={isSavingFinding || newFindingAssetOptions.length === 0}>
              {isSavingFinding ? 'Saving...' : 'Create Finding'}
            </Button>
            <button
              type="button"
              onClick={() => {
                setShowCreateFinding(false);
                setSelectedQuestionTemplateId('');
              }}
              className="rounded-lg bg-slate-700 px-4 py-2 text-white hover:bg-slate-600"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">Security Findings ({filteredFindings.length})</h3>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={findingsFilterText}
              onChange={(event) => setFindingsFilterText(event.target.value)}
              placeholder="Search findings"
              className="rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white"
            />
            <select
              value={findingsSeverityFilter}
              onChange={(event) => setFindingsSeverityFilter(event.target.value as SeverityFilter)}
              className="rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
            <select
              value={findingsSort}
              onChange={(event) => setFindingsSort(event.target.value as FindingsSort)}
              className="rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white"
            >
              <option value="SEVERITY_DESC">Severity desc</option>
              <option value="SEVERITY_ASC">Severity asc</option>
              <option value="NEWEST">Newest</option>
              <option value="OLDEST">Oldest</option>
            </select>
          </div>
        </div>

        {filteredFindings.length === 0 && (
          <div className="rounded border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-400">
            No findings match your filter criteria.
          </div>
        )}

        {filteredFindings.map((finding) => {
          const risk = findingRisk(finding);
          const linkedMeasures = measuresByFindingId.get(finding.id) || [];
          const isSelected = selectedFindingId === finding.id;
          const isEditing = editingFindingId === finding.id;

          return (
            <div
              key={finding.id}
              className={`rounded-lg border p-4 transition-all ${
                isSelected ? 'border-orange-400 bg-slate-700/50' : 'border-slate-600 bg-slate-800/30 hover:border-slate-500'
              }`}
            >
              <div className="flex justify-between items-start gap-3">
                <button type="button" onClick={() => setSelectedFindingId(isSelected ? null : finding.id)} className="text-left">
                  <p className="text-white font-medium">{finding.assetName}</p>
                  <p className="text-sm text-slate-300">{finding.questionText}</p>
                </button>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className={`rounded px-2 py-1 font-semibold ${severityBadgeClass(finding.severity)}`}>
                    {severityLabel(finding.severity)} {finding.severity}/10
                  </span>
                  <span className={`rounded px-2 py-1 font-semibold ${riskBadgeClass(risk.level)}`}>
                    Risk: {risk.score === null ? 'n/a' : `${risk.score} (${risk.level})`}
                  </span>
                  <span className="rounded bg-slate-700 px-2 py-1 text-slate-200">Measures: {linkedMeasures.length}</span>
                </div>
              </div>

              <div className="mt-2 text-xs text-slate-400">Norm: {finding.normReference}</div>
              <p className="mt-2 text-sm text-slate-300">{finding.description || 'No description provided.'}</p>

              {isEditing ? (
                <div className="mt-3 space-y-3 rounded border border-slate-600 bg-slate-900/40 p-3">
                  <input
                    type="text"
                    value={findingEdit.questionText}
                    onChange={(event) => setFindingEdit((prev) => ({ ...prev, questionText: event.target.value }))}
                    className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={findingEdit.normReference}
                      onChange={(event) => setFindingEdit((prev) => ({ ...prev, normReference: event.target.value }))}
                      className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white"
                    />
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={findingEdit.severity}
                      onChange={(event) =>
                        setFindingEdit((prev) => ({ ...prev, severity: Number(event.target.value) || 1 }))
                      }
                      className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <textarea
                    rows={3}
                    value={findingEdit.description}
                    onChange={(event) => setFindingEdit((prev) => ({ ...prev, description: event.target.value }))}
                    className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white"
                  />
                  <div className="flex gap-2">
                    <Button onClick={() => void handleUpdateFinding(finding.id)} disabled={isSavingFinding}>
                      {isSavingFinding ? 'Saving...' : 'Save Finding'}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setEditingFindingId(null)}
                      className="rounded bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                canEdit && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => startFindingEdit(finding)}
                      className="rounded bg-slate-700 px-3 py-1 text-xs text-white hover:bg-slate-600"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteFinding(finding.id)}
                      className="rounded bg-red-900/40 px-3 py-1 text-xs text-red-200 hover:bg-red-900/60"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFindingId(finding.id)}
                      className="rounded bg-orange-900/40 px-3 py-1 text-xs text-orange-200 hover:bg-orange-900/60"
                    >
                      Add Measure
                    </button>
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>

      {selectedFinding && (
        <form onSubmit={handleCreateMeasure} className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
          <h3 className="mb-2 text-lg font-semibold text-white">Create Remediation Measure</h3>
          <p className="mb-4 text-xs text-slate-400">
            Target finding: <span className="font-semibold text-slate-200">{selectedFinding.assetName}</span>
          </p>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Measure Title *</label>
              <input
                type="text"
                value={newMeasure.title}
                onChange={(event) => setNewMeasure((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Enable TLS encryption on interface"
                className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none"
                disabled={!canEdit}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Description</label>
              <textarea
                value={newMeasure.description}
                onChange={(event) => setNewMeasure((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Implementation details..."
                rows={3}
                className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none"
                disabled={!canEdit}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Priority</label>
                <select
                  value={newMeasure.priority}
                  onChange={(event) => setNewMeasure((prev) => ({ ...prev, priority: event.target.value as MeasurePriority }))}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-orange-400 focus:outline-none"
                  disabled={!canEdit}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Status</label>
                <select
                  value={newMeasure.status}
                  onChange={(event) => setNewMeasure((prev) => ({ ...prev, status: event.target.value as MeasureStatus }))}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-orange-400 focus:outline-none"
                  disabled={!canEdit}
                >
                  <option value="Open">Open</option>
                  <option value="InProgress">In Progress</option>
                  <option value="Done">Done</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Due Date</label>
                <input
                  type="date"
                  value={newMeasure.dueDate}
                  onChange={(event) => setNewMeasure((prev) => ({ ...prev, dueDate: event.target.value }))}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-orange-400 focus:outline-none"
                  disabled={!canEdit}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Assigned To</label>
                <input
                  type="text"
                  value={newMeasure.assignedTo}
                  onChange={(event) => setNewMeasure((prev) => ({ ...prev, assignedTo: event.target.value }))}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-orange-400 focus:outline-none"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={!canEdit || isSavingMeasure}>
                {isSavingMeasure ? 'Saving...' : 'Create Measure'}
              </Button>
              <button
                type="button"
                onClick={() => setSelectedFindingId(null)}
                className="flex-1 rounded-lg bg-slate-700 px-4 py-2 text-white transition-colors hover:bg-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-white">Remediation Measures ({filteredMeasures.length})</h3>
          <div className="flex flex-wrap gap-2 text-xs">
            <input
              type="text"
              value={measuresFilterText}
              onChange={(event) => setMeasuresFilterText(event.target.value)}
              placeholder="Search measures"
              className="rounded border border-slate-600 bg-slate-700 px-3 py-1 text-white"
            />
            <select
              value={measuresStatusFilter}
              onChange={(event) => setMeasuresStatusFilter(event.target.value as 'ALL' | MeasureStatus)}
              className="rounded border border-slate-600 bg-slate-700 px-2 py-1 text-white"
            >
              <option value="ALL">All Statuses</option>
              <option value="Open">Open</option>
              <option value="InProgress">In Progress</option>
              <option value="Done">Done</option>
            </select>
            <select
              value={measuresPriorityFilter}
              onChange={(event) => setMeasuresPriorityFilter(event.target.value as 'ALL' | MeasurePriority)}
              className="rounded border border-slate-600 bg-slate-700 px-2 py-1 text-white"
            >
              <option value="ALL">All Priorities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <select
              value={measuresSort}
              onChange={(event) => setMeasuresSort(event.target.value as MeasuresSort)}
              className="rounded border border-slate-600 bg-slate-700 px-2 py-1 text-white"
            >
              <option value="PRIORITY_DESC">Priority desc</option>
              <option value="PRIORITY_ASC">Priority asc</option>
              <option value="DUE_ASC">Due asc</option>
              <option value="DUE_DESC">Due desc</option>
              <option value="NEWEST">Newest</option>
              <option value="OLDEST">Oldest</option>
            </select>
          </div>
        </div>

        {filteredMeasures.length === 0 && (
          <div className="rounded border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-400">
            No measures match your filter criteria.
          </div>
        )}

        {filteredMeasures.map((measure) => {
          const parentFinding = findingById.get(measure.findingId);
          return (
            <div key={measure.id} className="rounded-lg border border-slate-600 bg-slate-800/30 p-4">
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1">
                  <p className="text-white font-medium">{measure.title}</p>
                  {measure.description && <p className="mt-1 text-sm text-slate-400">{measure.description}</p>}
                  <p className="mt-1 text-xs text-slate-500">
                    Finding: {parentFinding?.assetName || 'Unknown'} | Due:{' '}
                    {measure.dueDate ? new Date(measure.dueDate).toLocaleDateString() : 'n/a'}
                  </p>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${priorityBadgeClass(measure.priority)}`}>
                    {measure.priority}
                  </span>
                  <span className={`rounded px-2 py-1 text-xs ${statusBadgeClass(measure.status)}`}>{measure.status}</span>
                  {canEdit && (
                    <select
                      value={measure.status}
                      onChange={(event) =>
                        void handleQuickMeasureStatus(measure, event.target.value as MeasureStatus)
                      }
                      className="rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs text-white"
                    >
                      <option value="Open">Open</option>
                      <option value="InProgress">In Progress</option>
                      <option value="Done">Done</option>
                    </select>
                  )}
                </div>
              </div>
              {canEdit && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleEditMeasure(measure)}
                    className="rounded bg-slate-700 px-3 py-1 text-xs text-white hover:bg-slate-600"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteMeasure(measure.id)}
                    className="rounded bg-red-900/40 px-3 py-1 text-xs text-red-200 hover:bg-red-900/60"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
