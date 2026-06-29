import { useCallback, useEffect, useState } from 'react';
import { getActivityStats } from '../api/client';
import type { ActivityStats } from '../api/types';

export function useActivityStats(days: number = 7) {
  const [data, setData] = useState<ActivityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const stats = await getActivityStats(days);
      setData(stats);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '加载活跃度数据失败');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
