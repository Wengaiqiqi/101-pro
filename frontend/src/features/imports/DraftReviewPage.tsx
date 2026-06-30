import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, X } from 'lucide-react';
import { batchApproveDrafts, listDrafts, publishDrafts, updateDraft } from '../../api/client';
import type { Difficulty, ImportedQuestionDraft, ImportJob, QuestionOption, QuestionType } from '../../api/types';
import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { Field } from '../../components/Field';
import { LatexText } from '../../components/LatexText';
import { StatusBadge } from '../../components/StatusBadge';
import { isChoiceQuestion } from '../../lib/utils';
import { getDraftStatusLabel } from '../../lib/statusHelpers';

interface DraftReviewPageProps {
  job: ImportJob;
  onPublished: () => void;
}

const ANSWER_REQUIRED_TYPES = new Set(['single_choice', 'multiple_choice', 'true_false', 'fill_blank']);
function requiresAnswer(questionType: string): boolean {
  return ANSWER_REQUIRED_TYPES.has(questionType);
}

const defaultOptions: QuestionOption[] = [
  { content: '', is_correct: true },
  { content: '', is_correct: false },
  { content: '', is_correct: false },
  { content: '', is_correct: false },
];

/** Check if a pending draft has issues that would prevent publishing. */
function isProblematic(draft: ImportedQuestionDraft): boolean {
  if (draft.status !== 'pending') return false;
  if (isChoiceQuestion(draft.question_type)) {
    if (draft.options.length === 0) return true;
    const optionLabels = new Set(draft.options.map((o) => o.label).filter(Boolean));
    const answerLabels = draft.answer_json?.label ?? draft.answer_text ?? '';
    const labels = typeof answerLabels === 'string' ? answerLabels.replace(/[|, ]+/g, ' ').trim().split(/\s+/) : [];
    if (labels.length === 0) return true;
    return !labels.some((l) => optionLabels.has(l));
  }
  return !draft.answer_text;
}

type FilterStatus = 'all' | 'pending' | 'approved' | 'problematic';

export function DraftReviewPage({ job, onPublished }: DraftReviewPageProps) {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<ImportedQuestionDraft[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [isSaving, setIsSaving] = useState(false);
  const [isApprovingAll, setIsApprovingAll] = useState(false);

  // Edit form state
  const [stem, setStem] = useState('');
  const [questionType, setQuestionType] = useState<QuestionType>('single_choice');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [explanation, setExplanation] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [options, setOptions] = useState<QuestionOption[]>(defaultOptions);

  const editingDraft = drafts.find((d) => d.id === editingId);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const items = await listDrafts(job.id);
        if (isMounted) { setDrafts(items); setError(null); }
      } catch (caught) {
        if (isMounted) setError(caught instanceof Error ? caught.message : '草稿加载失败');
      }
    }
    void load();
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') setEditingId(null); }
    document.addEventListener('keydown', handleKey);
    return () => { isMounted = false; document.removeEventListener('keydown', handleKey); };
  }, [job.id]);

  // ── Edit helpers ──
  function startEdit(draft: ImportedQuestionDraft) {
    setEditingId(draft.id);
    setStem(draft.stem);
    setQuestionType(draft.question_type as QuestionType);
    setDifficulty(draft.difficulty as Difficulty);
    setExplanation(draft.explanation ?? '');
    setAnswerText(draft.answer_text);
    setOptions(draft.options.length > 0 ? draft.options : defaultOptions);
  }

  function updateOption(index: number, content: string) {
    setOptions((cur) => cur.map((o, i) => (i === index ? { ...o, content } : o)));
  }

  function markCorrect(index: number) {
    setOptions((cur) =>
      cur.map((o, i) => ({
        ...o,
        is_correct: questionType === 'multiple_choice'
          ? (i === index ? !o.is_correct : o.is_correct)
          : i === index,
      }))
    );
  }

  function addOption() { setOptions((cur) => [...cur, { content: '', is_correct: false }]); }

  function removeOption(index: number) {
    setOptions((cur) => {
      const next = cur.filter((_, i) => i !== index);
      if (next.length >= 2 && !next.some((o) => o.is_correct)) next[0].is_correct = true;
      return next.length >= 2 ? next : cur;
    });
  }

  function computedAnswer(): string {
    if (!isChoiceQuestion(questionType)) return answerText;
    const correct = options.filter((o) => o.is_correct);
    if (correct.length === 0) return '';
    return correct.map((o) => o.label ?? o.content).join(' ');
  }

  // ── Save ──
  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft = drafts.find((d) => d.id === editingId);
    if (!draft) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateDraft(draft.id, {
        stem,
        question_type: questionType,
        answer_json: draft.answer_json,
        answer_text: isChoiceQuestion(questionType) ? computedAnswer() : answerText,
        difficulty,
        explanation,
        tags: draft.tags,
        options: options.filter((o) => o.content.trim()),
        status: draft.status,
      });
      setDrafts((cur) => cur.map((d) => (d.id === updated.id ? updated : d)));
      setEditingId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '草稿保存失败');
    } finally {
      setIsSaving(false);
    }
  }

  // ── Actions ──
  async function handlePublish() {
    setIsPublishing(true);
    setError(null);
    try {
      await publishDrafts(job.id);
      const items = await listDrafts(job.id);
      setDrafts(items);
      onPublished();
    } catch (caught) {
      const msg = caught instanceof Error ? caught.message : '发布失败';
      const pending = drafts.filter((d) => d.status === 'pending');
      const problems = pending.filter(isProblematic);
      if (problems.length > 0 && filterStatus !== 'problematic') {
        setError(`${msg} — ${problems.length} 个草稿存在问题，点击下方「待处理」筛选`);
      } else if (pending.length > 0) {
        setError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleApprove(draft: ImportedQuestionDraft) {
    setError(null);
    try {
      const updated = await updateDraft(draft.id, {
        stem: draft.stem, question_type: draft.question_type, answer_json: draft.answer_json,
        answer_text: draft.answer_text, difficulty: draft.difficulty, explanation: draft.explanation,
        tags: draft.tags, options: draft.options, status: 'approved',
      });
      setDrafts((cur) => cur.map((d) => (d.id === updated.id ? updated : d)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '草稿审核失败');
    }
  }

  async function handleApproveAll() {
    setIsApprovingAll(true);
    setError(null);
    try {
      await batchApproveDrafts(job.id);
      const items = await listDrafts(job.id);
      setDrafts(items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '批量审核失败');
    } finally {
      setIsApprovingAll(false);
    }
  }

  // ── Derived ──
  const pendingDrafts = useMemo(() => drafts.filter((d) => d.status === 'pending'), [drafts]);
  const approvedCount = useMemo(() => drafts.filter((d) => d.status === 'approved').length, [drafts]);
  const problematicDrafts = useMemo(() => pendingDrafts.filter(isProblematic), [pendingDrafts]);

  const filteredDrafts = useMemo(() => {
    switch (filterStatus) {
      case 'pending': return pendingDrafts;
      case 'approved': return drafts.filter((d) => d.status === 'approved');
      case 'problematic': return problematicDrafts;
      default: return drafts;
    }
  }, [drafts, filterStatus, pendingDrafts, problematicDrafts]);

  const counts = { all: drafts.length, pending: pendingDrafts.length, approved: approvedCount, problematic: problematicDrafts.length };
  const allPublished = drafts.length > 0 && drafts.every((d) => d.status === 'published');

  // ── Render ──
  return (
    <section className="border border-slate-200 rounded-xl bg-white shadow-sm" aria-labelledby="draft-review-title">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 px-4 py-3.5 border-b border-slate-100">
        <div>
          <h2 id="draft-review-title" className="m-0 text-lg font-bold text-slate-900">审核草稿</h2>
          <p className="mt-1 text-sm text-slate-500">{job.filename}</p>
        </div>
        <button
          className="inline-flex items-center gap-2 min-h-[36px] px-3 rounded-lg border border-slate-300 text-slate-700 bg-white text-[13px] font-bold hover:bg-slate-50"
          type="button" onClick={() => navigate(`/imports/${job.id}`)}
        >
          返回任务
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-3 px-3 py-2.5 border border-orange-300 rounded-lg text-amber-800 bg-orange-50 text-[13px]" role="alert">
          <span>{error}</span>
          {filterStatus !== 'problematic' && problematicDrafts.length > 0 && (
            <button className="ml-3 underline font-bold hover:text-amber-900" type="button"
              onClick={() => { setFilterStatus('problematic'); setError(null); }}>
              查看待处理
            </button>
          )}
        </div>
      )}

      {/* Sticky tabs + actions */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-4 py-2 bg-white/95 backdrop-blur-sm border-b border-slate-100">
        <div className="flex gap-1.5">
          {(['all', 'pending', 'problematic', 'approved'] as const).map((s) => (
            <button key={s} type="button"
              className={`px-3 py-1.5 rounded-md text-[13px] font-bold transition-all ${
                filterStatus === s ? 'bg-teal-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              onClick={() => setFilterStatus(s)}
            >
              {s === 'all' && `全部 (${counts.all})`}
              {s === 'pending' && `待审核 (${counts.pending})`}
              {s === 'problematic' && `待处理 (${counts.problematic})`}
              {s === 'approved' && `已通过 (${counts.approved})`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {pendingDrafts.length > 0 && (
            <button
              className="inline-flex items-center justify-center gap-2 min-h-[36px] px-4 rounded-lg border border-slate-300 bg-white text-slate-700 text-[13px] font-bold hover:bg-slate-50 disabled:opacity-60"
              type="button" disabled={isApprovingAll}
              onClick={() => void handleApproveAll()}
            >
              {isApprovingAll ? '审核中...' : `一键全部通过 (${pendingDrafts.length})`}
            </button>
          )}
          <button
            className="inline-flex items-center justify-center gap-2 min-h-[36px] px-4 rounded-lg border border-teal-600 bg-teal-600 text-white text-[13px] font-bold hover:bg-teal-700 disabled:opacity-60"
            type="button" disabled={isPublishing || allPublished}
            onClick={handlePublish}
            title={allPublished ? '所有题目已发布' : undefined}
          >
            {isPublishing ? '发布中...' : '发布到题库'}
          </button>
        </div>
      </div>

      {/* Edit Modal — matches bank question edit style */}
      {editingId && editingDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setEditingId(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="m-0 text-base font-bold text-slate-900">编辑草稿</h3>
              <button className="flex items-center justify-center w-8 h-8 rounded-md text-slate-400 hover:text-black hover:bg-slate-100" type="button" onClick={() => setEditingId(null)}>
                <X size={16} />
              </button>
            </div>
            <form className="grid gap-4 p-5" onSubmit={handleSave}>
              <Field label="题干" value={stem} onChange={(e) => setStem(e.target.value)} required />
              <div className="grid grid-cols-2 gap-4">
                <label className="grid gap-1.5">
                  <span className="text-[13px] font-bold text-slate-700">题型</span>
                  <select className="w-full min-h-[38px] px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20"
                    value={questionType} onChange={(e) => setQuestionType(e.target.value as QuestionType)}>
                    <option value="single_choice">单选题</option>
                    <option value="multiple_choice">多选题</option>
                    <option value="true_false">判断题</option>
                    <option value="fill_blank">填空题</option>
                    <option value="short_answer">简答题</option>
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[13px] font-bold text-slate-700">难度</span>
                  <select className="w-full min-h-[38px] px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20"
                    value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                    <option value="easy">简单</option>
                    <option value="medium">中等</option>
                    <option value="hard">困难</option>
                  </select>
                </label>
              </div>
              <Field label="解析" value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="可选" />
              {isChoiceQuestion(questionType) ? (
                <>
                  {options.map((option, index) => (
                    <div key={index} className="flex items-end gap-2">
                      <div className="flex-1">
                        <Field label={`选项 ${option.label ?? String.fromCharCode(65 + index)}`}
                          value={option.content} onChange={(e) => updateOption(index, e.target.value)} />
                      </div>
                      <button type="button"
                        className={`min-h-[38px] px-3 rounded-md border text-[12px] font-bold transition-all ${
                          option.is_correct ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                        }`}
                        onClick={() => markCorrect(index)}>
                        {option.is_correct ? '✓ 正确' : '标记'}
                      </button>
                      {options.length > 2 && (
                        <button type="button"
                          className="min-h-[38px] w-[38px] flex items-center justify-center rounded-md border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-300 hover:bg-red-50"
                          onClick={() => removeOption(index)} title="删除选项">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button"
                    className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 rounded-md border border-dashed border-slate-300 text-slate-500 text-[12px] font-bold hover:border-slate-400 hover:text-black"
                    onClick={addOption}>
                    <Plus size={14} /> 添加选项
                  </button>
                  <div className="text-[12px] text-slate-500 font-medium">当前答案：{computedAnswer() || '未选择'}</div>
                </>
              ) : (
                <Field label={requiresAnswer(questionType) ? '答案' : '答案（可选）'}
                  value={answerText} onChange={(e) => setAnswerText(e.target.value)}
                  required={requiresAnswer(questionType)} placeholder="参考答案" />
              )}
              <button
                className="w-full inline-flex items-center justify-center gap-2 min-h-[38px] rounded-lg bg-teal-600 text-white text-[13px] font-bold hover:bg-teal-700 disabled:opacity-60"
                type="submit" disabled={isSaving}>
                {isSaving ? '保存中...' : '保存草稿'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      {drafts.length ? (
        <>
          {filteredDrafts.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-slate-400">该分类下暂无草稿</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50 w-8">#</th>
                    <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">题干</th>
                    <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">题型</th>
                    <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">难度</th>
                    <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">选项</th>
                    <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">答案</th>
                    <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">状态</th>
                    <th className="px-3.5 py-2.5 border-b border-slate-100 text-right text-xs font-extrabold text-slate-500 bg-slate-50">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrafts.map((draft, idx) => (
                    <tr key={draft.id} className={`hover:bg-slate-50 ${isProblematic(draft) ? 'bg-amber-50/50' : ''}`}>
                      <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-400 text-[12px] font-bold">{idx + 1}</td>
                      <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-700 max-w-[300px]"><LatexText text={draft.stem} /></td>
                      <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-700">{draft.question_type}</td>
                      <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-700">{draft.difficulty}</td>
                      <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-700">
                        {draft.options.length > 0 ? draft.options.map((o, i) => (
                          <span key={i} className={o.is_correct ? 'text-emerald-700 font-bold' : ''}>
                            {o.label ?? String.fromCharCode(65 + i)}. <LatexText text={o.content} />
                            {o.is_correct ? ' ✓' : ''}{i < draft.options.length - 1 ? ' / ' : ''}
                          </span>
                        )) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-3.5 py-2.5 border-b border-slate-100 text-emerald-700 font-bold text-[13px]">
                        {draft.answer_text || (isProblematic(draft) ? <span className="text-amber-600">缺少答案</span> : '—')}
                      </td>
                      <td className="px-3.5 py-2.5 border-b border-slate-100">
                        <StatusBadge className={draft.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : ''}>
                          {getDraftStatusLabel(draft.status)}
                        </StatusBadge>
                      </td>
                      <td className="px-3.5 py-2.5 border-b border-slate-100 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button className="border-0 bg-transparent text-teal-600 text-[13px] font-bold hover:underline" type="button" onClick={() => startEdit(draft)}>编辑</button>
                          {draft.status === 'pending' && (
                            <button className="border-0 bg-transparent text-teal-600 text-[13px] font-bold hover:underline" type="button" onClick={() => void handleApprove(draft)}>通过</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <EmptyState title="暂无草稿" description="生成完成后会在这里显示待审核题目。" />
      )}
    </section>
  );
}
