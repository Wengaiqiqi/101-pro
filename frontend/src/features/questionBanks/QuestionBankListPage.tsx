import { FormEvent, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, BookOpen, ArrowRight, Trash2 } from 'lucide-react';
import type { QuestionBank } from '../../api/types';
import { ConfirmModal } from '../../components/ConfirmModal';
import { EmptyState } from '../../components/EmptyState';
import { Field } from '../../components/Field';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDate } from '../../lib/utils';
import { cn } from '../../lib/utils';

interface QuestionBankListPageProps {
  banks: QuestionBank[];
  onCreate: (payload: { name: string; description?: string }) => Promise<void>;
  onDelete?: (bankId: number) => Promise<void>;
}

export function QuestionBankListPage({ banks, onCreate, onDelete }: QuestionBankListPageProps) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuestionBank | null>(null);

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
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-black/[0.06]">
        <div>
          <h2 id="banks-title" className="m-0 text-3xl font-bold text-black tracking-tight leading-tight">题库管理</h2>
          <p className="mt-2 text-[14px] text-zinc-500 font-medium">创建、选择并维护你的专属题库，构建知识体系。</p>
        </div>
        
        <button
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-black text-white text-[13px] font-semibold hover:bg-zinc-800 transition-all duration-200"
          type="button"
          onClick={() => nameRef.current?.focus()}
        >
          <Plus size={16} />
          新建题库
        </button>
      </header>

      <section className="bg-white rounded-xl border border-black/[0.06] shadow-sm overflow-hidden">
        <form className="flex items-end gap-4 p-5 bg-zinc-50/50 border-b border-black/[0.06] max-md:flex-col max-md:items-stretch" aria-label="新建题库" onSubmit={handleCreate}>
          <div className="flex-1">
            <Field ref={nameRef} label="名称" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：高频前端面试题" required />
          </div>
          <div className="flex-1">
            <Field label="描述" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="简短说明题库用途" />
          </div>
          <button
            className="inline-flex items-center justify-center gap-2 h-[38px] px-6 rounded-md bg-white border border-black/[0.1] text-black text-[13px] font-semibold hover:bg-zinc-50 hover:border-black/[0.2] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            type="submit"
            disabled={isCreating}
          >
            {isCreating ? (
              <span className="animate-spin inline-block w-4 h-4 border-2 border-black/[0.2] border-t-black rounded-full" />
            ) : (
              <Plus size={16} />
            )}
            {isCreating ? '创建中...' : '确认创建'}
          </button>
        </form>

        {error ? (
          <div className="m-4 px-4 py-3 border border-red-200 rounded-md text-red-700 bg-red-50 flex items-center gap-2" role="alert">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        ) : null}

        {banks.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-black/[0.06]">
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">名称</th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">描述</th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">题目数</th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">可见性</th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">更新时间</th>
                  <th className="px-6 py-4 text-right text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {banks.map((bank) => (
                  <tr key={bank.id} className="group hover:bg-zinc-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-[14px] font-semibold text-black">{bank.name}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-[13px] text-zinc-500 max-w-[200px] truncate">{bank.description || '—'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded bg-zinc-100 text-[12px] font-bold text-zinc-700 border border-black/[0.04]">
                        {bank.question_count ?? '0'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge className="bg-emerald-50 text-emerald-700 border-emerald-200/60 rounded tracking-wider text-[10px]">{bank.visibility === 'public' ? '公开' : '私有'}</StatusBadge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-[12px] text-zinc-500 font-medium">{formatDate(bank.updated_at)}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-zinc-600 hover:text-black hover:bg-zinc-100 text-[12px] font-semibold transition-colors"
                          type="button"
                          onClick={() => navigate(`/banks/${bank.id}`)}
                        >
                          管理
                          <ArrowRight size={14} />
                        </button>
                        {onDelete && (
                          <button
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            type="button"
                            title="删除题库"
                            onClick={() => setDeleteTarget(bank)}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16">
            <EmptyState title="No Banks Found" description="创建第一个题库后即可导入文档并生成练习题。" icon={<BookOpen size={48} className="text-zinc-200" />} />
          </div>
        )}
      </section>

      <ConfirmModal
        open={deleteTarget !== null}
        title="删除题库"
        message={`确定删除题库"${deleteTarget?.name}"？所有题目将一并删除。`}
        confirmLabel="删除"
        danger
        onConfirm={async () => {
          if (deleteTarget && onDelete) {
            await onDelete(deleteTarget.id);
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
