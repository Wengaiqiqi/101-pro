import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ArrowRight, Trash2, Pencil, X } from 'lucide-react';
import type { QuestionBank } from '../../api/types';
import { updateQuestionBank } from '../../api/client';
import { ConfirmModal } from '../../components/ConfirmModal';
import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDate } from '../../lib/utils';

interface QuestionBankListPageProps {
  banks: QuestionBank[];
  onDelete?: (bankId: number) => Promise<void>;
  onBankUpdated?: (bank: QuestionBank) => void;
}

export function QuestionBankListPage({ banks, onDelete, onBankUpdated }: QuestionBankListPageProps) {
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<QuestionBank | null>(null);
  const [editingBank, setEditingBank] = useState<QuestionBank | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(bank: QuestionBank) {
    setEditingBank(bank);
    setEditName(bank.name);
    setEditDescription(bank.description || '');
    setError(null);
  }

  async function handleSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingBank || !editName.trim()) return;

    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateQuestionBank(editingBank.id, {
        name: editName.trim(),
        description: editDescription.trim(),
      });
      onBankUpdated?.(updated);
      setEditingBank(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <header className="pb-6 border-b border-black/[0.06]">
        <h2 id="banks-title" className="m-0 text-3xl font-bold text-black tracking-tight leading-tight">题库管理</h2>
        <p className="mt-2 text-[14px] text-zinc-500 font-medium">管理你的专属题库，构建知识体系。通过文档导入创建题库。</p>
      </header>

      <section className="bg-white rounded-xl border border-black/[0.06] shadow-sm overflow-hidden">
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
                      <StatusBadge className={bank.visibility === 'public' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60' : 'bg-zinc-100 text-zinc-600 border-zinc-200'}>
                        {bank.visibility === 'public' ? '公开' : '私有'}
                      </StatusBadge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-[12px] text-zinc-500 font-medium">{formatDate(bank.updated_at)}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          className="inline-flex items-center justify-center w-8 h-8 rounded-md text-zinc-400 hover:text-black hover:bg-zinc-100 transition-colors"
                          type="button"
                          title="重命名"
                          onClick={() => startEdit(bank)}
                        >
                          <Pencil size={14} />
                        </button>
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
            <EmptyState title="暂无题库" description="通过文档导入功能创建题库，或从题集广场获取公开题库。" icon={<BookOpen size={48} className="text-zinc-200" />} />
          </div>
        )}
      </section>

      {/* Edit Modal */}
      {editingBank && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEditingBank(null)}>
          <form
            className="w-full max-w-md mx-4 bg-white rounded-xl shadow-xl border border-black/[0.06] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveEdit}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="m-0 text-base font-bold text-slate-900">重命名题库</h3>
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                onClick={() => setEditingBank(null)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="grid gap-4 p-5">
              {error && <ErrorAlert message={error} />}
              <div className="grid gap-1.5">
                <label className="text-[13px] font-semibold text-slate-700">名称</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full h-[38px] px-3 border border-slate-300 rounded-lg text-slate-800 bg-white outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20"
                  required
                  autoFocus
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-[13px] font-semibold text-slate-700">描述</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full min-h-[80px] px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20 resize-y"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
              <button
                type="button"
                className="flex-1 h-[38px] rounded-lg border border-slate-300 bg-white text-slate-700 text-[13px] font-semibold hover:bg-slate-50"
                onClick={() => setEditingBank(null)}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSaving || !editName.trim()}
                className="flex-1 h-[38px] rounded-lg bg-black text-white text-[13px] font-semibold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </form>
        </div>
      )}

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
