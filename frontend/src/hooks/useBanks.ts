import { useCallback, useEffect, useState } from 'react';
import { createQuestionBank as apiCreateBank, deleteQuestionBank as apiDeleteBank, listQuestionBanks } from '../api/client';
import type { QuestionBank, QuestionBankCreate } from '../api/types';

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
    try {
      const items = await listQuestionBanks();
      setBanks(items);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '题库刷新失败');
    }
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
