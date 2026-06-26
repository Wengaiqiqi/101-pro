import { FormEvent, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { QuestionBank } from '../../api/types';
import { EmptyState } from '../../components/EmptyState';
import { Field } from '../../components/Field';
import { StatusBadge } from '../../components/StatusBadge';

interface QuestionBankListPageProps {
  banks: QuestionBank[];
  onCreate: (payload: { name: string; description?: string }) => Promise<void>;
  onSelect: (bank: QuestionBank) => void;
}

export function QuestionBankListPage({ banks, onCreate, onSelect }: QuestionBankListPageProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsCreating(true);

    try {
      await onCreate({ name, description });
      setName('');
      setDescription('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '题库创建失败');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="banks-title">
      <div className="panel__header">
        <div>
          <h2 id="banks-title">题库</h2>
          <p>创建、选择并维护你的题库。</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => nameRef.current?.focus()}>
          <Plus size={15} aria-hidden="true" />
          新建题库
        </button>
      </div>

      <form className="panel__header" aria-label="新建题库" onSubmit={handleCreate}>
        <Field ref={nameRef} label="名称" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：高频错题" required />
        <Field label="描述" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="简短说明用途" />
        <button className="secondary-button" type="submit" disabled={isCreating}>
          <Plus size={15} aria-hidden="true" />
          创建题库
        </button>
      </form>

      {error ? (
        <div className="inline-alert" role="alert">
          {error}
        </div>
      ) : null}

      {banks.length ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>描述</th>
              <th>题目数</th>
              <th>可见性</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {banks.map((bank) => (
              <tr key={bank.id}>
                <td>{bank.name}</td>
                <td>{bank.description || '未填写'}</td>
                <td>{bank.question_count ?? '-'}</td>
                <td>
                  <StatusBadge>{bank.visibility}</StatusBadge>
                </td>
                <td>{formatDate(bank.updated_at)}</td>
                <td>
                  <button className="text-button" type="button" onClick={() => onSelect(bank)}>
                    查看题目
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState title="暂无题库" description="创建第一个题库后即可导入文档并生成练习题。" />
      )}
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}
