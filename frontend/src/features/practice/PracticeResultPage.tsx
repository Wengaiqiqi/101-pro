import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';

import type { PracticeSession, Question } from '../../api/types';

interface PracticeResultPageProps {
  session: PracticeSession;
  questions: Question[];
  onRestart: () => void;
}

export function PracticeResultPage({ session, questions, onRestart }: PracticeResultPageProps) {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const correctCount = session.answers.filter((answer) => answer.is_correct).length;
  const wrongCount = session.answers.length - correctCount;

  return (
    <section className="panel practice-result" aria-label="练习结果">
      <div className="panel__header">
        <div>
          <h2>练习结果</h2>
          <p>本次共完成 {session.answers.length} 道题。</p>
        </div>
        <button className="secondary-button" type="button" onClick={onRestart}>
          <RotateCcw size={16} aria-hidden="true" />
          再练一次
        </button>
      </div>

      <div className="result-metrics" aria-label="成绩概览">
        <ResultMetric label="得分" value={`${session.score}/${session.answers.length}`} />
        <ResultMetric label="正确率" value={`${session.accuracy}%`} />
        <ResultMetric label="正确" value={String(correctCount)} tone="success" />
        <ResultMetric label="错误" value={String(wrongCount)} tone="danger" />
      </div>

      <div className="feedback-list">
        {session.answers.map((answer, index) => {
          const question = questionById.get(answer.question_id);
          return (
            <article className="feedback-row" key={answer.id}>
              <div className={`feedback-row__status feedback-row__status--${answer.is_correct ? 'correct' : 'wrong'}`}>
                {answer.is_correct ? <CheckCircle2 size={18} aria-hidden="true" /> : <XCircle size={18} aria-hidden="true" />}
                {answer.is_correct ? '回答正确' : '回答错误'}
              </div>
              <div>
                <strong>{index + 1}. {question?.stem ?? `题目 #${answer.question_id}`}</strong>
                <p>你的答案：{formatAnswer(answer.user_answer_json.value)}</p>
                {question?.explanation ? <p className="feedback-row__explanation">解析：{question.explanation}</p> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ResultMetric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'success' | 'danger' }) {
  return (
    <div className={`result-metric result-metric--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatAnswer(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join('、');
  }
  return value === undefined || value === null || value === '' ? '未作答' : String(value);
}
