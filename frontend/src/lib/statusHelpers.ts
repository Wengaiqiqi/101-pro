import type { ImportJobStatus, DraftStatus, MasteryStatus } from '../api/types';

// ── Import Job Status ──────────────────────────────────────────────

const importStatusLabel: Record<ImportJobStatus, string> = {
  pending: '排队中',
  processing: '处理中',
  reviewing: '待审核',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

const importStatusTone: Record<ImportJobStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  processing: 'bg-blue-100 text-blue-700',
  reviewing: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-zinc-100 text-zinc-500',
};

export function getImportStatusLabel(status: ImportJobStatus): string {
  return importStatusLabel[status] ?? status;
}

export function getImportStatusTone(status: ImportJobStatus): string {
  return importStatusTone[status] ?? 'bg-gray-100 text-gray-700';
}

// ── Draft Status ───────────────────────────────────────────────────

const draftStatusLabel: Record<DraftStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  published: '已发布',
};

export function getDraftStatusLabel(status: DraftStatus): string {
  return draftStatusLabel[status] ?? status;
}

// ── Mastery Status ─────────────────────────────────────────────────

const masteryStatusLabel: Record<MasteryStatus, string> = {
  mastered: '已掌握',
  unmastered: '未掌握',
};

export function getMasteryStatusLabel(status: MasteryStatus): string {
  return masteryStatusLabel[status] ?? status;
}

// ── Question Type ──────────────────────────────────────────────────

const questionTypeLabel: Record<string, string> = {
  single_choice: '单选题',
  multiple_choice: '多选题',
  true_false: '判断题',
  fill_blank: '填空题',
  short_answer: '简答题',
};

export function getQuestionTypeLabel(type: string): string {
  return questionTypeLabel[type] ?? type;
}

// ── Difficulty ─────────────────────────────────────────────────────

const difficultyLabel: Record<string, string> = {
  auto: '自动',
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

const difficultyTone: Record<string, string> = {
  easy: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  hard: 'bg-red-100 text-red-700',
};

export function getDifficultyLabel(difficulty: string): string {
  return difficultyLabel[difficulty] ?? difficulty;
}

export function getDifficultyTone(difficulty: string): string {
  return difficultyTone[difficulty] ?? 'bg-gray-100 text-gray-700';
}
