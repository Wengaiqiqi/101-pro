import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, FileInput, NotebookTabs, PlayCircle, Activity, ChevronRight, ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ActivityStats, ImportJob, PracticeSession, QuestionBank } from '../../api/types';
import { getActivityStats } from '../../api/client';
import { getImportStatusLabel, getImportStatusTone } from '../../lib/statusHelpers';
import { cn } from '../../lib/utils';

const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

function formatDayLabel(dateStr: string, totalDays: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (totalDays <= 14) {
    return `${d.getMonth() + 1}/${d.getDate()} 周${DAY_LABELS[d.getDay()]}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}分钟`;
  const h = Math.floor(m / 60);
  return `${h}小时${m % 60}分`;
}

interface DashboardPageProps {
  banks: QuestionBank[];
  importJobs: ImportJob[];
  // TODO: Implement recentPractice data fetching in DashboardWrapper
  recentPractice?: PracticeSession | null;
  wrongQuestionCount?: number;
  activityStats?: ActivityStats | null;
}

export function DashboardPage({
  banks,
  importJobs,
  recentPractice,
  wrongQuestionCount = 0,
  activityStats,
}: DashboardPageProps) {
  const navigate = useNavigate();
  const latestJob = importJobs[0];

  const [expanded, setExpanded] = useState(false);
  const [expandedStats, setExpandedStats] = useState<ActivityStats | null>(null);
  const [loadingExpanded, setLoadingExpanded] = useState(false);

  const currentStats = expanded ? (expandedStats ?? activityStats) : activityStats;
  const daily = currentStats?.daily ?? [];
  const maxQuestions = Math.max(1, ...daily.map((d) => d.question_count));

  useEffect(() => {
    if (expanded && !expandedStats) {
      setLoadingExpanded(true);
      getActivityStats(30)
        .then(setExpandedStats)
        .catch(() => setExpandedStats(null))
        .finally(() => setLoadingExpanded(false));
    }
  }, [expanded, expandedStats]);

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

      {/* Activity Chart */}
      <section className={cn(
        "bg-white rounded-xl border border-black/[0.06] shadow-sm p-6 relative overflow-hidden transition-all duration-500 ease-out",
        expanded ? "ring-1 ring-black/5 shadow-md" : ""
      )}>
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <Activity size={20} className="text-indigo-600" />
            </div>
            <div>
              <h3 className="text-[16px] font-semibold text-black leading-none mb-1.5">学习活跃度</h3>
              {currentStats && (
                <div className="text-[13px] text-zinc-500 font-medium flex items-center gap-2">
                  <span>近{currentStats.days}天记录</span>
                  <span className="w-1 h-1 rounded-full bg-zinc-300"></span>
                  <span>共 <strong className="text-black font-semibold">{currentStats.total_questions}</strong> 题</span>
                  <span className="w-1 h-1 rounded-full bg-zinc-300"></span>
                  <span>做对 <strong className="text-emerald-600 font-semibold">{currentStats.total_correct}</strong> 题</span>
                  {loadingExpanded && <span className="ml-2 text-indigo-500 animate-pulse text-[12px]">加载中...</span>}
                </div>
              )}
            </div>
          </div>
          <button
            className={cn(
              "inline-flex items-center gap-1.5 text-[13px] font-medium transition-all px-4 py-2 rounded-lg border",
              expanded 
                ? "bg-zinc-100 text-zinc-700 border-transparent hover:bg-zinc-200" 
                : "bg-white text-zinc-600 border-black/[0.08] hover:border-black/20 hover:shadow-sm"
            )}
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? (
              <><ChevronLeft size={16} /> 收起</>
            ) : (
              <>查看详细 <ChevronRight size={16} /></>
            )}
          </button>
        </div>

        {daily.length > 0 ? (
          <ActivityLineChart daily={daily} maxQuestions={maxQuestions} totalDays={daily.length} expanded={expanded} />
        ) : (
          <div className="h-[200px] flex flex-col items-center justify-center text-zinc-400 gap-2">
            <Activity size={32} className="text-zinc-200" />
            <span className="text-[14px]">暂无练习数据</span>
          </div>
        )}
      </section>
    </div>
  );
}

function ActivityLineChart({ daily, maxQuestions, totalDays, expanded }: { daily: { date: string; question_count: number; correct_count: number }[]; maxQuestions: number; totalDays: number; expanded: boolean }) {
  const n = daily.length;
  const H = expanded ? 320 : 200;
  const gradientId = useId();

  // All positions in percentages
  const pts = daily.map((d, i) => ({
    xPct: n === 1 ? 50 : (i / (n - 1)) * 100,
    yPct: (1 - d.question_count / Math.max(maxQuestions, 1)) * 100,
    ...d,
  }));

  // Smooth line path using cubic bezier curves
  const createSmoothPath = (points: typeof pts) => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M0,${points[0].yPct} L100,${points[0].yPct}`;
    
    let path = `M${points[0].xPct},${points[0].yPct}`;
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      const controlPointX = (current.xPct + next.xPct) / 2;
      path += ` C${controlPointX},${current.yPct} ${controlPointX},${next.yPct} ${next.xPct},${next.yPct}`;
    }
    return path;
  };

  const linePath = createSmoothPath(pts);
  const areaPath = pts.length > 1 ? `${linePath} L${pts[pts.length - 1].xPct},100 L${pts[0].xPct},100 Z` : '';

  return (
    <div className="transition-all duration-500 ease-in-out" style={{ height: H + 40 }}>
      {/* Line + area via SVG, stretches to full width */}
      <div className="relative w-full transition-all duration-500 ease-in-out" style={{ height: H }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
          <defs>
            <linearGradient id={`${gradientId}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`${gradientId}-line`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#818cf8" />
              <stop offset="50%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
          </defs>
          
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((y, i) => (
            <line key={i} x1="0" y1={y} x2="100" y2={y} stroke="#f4f4f5" strokeWidth={0.5} strokeDasharray={y === 100 ? '' : '2,2'} />
          ))}
          
          {/* Area and Line */}
          {pts.length > 1 && (
            <>
              <path d={areaPath} fill={`url(#${gradientId}-area)`} className="animate-in fade-in duration-1000" />
              <path d={linePath} fill="none" stroke={`url(#${gradientId}-line)`} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-sm" />
            </>
          )}
          {pts.length === 1 && (
            <path d={`M0,${pts[0].yPct} L100,${pts[0].yPct}`} fill="none" stroke={`url(#${gradientId}-line)`} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-sm" />
          )}
        </svg>
        
        {/* Data Points */}
        {pts.map((p, i) => {
          if (p.question_count === 0 && pts.length > 14 && !expanded) return null;
          
          return (
            <div
              key={i}
              className="absolute group z-10"
              style={{
                left: `${p.xPct}%`,
                top: `${p.yPct}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div className={cn(
                "w-3 h-3 rounded-full bg-white border-2 border-indigo-500 cursor-pointer shadow-sm transition-all duration-200",
                "group-hover:scale-150 group-hover:border-indigo-600 group-hover:bg-indigo-50",
                p.question_count === 0 ? "opacity-0 group-hover:opacity-100" : "opacity-100"
              )} />
              
              {/* Vertical Guide Line on Hover */}
              <div 
                className="absolute left-1/2 w-px bg-indigo-500/30 -translate-x-1/2 hidden group-hover:block pointer-events-none transition-all duration-200" 
                style={{ top: '6px', height: `${(H * p.yPct / 100) > H ? 0 : H - (H * p.yPct / 100)}px` }} 
              />

              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 hidden group-hover:flex flex-col items-center pointer-events-none animate-in fade-in zoom-in-95 duration-200">
                <div className="bg-zinc-900 text-white text-xs px-3 py-2.5 rounded-lg shadow-xl whitespace-nowrap z-20 flex flex-col gap-1.5 border border-zinc-800">
                  <span className="text-zinc-300 font-medium">{formatDayLabel(p.date, totalDays)}</span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                      <span className="text-zinc-400">答题</span>
                      <span className="font-semibold text-white">{p.question_count}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                      <span className="text-zinc-400">正确</span>
                      <span className="font-semibold text-white">{p.correct_count}</span>
                    </span>
                  </div>
                </div>
                {/* Tooltip Arrow */}
                <div className="w-2.5 h-2.5 bg-zinc-900 border-r border-b border-zinc-800 rotate-45 -mt-1.5 shadow-xl"></div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* X axis labels */}
      <div className="relative mt-4 text-[11px] font-medium text-zinc-400" style={{ height: 20 }}>
        {pts.map((p, i) => {
          let showLabel = false;
          const step = Math.max(1, Math.ceil(totalDays / 6));
          
          if (i === 0 || i === pts.length - 1) {
            showLabel = true;
          } else if (i % step === 0 && (pts.length - 1 - i) > step * 0.6) {
            showLabel = true;
          }

          if (!showLabel) return null;
          
          return (
            <span
              key={i}
              className="absolute whitespace-nowrap transition-all duration-300"
              style={{ 
                left: `${p.xPct}%`, 
                transform: i === 0 ? 'translateX(0)' : i === pts.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)'
              }}
            >
              {formatDayLabel(p.date, totalDays)}
            </span>
          );
        })}
      </div>
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
