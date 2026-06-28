import { useCallback, useEffect, useState } from 'react';
import { ApiError, createQuestionBank as apiCreateBank, deleteQuestionBank as apiDeleteBank, listQuestionBanks } from '../api/client';
import type { QuestionBank, QuestionBankCreate } from '../api/types';
import { clearAuthState } from '../features/auth/authStore';

export function useBanks(userId: number | undefined) {
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    let isMounted = true;
    setLoading(true);

    listQuestionBanks()
      .then((items) => {
        if (isMounted) {
          setBanks(items);
          setError(null);
        }
      })
      .catch((caught) => {
        if (!isMounted) return;
        if (caught instanceof ApiError && caught.status === 401) {
          clearAuthState();
          return;
        }
        setError(caught instanceof Error ? caught.message : '题库加载失败');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [userId]);

  const refreshBanks = useCallback(async () => {
    const items = await listQuestionBanks();
    setBanks(items);
  }, []);

  const createBank = useCallback(async (payload: QuestionBankCreate) => {
    const created = await apiCreateBank(payload);
    setBanks((current) => [...current, created]);
    return created;
  }, []);

  const deleteBank = useCallback(async (bankId: number) => {
    await apiDeleteBank(bankId);
    setBanks((current) => current.filter((b) => b.id !== bankId));
  }, []);

  return { banks, loading, error, createBank, deleteBank, refreshBanks, setBanks } as const;
}
