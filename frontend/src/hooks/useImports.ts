import { useCallback, useEffect, useState } from 'react';
import { createImportJob as apiCreateImport, deleteImportJob, listImportJobs } from '../api/client';
import type { ImportJob, ImportJobCreate } from '../api/types';

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
      setError(caught instanceof Error ? caught.message : '导入任务加载失败');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchImports();
  }, [fetchImports]);

  const hasActiveImports = importJobs.some((job) => job.status === 'pending' || job.status === 'processing');

  // Poll every 3s while there are active (pending/processing) jobs.
  useEffect(() => {
    if (!hasActiveImports) return;
    const timer = setInterval(() => { void fetchImports(true); }, 3000);
    return () => clearInterval(timer);
  }, [fetchImports, hasActiveImports]);

  const refreshImports = useCallback(async () => {
    try {
      await fetchImports(true);
    } catch {
      // Error already handled in fetchImports
    }
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
