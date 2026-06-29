import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUp, FileText, ArrowLeft, Settings2, ShieldCheck, Plus, X } from 'lucide-react';
import type { Difficulty, ImportJobCreate, QuestionBank, QuestionBankCreate, QuestionType } from '../../api/types';
import { Field } from '../../components/Field';
import { cn } from '../../lib/utils';

interface NewImportPageProps {
  banks: QuestionBank[];
  onCreateBank: (payload: QuestionBankCreate) => Promise<QuestionBank>;
  onCreate: (payload: ImportJobCreate) => Promise<void>;
  onDone?: () => void;
}

const questionTypeOptions: { value: QuestionType; label: string; icon: string }[] = [
  { value: 'single_choice', label: '单选题', icon: '◉' },
  { value: 'multiple_choice', label: '多选题', icon: '☑' },
  { value: 'true_false', label: '判断题', icon: '⚖' },
  { value: 'fill_blank', label: '填空题', icon: '▢' },
  { value: 'short_answer', label: '简答题', icon: '✎' },
];

export function NewImportPage({ banks, onCreateBank, onCreate, onDone }: NewImportPageProps) {
  const navigate = useNavigate();
  const [bankId, setBankId] = useState(banks[0]?.id.toString() ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [questionCount, setQuestionCount] = useState<number | ''>('');
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>('auto');
  const [language, setLanguage] = useState('zh-CN');
  const [withExplanations, setWithExplanations] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = useMemo(() => Boolean(bankId && files.length > 0), [bankId, files]);

  // New bank modal state
  const [showBankModal, setShowBankModal] = useState(false);
  const [newBankName, setNewBankName] = useState('');
  const [newBankDesc, setNewBankDesc] = useState('');
  const [isCreatingBank, setIsCreatingBank] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);

  async function handleCreateBank(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBankError(null);
    setIsCreatingBank(true);
    try {
      const created = await onCreateBank({ name: newBankName, description: newBankDesc });
      setBankId(String(created.id));
      setNewBankName('');
      setNewBankDesc('');
      setShowBankModal(false);
    } catch (caught) {
      setBankError(caught instanceof Error ? caught.message : '题库创建失败');
    } finally {
      setIsCreatingBank(false);
    }
  }

  useEffect(() => {
    if (!bankId && banks[0]) {
      setBankId(String(banks[0].id));
    }
  }, [bankId, banks]);

  function toggleQuestionType(value: QuestionType) {
    setQuestionTypes((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (files.length === 0) {
      setError('请选择文件');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      for (const f of files) {
        await onCreate({
          bank_id: Number(bankId),
          file: f,
          question_count: questionCount === '' ? 0 : questionCount,
          question_types: questionTypes,
          difficulty,
          language,
          with_explanations: withExplanations,
        });
      }
      onDone?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '导入任务创建失败');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-black/[0.06]">
        <div className="flex items-center gap-4">
          <button 
            className="flex items-center justify-center w-8 h-8 rounded-md bg-white border border-black/[0.06] shadow-sm text-zinc-500 hover:text-black hover:border-black/[0.2] transition-colors"
            onClick={() => navigate('/imports')}
            type="button"
            aria-label="返回列表"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 id="new-import-title" className="m-0 text-3xl font-bold text-black tracking-tight leading-tight flex items-center gap-2">
              新建导入
            </h2>
            <p className="mt-2 text-[14px] text-zinc-500 font-medium">配置解析参数并上传学习文档，AI将自动提取考点并生成题目。</p>
          </div>
        </div>
      </header>

      <section className="bg-white rounded-xl shadow-sm border border-black/[0.06] overflow-hidden">
        <div className="p-5 border-b border-black/[0.06] flex items-center gap-2 bg-zinc-50/50">
          <Settings2 size={16} className="text-black" />
          <h3 className="text-[14px] font-bold text-black uppercase tracking-widest">导入配置</h3>
        </div>

        <form className="p-6 md:p-8" aria-label="新建导入任务" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            
            {/* Left Column */}
            <div className="space-y-6">
              <label className="grid gap-2">
                <span className="text-[13px] font-semibold text-zinc-700">目标题库</span>
                {banks.length > 0 ? (
                  <select
                    className="w-full h-[40px] px-3 appearance-none bg-white border border-black/[0.1] rounded-md text-[13px] font-semibold text-black shadow-sm focus:border-black focus:ring-1 focus:ring-black transition-all cursor-pointer"
                    value={bankId}
                    onChange={(event) => {
                      if (event.target.value === '__new__') {
                        setShowBankModal(true);
                      } else {
                        setBankId(event.target.value);
                      }
                    }}
                  >
                    <option value="" disabled>请选择题库</option>
                    {banks.map((bank) => (
                      <option key={bank.id} value={bank.id}>{bank.name}</option>
                    ))}
                    <option value="__new__">＋ 新建题库</option>
                  </select>
                ) : (
                  <button
                    type="button"
                    className="w-full h-[40px] flex items-center justify-center gap-2 rounded-md border border-dashed border-black/[0.2] bg-white text-[13px] font-semibold text-zinc-500 hover:text-black hover:border-black/[0.4] transition-all"
                    onClick={() => setShowBankModal(true)}
                  >
                    <Plus size={16} />
                    暂无题库，点击新建
                  </button>
                )}
              </label>

              <div className="grid gap-2">
                <span className="text-[13px] font-semibold text-zinc-700">文档上传</span>
                <label className="flex flex-col items-center justify-center w-full min-h-[140px] border border-dashed border-black/[0.15] bg-zinc-50/50 hover:bg-zinc-50 hover:border-black/[0.3] rounded-lg cursor-pointer transition-colors group">
                  <FileUp size={24} className="text-zinc-400 group-hover:text-black mb-3 transition-colors" />
                  <span className="text-[13px] font-semibold text-zinc-600">
                    {files.length > 0 ? <strong className="text-black">已选 {files.length} 个文件</strong> : '点击或拖拽上传文件'}
                  </span>
                  <span className="text-[11px] text-zinc-400 mt-1">PDF, DOC, DOCX, TXT, MD（最多 3 个）</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.txt,.md"
                    multiple
                    onChange={(event) => {
                      const selected = Array.from(event.target.files ?? []);
                      setFiles(selected.slice(0, 3));
                      event.target.value = '';
                    }}
                  />
                </label>
                {files.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {files.map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-md bg-zinc-100 border border-black/[0.06] text-[12px] font-medium text-zinc-700">
                        <FileText size={12} className="text-zinc-400" />
                        {f.name}
                        <button
                          type="button"
                          className="flex items-center justify-center w-5 h-5 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-2">
                <label className="grid gap-2">
                  <span className="text-[13px] font-semibold text-zinc-700">期望生成题目数</span>
                  <input
                    type="number"
                    className="w-full h-[40px] px-3 bg-white border border-black/[0.1] rounded-md text-[13px] font-semibold text-black shadow-sm focus:border-black focus:ring-1 focus:ring-black transition-all placeholder:text-zinc-400"
                    min={1}
                    max={100}
                    placeholder="自动"
                    value={questionCount}
                    onChange={(event) => {
                      const v = event.target.value;
                      setQuestionCount(v === '' ? '' : Number(v));
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              <div className="grid gap-2">
                <span className="text-[13px] font-semibold text-zinc-700">生成题型</span>
                <span className="text-[11px] text-zinc-400">不选则自动生成全部题型</span>
                <div className="flex flex-col sm:flex-row gap-3">
                  {questionTypeOptions.map((item) => {
                    const isChecked = questionTypes.includes(item.value);
                    return (
                      <label 
                        key={item.value} 
                        className={cn(
                          "flex-1 flex items-center justify-center gap-2 h-[40px] rounded-md border cursor-pointer transition-all",
                          isChecked ? "border-black bg-zinc-50 text-black shadow-sm" : "border-black/[0.1] bg-white text-zinc-600 hover:border-black/[0.2]"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleQuestionType(item.value)}
                          className="hidden"
                        />
                        <span className={cn("text-[14px]", isChecked ? "opacity-100" : "opacity-60")}>{item.icon}</span>
                        <span className="text-[12px] font-semibold">{item.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="grid gap-2">
                  <span className="text-[13px] font-semibold text-zinc-700">题目难度</span>
                  <select
                    className="w-full h-[40px] px-3 appearance-none bg-white border border-black/[0.1] rounded-md text-[13px] font-semibold text-black shadow-sm focus:border-black focus:ring-1 focus:ring-black transition-all cursor-pointer"
                    value={difficulty}
                    onChange={(event) => setDifficulty(event.target.value as Difficulty)}
                  >
                    <option value="auto">自动</option>
                    <option value="easy">简单</option>
                    <option value="medium">中等</option>
                    <option value="hard">困难</option>
                  </select>
                </label>
                
                <label className="grid gap-2">
                  <span className="text-[13px] font-semibold text-zinc-700">生成语言</span>
                  <select
                    className="w-full h-[40px] px-3 appearance-none bg-white border border-black/[0.1] rounded-md text-[13px] font-semibold text-black shadow-sm focus:border-black focus:ring-1 focus:ring-black transition-all cursor-pointer"
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                  >
                    <option value="zh-CN">中文</option>
                    <option value="en-US">英文</option>
                  </select>
                </label>
              </div>

              <label className={cn(
                "flex items-center justify-between p-3 mt-2 rounded-md border cursor-pointer transition-all",
                withExplanations ? "border-black bg-zinc-50" : "border-black/[0.1] hover:border-black/[0.2]"
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn("p-1.5 rounded-md border", withExplanations ? "bg-white border-black/[0.1] text-black shadow-sm" : "bg-zinc-50 border-black/[0.04] text-zinc-400")}>
                    <ShieldCheck size={16} />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-black">生成详细解析</div>
                    <div className="text-[11px] text-zinc-500 font-medium">为每道题生成清晰的解题思路</div>
                  </div>
                </div>
                <div className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={withExplanations} onChange={(event) => setWithExplanations(event.target.checked)} className="sr-only peer" />
                  <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-black/[0.1] after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-black"></div>
                </div>
              </label>
            </div>
          </div>

          {error ? (
            <div className="mt-8 px-4 py-3 border border-red-200 rounded-md text-red-700 bg-red-50 flex items-center gap-2" role="alert">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          ) : null}

          <div className="mt-10 pt-6 border-t border-black/[0.06] flex justify-end">
            <button
              className="inline-flex items-center justify-center gap-2 h-[42px] px-8 rounded-md bg-black text-white text-[13px] font-semibold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              type="submit"
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? (
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
              ) : (
                <FileUp size={16} />
              )}
              {isSubmitting ? '解析生成中...' : '提交智能导入'}
            </button>
          </div>
        </form>
      </section>

      {/* New bank modal */}
      {showBankModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowBankModal(false)}>
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-black/[0.06] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.06]">
              <h3 className="text-[15px] font-bold text-black">新建题库</h3>
              <button
                className="flex items-center justify-center w-7 h-7 rounded-md text-zinc-400 hover:text-black hover:bg-zinc-100 transition-colors"
                type="button"
                onClick={() => setShowBankModal(false)}
              >
                <X size={16} />
              </button>
            </div>
            <form className="p-6 space-y-4" onSubmit={handleCreateBank}>
              <Field
                label="题库名称"
                value={newBankName}
                onChange={(e) => setNewBankName(e.target.value)}
                placeholder="例如：高频前端面试题"
                required
                autoFocus
              />
              <Field
                label="题库描述"
                value={newBankDesc}
                onChange={(e) => setNewBankDesc(e.target.value)}
                placeholder="简短说明题库用途（可选）"
              />
              {bankError && (
                <div className="px-3 py-2 border border-red-200 rounded-md text-red-700 bg-red-50 text-[13px] font-medium" role="alert">
                  {bankError}
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  className="h-[38px] px-4 rounded-md border border-black/[0.1] text-[13px] font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors"
                  type="button"
                  onClick={() => setShowBankModal(false)}
                >
                  取消
                </button>
                <button
                  className="inline-flex items-center gap-2 h-[38px] px-6 rounded-md bg-black text-white text-[13px] font-semibold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  type="submit"
                  disabled={isCreatingBank || !newBankName.trim()}
                >
                  {isCreatingBank ? (
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                  ) : (
                    <Plus size={16} />
                  )}
                  {isCreatingBank ? '创建中...' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
