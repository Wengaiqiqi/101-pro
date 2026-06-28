import { useState } from 'react';
import { CheckCircle2, RotateCcw, XCircle, Award, Target, XOctagon } from 'lucide-react';
import type { PracticeSession, Question } from '../../api/types';
import { LatexText } from '../../components/LatexText';
import { getQuestionTypeLabel } from '../../lib/statusHelpers';
import { cn } from '../../lib/utils';

interface PracticeResultPageProps {
  session: PracticeSession;
  questions: Question[];
  onRestart: () => void;
}

type TabKey = 'all' | 'correct' | 'wrong';

const tabs: { key: TabKey; label: string; icon: typeof CheckCircle2 }[] = [
  { key: 'all', label: '全部题目', icon: Target },
  { key: 'correct', label: '作答正确', icon: Award },
  { key: 'wrong', label: '未掌握题目', icon: XOctagon },
];

export function PracticeResultPage({ session, questions, onRestart }: PracticeResultPageProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const correctCount = session.answers.filter((a) => a.is_correct).length;
  const wrongCount = session.answers.length - correctCount;

  const filteredAnswers = session.answers.filter((answer) => {
    if (activeTab === 'correct') return answer.is_correct;
    if (activeTab === 'wrong') return !answer.is_correct;
    return true;
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      {/* Header */}
      <header className="flex items-center justify-between gap-4 pb-6 border-b border-black/[0.06]">
        <div>
          <h2 className="m-0 text-3xl font-bold text-black tracking-tight leading-tight">练习结果</h2>
          <p className="mt-2 text-[14px] text-zinc-500 font-medium">本次共完成 {session.answers.length} 道题，正确率 {session.accuracy}%。</p>
        </div>
        <button
          className="inline-flex items-center gap-2 h-[40px] px-4 rounded-md bg-black text-white text-[13px] font-semibold hover:bg-zinc-800 transition-all shadow-sm"
          type="button"
          onClick={onRestart}
        >
          <RotateCcw size={16} aria-hidden="true" />
          再练一次
        </button>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="得分" value={`${session.score}/${session.answers.length}`} />
        <StatCard label="正确率" value={`${session.accuracy}%`} />
        <StatCard label="正确" value={String(correctCount)} tone="success" />
        <StatCard label="错误" value={String(wrongCount)} tone="danger" />
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-black/[0.06] overflow-hidden">
        <div className="flex border-b border-black/[0.06]">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = tab.key === 'all'
              ? session.answers.length
              : tab.key === 'correct'
                ? correctCount
                : wrongCount;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                className={cn(
                  "flex items-center gap-2 px-5 py-3.5 text-[13px] font-semibold border-b-2 transition-all -mb-px",
                  isActive
                    ? "border-black text-black"
                    : "border-transparent text-zinc-400 hover:text-zinc-600"
                )}
                onClick={() => setActiveTab(tab.key)}
              >
                <Icon size={15} />
                {tab.label}
                <span className={cn(
                  "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold",
                  isActive ? "bg-black text-white" : "bg-zinc-100 text-zinc-500"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Question list */}
        <div className="divide-y divide-black/[0.04]">
          {filteredAnswers.length === 0 ? (
            <div className="py-16 text-center text-[14px] text-zinc-400 font-medium">
              {activeTab === 'correct' ? '暂无正确题目' : activeTab === 'wrong' ? '恭喜，全部掌握！' : '暂无题目'}
            </div>
          ) : (
            filteredAnswers.map((answer, index) => {
              const question = questionById.get(answer.question_id);
              return (
                <article key={answer.id} className="px-6 py-5">
                  <div className="flex items-start gap-4">
                    {/* Status badge */}
                    <div className={cn(
                      'flex-shrink-0 flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1 rounded-md border mt-0.5',
                      answer.is_correct
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                        : 'bg-red-50 text-red-700 border-red-200/60',
                    )}>
                      {answer.is_correct ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                      {answer.is_correct ? '正确' : '错误'}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Question header */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-zinc-100 text-[11px] font-bold text-zinc-600">
                          {index + 1}
                        </span>
                        {question && (
                          <span className="inline-flex items-center justify-center h-5 px-1.5 rounded bg-zinc-100 border border-black/[0.04] text-[10px] font-bold text-zinc-500 tracking-widest uppercase">
                            {getQuestionTypeLabel(question.question_type)}
                          </span>
                        )}
                      </div>

                      {/* Question stem */}
                      <h3 className="m-0 text-[14px] font-semibold text-black leading-relaxed tracking-tight mb-3">
                        <LatexText text={question?.stem ?? `题目 #${answer.question_id}`} />
                      </h3>

                      {/* Options for choice questions */}
                      {question && question.options.length > 0 && (
                        <div className="grid gap-1.5 mb-3">
                          {question.options.map((opt, optIndex) => {
                            const label = opt.label ?? String.fromCharCode(65 + optIndex);
                            const userAnswers = Array.isArray(answer.user_answer_json.value)
                              ? answer.user_answer_json.value
                              : [answer.user_answer_json.value];
                            const isUserChoice = userAnswers.includes(label);
                            const isCorrect = opt.is_correct;

                            return (
                              <div
                                key={opt.id ?? label}
                                className={cn(
                                  "flex items-start gap-3 px-3 py-2 rounded-md border text-[13px]",
                                  isCorrect && isUserChoice ? "bg-emerald-50 border-emerald-300 text-emerald-800" :
                                  isCorrect ? "bg-emerald-50/50 border-emerald-200 text-emerald-700" :
                                  isUserChoice ? "bg-red-50 border-red-200 text-red-700" :
                                  "bg-white border-black/[0.06] text-zinc-600"
                                )}
                              >
                                <span className={cn(
                                  "flex-shrink-0 font-bold",
                                  isCorrect ? "text-emerald-600" : isUserChoice ? "text-red-500" : "text-zinc-400"
                                )}>
                                  {label}.
                                </span>
                                <span className="flex-1"><LatexText text={opt.content} /></span>
                                {isCorrect && <CheckCircle2 size={14} className="flex-shrink-0 text-emerald-500 mt-0.5" />}
                                {isUserChoice && !isCorrect && <XCircle size={14} className="flex-shrink-0 text-red-400 mt-0.5" />}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* User answer for non-choice questions */}
                      {question && question.options.length === 0 && (
                        <div className="mb-3">
                          <div className="inline-block px-3 py-1.5 rounded-md bg-zinc-50 border border-black/[0.04] text-[13px] text-zinc-700 font-medium">
                            <span className="text-zinc-400 mr-2">你的答案：</span>
                            {formatAnswer(answer.user_answer_json.value)}
                          </div>
                          {question.answer_text && (
                            <div className="mt-1.5 inline-block px-3 py-1.5 rounded-md bg-emerald-50 border border-emerald-200/60 text-[13px] text-emerald-700 font-medium">
                              <span className="text-emerald-500 mr-2">正确答案：</span>
                              {question.answer_text}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Explanation */}
                      {question?.explanation ? (
                        <div className="mt-3 p-3.5 rounded-lg bg-zinc-50 border border-black/[0.04] text-[13px] text-zinc-600 leading-relaxed">
                          <strong className="text-black font-semibold mr-2">解析：</strong>
                          <LatexText text={question.explanation} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'success' | 'danger' }) {
  const toneClass = tone === 'success' ? 'text-emerald-600' : tone === 'danger' ? 'text-red-600' : 'text-black';
  return (
    <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm p-5">
      <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">{label}</span>
      <strong className={cn('block text-3xl font-bold tracking-tight mt-1.5', toneClass)}>{value}</strong>
    </div>
  );
}

function formatAnswer(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join('、');
  }
  return value === undefined || value === null || value === '' ? '未作答' : String(value);
}
