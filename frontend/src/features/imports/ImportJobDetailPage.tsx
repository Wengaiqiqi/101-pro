import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getImportJob } from '../../api/client';
import type { ImportJob } from '../../api/types';
import { StatusBadge } from '../../components/StatusBadge';
import { getImportStatusLabel, getImportStatusTone, getDifficultyLabel } from '../../lib/statusHelpers';

interface ImportJobDetailPageProps {
  job: ImportJob;
  onJobChange: (job: ImportJob) => void;
}

const activeStatuses = new Set(['pending', 'processing']);

export function ImportJobDetailPage({ job, onJobChange }: ImportJobDetailPageProps) {
  const navigate = useNavigate();
  const [currentJob, setCurrentJob] = useState(job);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentJob(job);
  }, [job]);

  useEffect(() => {
    if (!activeStatuses.has(currentJob.status)) {
      return;
    }

    let isMounted = true;

    async function refresh() {
      try {
        const nextJob = await getImportJob(currentJob.id);
        if (isMounted) {
          setCurrentJob(nextJob);
          onJobChange(nextJob);
          setError(null);
        }
      } catch (caught) {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : '导入任务刷新失败');
        }
      }
    }

    const timerId = window.setInterval(() => {
      void refresh();
    }, 2000);

    return () => {
      isMounted = false;
      window.clearInterval(timerId);
    };
  }, [currentJob.id, currentJob.status, onJobChange]);

  const canReview = currentJob.status === 'reviewing' || currentJob.status === 'completed';

  return (
    <section className="border border-slate-200 rounded-xl bg-white shadow-sm" aria-labelledby="import-job-title">
      <div className="flex items-center justify-between gap-4 px-4 py-3.5 border-b border-slate-100">
        <div>
          <h2 id="import-job-title" className="m-0 text-lg font-bold text-slate-900">{currentJob.filename}</h2>
          <p className="mt-1 text-sm text-slate-500">导入任务详情与生成状态。</p>
        </div>
        <button
          className="inline-flex items-center gap-2 min-h-[36px] px-3 rounded-lg border border-slate-300 text-slate-700 bg-white text-[13px] font-bold hover:bg-slate-50"
          type="button"
          onClick={() => navigate('/imports')}
        >
          返回列表
        </button>
      </div>

      {error ? (
        <div className="mx-4 mt-3 px-3 py-2.5 border border-orange-300 rounded-lg text-amber-800 bg-orange-50" role="alert">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50 w-[120px]">状态</th>
              <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-700">
                <StatusBadge className={getImportStatusTone(currentJob.status)}>{getImportStatusLabel(currentJob.status)}</StatusBadge>
              </td>
            </tr>
            <tr>
              <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">题目数量</th>
              <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-700">{currentJob.question_count}</td>
            </tr>
            <tr>
              <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">题型</th>
              <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-700">{currentJob.question_types.join('、')}</td>
            </tr>
            <tr>
              <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">难度</th>
              <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-700">{getDifficultyLabel(currentJob.difficulty)}</td>
            </tr>
            <tr>
              <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">语言</th>
              <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-700">{currentJob.language}</td>
            </tr>
            <tr>
              <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">解析</th>
              <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-700">{currentJob.with_explanations ? '生成' : '不生成'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-4 px-4 py-3.5 border-t border-slate-100">
        {canReview ? (
          <button
            className="inline-flex items-center gap-2 min-h-[36px] px-3 rounded-lg border border-slate-300 text-slate-700 bg-white text-[13px] font-bold hover:bg-slate-50"
            type="button"
            onClick={() => navigate(`/imports/${currentJob.id}/review`)}
          >
            审核草稿
          </button>
        ) : (
          <StatusBadge className="bg-amber-50 text-amber-700">等待生成完成</StatusBadge>
        )}
      </div>
    </section>
  );
}
