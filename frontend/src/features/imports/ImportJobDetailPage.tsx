import { useEffect, useState } from 'react';
import { getImportJob } from '../../api/client';
import type { ImportJob } from '../../api/types';
import { StatusBadge } from '../../components/StatusBadge';

interface ImportJobDetailPageProps {
  job: ImportJob;
  onBack: () => void;
  onReview: (job: ImportJob) => void;
  onJobChange: (job: ImportJob) => void;
}

const activeStatuses = new Set(['pending', 'parsing', 'processing', 'generating']);

export function ImportJobDetailPage({ job, onBack, onReview, onJobChange }: ImportJobDetailPageProps) {
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

  const canReview = currentJob.status === 'reviewing' || currentJob.status === 'completed' || currentJob.status === 'published';

  return (
    <section className="panel" aria-labelledby="import-job-title">
      <div className="panel__header">
        <div>
          <h2 id="import-job-title">{currentJob.filename}</h2>
          <p>导入任务详情与生成状态。</p>
        </div>
        <button className="secondary-button" type="button" onClick={onBack}>
          返回列表
        </button>
      </div>

      {error ? (
        <div className="inline-alert" role="alert">
          {error}
        </div>
      ) : null}

      <table className="data-table">
        <tbody>
          <tr>
            <th>状态</th>
            <td>
              <StatusBadge tone={statusTone(currentJob.status)}>{statusLabel(currentJob.status)}</StatusBadge>
            </td>
          </tr>
          <tr>
            <th>题目数量</th>
            <td>{currentJob.question_count}</td>
          </tr>
          <tr>
            <th>题型</th>
            <td>{currentJob.question_types.join('、')}</td>
          </tr>
          <tr>
            <th>难度</th>
            <td>{currentJob.difficulty}</td>
          </tr>
          <tr>
            <th>语言</th>
            <td>{currentJob.language}</td>
          </tr>
          <tr>
            <th>解析</th>
            <td>{currentJob.with_explanations ? '生成' : '不生成'}</td>
          </tr>
        </tbody>
      </table>

      <div className="panel__header">
        {canReview ? (
          <button className="secondary-button" type="button" onClick={() => onReview(currentJob)}>
            审核草稿
          </button>
        ) : (
          <StatusBadge tone="warning">等待生成完成</StatusBadge>
        )}
      </div>
    </section>
  );
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: '排队中',
    parsing: '解析中',
    processing: '处理中',
    generating: '生成中',
    reviewing: '待审核',
    completed: '已完成',
    failed: '失败',
    published: '已发布'
  };

  return labels[status] ?? status;
}

function statusTone(status: string): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'completed' || status === 'published') {
    return 'success';
  }
  if (status === 'failed') {
    return 'danger';
  }
  if (activeStatuses.has(status)) {
    return 'warning';
  }
  return 'neutral';
}
