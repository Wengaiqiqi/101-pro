import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { batchApproveDrafts, listDrafts, publishDrafts, updateDraft } from '../../api/client';
import type { ImportedQuestionDraft, ImportJob, QuestionOption } from '../../api/types';
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

const ANSWER_REQUIRED_TYPES = new Set([
  'single_choice',
  'multiple_choice',
  'true_false',
  'fill_blank',
]);

function requiresAnswer(questionType: string): boolean {
  return ANSWER_REQUIRED_TYPES.has(questionType);
}

function draftNeedsWork(draft: ImportedQuestionDraft): boolean {
  // Choice questions: no options, no correct option, or empty answer
  if (isChoiceQuestion(draft.question_type)) {
    if (!draft.options || draft.options.length === 0) return true;
    if (!draft.options.some((o) => o.is_correct)) return true;
    if (!draft.answer_text || draft.answer_text === '—') return true;
    // Answer labels must match option labels
    const labels = new Set(draft.options.map((o) => String(o.label ?? '')));
    const answerLabels = draft.answer_text.split(/[\s|,]+/).filter(Boolean);
    if (answerLabels.length === 0) return true;
    if (!answerLabels.every((l) => labels.has(l))) return true;
    return false;
  }
  // Non-choice questions that require answer but have none
  if (requiresAnswer(draft.question_type) && (!draft.answer_text || draft.answer_text === '—')) {
    return true;
  }
  return false;
}

export function DraftReviewPage({ job, onPublished }: DraftReviewPageProps) {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<ImportedQuestionDraft[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [stem, setStem] = useState('');
  const [explanation, setExplanation] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [options, setOptions] = useState<QuestionOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'needs_work'>('all');
  const editingDraft = drafts.find((item) => item.id === editingId);
  const answerRequired = editingDraft ? requiresAnswer(editingDraft.question_type) : true;

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const items = await listDrafts(job.id);
        if (isMounted) {
          setDrafts(items);
          setError(null);
        }
      } catch (caught) {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : '草稿加载失败');
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [job.id]);

  function startEdit(draft: ImportedQuestionDraft) {
    setEditingId(draft.id);
    setStem(draft.stem);
    setExplanation(draft.explanation ?? '');
    setAnswerText(draft.answer_text);
    setOptions(draft.options);
  }

  function updateOption(index: number, content: string) {
    setOptions((current) => current.map((option, optionIndex) => (optionIndex === index ? { ...option, content } : option)));
  }

  function toggleOptionCorrect(index: number) {
    setOptions((current) => current.map((option, optionIndex) => (optionIndex === index ? { ...option, is_correct: !option.is_correct } : option)));
  }

  function computedAnswerText(): string {
    const correct = options.filter((o) => o.is_correct);
    if (correct.length === 0) return answerText;
    return correct.map((o) => o.label ?? o.content).join(' ');
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft = drafts.find((item) => item.id === editingId);
    if (!draft) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const updated = await updateDraft(draft.id, {
        stem,
        question_type: draft.question_type,
        answer_json: draft.answer_json,
        answer_text: computedAnswerText(),
        difficulty: draft.difficulty,
        explanation,
        tags: draft.tags,
        options,
        status: draft.status,
      });
      setDrafts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditingId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '草稿保存失败');
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePublish() {
    setIsPublishing(true);
    setError(null);

    try {
      await publishDrafts(job.id);
      onPublished();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '发布失败';
      setError(message);
      // If there are still pending drafts, suggest filtering to them
      if (needsWorkDrafts.length > 0 && filterStatus !== 'needs_work') {
        setError(message + ' — 点击下方「待处理」查看有问题的草稿');
      }
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleApprove(draft: ImportedQuestionDraft) {
    setError(null);
    try {
      const updated = await updateDraft(draft.id, {
        stem: draft.stem,
        question_type: draft.question_type,
        answer_json: draft.answer_json,
        answer_text: draft.answer_text,
        difficulty: draft.difficulty,
        explanation: draft.explanation,
        tags: draft.tags,
        options: draft.options,
        status: 'approved',
      });
      setDrafts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '草稿审核失败');
    }
  }

  const approvedCount = drafts.filter((draft) => draft.status === 'approved').length;
  const pendingDrafts = drafts.filter((draft) => draft.status === 'pending');
  const [isApprovingAll, setIsApprovingAll] = useState(false);

  const needsWorkDrafts = useMemo(() => drafts.filter(draftNeedsWork), [drafts]);

  const filteredDrafts = useMemo(() => {
    if (filterStatus === 'all') return drafts;
    if (filterStatus === 'needs_work') return needsWorkDrafts;
    return drafts.filter((d) => d.status === filterStatus);
  }, [drafts, filterStatus, needsWorkDrafts]);

  async function handleApproveAll() {
    setIsApprovingAll(true);
    setError(null);
    try {
      await batchApproveDrafts(job.id);
      // Refresh drafts list
      const items = await listDrafts(job.id);
      setDrafts(items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '批量审核失败');
    } finally {
      setIsApprovingAll(false);
    }
  }

  return (
    <section className="border border-slate-200 rounded-xl bg-white shadow-sm" aria-labelledby="draft-review-title">
      <div className="flex items-center justify-between gap-4 px-4 py-3.5 border-b border-slate-100">
        <div>
          <h2 id="draft-review-title" className="m-0 text-lg font-bold text-slate-900">审核草稿</h2>
          <p className="mt-1 text-sm text-slate-500">{job.filename}</p>
        </div>
        <button
          className="inline-flex items-center gap-2 min-h-[36px] px-3 rounded-lg border border-slate-300 text-slate-700 bg-white text-[13px] font-bold hover:bg-slate-50"
          type="button"
          onClick={() => navigate(`/imports/${job.id}`)}
        >
          返回任务
        </button>
      </div>

      {error ? (
        <div className="mx-4 mt-3 px-3 py-2.5 border border-orange-300 rounded-lg text-amber-800 bg-orange-50" role="alert">
          <span>{error}</span>
          {needsWorkDrafts.length > 0 && filterStatus !== 'needs_work' && (
            <button
              className="ml-3 underline font-bold hover:text-amber-900"
              type="button"
              onClick={() => { setFilterStatus('needs_work'); setError(null); }}
            >
              查看待处理
            </button>
          )}
        </div>
      ) : null}

      {/* Sticky Filter Bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-2.5 bg-white/95 backdrop-blur-sm border-b border-slate-100">
        <div className="flex gap-2">
          {([
            ['all', `全部 (${drafts.length})`],
            ['pending', `待审核 (${pendingDrafts.length})`],
            ['needs_work', `待处理 (${needsWorkDrafts.length})`],
            ['approved', `已通过 (${approvedCount})`],
          ] as const).map(([status, label]) => (
            <button
              key={status}
              type="button"
              className={`px-3 py-1.5 rounded-md text-[13px] font-bold whitespace-nowrap transition-all ${
                filterStatus === status
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              onClick={() => setFilterStatus(status)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {pendingDrafts.length > 0 && (
            <button
              className="inline-flex items-center justify-center gap-1.5 min-h-[34px] px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-[12px] font-bold hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
              type="button"
              disabled={isApprovingAll}
              onClick={() => void handleApproveAll()}
            >
              {isApprovingAll ? '审核中...' : `一键通过 (${pendingDrafts.length})`}
            </button>
          )}
          <button
            className="inline-flex items-center justify-center gap-1.5 min-h-[34px] px-3 rounded-lg border border-teal-600 bg-teal-600 text-white text-[12px] font-bold hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed"
            type="button"
            disabled={isPublishing}
            onClick={handlePublish}
          >
            {isPublishing ? '发布中...' : '发布到题库'}
          </button>
        </div>
      </div>

      {/* Edit Modal */}
      {editingId && editingDraft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setEditingId(null)}
        >
          <form
            className="w-full max-w-[560px] max-h-[85vh] mx-4 bg-white rounded-xl shadow-xl border border-black/[0.06] overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col"
            onClick={(e) => e.stopPropagation()}
            aria-label="编辑草稿"
            onSubmit={handleSave}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="m-0 text-[16px] font-bold text-black">编辑草稿</h3>
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                onClick={() => setEditingId(null)}
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto grid gap-4 p-6">
              <div>
                <Field label="题干" value={stem} onChange={(event) => setStem(event.target.value)} required />
                {stem && <div className="mt-1 p-2 rounded bg-slate-50 text-[12px] text-slate-600"><LatexText text={stem} /></div>}
              </div>
              <Field label="解析" value={explanation} onChange={(event) => setExplanation(event.target.value)} />
              {isChoiceQuestion(editingDraft.question_type) ? (
                <>
                  {options.map((option, index) => (
                    <div key={index} className="grid gap-1.5" style={{ gridTemplateColumns: '1fr auto' }}>
                      <label className="text-[13px] font-bold text-slate-700">
                        选项 {option.label ?? String.fromCharCode(65 + index)}
                      </label>
                      <div />
                      <input
                        className="w-full min-h-[38px] px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20"
                        value={option.content}
                        onChange={(event) => updateOption(index, event.target.value)}
                      />
                      <button
                        type="button"
                        className={`min-h-[38px] px-3 rounded-md border text-[12px] font-bold transition-all ${
                          option.is_correct
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                        }`}
                        onClick={() => toggleOptionCorrect(index)}
                        title={option.is_correct ? '正确答案' : '标记为正确答案'}
                      >
                        {option.is_correct ? '✓ 正确' : '标记正确'}
                      </button>
                      {option.content && (
                        <div className="col-span-2 text-[11px] text-slate-500"><LatexText text={option.content} /></div>
                      )}
                    </div>
                  ))}
                  <div className="text-[12px] text-slate-500 font-medium">
                    当前答案：{computedAnswerText() || '未选择'}
                  </div>
                </>
              ) : (
                <Field
                  label={answerRequired ? '答案' : '答案（可选）'}
                  value={answerText}
                  onChange={(event) => setAnswerText(event.target.value)}
                  required={answerRequired}
                />
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
              <button
                className="flex-1 inline-flex items-center justify-center gap-2 min-h-[38px] rounded-lg border border-slate-300 bg-white text-slate-700 text-[13px] font-bold hover:bg-slate-50"
                type="button"
                onClick={() => setEditingId(null)}
              >
                取消
              </button>
              <button
                className="flex-1 inline-flex items-center justify-center gap-2 min-h-[38px] rounded-lg border border-teal-600 bg-teal-600 text-white text-[13px] font-bold hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed"
                type="submit"
                disabled={isSaving}
              >
                保存草稿
              </button>
            </div>
          </form>
        </div>
      )}

      {drafts.length ? (
        <>
          {filteredDrafts.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-slate-400">该分类下暂无草稿</div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">题干</th>
                  <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">题型</th>
                  <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">难度</th>
                  <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">选项</th>
                  <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">答案</th>
                  <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">状态</th>
                  <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredDrafts.map((draft) => (
                  <tr key={draft.id} className="hover:bg-slate-50">
                    <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-700 max-w-[300px]"><LatexText text={draft.stem} /></td>
                    <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-700">{draft.question_type}</td>
                    <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-700">{draft.difficulty}</td>
                    <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-700">
                      {draft.options.length > 0 ? draft.options.map((option, index) => (
                        <span key={`${draft.id}-${index}`} className={option.is_correct ? 'text-emerald-700 font-bold' : ''}>
                          {option.label ?? String.fromCharCode(65 + index)}. <LatexText text={option.content} />
                          {option.is_correct ? ' ✓' : ''}
                          {index < draft.options.length - 1 ? ' / ' : ''}
                        </span>
                      )) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-700 font-bold text-emerald-700">
                      {draft.answer_text || '—'}
                    </td>
                    <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-700">
                      <StatusBadge className={draft.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : ''}>
                        {getDraftStatusLabel(draft.status)}
                      </StatusBadge>
                    </td>
                    <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-700">
                      <div className="flex gap-2">
                        <button className="border-0 bg-transparent text-teal-600 text-[13px] font-bold hover:underline" type="button" onClick={() => startEdit(draft)}>
                          编辑
                        </button>
                        <button className="border-0 bg-transparent text-teal-600 text-[13px] font-bold hover:underline" type="button" onClick={() => void handleApprove(draft)}>
                          通过
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
          <div className="flex items-center justify-between gap-4 px-4 py-3.5 border-t border-slate-100">
            <span className="text-[12px] text-slate-400">
              已通过 {approvedCount} / {drafts.length}{needsWorkDrafts.length > 0 ? ` · 待处理 ${needsWorkDrafts.length}` : ''}
            </span>
          </div>
        </>
      ) : (
        <EmptyState title="暂无草稿" description="生成完成后会在这里显示待审核题目。" />
      )}
    </section>
  );
}
