import { useEffect, useMemo, useState } from 'react';
import { CheckCheck } from 'lucide-react';

import { listQuestions, markWrongQuestionMastered } from '../../api/client';
import type { Question, QuestionBank, WrongQuestion } from '../../api/types';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';

interface WrongQuestionsPageProps {
  banks: QuestionBank[];
  wrongQuestions: WrongQuestion[];
  onChanged: (wrongQuestion: WrongQuestion) => void;
}

export function WrongQuestionsPage({ banks, wrongQuestions, onChanged }: WrongQuestionsPageProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [bankFilter, setBankFilter] = useState('all');
  const [masteryFilter, setMasteryFilter] = useState('unmastered');
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    Promise.all(banks.map((bank) => listQuestions(bank.id)))
      .then((groups) => {
        if (isMounted) setQuestions(groups.flat());
      })
      .catch((caught) => {
        if (isMounted) setError(caught instanceof Error ? caught.message : '错题详情加载失败');
      });
    return () => { isMounted = false; };
  }, [banks]);

  const questionById = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);
  const visible = wrongQuestions.filter((item) => {
    const question = questionById.get(item.question_id);
    const bankMatches = bankFilter === 'all' || question?.bank_id === Number(bankFilter);
    const masteryMatches = masteryFilter === 'all' || item.mastery_status === masteryFilter;
    return bankMatches && masteryMatches;
  });

  async function handleMastered(item: WrongQuestion) {
    setWorkingId(item.id);
    setError(null);
    try {
      onChanged(await markWrongQuestionMastered(item.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '状态更新失败');
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel__header wrong-header">
        <div><h2>错题本</h2><p>按题库复盘错误，并标记已经掌握的题目。</p></div>
        <div className="filter-row">
          <label className="compact-field"><span>题库</span><select value={bankFilter} onChange={(event) => setBankFilter(event.target.value)}><option value="all">全部题库</option>{banks.map((bank) => <option value={bank.id} key={bank.id}>{bank.name}</option>)}</select></label>
          <label className="compact-field"><span>状态</span><select value={masteryFilter} onChange={(event) => setMasteryFilter(event.target.value)}><option value="unmastered">未掌握</option><option value="mastered">已掌握</option><option value="all">全部状态</option></select></label>
        </div>
      </div>
      {error ? <div className="inline-alert" role="alert">{error}</div> : null}
      {visible.length === 0 ? <EmptyState title="没有符合条件的错题" description="完成练习后，答错的题目会自动归集到这里。" /> : (
        <div className="wrong-list">
          {visible.map((item) => {
            const question = questionById.get(item.question_id);
            const bank = banks.find((candidate) => candidate.id === question?.bank_id);
            return <article className="wrong-row" key={item.id}>
              <div className="wrong-row__main"><div className="wrong-row__meta"><span>{bank?.name ?? '题库加载中'}</span><StatusBadge tone={item.mastery_status === 'mastered' ? 'success' : 'warning'}>{item.mastery_status === 'mastered' ? '已掌握' : '未掌握'}</StatusBadge></div><h3>{question?.stem ?? `题目 #${item.question_id}`}</h3><p>累计答错 {item.wrong_count} 次{item.last_wrong_at ? ` · 最近 ${formatDate(item.last_wrong_at)}` : ''}</p>{question?.explanation ? <p className="wrong-row__explanation">解析：{question.explanation}</p> : null}</div>
              {item.mastery_status !== 'mastered' ? <button className="secondary-button" type="button" disabled={workingId === item.id} onClick={() => handleMastered(item)}><CheckCheck size={16} aria-hidden="true" />{workingId === item.id ? '正在更新' : '标记已掌握'}</button> : null}
            </article>;
          })}
        </div>
      )}
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(value));
}
