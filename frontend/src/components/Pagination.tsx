import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, total, pageSize, onChange }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-black/[0.06]">
      <span className="text-[12px] text-zinc-400 font-medium">
        共 {total} 条，第 {page}/{totalPages} 页
      </span>
      <div className="flex items-center gap-1">
        <button
          className={cn(
            "flex items-center justify-center w-8 h-8 rounded-md border text-[12px] font-semibold transition-all",
            page <= 1
              ? "border-black/[0.04] text-zinc-300 cursor-not-allowed"
              : "border-black/[0.1] text-zinc-600 hover:bg-zinc-50 hover:border-black/[0.2]"
          )}
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={14} />
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-md border text-[12px] font-semibold transition-all",
              p === page
                ? "border-black bg-black text-white"
                : "border-black/[0.1] text-zinc-600 hover:bg-zinc-50 hover:border-black/[0.2]"
            )}
            type="button"
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        ))}
        <button
          className={cn(
            "flex items-center justify-center w-8 h-8 rounded-md border text-[12px] font-semibold transition-all",
            page >= totalPages
              ? "border-black/[0.04] text-zinc-300 cursor-not-allowed"
              : "border-black/[0.1] text-zinc-600 hover:bg-zinc-50 hover:border-black/[0.2]"
          )}
          type="button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
