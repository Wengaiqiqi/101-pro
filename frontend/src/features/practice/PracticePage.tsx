import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, BookOpenCheck } from 'lucide-react';

import { createPracticeSession, finishPracticeSession, listQuestions, submitPracticeAnswer } from '../../api/client';
import type { PracticeAnswer, PracticeSession, Question, QuestionBank, WrongQuestion } from '../../api/types';
import { EmptyState } from '../../components/EmptyState';
import { Field } from '../../components/Field';
import { PracticeResultPage } from './PracticeResultPage';

interface PracticePageProps {
  banks: QuestionBank[];
  wrongQuestions: WrongQuestion[];
  onPracticeFinished: () => void | Promise<void>;
}

type PracticeOrder = 'sequential' | 'random';

export function PracticePage({ banks, wrongQuestions, onPracticeFinished }: PracticePageProps) {
  const [bankId, setBankId] = useState(banks[0]?.id ? String(banks[0].id) : '');
  const [questionCount, setQuestionCount] = useState(10);
  const [order, setOrder] = useState<PracticeOrder>('sequential');
  const [wrongOnly, setWrongOnly] = useState(false);
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);
  const [submittedAnswers, setSubmittedAnswers] = useState<PracticeAnswer[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState<string | string[]>('');
  const [questionStartedAt, setQuestionStartedAt] = useState(Date.now());
  const [result, setResult] = useState<PracticeSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  async function handleStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bankId) {
      setError('请先选择题库');
      return;
    }

    setIsWorking(true);
    setError(null);
    try {
      const allQuestions = await listQuestions(Number(bankId));
      const eligible = wrongOnly
        ? allQuestions.filter((question) => wrongQuestions.some((item) => item.question_id === question.id && item.mastery_status !== 'mastered'))
        : allQuestions;
      const ordered = order === 'random' ? shuffle(eligible) : eligible;
      const selected = ordered.slice(0, Math.max(1, questionCount));
      if (selected.length === 0) {
        setError(wrongOnly ? '这个题库暂时没有未掌握的错题' : '这个题库还没有可练习的题目');
        return;
      }

      const created = await createPracticeSession({
        bank_id: Number(bankId),
        mode: wrongOnly ? 'wrong_questions' : order,
        question_count: selected.length
      });
      setSession(created);
      setSessionQuestions(selected.slice(0, created.question_count));
      setSubmittedAnswers([]);
      setCurrentIndex(0);
      setAnswer('');
      setQuestionStartedAt(Date.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '练习创建失败');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleSubmitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = sessionQuestions[currentIndex];
    if (!session || !question || !hasAnswer(answer)) {
      setError('请选择或填写答案');
      return;
    }

    setIsWorking(true);
    setError(null);
    try {
      const saved = await submitPracticeAnswer(session.id, {
        question_id: question.id,
        user_answer: answer,
        elapsed_seconds: Math.max(0, Math.round((Date.now() - questionStartedAt) / 1000))
      });
      const nextAnswers = [...submittedAnswers, saved];
      setSubmittedAnswers(nextAnswers);

      if (currentIndex === sessionQuestions.length - 1) {
        const finished = await finishPracticeSession(session.id);
        setResult({ ...finished, answers: finished.answers.length ? finished.answers : nextAnswers });
        await onPracticeFinished();
        return;
      }

      setCurrentIndex((current) => current + 1);
      setAnswer('');
      setQuestionStartedAt(Date.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '答案提交失败');
    } finally {
      setIsWorking(false);
    }
  }

  function restart() {
    setSession(null);
    setResult(null);
    setSessionQuestions([]);
    setSubmittedAnswers([]);
    setAnswer('');
    setError(null);
  }

  if (result) {
    return <PracticeResultPage session={result} questions={sessionQuestions} onRestart={restart} />;
  }

  if (session && sessionQuestions[currentIndex]) {
    const question = sessionQuestions[currentIndex];
    const isLast = currentIndex === sessionQuestions.length - 1;
    return (
      <section className="panel practice-runner" aria-label="练习题目">
        <div className="panel__header practice-runner__header">
          <div>
            <p className="practice-progress">第 {currentIndex + 1} / {sessionQuestions.length} 题</p>
            <h2>{question.stem}</h2>
          </div>
          <span className="practice-type">{questionTypeLabel(question.question_type)}</span>
        </div>
        <form className="practice-question" onSubmit={handleSubmitAnswer}>
          <AnswerControl question={question} answer={answer} onChange={setAnswer} />
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <button className="primary-button practice-submit" type="submit" disabled={isWorking}>
            {isWorking ? '正在提交...' : isLast ? '提交并查看结果' : '提交并进入下一题'}
            {!isWorking ? <ArrowRight size={16} aria-hidden="true" /> : null}
          </button>
        </form>
      </section>
    );
  }

  if (banks.length === 0) {
    return (
      <section className="panel">
        <EmptyState title="还没有可练习的题库" description="先创建题库并加入题目，然后从这里开始练习。" />
      </section>
    );
  }

  return (
    <section className="panel practice-setup-panel">
      <div className="panel__header">
        <div>
          <h2>开始练习</h2>
          <p>选择范围与顺序，完成后自动记录成绩和错题。</p>
        </div>
        <BookOpenCheck size={22} aria-hidden="true" />
      </div>
      <form className="practice-setup" aria-label="开始练习" onSubmit={handleStart}>
        <label className="field">
          <span className="field__label">题库</span>
          <select className="field__control" value={bankId} onChange={(event) => setBankId(event.target.value)} required>
            {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}（{bank.question_count ?? 0} 题）</option>)}
          </select>
        </label>
        <Field label="题目数量" type="number" min={1} max={100} value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} required />
        <label className="field">
          <span className="field__label">出题顺序</span>
          <select className="field__control" value={order} onChange={(event) => setOrder(event.target.value as PracticeOrder)} disabled={wrongOnly}>
            <option value="sequential">按题库顺序</option>
            <option value="random">随机顺序</option>
          </select>
        </label>
        <label className="check-control practice-setup__wide">
          <input type="checkbox" checked={wrongOnly} onChange={(event) => setWrongOnly(event.target.checked)} />
          <span><strong>只练未掌握错题</strong><small>当前账号共 {wrongQuestions.filter((item) => item.mastery_status !== 'mastered').length} 道</small></span>
        </label>
        {error ? <div className="form-error practice-setup__wide" role="alert">{error}</div> : null}
        <button className="primary-button practice-setup__wide" type="submit" disabled={isWorking}>
          {isWorking ? '正在准备...' : '开始练习'}
        </button>
      </form>
    </section>
  );
}

function AnswerControl({ question, answer, onChange }: { question: Question; answer: string | string[]; onChange: (value: string | string[]) => void }) {
  if (question.question_type === 'single_choice') {
    return <div className="answer-list">{question.options.map((option, index) => {
      const label = option.label ?? String.fromCharCode(65 + index);
      return <label className="answer-option" key={option.id ?? label}><input type="radio" name="answer" checked={answer === label} onChange={() => onChange(label)} /><span>{label}. {option.content}</span></label>;
    })}</div>;
  }

  if (question.question_type === 'multiple_choice') {
    const selected = Array.isArray(answer) ? answer : [];
    return <div className="answer-list">{question.options.map((option, index) => {
      const label = option.label ?? String.fromCharCode(65 + index);
      return <label className="answer-option" key={option.id ?? label}><input type="checkbox" checked={selected.includes(label)} onChange={() => onChange(selected.includes(label) ? selected.filter((item) => item !== label) : [...selected, label])} /><span>{label}. {option.content}</span></label>;
    })}</div>;
  }

  return <label className="field"><span className="field__label">你的答案</span><textarea className="field__control practice-text-answer" value={Array.isArray(answer) ? answer.join('、') : answer} onChange={(event) => onChange(event.target.value)} rows={5} required /></label>;
}

function hasAnswer(answer: string | string[]): boolean {
  return Array.isArray(answer) ? answer.length > 0 : answer.trim().length > 0;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function questionTypeLabel(type: string): string {
  return ({ single_choice: '单选题', multiple_choice: '多选题', fill_blank: '填空题', short_answer: '简答题' } as Record<string, string>)[type] ?? type;
}
