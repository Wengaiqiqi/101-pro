import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createQuestion as apiCreateQuestion,
  deleteQuestion as apiDeleteQuestion,
  listQuestions,
  updateQuestion as apiUpdateQuestion
} from '../api/client';
import type { Question, QuestionPayload } from '../api/types';

export function useQuestions(bankId: number | null) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bankId) {
      setQuestions([]);
      return;
    }

    let isMounted = true;
    setLoading(true);

    listQuestions(bankId)
      .then((items) => {
        if (isMounted) {
          setQuestions(items);
          setError(null);
        }
      })
      .catch((caught) => {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : '题目加载失败');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [bankId]);

  const refreshQuestions = useCallback(async () => {
    if (!bankId) return;
    const items = await listQuestions(bankId);
    setQuestions(items);
  }, [bankId]);

  const createQuestion = useCallback(
    async (payload: QuestionPayload) => {
      if (!bankId) return;
      const created = await apiCreateQuestion(bankId, payload);
      setQuestions((current) => [...current, created]);
    },
    [bankId]
  );

  const updateQuestion = useCallback(async (questionId: number, payload: QuestionPayload) => {
    const updated = await apiUpdateQuestion(questionId, payload);
    setQuestions((current) => current.map((q) => (q.id === questionId ? updated : q)));
  }, []);

  const deleteQuestion = useCallback(async (questionId: number) => {
    await apiDeleteQuestion(questionId);
    setQuestions((current) => current.filter((q) => q.id !== questionId));
  }, []);

  return { questions, loading, error, createQuestion, updateQuestion, deleteQuestion, refreshQuestions, setQuestions } as const;
}
