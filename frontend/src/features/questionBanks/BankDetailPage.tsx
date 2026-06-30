import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, X, Globe, Lock } from 'lucide-react';
import type { Difficulty, Question, QuestionBank, QuestionOption, QuestionPayload, QuestionType } from '../../api/types';
import { updateQuestionBank } from '../../api/client';
import { ConfirmModal } from '../../components/ConfirmModal';
import { EmptyState } from '../../components/EmptyState';
import { Field } from '../../components/Field';
import { LatexText } from '../../components/LatexText';
import { StatusBadge } from '../../components/StatusBadge';
import { isChoiceQuestion } from '../../lib/utils';
import { getQuestionTypeLabel, getDifficultyLabel, getDifficultyTone } from '../../lib/statusHelpers';

interface BankDetailPageProps {
  bank: QuestionBank;
  questions: Question[];
  onCreateQuestion: (payload: QuestionPayload) => Promise<void>;
  onUpdateQuestion: (questionId: number, payload: QuestionPayload) => Promise<void>;
  onDeleteQuestion: (questionId: number) => Promise<void>;
  onBankUpdated?: (bank: QuestionBank) => void;
}

const defaultOptions: QuestionOption[] = [
  { content: '', is_correct: true },
  { content: '', is_correct: false },
  { content: '', is_correct: false },
  { content: '', is_correct: false },
];

export function BankDetailPage({
  bank,
  questions,
  onCreateQuestion,
  onUpdateQuestion,
  onDeleteQuestion,
  onBankUpdated,
}: BankDetailPageProps) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Question | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTogglingVisibility, setIsTogglingVisibility] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);

  function openCreate() {
    setEditing(null);
    setShowCreate(true);
    setError(null);
  }

  function openEdit(question: Question) {
    setShowCreate(false);
    setEditing(question);
    setError(null);
  }

  function closeModal() {
    setEditing(null);
    setShowCreate(false);
    setError(null);
  }

  async function toggleVisibility() {
    setIsTogglingVisibility(true);
    setError(null);
    try {
      const newVisibility = bank.visibility === 'public' ? 'private' : 'public';
      const updated = await updateQuestionBank(bank.id, { visibility: newVisibility });
      onBankUpdated?.(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '更新失败');
    } finally {
      setIsTogglingVisibility(false);
    }
  }

  return (
    <section className="border border-slate-200 rounded-xl bg-white shadow-sm" aria-labelledby="bank-detail-title">
      <div className="flex items-center justify-between gap-4 px-4 py-3.5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <button
            className="flex items-center justify-center w-8 h-8 rounded-md border border-slate-200 text-slate-500 hover:text-black hover:border-slate-300 transition-colors"
            type="button"
            onClick={() => navigate('/banks')}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 id="bank-detail-title" className="m-0 text-lg font-bold text-slate-900">{bank.name}</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">{bank.description || '共 ' + questions.length + ' 道题目'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={`inline-flex items-center gap-2 min-h-[36px] px-3 rounded-lg border text-[13px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              bank.visibility === 'public'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
            type="button"
            disabled={isTogglingVisibility}
            onClick={() => void toggleVisibility()}
          >
            {isTogglingVisibility ? (
              <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
            ) : bank.visibility === 'public' ? (
              <Globe size={14} />
            ) : (
              <Lock size={14} />
            )}
            {bank.visibility === 'public' ? '已公开' : '设为公开'}
          </button>
          <button
            className="inline-flex items-center gap-2 min-h-[36px] px-3 rounded-lg bg-black text-white text-[13px] font-bold hover:bg-zinc-800 transition-colors"
            type="button"
            onClick={openCreate}
          >
            <Plus size={14} />
            添加题目
          </button>
        </div>
      </div>

      {questions.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50 w-12">#</th>
                <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">题干</th>
                <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">题型</th>
                <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">难度</th>
                <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">选项</th>
                <th className="px-3.5 py-2.5 border-b border-slate-100 text-left text-xs font-extrabold text-slate-500 bg-slate-50">答案</th>
                <th className="px-3.5 py-2.5 border-b border-slate-100 text-right text-xs font-extrabold text-slate-500 bg-slate-50">操作</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((question, index) => (
                <tr key={question.id} className="hover:bg-slate-50">
                  <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-400 text-[12px] font-bold">{index + 1}</td>
                  <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-700 max-w-[250px]"><LatexText text={question.stem} /></td>
                  <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-700">
                    <StatusBadge>{getQuestionTypeLabel(question.question_type)}</StatusBadge>
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-700">
                    <StatusBadge className={getDifficultyTone(question.difficulty)}>{getDifficultyLabel(question.difficulty)}</StatusBadge>
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-slate-100 text-slate-700">
                    {question.options.length > 0 ? question.options.map((option, i) => (
                      <span key={i} className={option.is_correct ? 'text-emerald-700 font-bold' : ''}>
                        {option.label ?? String.fromCharCode(65 + i)}. <LatexText text={option.content} />
                        {option.is_correct ? ' ✓' : ''}
                        {i < question.options.length - 1 ? ' / ' : ''}
                      </span>
                    )) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-slate-100 text-emerald-700 font-bold text-[13px]">
                    {question.answer_text || '—'}
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-slate-100 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-400 hover:text-black hover:bg-slate-100 transition-colors"
                        type="button"
                        title="编辑"
                        onClick={() => openEdit(question)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        type="button"
                        title="删除"
                        onClick={() => setDeleteTarget(question)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-16">
          <EmptyState title="暂无题目" description="点击「添加题目」手动创建，或从文档导入生成。" />
        </div>
      )}

      {/* Modal for create/edit */}
      {(showCreate || editing) && (
        <QuestionFormModal
          question={editing}
          error={error}
          onClose={closeModal}
          onError={setError}
          onCreate={onCreateQuestion}
          onUpdate={onUpdateQuestion}
        />
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title="删除题目"
        message={`确定删除题目"${deleteTarget?.stem?.slice(0, 50)}..."？`}
        confirmLabel="删除"
        danger
        onConfirm={async () => {
          if (deleteTarget) {
            await onDeleteQuestion(deleteTarget.id);
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}

function QuestionFormModal({
  question,
  error,
  onClose,
  onError,
  onCreate,
  onUpdate,
}: {
  question: Question | null;
  error: string | null;
  onClose: () => void;
  onError: (e: string | null) => void;
  onCreate: (payload: QuestionPayload) => Promise<void>;
  onUpdate: (questionId: number, payload: QuestionPayload) => Promise<void>;
}) {
  const isEdit = !!question;
  const [stem, setStem] = useState(question?.stem ?? '');
  const [questionType, setQuestionType] = useState<QuestionType>(question?.question_type ?? 'single_choice');
  const [difficulty, setDifficulty] = useState<Difficulty>(question?.difficulty ?? 'medium');
  const [explanation, setExplanation] = useState(question?.explanation ?? '');
  const [answerText, setAnswerText] = useState(question?.answer_text ?? '');
  const [options, setOptions] = useState<QuestionOption[]>(
    question?.options.length ? question.options : defaultOptions
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function updateOption(index: number, content: string) {
    setOptions((current) => current.map((option, i) => (i === index ? { ...option, content } : option)));
  }

  function markCorrect(index: number) {
    setOptions((current) =>
      current.map((option, i) => ({
        ...option,
        is_correct: questionType === 'multiple_choice' ? (i === index ? !option.is_correct : option.is_correct) : i === index,
      }))
    );
  }

  function addOption() {
    setOptions((current) => [...current, { content: '', is_correct: false }]);
  }

  function removeOption(index: number) {
    setOptions((current) => {
      const next = current.filter((_, i) => i !== index);
      // Ensure at least one option is marked correct
      if (next.length > 0 && !next.some((o) => o.is_correct)) {
        next[0].is_correct = true;
      }
      return next.length >= 2 ? next : current;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError(null);
    setIsSaving(true);

    const payload: QuestionPayload = {
      stem,
      question_type: questionType,
      answer_text: isChoiceQuestion(questionType) ? undefined : answerText,
      difficulty,
      explanation,
      options: isChoiceQuestion(questionType) ? options.filter((o) => o.content.trim()) : [],
    };

    try {
      if (isEdit && question) {
        await onUpdate(question.id, payload);
      } else {
        await onCreate(payload);
      }
      onClose();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* Dialog */}
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="m-0 text-base font-bold text-slate-900">{isEdit ? '编辑题目' : '添加题目'}</h3>
          <button
            className="flex items-center justify-center w-8 h-8 rounded-md text-slate-400 hover:text-black hover:bg-slate-100 transition-colors"
            type="button"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <form className="grid gap-4 p-5" onSubmit={handleSubmit}>
          <Field label="题干" value={stem} onChange={(e) => setStem(e.target.value)} placeholder="输入题干" required />
          <div className="grid grid-cols-2 gap-4">
            <label className="grid gap-1.5">
              <span className="text-[13px] font-bold text-slate-700">题型</span>
              <select
                className="w-full min-h-[38px] px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20"
                value={questionType}
                onChange={(e) => setQuestionType(e.target.value as QuestionType)}
              >
                <option value="single_choice">单选题</option>
                <option value="multiple_choice">多选题</option>
                <option value="true_false">判断题</option>
                <option value="fill_blank">填空题</option>
                <option value="short_answer">简答题</option>
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13px] font-bold text-slate-700">难度</span>
              <select
                className="w-full min-h-[38px] px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              >
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
                    <Field
                      label={`选项 ${String.fromCharCode(65 + index)}`}
                      value={option.content}
                      onChange={(e) => updateOption(index, e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className={`min-h-[38px] px-3 rounded-md border text-[12px] font-bold transition-all ${
                      option.is_correct
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                    }`}
                    onClick={() => markCorrect(index)}
                  >
                    {option.is_correct ? '✓ 正确' : '标记'}
                  </button>
                  {options.length > 2 && (
                    <button
                      type="button"
                      className="min-h-[38px] w-[38px] flex items-center justify-center rounded-md border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-300 hover:bg-red-50 transition-all"
                      onClick={() => removeOption(index)}
                      title="删除选项"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 rounded-md border border-dashed border-slate-300 text-slate-500 text-[12px] font-bold hover:border-slate-400 hover:text-black transition-all"
                onClick={addOption}
              >
                <Plus size={14} />
                添加选项
              </button>
            </>
          ) : (
            <Field label="答案" value={answerText} onChange={(e) => setAnswerText(e.target.value)} placeholder="参考答案" required />
          )}

          {error ? (
            <div className="px-3 py-2.5 border border-orange-300 rounded-lg text-amber-800 bg-orange-50 text-[13px]" role="alert">
              {error}
            </div>
          ) : null}

          <button
            className="w-full inline-flex items-center justify-center gap-2 min-h-[38px] rounded-lg bg-black text-white text-[13px] font-bold hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? '保存中...' : isEdit ? '保存修改' : '添加题目'}
          </button>
        </form>
      </div>
    </div>
  );
}
