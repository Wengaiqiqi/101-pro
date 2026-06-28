import { useCallback, useEffect, useState } from 'react';
import { ApiError, createImportJob as apiCreateImport, deleteImportJob, listImportJobs } from '../api/client';
import type { ImportJob, ImportJobCreate } from '../api/types';
import { clearAuthState } from '../features/auth/authStore';

export function useImports(userId: number | undefined) {
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    let isMounted = true;
    setLoading(true);

    listImportJobs()
      .then((items) => {
        if (isMounted) {
          setImportJobs(items);
          setError(null);
        }
      })
      .catch((caught) => {
        if (!isMounted) return;
        if (caught instanceof ApiError && caught.status === 401) {
          clearAuthState();
          return;
        }
        setError(caught instanceof Error ? caught.message : '导入任务加载失败');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [userId]);

  const refreshImports = useCallback(async () => {
    const items = await listImportJobs();
    setImportJobs(items);
  }, []);

  const createImport = useCallback(async (payload: ImportJobCreate) => {
    const created = await apiCreateImport(payload);
    setImportJobs((current) => [created, ...current]);
    return created;
  }, []);

  const deleteImport = useCallback(async (jobId: number) => {
    await deleteImportJob(jobId);
    setImportJobs((current) => current.filter((j) => j.id !== jobId));
  }, []);

  return { importJobs, loading, error, createImport, deleteImport, refreshImports, setImportJobs } as const;
}
