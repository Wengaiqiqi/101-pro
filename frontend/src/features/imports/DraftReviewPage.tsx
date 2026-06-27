import { FormEvent, useEffect, useState } from 'react';
import { listDrafts, publishDrafts, updateDraft } from '../../api/client';
import type { ImportedQuestionDraft, ImportJob, QuestionOption } from '../../api/types';
import { EmptyState } from '../../components/EmptyState';
import { Field } from '../../components/Field';
import { StatusBadge } from '../../components/StatusBadge';

interface DraftReviewPageProps {
  job: ImportJob;
  onBack: () => void;
  onPublished: () => void;
}

export function DraftReviewPage({ job, onBack, onPublished }: DraftReviewPageProps) {
  const [drafts, setDrafts] = useState<ImportedQuestionDraft[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [stem, setStem] = useState('');
  const [explanation, setExplanation] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [options, setOptions] = useState<QuestionOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

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
        answer_text: answerText,
        difficulty: draft.difficulty,
        explanation,
        options,
        status: draft.status
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
      setError(caught instanceof Error ? caught.message : '发布失败');
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
        options: draft.options,
        status: 'approved'
      });
      setDrafts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '草稿审核失败');
    }
  }

  const approvedCount = drafts.filter((draft) => draft.status === 'approved').length;

  return (
    <section className="panel" aria-labelledby="draft-review-title">
      <div className="panel__header">
        <div>
          <h2 id="draft-review-title">审核草稿</h2>
          <p>{job.filename}</p>
        </div>
        <button className="secondary-button" type="button" onClick={onBack}>
          返回任务
        </button>
      </div>

      {error ? (
        <div className="inline-alert" role="alert">
          {error}
        </div>
      ) : null}

      {editingId ? (
        <form className="panel__header" aria-label="编辑草稿" onSubmit={handleSave}>
          <Field label="题干" value={stem} onChange={(event) => setStem(event.target.value)} required />
          <Field label="解析" value={explanation} onChange={(event) => setExplanation(event.target.value)} />
          {isChoiceQuestion(drafts.find((item) => item.id === editingId)?.question_type ?? '') ? (
            options.map((option, index) => (
              <Field
                key={index}
                label={`选项 ${index + 1}`}
                value={option.content}
                onChange={(event) => updateOption(index, event.target.value)}
              />
            ))
          ) : (
            <Field label="答案" value={answerText} onChange={(event) => setAnswerText(event.target.value)} required />
          )}
          <button className="primary-button" type="submit" disabled={isSaving}>
            保存草稿
          </button>
        </form>
      ) : null}

      {drafts.length ? (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>题干</th>
                <th>题型</th>
                <th>难度</th>
                <th>选项</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((draft) => (
                <tr key={draft.id}>
                  <td>{draft.stem}</td>
                  <td>{draft.question_type}</td>
                  <td>{draft.difficulty}</td>
                  <td>
                    {draft.options.map((option, index) => (
                      <span key={`${draft.id}-${index}`}>
                        {option.content}
                        {index < draft.options.length - 1 ? ' / ' : ''}
                      </span>
                    ))}
                  </td>
                  <td>
                    <StatusBadge tone={draft.status === 'approved' || draft.status === 'ready' ? 'success' : 'neutral'}>
                      {statusLabel(draft.status)}
                    </StatusBadge>
                  </td>
                  <td>
                    <button className="text-button" type="button" onClick={() => startEdit(draft)}>
                      编辑
                    </button>
                    <button className="text-button" type="button" onClick={() => void handleApprove(draft)}>
                      通过
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="panel__header">
            <button className="primary-button" type="button" disabled={isPublishing || approvedCount === 0} onClick={handlePublish}>
              发布到题库
            </button>
          </div>
        </>
      ) : (
        <EmptyState title="暂无草稿" description="生成完成后会在这里显示待审核题目。" />
      )}
    </section>
  );
}

function isChoiceQuestion(questionType: string): boolean {
  return questionType === 'single_choice' || questionType === 'multiple_choice';
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '待审核',
    ready: '可发布',
    approved: '已通过',
    published: '已发布',
    rejected: '已驳回'
  };

  return labels[status] ?? status;
}
