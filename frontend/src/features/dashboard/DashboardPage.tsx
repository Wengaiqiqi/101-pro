import { useNavigate } from 'react-router-dom';
import { BookOpen, FileInput, NotebookTabs, PlayCircle, Activity } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ImportJob, PracticeSession, QuestionBank } from '../../api/types';
import { getImportStatusLabel, getImportStatusTone } from '../../lib/statusHelpers';
import { cn } from '../../lib/utils';

interface DashboardPageProps {
  banks: QuestionBank[];
  importJobs: ImportJob[];
  recentPractice?: PracticeSession | null;
  wrongQuestionCount?: number;
}

export function DashboardPage({
  banks,
  importJobs,
  recentPractice,
  wrongQuestionCount = 0,
}: DashboardPageProps) {
  const navigate = useNavigate();
  const latestJob = importJobs[0];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      {/* Header Section */}
      <header className="pb-6 border-b border-black/[0.06]">
        <h2 id="dashboard-title" className="m-0 text-3xl font-bold text-black tracking-tight leading-tight">工作台概览</h2>
        <p className="mt-2 text-[14px] text-zinc-500 font-medium">随时掌握题库动态、练习进度及系统资源状态。</p>
      </header>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric 
          label="题库资源" 
          value={banks.length} 
          tone="" 
          actionLabel="管理题库" 
          onAction={() => navigate('/banks')} 
          icon={<BookOpen size={16} strokeWidth={2.5} />} 
          note="使用中"
        />
        <Metric
          label="导入队列"
          value={importJobs.length}
          tone={latestJob ? (latestJob.status === 'completed' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200') : ''}
          actionLabel="查看任务"
          onAction={() => navigate('/imports')}
          icon={<FileInput size={16} strokeWidth={2.5} />}
          note={latestJob ? getImportStatusLabel(latestJob.status) : '暂无任务'}
        />
        <Metric
          label="今日练习"
          value={recentPractice ? `${recentPractice.score}/${recentPractice.question_count}` : '0'}
          actionLabel="开始练习"
          onAction={() => navigate('/practice')}
          icon={<PlayCircle size={16} strokeWidth={2.5} />}
          note={recentPractice ? (recentPractice.finished_at ? `正确率 ${recentPractice.accuracy}%` : '进行中') : '未开始'}
        />
        <Metric
          label="待攻克错题"
          value={wrongQuestionCount}
          tone={wrongQuestionCount > 0 ? 'text-amber-700 bg-amber-50 border-amber-200' : ''}
          actionLabel="复盘错题"
          onAction={() => navigate('/mistakes')}
          icon={<NotebookTabs size={16} strokeWidth={2.5} />}
          note={wrongQuestionCount ? '待复习' : '已清零'}
        />
      </div>

      {/* Activity Chart Placeholder (SaaS style) */}
      <section className="bg-white rounded-xl border border-black/[0.06] shadow-sm p-6 relative overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-zinc-400" />
            <h3 className="text-[15px] font-semibold text-black">学习活跃度</h3>
          </div>
          <button className="text-[12px] font-medium text-zinc-500 hover:text-black transition-colors px-3 py-1.5 rounded-md hover:bg-zinc-100">查看详情</button>
        </div>
        
        <div className="h-[200px] w-full flex items-end gap-2 pt-4 border-b border-black/[0.04]">
          {/* Mock bars for the chart */}
          {[40, 60, 30, 80, 50, 90, 70].map((val, i) => (
            <div key={i} className="flex-1 flex flex-col justify-end group">
              <div 
                className="w-full bg-black/[0.04] rounded-t-sm group-hover:bg-black transition-colors duration-300" 
                style={{ height: `${val}%` }} 
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-3 text-[11px] font-medium text-zinc-400 tracking-widest">
          <span>周一</span>
          <span>周二</span>
          <span>周三</span>
          <span>周四</span>
          <span>周五</span>
          <span>周六</span>
          <span>周日</span>
        </div>
      </section>
    </div>
  );
}

interface MetricProps {
  label: string;
  value: string | number;
  tone?: string;
  actionLabel: string;
  onAction: () => void;
  icon: ReactNode;
  note?: string;
}

function Metric({ label, value, tone = '', actionLabel, onAction, icon, note = '正常' }: MetricProps) {
  return (
    <div className="group relative flex flex-col bg-white rounded-xl p-5 border border-black/[0.06] shadow-sm hover:border-black/20 hover:shadow-md transition-all duration-300 ease-out">
      <div className="flex items-start justify-between gap-4 mb-8">
        <span className="text-[13px] font-semibold text-zinc-500">{label}</span>
        <div className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold tracking-widest uppercase border border-black/[0.06] bg-zinc-50 text-zinc-500", tone)}>
          {note}
        </div>
      </div>

      <div className="flex items-end justify-between mt-auto">
        <div>
          <strong className="block text-4xl font-bold text-black tracking-tighter leading-none">{value}</strong>
        </div>
        
        <button
          className="flex items-center justify-center w-8 h-8 rounded-full bg-zinc-50 text-zinc-400 group-hover:bg-black group-hover:text-white transition-all duration-300 border border-black/[0.04] group-hover:border-black"
          type="button"
          onClick={onAction}
          title={actionLabel}
          aria-label={actionLabel}
        >
          <div className="group-hover:rotate-[-45deg] transition-transform duration-300">
            {icon}
          </div>
        </button>
      </div>
    </div>
  );
}
