'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import Button from '@/components/common/Button';

interface Answer {
  id: string;
  answerValue: string;
  targetType?: string | null;
  targetId?: string | null;
  user?: {
    name: string | null;
    email: string;
  };
  createdAt: string;
  comment?: string | null;
}

interface Question {
  id: string;
  text: string;
  normReference: string;
  targetType: string;
  answerType: string;
  answers?: Answer[];
}

interface AssessmentQuestionsProps {
  projectId: string;
  canEdit?: boolean;
}

interface ComponentOption {
  id: string;
  name: string;
  category: string;
}

interface DataObjectOption {
  id: string;
  name: string;
}

type QuestionTargetType = 'Component' | 'Edge' | 'DataObject' | 'None';
const FULFILLMENT_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;
type FulfillmentNumericValue = (typeof FULFILLMENT_VALUES)[number];
type FulfillmentAnswerValue = FulfillmentNumericValue | 'N/A';
const DEFAULT_FULFILLMENT_VALUE: FulfillmentNumericValue = '10';

const isFulfillmentNumericValue = (value: string): value is FulfillmentNumericValue =>
  FULFILLMENT_VALUES.includes(value as FulfillmentNumericValue);

const isContainerCategory = (category: string | null | undefined): boolean => {
  const normalized = (category || '').trim().toLowerCase();
  return normalized === 'container' || normalized === 'system';
};

const normalizeLegacyAnswerValue = (value: string): FulfillmentAnswerValue | null => {
  const trimmed = value.trim();
  const upper = trimmed.toUpperCase();

  if (upper === 'N/A') {
    return 'N/A';
  }

  if (upper === 'YES') {
    return '10';
  }

  if (upper === 'NO') {
    return '0';
  }

  if (isFulfillmentNumericValue(trimmed)) {
    return trimmed;
  }

  return null;
};

const getAnswerBadgeClass = (value: string): string => {
  const normalized = normalizeLegacyAnswerValue(value);

  if (normalized === 'N/A') {
    return 'bg-slate-600 text-slate-100';
  }

  if (normalized) {
    const numericValue = Number.parseInt(normalized, 10);
    if (numericValue <= 3) {
      return 'bg-red-900/40 text-red-200';
    }
    if (numericValue <= 6) {
      return 'bg-orange-900/40 text-orange-200';
    }
    if (numericValue <= 8) {
      return 'bg-yellow-900/40 text-yellow-200';
    }
    return 'bg-green-900/40 text-green-200';
  }

  return 'bg-slate-700 text-slate-100';
};

const formatAnswerValue = (value: string): string => {
  const normalized = normalizeLegacyAnswerValue(value);
  if (!normalized) {
    return value;
  }

  const upper = value.trim().toUpperCase();
  if (upper === 'YES') {
    return '10/10 (legacy Yes)';
  }
  if (upper === 'NO') {
    return '0/10 (legacy No)';
  }
  if (normalized === 'N/A') {
    return 'N/A';
  }

  return `${normalized}/10`;
};

export default function AssessmentQuestions({ projectId, canEdit = true }: AssessmentQuestionsProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [answerValue, setAnswerValue] = useState<FulfillmentAnswerValue>(DEFAULT_FULFILLMENT_VALUE);
  const [lastNumericAnswerValue, setLastNumericAnswerValue] = useState<FulfillmentNumericValue>(DEFAULT_FULFILLMENT_VALUE);
  const [comment, setComment] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [error, setError] = useState('');
  const [showCreateQuestionForm, setShowCreateQuestionForm] = useState(false);
  const [isCreatingQuestion, setIsCreatingQuestion] = useState(false);
  const [components, setComponents] = useState<ComponentOption[]>([]);
  const [dataObjects, setDataObjects] = useState<DataObjectOption[]>([]);
  const [newQuestion, setNewQuestion] = useState({
    text: '',
    normReference: '',
    targetType: 'None' as QuestionTargetType,
  });

  const componentNameById = useMemo(
    () => new Map(components.map((component) => [component.id, component.name])),
    [components]
  );
  const dataObjectNameById = useMemo(
    () => new Map(dataObjects.map((dataObject) => [dataObject.id, dataObject.name])),
    [dataObjects]
  );

  const fetchQuestions = async () => {
    try {
      setIsLoading(true);
      setError('');
      const response = await fetch(`/api/projects/${projectId}/questions`);
      if (!response.ok) {
        throw new Error('Questions could not be loaded');
      }
      const data = (await response.json()) as Question[];
      setQuestions(data);
      return data;
    } catch (fetchError) {
      setError((fetchError as Error).message);
      throw fetchError;
    } finally {
      setIsLoading(false);
    }
  };

  const fetchQuestionTargets = async () => {
    try {
      const [nodesResponse, dataObjectsResponse] = await Promise.all([
        fetch(`/api/projects/${projectId}/nodes`),
        fetch(`/api/projects/${projectId}/data-objects`),
      ]);

      if (nodesResponse.ok) {
        const nodes = (await nodesResponse.json()) as ComponentOption[];
        setComponents(
          nodes
            .filter((node) => !isContainerCategory(node.category))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      }

      if (dataObjectsResponse.ok) {
        const objects = (await dataObjectsResponse.json()) as DataObjectOption[];
        setDataObjects(objects.sort((a, b) => a.name.localeCompare(b.name)));
      }
    } catch {
      setError('Targets for questions could not be loaded');
    }
  };

  const getNextOpenQuestionId = (questionList: Question[], currentQuestionId: string) => {
    const isUnanswered = (question: Question) => (question.answers?.length || 0) === 0;
    const currentIndex = questionList.findIndex((question) => question.id === currentQuestionId);

    if (currentIndex === -1) {
      return questionList.find(isUnanswered)?.id ?? null;
    }

    const nextUnansweredBelow = questionList.slice(currentIndex + 1).find(isUnanswered);
    if (nextUnansweredBelow) {
      return nextUnansweredBelow.id;
    }

    return questionList.find(isUnanswered)?.id ?? null;
  };

  const resolveAnswerTargetLabel = (answer: Answer): string | null => {
    if (!answer.targetId) {
      return null;
    }

    if (answer.targetType === 'Component') {
      return componentNameById.get(answer.targetId) || answer.targetId;
    }
    if (answer.targetType === 'DataObject') {
      return dataObjectNameById.get(answer.targetId) || answer.targetId;
    }
    if (answer.targetType === 'Edge') {
      return `Interface ${answer.targetId}`;
    }

    return answer.targetId;
  };

  useEffect(() => {
    void Promise.all([fetchQuestions(), fetchQuestionTargets()]).catch(() => undefined);
  }, [projectId]);

  useEffect(() => {
    if (!canEdit && selectedQuestion) {
      setSelectedQuestion(null);
      setSelectedTargetId('');
    }
  }, [canEdit, selectedQuestion]);

  const handleSubmitAnswer = async () => {
    if (!canEdit || !selectedQuestion) {
      return;
    }

    try {
      setError('');
      const currentQuestionId = selectedQuestion;
      const selected = questions.find((question) => question.id === selectedQuestion);
      const targetType: QuestionTargetType =
        selected?.targetType === 'Component' ||
        selected?.targetType === 'Edge' ||
        selected?.targetType === 'DataObject' ||
        selected?.targetType === 'None'
          ? selected.targetType
          : 'None';
      const normalizedTargetId = selectedTargetId.trim();

      const response = await fetch(`/api/projects/${projectId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: selectedQuestion,
          answerValue,
          comment,
          targetType,
          targetId: normalizedTargetId ? normalizedTargetId : undefined,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Answer could not be saved');
      }

      const updatedQuestions = await fetchQuestions();
      const nextOpenQuestionId = getNextOpenQuestionId(updatedQuestions, currentQuestionId);
      setSelectedQuestion(nextOpenQuestionId);
      setAnswerValue(DEFAULT_FULFILLMENT_VALUE);
      setLastNumericAnswerValue(DEFAULT_FULFILLMENT_VALUE);
      setComment('');
      setSelectedTargetId('');
    } catch (submitError) {
      setError((submitError as Error).message);
    }
  };

  const handleCreateQuestion = async (event: FormEvent) => {
    event.preventDefault();

    if (!canEdit) {
      return;
    }

    if (!newQuestion.text.trim()) {
      setError('Question text is required');
      return;
    }

    try {
      setError('');
      setIsCreatingQuestion(true);

      const response = await fetch(`/api/projects/${projectId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: newQuestion.text.trim(),
          normReference: newQuestion.normReference.trim() || undefined,
          targetType: newQuestion.targetType,
          answerType: 'YesNo',
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Question could not be created');
      }

      setNewQuestion({ text: '', normReference: '', targetType: 'None' });
      setShowCreateQuestionForm(false);
      await fetchQuestions();
    } catch (createError) {
      setError((createError as Error).message);
    } finally {
      setIsCreatingQuestion(false);
    }
  };

  if (isLoading) {
    return <div className="text-slate-400">Loading questions...</div>;
  }

  const answeredCount = questions.filter((question) => (question.answers?.length || 0) > 0).length;
  const completionPercent = questions.length === 0 ? 0 : Math.round((answeredCount / questions.length) * 100);

  return (
    <div className="space-y-6">
      {error && <div className="rounded border border-red-600/40 bg-red-900/20 p-3 text-sm text-red-200">{error}</div>}

      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Assessment Progress</h3>
          <span className="text-sm text-slate-300">
            {answeredCount} of {questions.length} answered
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
          <div className="h-full bg-gradient-to-r from-orange-500 to-yellow-500 transition-all" style={{ width: `${completionPercent}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-400">{completionPercent}% complete</p>
      </div>

      {canEdit ? (
        !showCreateQuestionForm ? (
          <Button onClick={() => setShowCreateQuestionForm(true)}>+ Create Custom Question</Button>
        ) : (
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <h3 className="mb-4 text-sm font-semibold text-white">Create Custom Question</h3>
            <form onSubmit={handleCreateQuestion} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-slate-300">Question Text</label>
                <textarea
                  value={newQuestion.text}
                  onChange={(event) => setNewQuestion((prev) => ({ ...prev, text: event.target.value }))}
                  rows={3}
                  placeholder="Enter a custom assessment question..."
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-slate-300">Norm Reference (optional)</label>
                <input
                  type="text"
                  value={newQuestion.normReference}
                  onChange={(event) =>
                    setNewQuestion((prev) => ({ ...prev, normReference: event.target.value }))
                  }
                  placeholder="e.g. IEC 62443-3-3 SR 1.1"
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-slate-300">Target Type</label>
                <select
                  value={newQuestion.targetType}
                  onChange={(event) =>
                    setNewQuestion((prev) => ({
                      ...prev,
                      targetType: event.target.value as QuestionTargetType,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-orange-400 focus:outline-none"
                >
                  <option value="None">None</option>
                  <option value="Component">Component</option>
                  <option value="Edge">Edge</option>
                  <option value="DataObject">Data Object</option>
                </select>
              </div>

              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={isCreatingQuestion}>
                  {isCreatingQuestion ? 'Creating...' : 'Create Question'}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateQuestionForm(false);
                    setNewQuestion({ text: '', normReference: '', targetType: 'None' });
                  }}
                  className="flex-1 rounded-lg bg-slate-700 px-4 py-2 text-white transition-colors hover:bg-slate-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )
      ) : (
        <div className="rounded border border-slate-700 bg-slate-800/40 p-3 text-sm text-slate-300">
          Read-only mode: Viewer cannot submit answers or create questions.
        </div>
      )}

      <div className="space-y-3">
        {questions.map((question) => {
          const sortedAnswers = [...(question.answers || [])].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );

          return (
            <div
              key={question.id}
              onClick={() => {
                if (!canEdit || selectedQuestion === question.id) {
                  return;
                }
                const latestTargetId = sortedAnswers[0]?.targetId || '';
                setSelectedQuestion(question.id);
                setAnswerValue(DEFAULT_FULFILLMENT_VALUE);
                setLastNumericAnswerValue(DEFAULT_FULFILLMENT_VALUE);
                setComment('');
                if (question.targetType === 'Component' || question.targetType === 'DataObject' || question.targetType === 'Edge') {
                  setSelectedTargetId(latestTargetId);
                } else {
                  setSelectedTargetId('');
                }
              }}
              className={`rounded-lg border p-4 transition-all ${
                selectedQuestion === question.id
                  ? 'border-orange-400 bg-slate-700/50'
                  : 'border-slate-600 bg-slate-800/30 hover:border-slate-500'
              } ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div className="mb-2 flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium text-white">{question.text}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded bg-slate-700 px-2 py-1 text-xs">{question.normReference}</span>
                    <span className="rounded bg-blue-900/30 px-2 py-1 text-xs text-blue-300">{question.targetType}</span>
                  </div>
                </div>
                {sortedAnswers.length > 0 && (
                  <span className="ml-2 rounded bg-green-900/30 px-2 py-1 text-xs font-bold text-green-300">
                    {sortedAnswers.length} answer{sortedAnswers.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              {sortedAnswers.length > 0 && (
                <div className="mt-3 border-t border-slate-600 pt-3">
                  <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                    {sortedAnswers.map((answer) => {
                      const targetLabel = resolveAnswerTargetLabel(answer);
                      return (
                        <div key={answer.id} className="rounded border border-slate-600/60 bg-slate-800/40 p-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-slate-300">
                              <span className="font-semibold">{answer.user?.name || answer.user?.email || 'Unknown user'}</span>
                            </p>
                            <span className={`rounded px-2 py-1 font-semibold ${getAnswerBadgeClass(answer.answerValue)}`}>
                              {formatAnswerValue(answer.answerValue)}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">{new Date(answer.createdAt).toLocaleString()}</p>
                          {targetLabel && <p className="mt-1 text-[11px] text-cyan-300">Target: {targetLabel}</p>}
                          {answer.comment && <p className="mt-1 italic text-slate-400">&quot;{answer.comment}&quot;</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {canEdit && selectedQuestion === question.id && (
                <div className="mt-4 border-t border-slate-600 pt-4" onClick={(event) => event.stopPropagation()}>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-300">Fulfillment Level</label>
                      <div className="rounded-lg border border-slate-600 bg-slate-800/60 p-3">
                        <input
                          type="range"
                          min={0}
                          max={10}
                          step={1}
                          value={answerValue === 'N/A' ? lastNumericAnswerValue : answerValue}
                          onChange={(event) => {
                            const nextValue = event.target.value as FulfillmentNumericValue;
                            setLastNumericAnswerValue(nextValue);
                            setAnswerValue(nextValue);
                          }}
                          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-600 accent-orange-500"
                        />
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                          <span>0</span>
                          <span>5</span>
                          <span>10</span>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <button
                          onClick={() => {
                            if (answerValue === 'N/A') {
                              setAnswerValue(lastNumericAnswerValue);
                              return;
                            }
                            setAnswerValue('N/A');
                          }}
                          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                            answerValue === 'N/A'
                              ? 'bg-slate-500 text-white'
                              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                          type="button"
                        >
                          N/A
                        </button>
                        <p className="text-sm text-slate-300">
                          Selected:{' '}
                          <span className="font-semibold text-orange-300">
                            {answerValue === 'N/A' ? 'N/A' : `${answerValue}/10`}
                          </span>
                        </p>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">0 = not fulfilled, 10 = fully fulfilled</p>
                    </div>

                    {(question.targetType === 'Component' || question.targetType === 'DataObject') && (
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-300">
                          {question.targetType === 'Component' ? 'Component (optional)' : 'Data Object (optional)'}
                        </label>
                        <select
                          value={selectedTargetId}
                          onChange={(event) => setSelectedTargetId(event.target.value)}
                          className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-orange-400 focus:outline-none"
                        >
                          <option value="">
                            {question.targetType === 'Component'
                              ? 'No specific component selected'
                              : 'No specific data object selected'}
                          </option>
                          {(question.targetType === 'Component' ? components : dataObjects).map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-slate-400">
                          Optional: assign the answer to a specific {question.targetType === 'Component' ? 'component' : 'data object'}.
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-300">Comment (optional)</label>
                      <textarea
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        placeholder="Add context or findings..."
                        rows={3}
                        className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none"
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={handleSubmitAnswer} className="flex-1">
                        Submit Answer
                      </Button>
                      <button
                        onClick={() => {
                          setSelectedQuestion(null);
                          setSelectedTargetId('');
                        }}
                        className="flex-1 rounded-lg bg-slate-700 px-4 py-2 text-white transition-colors hover:bg-slate-600"
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
