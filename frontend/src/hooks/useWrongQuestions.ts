import { useCallback, useEffect, useState } from 'react';
import { ApiError, listWrongQuestions, markWrongQuestionMastered } from '../api/client';
import type { WrongQuestion } from '../api/types';
import { clearAuthState } from '../features/auth/authStore';

export function useWrongQuestions(userId: number | undefined) {
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    let isMounted = true;
    setLoading(true);

    listWrongQuestions()
      .then((items) => {
        if (isMounted) {
          setWrongQuestions(items);
          setError(null);
        }
      })
      .catch((caught) => {
        if (!isMounted) return;
        if (caught instanceof ApiError && caught.status === 401) {
          clearAuthState();
          return;
        }
        setError(caught instanceof Error ? caught.message : '错题加载失败');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [userId]);

  const refreshWrongQuestions = useCallback(async () => {
    const items = await listWrongQuestions();
    setWrongQuestions(items);
  }, []);

  const markMastered = useCallback(async (wrongQuestionId: number) => {
    const updated = await markWrongQuestionMastered(wrongQuestionId);
    setWrongQuestions((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }, []);

  return { wrongQuestions, loading, error, markMastered, refreshWrongQuestions, setWrongQuestions } as const;
}
