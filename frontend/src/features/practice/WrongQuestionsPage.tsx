import { useEffect, useMemo, useState } from 'react';
import { CheckCheck, Filter, ChevronDown, CheckCircle2, Zap } from 'lucide-react';

import { listQuestions } from '../../api/client';
import type { Question, QuestionBank, WrongQuestion } from '../../api/types';
import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { LatexText } from '../../components/LatexText';
import { Pagination } from '../../components/Pagination';
import { StatusBadge } from '../../components/StatusBadge';
import { formatShortDate } from '../../lib/utils';
import { getMasteryStatusLabel } from '../../lib/statusHelpers';
import { cn } from '../../lib/utils';

interface WrongQuestionsPageProps {
  banks: QuestionBank[];
  wrongQuestions: WrongQuestion[];
  onChanged: (wrongQuestion: WrongQuestion) => Promise<void>;
}

export function WrongQuestionsPage({ banks, wrongQuestions, onChanged }: WrongQuestionsPageProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [bankFilter, setBankFilter] = useState('all');
  const [masteryFilter, setMasteryFilter] = useState('unmastered');
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [isBatchMastering, setIsBatchMastering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    let isMounted = true;
    Promise.all(banks.map((bank) => listQuestions(bank.id)))
      .then((groups) => {
        if (isMounted) setQuestions(groups.flat());
      })
      .catch((caught) => {
        if (isMounted) setError(caught instanceof Error ? caught.message : '错题详情加载失败');
      });
    return () => {
      isMounted = false;
    };
  }, [banks]);

  const questionById = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);
  const visible = useMemo(() => wrongQuestions.filter((item) => {
    const question = questionById.get(item.question_id);
    const bankMatches = bankFilter === 'all' || question?.bank_id === Number(bankFilter);
    const masteryMatches = masteryFilter === 'all' || item.mastery_status === masteryFilter;
    return bankMatches && masteryMatches;
  }), [wrongQuestions, bankFilter, masteryFilter, questionById]);
  const paged = useMemo(() => visible.slice((page - 1) * pageSize, page * pageSize), [visible, page, pageSize]);

  async function handleMastered(item: WrongQuestion) {
    setWorkingId(item.id);
    setError(null);
    try {
      await onChanged(item);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '状态更新失败');
    } finally {
      setWorkingId(null);
    }
  }

  async function handleMasterAll() {
    const unmastered = visible.filter((item) => item.mastery_status !== 'mastered');
    if (unmastered.length === 0) return;

    setIsBatchMastering(true);
    setError(null);
    const failedIds: number[] = [];
    try {
      for (const item of unmastered) {
        try {
          await onChanged(item);
        } catch {
          failedIds.push(item.id);
        }
      }
      if (failedIds.length > 0) {
        setError(`${failedIds.length} 项标记失败，其余已成功`);
      }
    } finally {
      setIsBatchMastering(false);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-black/[0.06]">
        <div>
          <h2 className="m-0 text-3xl font-bold text-black tracking-tight leading-tight">错题复盘</h2>
          <p className="mt-2 text-[14px] text-zinc-500 font-medium">按题库复习错误，逐个击破知识盲区。</p>
        </div>

        <div className="flex items-center gap-3">
          {visible.some((item) => item.mastery_status !== 'mastered') && (
            <button
              type="button"
              disabled={isBatchMastering}
              onClick={() => void handleMasterAll()}
              className="inline-flex items-center gap-2 h-[36px] px-4 rounded-lg bg-black text-white text-[13px] font-semibold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isBatchMastering ? (
                <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
              ) : (
                <Zap size={14} />
              )}
              {isBatchMastering ? '标记中...' : '一键全部掌握'}
            </button>
          )}
          <div className="flex items-center gap-3 bg-zinc-50/50 p-1.5 rounded-lg border border-black/[0.06] max-md:flex-col max-md:w-full">
            <div className="flex items-center gap-1.5 pl-2 pr-1 text-zinc-400">
              <Filter size={14} />
              <span className="text-[11px] font-semibold uppercase tracking-widest">Filters</span>
            </div>
            <div className="flex gap-2 w-full">
              <div className="relative flex-1 md:w-[160px]">
                <select
                  className="w-full h-[32px] pl-3 pr-8 appearance-none bg-white border border-black/[0.06] rounded-md text-[13px] font-semibold text-black shadow-sm focus:border-black focus:ring-1 focus:ring-black transition-shadow cursor-pointer"
                  value={bankFilter}
                  onChange={(event) => { setBankFilter(event.target.value); setPage(1); }}
                >
                  <option value="all">全部题库</option>
                  {banks.map((bank) => (
                    <option value={bank.id} key={bank.id}>{bank.name}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
              <div className="relative flex-1 md:w-[140px]">
                <select
                  className="w-full h-[32px] pl-3 pr-8 appearance-none bg-white border border-black/[0.06] rounded-md text-[13px] font-semibold text-black shadow-sm focus:border-black focus:ring-1 focus:ring-black transition-shadow cursor-pointer"
                  value={masteryFilter}
                  onChange={(event) => { setMasteryFilter(event.target.value); setPage(1); }}
                >
                  <option value="unmastered">待掌握</option>
                  <option value="mastered">已掌握</option>
                  <option value="all">全部状态</option>
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {error ? <ErrorAlert message={error} /> : null}

      {visible.length === 0 ? (
        <div className="py-16 bg-white rounded-xl border border-black/[0.06] shadow-sm">
          <EmptyState 
            title="没有符合条件的错题" 
            description="完成练习后，答错的题目会自动归集到这里。" 
            icon={<CheckCircle2 size={48} className="text-zinc-200" />}
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm overflow-hidden">
          <div className="grid gap-0 divide-y divide-black/[0.04]">
            {paged.map((item) => {
              const question = questionById.get(item.question_id);
              const bank = banks.find((candidate) => candidate.id === question?.bank_id);
              const isMastered = item.mastery_status === 'mastered';

              return (
                <article
                  key={item.id}
                  className={cn(
                    "group flex flex-col md:flex-row md:items-start justify-between gap-6 p-5 transition-all duration-300",
                    isMastered ? "opacity-60" : "hover:bg-zinc-50/50"
                  )}
                >
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <StatusBadge className={cn("text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider rounded border", isMastered ? 'bg-zinc-100 text-zinc-500 border-zinc-200' : 'bg-amber-50 text-amber-700 border-amber-200')}>
                        {getMasteryStatusLabel(item.mastery_status)}
                      </StatusBadge>
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">
                        <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-black/[0.04]">{bank?.name ?? 'Loading...'}</span>
                        <span>/</span>
                        <span className="text-red-600/80">Missed {item.wrong_count}x</span>
                        {item.last_wrong_at && (
                          <>
                            <span>/</span>
                            <span>{formatShortDate(item.last_wrong_at)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <h3 className={cn("m-0 text-[15px] font-semibold leading-relaxed tracking-tight", isMastered ? "text-zinc-500 line-through decoration-zinc-300 decoration-1" : "text-black")}>
                      <LatexText text={question?.stem ?? `Question #${item.question_id}`} />
                    </h3>

                    {/* Options */}
                    {question && question.options.length > 0 && (
                      <div className="mt-3 grid gap-1.5">
                        {question.options.map((opt, optIndex) => {
                          const label = opt.label ?? String.fromCharCode(65 + optIndex);
                          return (
                            <div
                              key={opt.id ?? label}
                              className={cn(
                                "flex items-start gap-3 px-3 py-2 rounded-md border text-[13px]",
                                opt.is_correct
                                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                  : "bg-white border-black/[0.06] text-zinc-600"
                              )}
                            >
                              <span className={cn(
                                "flex-shrink-0 font-bold",
                                opt.is_correct ? "text-emerald-600" : "text-zinc-400"
                              )}>
                                {label}.
                              </span>
                              <span className="flex-1"><LatexText text={opt.content} /></span>
                              {opt.is_correct && <CheckCircle2 size={14} className="flex-shrink-0 text-emerald-500 mt-0.5" />}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Answer for non-choice questions */}
                    {question && question.options.length === 0 && question.answer_text && (
                      <div className="mt-3 inline-block px-3 py-1.5 rounded-md bg-emerald-50 border border-emerald-200/60 text-[13px] text-emerald-700 font-medium">
                        <span className="text-emerald-500 mr-2">正确答案：</span>
                        {question.answer_text}
                      </div>
                    )}

                    {question?.explanation && (
                      <div className="mt-4 p-3.5 rounded-lg bg-zinc-50/80 border border-black/[0.04] text-[13px] text-zinc-600 leading-relaxed">
                        <strong className="text-black font-semibold mr-2">解析：</strong>
                        <LatexText text={question.explanation} />
                      </div>
                    )}
                  </div>

                  {!isMastered && (
                    <div className="flex-shrink-0 flex justify-end">
                      <button
                        className="inline-flex items-center justify-center gap-2 h-[36px] px-4 rounded-md bg-white border border-black/[0.1] text-black text-[13px] font-semibold hover:bg-zinc-50 hover:border-black/[0.2] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        type="button"
                        disabled={workingId === item.id}
                        onClick={() => handleMastered(item)}
                      >
                        {workingId === item.id ? (
                          <span className="animate-spin inline-block w-4 h-4 border-2 border-black/[0.2] border-t-black rounded-full" />
                        ) : (
                          <CheckCheck size={16} className="text-emerald-600" />
                        )}
                        <span>{workingId === item.id ? '正在更新' : '标记已掌握'}</span>
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          <Pagination page={page} total={visible.length} pageSize={pageSize} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
