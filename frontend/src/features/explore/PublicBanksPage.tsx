import { useEffect, useState } from 'react';
import { BookOpen, Copy, Library, Search, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { QuestionBank } from '../../api/types';
import { forkBank, listPublicBanks } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';

export function PublicBanksPage() {
  const navigate = useNavigate();
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forkingId, setForkingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const pageSize = 24;

  useEffect(() => {
    let isMounted = true;
    loadBanks(isMounted, 0);
    return () => { isMounted = false; };
  }, []);

  async function loadBanks(isMounted: boolean, skip: number) {
    setIsLoading(true);
    setError(null);
    try {
      const items = await listPublicBanks(skip, pageSize);
      if (!isMounted) return;
      if (skip === 0) {
        setBanks(items);
      } else {
        setBanks((prev) => [...prev, ...items]);
      }
      setHasMore(items.length === pageSize);
    } catch (caught) {
      if (isMounted) setError(caught instanceof Error ? caught.message : '加载失败');
    } finally {
      if (isMounted) setIsLoading(false);
    }
  }

  function handleLoadMore() {
    loadBanks(true, banks.length);
  }

  async function handleFork(bankId: number) {
    setForkingId(bankId);
    setError(null);
    try {
      const newBank = await forkBank(bankId);
      navigate(`/banks/${newBank.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '复制失败');
    } finally {
      setForkingId(null);
    }
  }

  const filteredBanks = banks.filter((bank) =>
    bank.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bank.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (bank.owner_nickname || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <header className="flex items-center justify-between gap-4 pb-6 border-b border-black/[0.06]">
        <div>
          <h2 className="m-0 text-3xl font-bold text-black tracking-tight leading-tight">题集广场</h2>
          <p className="mt-2 text-[14px] text-zinc-500 font-medium">发现和获取其他用户分享的优质题库。</p>
        </div>
      </header>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          placeholder="搜索题库名称、描述或作者..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-[42px] pl-10 pr-4 bg-white border border-black/[0.1] rounded-lg text-[14px] text-black outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
        />
      </div>

      {error && <ErrorAlert message={error} />}

      {isLoading ? (
        <div className="py-16 text-center text-[14px] text-zinc-400 font-medium">
          加载中...
        </div>
      ) : filteredBanks.length === 0 ? (
        <div className="py-16 bg-white rounded-xl shadow-sm border border-black/[0.06]">
          <EmptyState
            title={searchQuery ? '没有找到匹配的题库' : '暂无公开题库'}
            description={searchQuery ? '试试其他关键词' : '还没有用户分享题库，你可以将自己的题库设为公开'}
            icon={<Library size={48} className="text-zinc-200" />}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBanks.map((bank) => (
              <div
                key={bank.id}
                className="bg-white rounded-xl shadow-sm border border-black/[0.06] overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="m-0 text-[15px] font-bold text-black leading-tight line-clamp-2 flex-1">
                      {bank.name}
                    </h3>
                    <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-100 text-[11px] font-semibold text-zinc-600">
                      <BookOpen size={12} />
                      {bank.question_count ?? 0}
                    </span>
                  </div>
                  {bank.description && (
                    <p className="text-[13px] text-zinc-500 leading-relaxed line-clamp-2 mb-3">
                      {bank.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-[12px] text-zinc-400">
                    {bank.owner_avatar_url ? (
                      <img src={bank.owner_avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                    ) : (
                      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-100">
                        <User size={10} className="text-zinc-500" />
                      </div>
                    )}
                    <span className="truncate">{bank.owner_nickname || '匿名用户'}</span>
                  </div>
                </div>
                <div className="px-5 py-3 border-t border-black/[0.04] bg-zinc-50/50">
                  <button
                    type="button"
                    disabled={forkingId === bank.id}
                    onClick={() => void handleFork(bank.id)}
                    className="w-full inline-flex items-center justify-center gap-2 h-[36px] rounded-lg border border-black/[0.1] bg-white text-[13px] font-semibold text-black hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {forkingId === bank.id ? (
                      <span className="animate-spin w-4 h-4 border-2 border-zinc-300 border-t-black rounded-full" />
                    ) : (
                      <Copy size={14} />
                    )}
                    {forkingId === bank.id ? '复制中...' : '获取此题库'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {hasMore && !searchQuery && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                disabled={isLoading}
                onClick={handleLoadMore}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg border border-black/[0.1] bg-white text-[14px] font-semibold text-black hover:bg-zinc-50 disabled:opacity-50 transition-all"
              >
                {isLoading ? '加载中...' : '加载更多'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
