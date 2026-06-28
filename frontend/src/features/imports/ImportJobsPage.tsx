import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilePlus, FileText, ArrowRight, Trash2 } from 'lucide-react';
import type { ImportJob, QuestionBank } from '../../api/types';
import { EmptyState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDate } from '../../lib/utils';
import { getImportStatusLabel, getImportStatusTone } from '../../lib/statusHelpers';

interface ImportJobsPageProps {
  jobs: ImportJob[];
  banks: QuestionBank[];
  onDelete?: (jobId: number) => Promise<void>;
}

export function ImportJobsPage({ jobs, banks, onDelete }: ImportJobsPageProps) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const paged = jobs.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-black/[0.06]">
        <div>
          <h2 id="imports-title" className="m-0 text-3xl font-bold text-black tracking-tight leading-tight">文档导入</h2>
          <p className="mt-2 text-[14px] text-zinc-500 font-medium">上传学习资料，利用AI智能生成高质量题目。</p>
        </div>
        
        <button
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-black text-white text-[13px] font-semibold hover:bg-zinc-800 transition-all duration-200"
          type="button"
          onClick={() => navigate('/imports/new')}
        >
          <FilePlus size={16} />
          新建导入
        </button>
      </header>

      <section className="bg-white rounded-xl border border-black/[0.06] shadow-sm overflow-hidden">
        {jobs.length ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-black/[0.06]">
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">文件</th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">题库</th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">状态</th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">题目数</th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">更新时间</th>
                  <th className="px-6 py-4 text-right text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {paged.map((job) => (
                  <tr key={job.id} className="group hover:bg-zinc-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-[14px] font-semibold text-black flex items-center gap-2">
                        <FileText size={14} className="text-zinc-400" />
                        {job.filename}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="inline-flex items-center justify-center h-6 px-2 rounded bg-zinc-100 text-[12px] font-bold text-zinc-700 border border-black/[0.04]">
                        {banks.find((bank) => bank.id === job.bank_id)?.name ?? job.bank_id}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge className={getImportStatusTone(job.status)}>{getImportStatusLabel(job.status)}</StatusBadge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-[13px] font-semibold text-zinc-700">{job.question_count}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-[12px] text-zinc-500 font-medium">{formatDate(job.updated_at)}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-zinc-600 hover:text-black hover:bg-zinc-100 text-[12px] font-semibold transition-colors"
                          type="button"
                          onClick={() => navigate(`/imports/${job.id}`)}
                        >
                          查看
                          <ArrowRight size={14} />
                        </button>
                        {onDelete && (
                          <button
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            type="button"
                            title="删除记录"
                            onClick={async () => {
                              if (confirm(`确定删除导入记录"${job.filename}"？`)) {
                                await onDelete(job.id);
                              }
                            }}
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
          <Pagination page={page} total={jobs.length} pageSize={pageSize} onChange={setPage} />
        </>
        ) : (
          <div className="py-16">
            <EmptyState
              title="No Import Jobs"
              description="选择题库并上传文档后，系统会生成可审核的题目草稿。"
              icon={<FilePlus size={48} className="text-zinc-200" />}
            />
          </div>
        )}
      </section>
    </div>
  );
}
