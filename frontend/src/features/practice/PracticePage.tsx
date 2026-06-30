import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { BookOpenCheck, Settings2, Sparkles, CheckCircle2, XCircle, Eye, EyeOff, ArrowRight, ArrowLeft } from 'lucide-react';

import { createPracticeSession, finishPracticeSession, listPracticeQuestions, submitPracticeAnswer } from '../../api/client';
import type { PracticeAnswer, PracticeSession, Question, QuestionBank, QuestionType, WrongQuestion } from '../../api/types';
import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { LatexText } from '../../components/LatexText';
import { PracticeResultPage } from './PracticeResultPage';
import { getQuestionTypeLabel } from '../../lib/statusHelpers';
import { cn } from '../../lib/utils';

interface PracticePageProps {
  banks: QuestionBank[];
  wrongQuestions: WrongQuestion[];
  onPracticeFinished: () => void | Promise<void>;
}

type PracticeOrder = 'sequential' | 'random';
type PracticeMode = 'practice' | 'exam';

export function PracticePage({ banks, wrongQuestions, onPracticeFinished }: PracticePageProps) {
  const [bankId, setBankId] = useState(banks[0]?.id ? String(banks[0].id) : '');
  const [questionCount, setQuestionCount] = useState<number | '' | 'custom'>('');
  const [customCount, setCustomCount] = useState('');
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([]);
  const [order, setOrder] = useState<PracticeOrder>('sequential');
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('practice');
  const [wrongOnly, setWrongOnly] = useState(false);
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string | string[]>>({});
  const [submittedMap, setSubmittedMap] = useState<Record<number, PracticeAnswer>>({});
  const [revealedSet, setRevealedSet] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<PracticeSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [isSubmittingAll, setIsSubmittingAll] = useState(false);

  const unmasteredWrongCount = wrongQuestions.filter((item) => item.mastery_status !== 'mastered').length;

  // banks 异步加载后，自动选中第一个
  useEffect(() => {
    if (!bankId && banks.length > 0) {
      setBankId(String(banks[0].id));
    }
  }, [banks, bankId]);

  async function handleStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bankId) {
      setError('请先选择题库');
      return;
    }

    setIsWorking(true);
    setError(null);
    try {
      const allQuestions = await listPracticeQuestions(Number(bankId));
      const typeFiltered = questionTypes.length > 0
        ? allQuestions.filter((q) => questionTypes.includes(q.question_type))
        : allQuestions;
      const eligible = wrongOnly
        ? typeFiltered.filter((question) => wrongQuestions.some((item) => item.question_id === question.id && item.mastery_status !== 'mastered'))
        : typeFiltered;
      const ordered = order === 'random' ? shuffle(eligible) : eligible;
      const count = questionCount === 'custom' ? (Number(customCount) || 0) : questionCount;
      const selected = count === '' ? ordered : ordered.slice(0, Math.max(1, count));
      if (selected.length === 0) {
        setError(wrongOnly ? '这个题库暂时没有未掌握的错题' : '这个题库还没有可练习的题目');
        return;
      }

      const created = await createPracticeSession({
        bank_id: Number(bankId),
        mode: order,
        question_count: selected.length,
      });
      setSession(created);
      setSessionQuestions(selected.slice(0, created.question_count));
      setAnswers({});
      setSubmittedMap({});
      setRevealedSet(new Set());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '练习创建失败');
    } finally {
      setIsWorking(false);
    }
  }

  function toggleQuestionType(type: QuestionType) {
    setQuestionTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  const submittingRef = useRef<Set<number>>(new Set());

  function setAnswerForQuestion(questionId: number, value: string | string[]) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  // Practice mode: auto-reveal on answer selection for choice questions
  const handleAutoReveal = useCallback(async (question: Question, value: string | string[]) => {
    if (!session || submittingRef.current.has(question.id)) return;
    submittingRef.current.add(question.id);
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
    setError(null);
    try {
      const saved = await submitPracticeAnswer(session.id, {
        question_id: question.id,
        user_answer: value,
        elapsed_seconds: 0,
      });
      setSubmittedMap((prev) => ({ ...prev, [question.id]: saved }));
      setRevealedSet((prev) => new Set(prev).add(question.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '提交失败');
    } finally {
      submittingRef.current.delete(question.id);
    }
  }, [session]);

  async function handleSubmitAll() {
    if (!session) return;
    const unanswered = sessionQuestions.filter((q) => !hasAnswer(answers[q.id]));
    if (unanswered.length > 0) {
      setError(`还有 ${unanswered.length} 题未作答`);
      const first = document.getElementById(`question-${unanswered[0].id}`);
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setIsSubmittingAll(true);
    setError(null);
    try {
      const allAnswers: PracticeAnswer[] = [];
      const questionsToSubmit = sessionQuestions.filter((q) => !submittedMap[q.id]);

      // Submit all unanswered questions in parallel
      const submitPromises = questionsToSubmit.map((question) =>
        submitPracticeAnswer(session.id, {
          question_id: question.id,
          user_answer: answers[question.id],
          elapsed_seconds: 0,
        })
      );

      const newAnswers = await Promise.all(submitPromises);

      // Merge with already submitted answers
      let newIndex = 0;
      for (const question of sessionQuestions) {
        if (submittedMap[question.id]) {
          allAnswers.push(submittedMap[question.id]);
        } else {
          allAnswers.push(newAnswers[newIndex++]);
        }
      }

      const finished = await finishPracticeSession(session.id);
      setResult({ ...finished, answers: finished.answers.length ? finished.answers : allAnswers });
      await onPracticeFinished();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '提交失败');
    } finally {
      setIsSubmittingAll(false);
    }
  }

  function restart() {
    setSession(null);
    setResult(null);
    setSessionQuestions([]);
    setAnswers({});
    setSubmittedMap({});
    setRevealedSet(new Set());
    setError(null);
  }

  if (result) {
    return <PracticeResultPage session={result} questions={sessionQuestions} onRestart={restart} />;
  }

  if (session && sessionQuestions.length > 0) {
    const isExamMode = practiceMode === 'exam';

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4 pb-4 border-b border-black/[0.06]">
          <div>
            <h2 className="m-0 text-xl font-bold text-black tracking-tight">
              {isExamMode ? '考试模式' : '练习模式'}
            </h2>
            <p className="mt-1 text-[13px] text-zinc-500">
              共 {sessionQuestions.length} 题
              {isExamMode ? '，全部答完后提交查看结果' : '，选择后即时查看答案'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-slate-300 text-slate-700 bg-white text-[13px] font-bold hover:bg-slate-50"
              type="button"
              onClick={restart}
            >
              <ArrowLeft size={14} />
              返回
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 min-h-[36px] px-3 rounded-lg border border-slate-300 text-slate-700 bg-white text-[13px] font-bold hover:bg-slate-50"
              type="button"
              onClick={restart}
            >
              重新开始
            </button>
          </div>
        </header>

        {error ? <ErrorAlert message={error} /> : null}

        <div className="space-y-6">
          {sessionQuestions.map((question, index) => {
            const currentAnswer = answers[question.id];
            const submitted = submittedMap[question.id];
            const isRevealed = revealedSet.has(question.id);

            const isUnanswered = !hasAnswer(currentAnswer);

            return (
              <article key={question.id} id={`question-${question.id}`} className={cn(
                "bg-white rounded-xl shadow-sm border overflow-hidden scroll-mt-24 transition-colors",
                isUnanswered ? "border-red-200" : "border-black/[0.06]"
              )}>
                <div className="px-6 py-4 border-b border-black/[0.04] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "inline-flex items-center justify-center w-7 h-7 rounded-md text-[12px] font-bold",
                      isUnanswered ? "bg-red-50 text-red-600" : "bg-zinc-100 text-zinc-700"
                    )}>
                      {index + 1}
                    </span>
                    <span className="inline-flex items-center justify-center h-6 px-2 rounded-md bg-zinc-100 border border-black/[0.04] text-[11px] font-bold text-zinc-600 tracking-widest uppercase">
                      {getQuestionTypeLabel(question.question_type)}
                    </span>
                    {isUnanswered && (
                      <span className="inline-flex items-center h-6 px-2 rounded-md bg-red-50 text-[11px] font-bold text-red-500">
                        未作答
                      </span>
                    )}
                    {isRevealed && submitted && (
                      <>
                        <span className={cn(
                          'inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-bold',
                          submitted.is_correct ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        )}>
                          {submitted.is_correct ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                          {submitted.is_correct ? '正确' : '错误'}
                        </span>
                        {submitted.feedback && (
                          <span className="text-[11px] text-zinc-400 font-medium ml-1">
                            AI：{submitted.feedback}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="px-6 py-4">
                  <h3 className="m-0 text-[15px] font-semibold text-black leading-relaxed tracking-tight mb-4">
                    <LatexText text={question.stem} />
                  </h3>

                  <AnswerControl
                    question={question}
                    answer={currentAnswer ?? ''}
                    onChange={(value) => {
                      if (!isExamMode && !isRevealed) {
                        void handleAutoReveal(question, value);
                      } else {
                        setAnswerForQuestion(question.id, value);
                      }
                    }}
                    onBlur={() => {
                      if (!isExamMode && !isRevealed && isTextQuestion(question.question_type) && hasAnswer(currentAnswer)) {
                        void handleAutoReveal(question, currentAnswer!);
                      }
                    }}
                    disabled={isExamMode ? false : isRevealed}
                    revealed={isRevealed}
                    submitted={submitted}
                  />
                </div>
              </article>
            );
          })}
        </div>

        {/* Submit button at bottom */}
        <div className="flex justify-center pt-4 pb-8">
          <button
            className="inline-flex items-center justify-center gap-2 h-[44px] px-8 rounded-xl bg-black text-white text-[14px] font-bold shadow-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            type="button"
            disabled={isSubmittingAll}
            onClick={() => void handleSubmitAll()}
          >
            {isSubmittingAll ? (
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
            ) : (
              <ArrowRight size={16} />
            )}
            {isSubmittingAll ? '提交中...' : '提交并查看结果'}
          </button>
        </div>
      </div>
    );
  }

  if (banks.length === 0) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
        <header className="pb-6 border-b border-black/[0.06]">
          <h2 className="m-0 text-3xl font-bold text-black tracking-tight leading-tight">专属练习</h2>
          <p className="mt-2 text-[14px] text-zinc-500 font-medium">选择题库与模式，开启沉浸式答题体验。</p>
        </header>
        <div className="py-16 bg-white rounded-xl shadow-sm border border-black/[0.06]">
          <EmptyState
            title="还没有可练习的题库"
            description="先创建题库并加入题目，然后从这里开始练习。"
            icon={<BookOpenCheck size={48} className="text-zinc-200" />}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <header className="pb-6 border-b border-black/[0.06]">
        <h2 className="m-0 text-3xl font-bold text-black tracking-tight leading-tight">专属练习</h2>
        <p className="mt-2 text-[14px] text-zinc-500 font-medium">选择题库与模式，开启沉浸式答题体验。</p>
      </header>

      <section className="bg-white rounded-xl shadow-sm border border-black/[0.06] overflow-hidden">
        <div className="p-5 border-b border-black/[0.06] flex items-center gap-2 bg-zinc-50/50">
          <Settings2 size={16} className="text-black" />
          <h3 className="text-[14px] font-bold text-black uppercase tracking-widest">练习设置</h3>
        </div>

        <form className="p-6 md:p-8 space-y-6" aria-label="开始练习" onSubmit={handleStart}>
          {/* Row 1: 选择题库 / 练习模式 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <label className="grid gap-2">
              <span className="text-[13px] font-semibold text-zinc-700">选择题库</span>
              <select
                className="w-full h-[40px] px-3 appearance-none bg-white border border-black/[0.1] rounded-md text-[13px] font-semibold text-black shadow-sm focus:border-black focus:ring-1 focus:ring-black transition-all cursor-pointer"
                value={bankId}
                onChange={(event) => setBankId(event.target.value)}
                required
              >
                {banks.map((bank) => (
                  <option key={bank.id} value={bank.id}>{bank.name}（{bank.question_count ?? 0} 题）</option>
                ))}
              </select>
            </label>

            <div className="grid gap-2">
              <span className="text-[13px] font-semibold text-zinc-700">练习模式</span>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'practice' as PracticeMode, label: '练习模式', icon: Eye },
                  { value: 'exam' as PracticeMode, label: '考试模式', icon: EyeOff },
                ].map((item) => {
                  const isChecked = practiceMode === item.value;
                  return (
                    <label
                      key={item.value}
                      className={cn(
                        "flex items-center gap-2.5 h-[40px] px-3 rounded-md border cursor-pointer transition-all",
                        isChecked ? "border-black bg-zinc-50 shadow-sm" : "border-black/[0.1] bg-white hover:border-black/[0.2]"
                      )}
                    >
                      <input
                        type="radio"
                        name="practiceMode"
                        checked={isChecked}
                        onChange={() => setPracticeMode(item.value)}
                        className="hidden"
                      />
                      <item.icon size={16} className={isChecked ? "text-black" : "text-zinc-400"} />
                      <span className={cn("text-[13px] font-semibold", isChecked ? "text-black" : "text-zinc-500")}>{item.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Row 2: 题目数量 / 出题顺序 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="grid gap-2">
                <span className="text-[13px] font-semibold text-zinc-700">题目数量</span>
                <select
                  className="w-full h-[40px] px-3 appearance-none bg-white border border-black/[0.1] rounded-md text-[13px] font-semibold text-black shadow-sm focus:border-black focus:ring-1 focus:ring-black transition-all cursor-pointer"
                  value={questionCount}
                  onChange={(event) => {
                    const val = event.target.value;
                    setQuestionCount(val === '' ? '' : val === 'custom' ? 'custom' : Number(val));
                  }}
                >
                  <option value="">全部</option>
                  {[5, 10, 20, 30, 50].map((n) => (
                    <option key={n} value={n}>{n} 题</option>
                  ))}
                  <option value="custom">自定义</option>
                </select>
              </label>
              {questionCount === 'custom' && (
                <input
                  type="number"
                  min={1}
                  max={500}
                  className="w-full h-[40px] px-3 bg-white border border-black/[0.1] rounded-md text-[13px] font-semibold text-black shadow-sm outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
                  placeholder="输入题目数量"
                  value={customCount}
                  onChange={(event) => setCustomCount(event.target.value)}
                />
              )}
            </div>

            <label className="grid gap-2">
              <span className="text-[13px] font-semibold text-zinc-700">出题顺序</span>
              <select
                className="w-full h-[40px] px-3 appearance-none bg-white border border-black/[0.1] rounded-md text-[13px] font-semibold text-black shadow-sm focus:border-black focus:ring-1 focus:ring-black transition-all cursor-pointer"
                value={order}
                onChange={(event) => setOrder(event.target.value as PracticeOrder)}
              >
                <option value="sequential">按题库顺序</option>
                <option value="random">随机顺序</option>
              </select>
            </label>
          </div>

          {/* Row 3: 题目类型 / 只练错题 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="grid gap-2">
              <span className="text-[13px] font-semibold text-zinc-700">题目类型</span>
              <div className="flex flex-wrap gap-2">
                {([
                  { value: 'single_choice' as QuestionType, label: '单选题', icon: '◉' },
                  { value: 'multiple_choice' as QuestionType, label: '多选题', icon: '☑' },
                  { value: 'true_false' as QuestionType, label: '判断题', icon: '⚖' },
                  { value: 'fill_blank' as QuestionType, label: '填空题', icon: '▢' },
                  { value: 'short_answer' as QuestionType, label: '简答题', icon: '✎' },
                ]).map((item) => {
                  const isActive = questionTypes.includes(item.value);
                  return (
                    <button
                      key={item.value}
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[12px] font-semibold transition-all",
                        isActive
                          ? "border-black bg-zinc-50 text-black shadow-sm"
                          : "border-black/[0.1] bg-white text-zinc-500 hover:border-black/[0.2] hover:text-black"
                      )}
                      onClick={() => toggleQuestionType(item.value)}
                    >
                      <span>{item.icon}</span>
                      {item.label}
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] text-zinc-400">不选则包含全部题型</span>
            </div>

            <div className="grid gap-2">
              <span className="text-[13px] font-semibold text-zinc-700">
                只练未掌握错题
                <span className="text-[11px] text-zinc-400 font-normal ml-1.5">（当前 {unmasteredWrongCount} 道待复习）</span>
              </span>
              <button
                type="button"
                disabled={unmasteredWrongCount === 0 && !wrongOnly}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[12px] font-semibold transition-all self-start",
                  wrongOnly
                    ? "border-black bg-zinc-50 text-black shadow-sm"
                    : unmasteredWrongCount === 0
                      ? "border-black/[0.06] bg-zinc-50 text-zinc-300 cursor-not-allowed"
                      : "border-black/[0.1] bg-white text-zinc-500 hover:border-black/[0.2] hover:text-black"
                )}
                onClick={() => setWrongOnly(!wrongOnly)}
              >
                <span>♻</span>
                {wrongOnly ? '已开启仅练错题' : unmasteredWrongCount === 0 ? '暂无待复习错题' : '点击开启'}
              </button>
              <span className="text-[11px] text-zinc-400">不开启则练习全部题目</span>
            </div>
          </div>

          {error ? <ErrorAlert message={error} /> : null}

          <div className="mt-10 flex justify-end">
            <button
              className="inline-flex items-center justify-center gap-2 h-[42px] px-8 rounded-md bg-black text-white text-[13px] font-semibold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              type="submit"
              disabled={isWorking}
            >
              {isWorking ? (
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
              ) : (
                <Sparkles size={16} />
              )}
              {isWorking ? '正在准备...' : '开始练习'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AnswerControl({
  question,
  answer,
  onChange,
  disabled,
  revealed,
  submitted,
  onBlur,
}: {
  question: Question;
  answer: string | string[];
  onChange: (value: string | string[]) => void;
  disabled?: boolean;
  revealed?: boolean;
  submitted?: PracticeAnswer;
  onBlur?: () => void;
}) {
  const correctLabels = submitted?.correct_option_labels
    ?? question.options.filter((option) => option.is_correct).map((option) => option.label ?? '');

  if (question.question_type === 'single_choice' || question.question_type === 'true_false') {
    return (
      <div className="grid gap-2">
        {question.options.map((option, index) => {
          const label = option.label ?? String.fromCharCode(65 + index);
          const isChecked = answer === label;
          const isCorrect = correctLabels.includes(label);
          const showResult = revealed && submitted;

          return (
            <label
              key={option.id ?? label}
              className={cn(
                "group flex items-start gap-4 min-h-[44px] px-4 py-3 rounded-lg border cursor-pointer transition-all duration-200",
                showResult && isCorrect ? "border-emerald-400 bg-emerald-50" :
                showResult && isChecked && !isCorrect ? "border-red-300 bg-red-50" :
                isChecked ? "border-black bg-zinc-50 shadow-sm" :
                "border-black/[0.08] bg-white hover:border-black/[0.2] hover:bg-zinc-50/50",
                disabled && "opacity-60 cursor-default"
              )}
            >
              <div className="relative flex-shrink-0 flex items-center justify-center w-[18px] h-[18px] rounded-full border border-black/[0.2] bg-white mt-0.5">
                <input
                  type="radio"
                  name={`q-${question.id}`}
                  checked={isChecked}
                  onChange={() => onChange(label)}
                  disabled={disabled}
                  className="peer absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="pointer-events-none absolute inset-[3px] rounded-full bg-black opacity-0 peer-checked:opacity-100 transition-opacity" />
              </div>
              <span className={cn("text-[14px] leading-relaxed flex-1", isChecked ? "text-black font-medium" : "text-zinc-700")}>
                <strong className="mr-2 font-bold opacity-60">{label}.</strong>
                <LatexText text={option.content} />
              </span>
              {showResult && isCorrect && <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0 mt-1" />}
              {showResult && isChecked && !isCorrect && <XCircle size={16} className="text-red-500 flex-shrink-0 mt-1" />}
            </label>
          );
        })}
      </div>
    );
  }

  if (question.question_type === 'multiple_choice') {
    const selected = Array.isArray(answer) ? answer : [];
    return (
      <div className="grid gap-2">
        {question.options.map((option, index) => {
          const label = option.label ?? String.fromCharCode(65 + index);
          const isChecked = selected.includes(label);
          const isCorrect = correctLabels.includes(label);
          const showResult = revealed && submitted;

          return (
            <label
              key={option.id ?? label}
              className={cn(
                "group flex items-start gap-4 min-h-[44px] px-4 py-3 rounded-lg border cursor-pointer transition-all duration-200",
                showResult && isCorrect ? "border-emerald-400 bg-emerald-50" :
                showResult && isChecked && !isCorrect ? "border-red-300 bg-red-50" :
                isChecked ? "border-black bg-zinc-50 shadow-sm" :
                "border-black/[0.08] bg-white hover:border-black/[0.2] hover:bg-zinc-50/50",
                disabled && "opacity-60 cursor-default"
              )}
            >
              <div className="relative flex-shrink-0 flex items-center justify-center w-[18px] h-[18px] rounded-[4px] border border-black/[0.2] bg-white mt-0.5">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onChange(isChecked ? selected.filter((item) => item !== label) : [...selected, label])}
                  disabled={disabled}
                  className="peer absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="pointer-events-none absolute inset-0 rounded-[3px] bg-black opacity-0 peer-checked:opacity-100 flex items-center justify-center transition-opacity">
                  <CheckCircle2 size={12} className="text-white" />
                </div>
              </div>
              <span className={cn("text-[14px] leading-relaxed flex-1", isChecked ? "text-black font-medium" : "text-zinc-700")}>
                <strong className="mr-2 font-bold opacity-60">{label}.</strong>
                <LatexText text={option.content} />
              </span>
              {showResult && isCorrect && <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0 mt-1" />}
              {showResult && isChecked && !isCorrect && <XCircle size={16} className="text-red-500 flex-shrink-0 mt-1" />}
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <span className="text-[13px] font-semibold text-zinc-700">你的答案</span>
      <textarea
        className="w-full min-h-[100px] p-3 border border-black/[0.1] rounded-md text-[14px] text-black bg-white outline-none focus:border-black focus:ring-1 focus:ring-black transition-all resize-y"
        value={Array.isArray(answer) ? answer.join('、') : answer}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => onBlur?.()}
        rows={3}
        placeholder="请在此输入你的详细答案..."
        disabled={disabled}
        required
      />
    </div>
  );
}

function hasAnswer(answer: string | string[] | undefined): boolean {
  if (!answer) return false;
  return Array.isArray(answer) ? answer.length > 0 : answer.trim().length > 0;
}

function isTextQuestion(type: string): boolean {
  return type === 'fill_blank' || type === 'short_answer';
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}
