import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Question, QuestionBank, QuestionOption, QuestionPayload } from '../../api/types';
import { EmptyState } from '../../components/EmptyState';
import { Field } from '../../components/Field';
import { StatusBadge } from '../../components/StatusBadge';

interface BankDetailPageProps {
  bank: QuestionBank;
  questions: Question[];
  onBack: () => void;
  onCreateQuestion: (payload: QuestionPayload) => Promise<void>;
  onUpdateQuestion: (questionId: number, payload: QuestionPayload) => Promise<void>;
  onDeleteQuestion: (questionId: number) => Promise<void>;
}

const emptyOptions: QuestionOption[] = [
  { content: '', is_correct: true },
  { content: '', is_correct: false }
];

export function BankDetailPage({
  bank,
  questions,
  onBack,
  onCreateQuestion,
  onUpdateQuestion,
  onDeleteQuestion
}: BankDetailPageProps) {
  const [editing, setEditing] = useState<Question | null>(null);
  const [stem, setStem] = useState('');
  const [questionType, setQuestionType] = useState('single_choice');
  const [difficulty, setDifficulty] = useState('medium');
  const [explanation, setExplanation] = useState('');
  const [options, setOptions] = useState<QuestionOption[]>(emptyOptions);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      return;
    }
    setStem(editing.stem);
    setQuestionType(editing.question_type);
    setDifficulty(editing.difficulty);
    setExplanation(editing.explanation ?? '');
    setOptions(editing.options.length ? editing.options : emptyOptions);
  }, [editing]);

  const actionLabel = useMemo(() => (editing ? '保存题目' : '添加题目'), [editing]);

  function resetForm() {
    setEditing(null);
    setStem('');
    setQuestionType('single_choice');
    setDifficulty('medium');
    setExplanation('');
    setOptions(emptyOptions);
  }

  function updateOption(index: number, content: string) {
    setOptions((current) => current.map((option, optionIndex) => (optionIndex === index ? { ...option, content } : option)));
  }

  function markCorrect(index: number) {
    setOptions((current) => current.map((option, optionIndex) => ({ ...option, is_correct: optionIndex === index })));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    const payload: QuestionPayload = {
      stem,
      question_type: questionType,
      difficulty,
      explanation,
      options: options.filter((option) => option.content.trim())
    };

    try {
      if (editing) {
        await onUpdateQuestion(editing.id, payload);
      } else {
        await onCreateQuestion(payload);
      }
      resetForm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '题目保存失败');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="bank-detail-title">
      <div className="panel__header">
        <div>
          <h2 id="bank-detail-title">{bank.name}</h2>
          <p>{bank.description || '维护题目、选项和解析。'}</p>
        </div>
        <button className="secondary-button" type="button" onClick={onBack}>
          返回题库
        </button>
      </div>

      <form className="panel__header" aria-label="题目编辑" onSubmit={handleSubmit}>
        <Field label="题干" value={stem} onChange={(event) => setStem(event.target.value)} placeholder="输入题干" required />
        <label className="field">
          <span className="field__label">题型</span>
          <select className="field__control" value={questionType} onChange={(event) => setQuestionType(event.target.value)}>
            <option value="single_choice">单选题</option>
            <option value="multiple_choice">多选题</option>
            <option value="short_answer">简答题</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">难度</span>
          <select className="field__control" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
            <option value="easy">简单</option>
            <option value="medium">中等</option>
            <option value="hard">困难</option>
          </select>
        </label>
        <Field label="解析" value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder="可选" />
        {options.map((option, index) => (
          <label className="field" key={index}>
            <span className="field__label">选项 {index + 1}</span>
            <input className="field__control" value={option.content} onChange={(event) => updateOption(index, event.target.value)} />
            <span>
              <input type="radio" checked={option.is_correct} onChange={() => markCorrect(index)} /> 正确答案
            </span>
          </label>
        ))}
        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}
        <button className="primary-button" type="submit" disabled={isSaving}>
          {actionLabel}
        </button>
      </form>

      {questions.length ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>题干</th>
              <th>题型</th>
              <th>难度</th>
              <th>选项</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((question) => (
              <tr key={question.id}>
                <td>{question.stem}</td>
                <td>
                  <StatusBadge>{question.question_type}</StatusBadge>
                </td>
                <td>{question.difficulty}</td>
                <td>{question.options.map((option) => option.content).join(' / ')}</td>
                <td>
                  <button className="text-button" type="button" onClick={() => setEditing(question)}>
                    编辑
                  </button>
                  <button className="text-button" type="button" onClick={() => void onDeleteQuestion(question.id)}>
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState title="暂无题目" description="可以手动创建题目，也可以从文档导入生成草稿。" />
      )}
    </section>
  );
}
