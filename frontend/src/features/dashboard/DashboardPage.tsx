import { BookOpen, FileInput, NotebookTabs, PlayCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { StatusBadge } from '../../components/StatusBadge';
import type { ImportJob, PracticeSession, QuestionBank } from '../../api/types';

interface DashboardPageProps {
  banks: QuestionBank[];
  importJobs: ImportJob[];
  recentPractice?: PracticeSession | null;
  wrongQuestionCount?: number;
  onNavigateBanks: () => void;
  onNavigateImports: () => void;
  onNavigatePractice: () => void;
  onNavigateMistakes: () => void;
}

export function DashboardPage({
  banks,
  importJobs,
  recentPractice,
  wrongQuestionCount = 0,
  onNavigateBanks,
  onNavigateImports,
  onNavigatePractice,
  onNavigateMistakes
}: DashboardPageProps) {
  const latestJob = importJobs[0];

  return (
    <section className="panel" aria-labelledby="dashboard-title">
      <div className="panel__header">
        <div>
          <h2 id="dashboard-title">工作台概览</h2>
          <p>集中查看题库、导入和练习进度。</p>
        </div>
      </div>

      <div className="metric-grid">
        <Metric label="题库" value={banks.length} tone="success" actionLabel="管理题库" onAction={onNavigateBanks} icon={<BookOpen size={15} />} />
        <Metric
          label="导入任务"
          value={importJobs.length}
          tone={latestJob ? statusTone(latestJob.status) : 'neutral'}
          actionLabel="查看导入"
          onAction={onNavigateImports}
          icon={<FileInput size={15} />}
          note={latestJob ? statusLabel(latestJob.status) : '暂无任务'}
        />
        <Metric
          label="最近练习"
          value={recentPractice ? `${recentPractice.score}/${recentPractice.question_count}` : '0'}
          tone="neutral"
          actionLabel="开始练习"
          onAction={onNavigatePractice}
          icon={<PlayCircle size={15} />}
          note={recentPractice ? (recentPractice.finished_at ? `${recentPractice.accuracy}% 正确率` : '进行中') : '尚未开始'}
        />
        <Metric
          label="错题"
          value={wrongQuestionCount}
          tone={wrongQuestionCount ? 'warning' : 'success'}
          actionLabel="复盘错题"
          onAction={onNavigateMistakes}
          icon={<NotebookTabs size={15} />}
          note={wrongQuestionCount ? '待复习' : '已清空'}
        />
      </div>
    </section>
  );
}

interface MetricProps {
  label: string;
  value: string | number;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
  actionLabel: string;
  onAction: () => void;
  icon: ReactNode;
  note?: string;
}

function Metric({ label, value, tone, actionLabel, onAction, icon, note = '正常' }: MetricProps) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <StatusBadge tone={tone}>{note}</StatusBadge>
      <button className="secondary-button" type="button" onClick={onAction}>
        {icon}
        {actionLabel}
      </button>
    </div>
  );
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: '排队中',
    processing: '处理中',
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
  if (status === 'pending' || status === 'processing') {
    return 'warning';
  }
  return 'neutral';
}
