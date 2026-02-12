'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/common/Button';

interface Answer {
  id: string;
  answerValue: string;
  user: {
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
}

export default function AssessmentQuestions({ projectId }: AssessmentQuestionsProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [answerValue, setAnswerValue] = useState('Yes');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

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
    } catch (fetchError) {
      setError((fetchError as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchQuestions();
  }, [projectId]);

  const handleSubmitAnswer = async () => {
    if (!selectedQuestion) {
      return;
    }

    try {
      setError('');
      const selected = questions.find((question) => question.id === selectedQuestion);

      const response = await fetch(`/api/projects/${projectId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: selectedQuestion,
          answerValue,
          comment,
          targetType: selected?.targetType || 'None',
        }),
      });

      if (!response.ok) {
        throw new Error('Answer could not be saved');
      }

      setSelectedQuestion(null);
      setAnswerValue('Yes');
      setComment('');
      await fetchQuestions();
    } catch (submitError) {
      setError((submitError as Error).message);
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

      <div className="space-y-3">
        {questions.map((question) => (
          <div
            key={question.id}
            onClick={() => {
              setSelectedQuestion(question.id);
              setAnswerValue('Yes');
              setComment('');
            }}
            className={`cursor-pointer rounded-lg border p-4 transition-all ${
              selectedQuestion === question.id
                ? 'border-orange-400 bg-slate-700/50'
                : 'border-slate-600 bg-slate-800/30 hover:border-slate-500'
            }`}
          >
            <div className="mb-2 flex items-start justify-between">
              <div className="flex-1">
                <p className="font-medium text-white">{question.text}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded bg-slate-700 px-2 py-1 text-xs">{question.normReference}</span>
                  <span className="rounded bg-blue-900/30 px-2 py-1 text-xs text-blue-300">{question.targetType}</span>
                </div>
              </div>
              {(question.answers?.length || 0) > 0 && (
                <span className="ml-2 rounded bg-green-900/30 px-2 py-1 text-xs font-bold text-green-300">
                  {question.answers?.length} answer{question.answers?.length === 1 ? '' : 's'}
                </span>
              )}
            </div>

            {(question.answers?.length || 0) > 0 && (
              <div className="mt-3 space-y-2 border-t border-slate-600 pt-3">
                {question.answers?.slice(-2).map((answer) => (
                  <div key={answer.id} className="text-xs">
                    <p className="text-slate-300">
                      <span className="font-semibold">{answer.user.name || answer.user.email}</span>:{' '}
                      <span className="text-orange-400">{answer.answerValue}</span>
                    </p>
                    {answer.comment && <p className="mt-1 italic text-slate-400">"{answer.comment}"</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedQuestion && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">
            {questions.find((question) => question.id === selectedQuestion)?.text}
          </h3>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Your Answer</label>
              <div className="flex gap-2">
                {['Yes', 'No', 'N/A'].map((value) => (
                  <button
                    key={value}
                    onClick={() => setAnswerValue(value)}
                    className={`flex-1 rounded-lg py-2 font-semibold transition-all ${
                      answerValue === value
                        ? value === 'Yes'
                          ? 'bg-green-600 text-white'
                          : value === 'No'
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-500 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                    type="button"
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

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
                onClick={() => setSelectedQuestion(null)}
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
}
