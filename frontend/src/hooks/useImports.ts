import { useCallback, useEffect, useState } from 'react';
import { ApiError, createImportJob as apiCreateImport, deleteImportJob, listImportJobs } from '../api/client';
import type { ImportJob, ImportJobCreate } from '../api/types';
import { clearAuthState } from '../features/auth/authStore';

export function useImports(userId: number | undefined) {
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchImports = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    try {
      const items = await listImportJobs();
      setImportJobs(items);
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        clearAuthState();
        return;
      }
      setError(caught instanceof Error ? caught.message : '导入任务加载失败');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchImports();
  }, [fetchImports]);

  // 有进行中的任务时，每3秒静默刷新
  useEffect(() => {
    const hasActive = importJobs.some((j) => j.status === 'pending' || j.status === 'processing');
    if (!hasActive) return;
    const timer = setInterval(() => fetchImports(true), 3000);
    return () => clearInterval(timer);
  }, [importJobs, fetchImports]);

  const refreshImports = useCallback(async () => {
    await fetchImports(true);
  }, [fetchImports]);

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
