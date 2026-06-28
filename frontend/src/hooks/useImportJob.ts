import { useEffect, useState } from 'react';
import { getImportJob } from '../api/client';
import type { ImportJob } from '../api/types';

export function useImportJob(jobId: number) {
  const [job, setJob] = useState<ImportJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    getImportJob(jobId)
      .then((j) => { if (isMounted) setJob(j); })
      .catch((caught) => { if (isMounted) setError(caught instanceof Error ? caught.message : '导入任务加载失败'); })
      .finally(() => { if (isMounted) setLoading(false); });
    return () => { isMounted = false; };
  }, [jobId]);

  return { job, setJob, loading, error } as const;
}
