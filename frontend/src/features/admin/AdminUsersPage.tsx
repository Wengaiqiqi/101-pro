import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff, Trash2, Users } from 'lucide-react';
import { listUsers, toggleUserActive, deleteUser } from '../../api/client';
import type { User } from '../../api/types';
import { ConfirmModal } from '../../components/ConfirmModal';
import { EmptyState } from '../../components/EmptyState';
import { formatDate } from '../../lib/utils';
import { cn } from '../../lib/utils';

interface AdminUsersPageProps {
  currentUser: User;
}

export function AdminUsersPage({ currentUser }: AdminUsersPageProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(user: User) {
    setWorkingId(user.id);
    setError(null);
    try {
      const updated = await toggleUserActive(user.id, !user.is_active);
      setUsers((prev) => prev.map((u) => u.id === user.id ? updated : u));
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setWorkingId(null);
    }
  }

  async function handleDelete(user: User) {
    setDeleteTarget(user);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setWorkingId(deleteTarget.id);
    setError(null);
    try {
      await deleteUser(deleteTarget.id);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    } finally {
      setWorkingId(null);
      setDeleteTarget(null);
    }
  }

  if (loading) {
    return <div className="py-16 text-center text-zinc-400 font-medium">加载中...</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <header className="pb-6 border-b border-black/[0.06]">
        <h2 className="m-0 text-3xl font-bold text-black tracking-tight leading-tight">用户管理</h2>
        <p className="mt-2 text-[14px] text-zinc-500 font-medium">查看、禁用或删除系统用户。</p>
      </header>

      {error && (
        <div className="px-4 py-3 border border-red-200 rounded-md text-red-700 bg-red-50 flex items-center gap-2" role="alert">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {users.length === 0 ? (
        <div className="py-16 bg-white rounded-xl border border-black/[0.06] shadow-sm">
          <EmptyState title="暂无用户" description="系统中还没有注册用户。" icon={<Users size={48} className="text-zinc-200" />} />
        </div>
      ) : (
        <section className="bg-white rounded-xl border border-black/[0.06] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-black/[0.06]">
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">ID</th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">用户名</th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">邮箱</th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">角色</th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">状态</th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">注册时间</th>
                  <th className="px-6 py-4 text-right text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {users.map((user) => {
                  const isSelf = user.id === currentUser.id;
                  return (
                    <tr key={user.id} className={cn("hover:bg-zinc-50/50 transition-colors", !user.is_active && "opacity-50")}>
                      <td className="px-6 py-4 text-[13px] text-zinc-500 font-mono">{user.id}</td>
                      <td className="px-6 py-4">
                        <span className="text-[14px] font-semibold text-black">{user.username}</span>
                        {isSelf && <span className="ml-2 text-[10px] text-zinc-400 font-medium">(当前)</span>}
                      </td>
                      <td className="px-6 py-4 text-[13px] text-zinc-500">{user.email || '—'}</td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider",
                          user.role === 'admin' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-zinc-100 text-zinc-600 border border-black/[0.04]'
                        )}>
                          {user.role === 'admin' ? '管理员' : '用户'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold",
                          user.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                        )}>
                          {user.is_active ? '正常' : '已禁用'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[12px] text-zinc-500 font-medium">{formatDate(user.created_at)}</td>
                      <td className="px-6 py-4 text-right">
                        {isSelf ? (
                          <span className="text-[12px] text-zinc-300">—</span>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              className={cn(
                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors",
                                user.is_active
                                  ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                  : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              )}
                              type="button"
                              disabled={workingId === user.id}
                              onClick={() => handleToggle(user)}
                            >
                              {user.is_active ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                              {user.is_active ? '禁用' : '启用'}
                            </button>
                            <button
                              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              type="button"
                              title="删除用户"
                              disabled={workingId === user.id}
                              onClick={() => handleDelete(user)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title="删除用户"
        message={`确定删除用户"${deleteTarget?.username}"？该操作不可恢复。`}
        confirmLabel="删除"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
