import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { ImportJobCreate, QuestionBank } from '../../api/types';
import { Field } from '../../components/Field';

interface NewImportPageProps {
  banks: QuestionBank[];
  onCreate: (payload: ImportJobCreate) => Promise<void>;
  onCancel: () => void;
}

const questionTypeOptions = [
  { value: 'single_choice', label: '单选题' },
  { value: 'multiple_choice', label: '多选题' },
  { value: 'short_answer', label: '简答题' }
];

export function NewImportPage({ banks, onCreate, onCancel }: NewImportPageProps) {
  const [bankId, setBankId] = useState(banks[0]?.id.toString() ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [questionCount, setQuestionCount] = useState(10);
  const [questionTypes, setQuestionTypes] = useState<string[]>(['single_choice']);
  const [difficulty, setDifficulty] = useState('medium');
  const [language, setLanguage] = useState('zh-CN');
  const [withExplanations, setWithExplanations] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = useMemo(() => Boolean(bankId && file), [bankId, file]);

  useEffect(() => {
    if (!bankId && banks[0]) {
      setBankId(String(banks[0].id));
    }
  }, [bankId, banks]);

  function toggleQuestionType(value: string) {
    setQuestionTypes((current) => {
      if (current.includes(value)) {
        const next = current.filter((item) => item !== value);
        return next.length ? next : current;
      }
      return [...current, value];
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError('请选择文件');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await onCreate({
        bank_id: Number(bankId),
        file,
        question_count: questionCount,
        question_types: questionTypes,
        difficulty,
        language,
        with_explanations: withExplanations
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '导入任务创建失败');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="new-import-title">
      <div className="panel__header">
        <div>
          <h2 id="new-import-title">新建导入</h2>
          <p>选择题库、文档和生成参数。</p>
        </div>
        <button className="secondary-button" type="button" onClick={onCancel}>
          返回列表
        </button>
      </div>

      <form className="panel__header" aria-label="新建导入任务" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">目标题库</span>
          <select className="field__control" value={bankId} onChange={(event) => setBankId(event.target.value)} required>
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </select>
        </label>
        <Field label="文件" type="file" accept=".pdf,.doc,.docx,.txt,.md" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required />
        <Field
          label="题目数量"
          type="number"
          min={1}
          max={100}
          value={questionCount}
          onChange={(event) => setQuestionCount(Number(event.target.value))}
          required
        />
        <fieldset className="field">
          <legend className="field__label">题型</legend>
          {questionTypeOptions.map((item) => (
            <label key={item.value}>
              <input
                type="checkbox"
                checked={questionTypes.includes(item.value)}
                onChange={() => toggleQuestionType(item.value)}
              />{' '}
              {item.label}
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span className="field__label">难度</span>
          <select className="field__control" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
            <option value="easy">简单</option>
            <option value="medium">中等</option>
            <option value="hard">困难</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">语言</span>
          <select className="field__control" value={language} onChange={(event) => setLanguage(event.target.value)}>
            <option value="zh-CN">中文</option>
            <option value="en-US">英文</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">解析</span>
          <span>
            <input type="checkbox" checked={withExplanations} onChange={(event) => setWithExplanations(event.target.checked)} /> 生成解析
          </span>
        </label>

        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}

        <button className="primary-button" type="submit" disabled={!canSubmit || isSubmitting}>
          开始导入
        </button>
      </form>
    </section>
  );
}
