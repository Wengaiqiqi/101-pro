import { FilePlus } from 'lucide-react';
import type { ImportJob, QuestionBank } from '../../api/types';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';

interface ImportJobsPageProps {
  jobs: ImportJob[];
  banks: QuestionBank[];
  onNew: () => void;
  onSelect: (job: ImportJob) => void;
}

export function ImportJobsPage({ jobs, banks, onNew, onSelect }: ImportJobsPageProps) {
  return (
    <section className="panel" aria-labelledby="imports-title">
      <div className="panel__header">
        <div>
          <h2 id="imports-title">文档导入</h2>
          <p>上传资料，生成待审核的题目草稿。</p>
        </div>
        <button className="secondary-button" type="button" onClick={onNew}>
          <FilePlus size={15} aria-hidden="true" />
          新建导入
        </button>
      </div>

      {jobs.length ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>文件</th>
              <th>题库</th>
              <th>状态</th>
              <th>题目数</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>{job.filename}</td>
                <td>{banks.find((bank) => bank.id === job.bank_id)?.name ?? job.bank_id}</td>
                <td>
                  <StatusBadge tone={statusTone(job.status)}>{statusLabel(job.status)}</StatusBadge>
                </td>
                <td>{job.question_count}</td>
                <td>{formatDate(job.updated_at)}</td>
                <td>
                  <button className="text-button" type="button" onClick={() => onSelect(job)}>
                    查看
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState
          title="暂无导入任务"
          description="选择题库并上传文档后，系统会生成可审核的题目草稿。"
        />
      )}
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
  if (status === 'pending' || status === 'parsing' || status === 'processing' || status === 'generating') {
    return 'warning';
  }
  return 'neutral';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}
