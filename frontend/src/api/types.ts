// ── Enums & Literal Unions ──────────────────────────────────────────

export type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false' | 'fill_blank' | 'short_answer';
export type Difficulty = 'auto' | 'easy' | 'medium' | 'hard';
export type Visibility = 'private' | 'public';
export type ImportJobStatus = 'pending' | 'processing' | 'reviewing' | 'completed' | 'failed' | 'cancelled';
export type DraftStatus = 'pending' | 'approved' | 'rejected' | 'published';
export type MasteryStatus = 'mastered' | 'unmastered';
export type PracticeMode = 'sequential' | 'random';

// ── Auth ───────────────────────────────────────────────────────────

export interface User {
  id: number;
  username: string;
  nickname: string;
  avatar_url?: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  password: string;
}

// ── Question Bank ──────────────────────────────────────────────────

export interface QuestionBank {
  id: number;
  owner_id: number;
  owner_nickname?: string;
  owner_avatar_url?: string;
  name: string;
  description: string;
  visibility: Visibility;
  question_count?: number;
  created_at: string;
  updated_at: string;
}

export interface QuestionBankCreate {
  name: string;
  description?: string;
}

// ── Question ───────────────────────────────────────────────────────

export interface QuestionOption {
  id?: number;
  label?: string;
  content: string;
  is_correct: boolean;
  order_index?: number;
}

export interface Question {
  id: number;
  bank_id: number;
  stem: string;
  question_type: QuestionType;
  answer_text?: string;
  difficulty: Difficulty;
  explanation?: string;
  tags?: string[];
  source?: string;
  options: QuestionOption[];
  created_at: string;
  updated_at: string;
}

export interface QuestionPayload {
  stem: string;
  question_type: QuestionType;
  answer_text?: string;
  difficulty: Difficulty;
  explanation?: string;
  tags?: string[];
  source?: string;
  options: QuestionOption[];
}

// ── Import Job ─────────────────────────────────────────────────────

export interface ImportJob {
  id: number;
  bank_id: number;
  filename: string;
  status: ImportJobStatus;
  progress: number;
  question_count: number;
  question_types: QuestionType[];
  difficulty: Difficulty;
  language: string;
  with_explanations: boolean;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportJobCreate {
  bank_id: number;
  file: File;
  question_count: number;
  question_types: QuestionType[];
  difficulty: Difficulty;
  language: string;
  with_explanations: boolean;
}

export interface ImportedQuestionDraft {
  id: number;
  import_job_id: number;
  stem: string;
  question_type: QuestionType;
  answer_json: Record<string, unknown>;
  answer_text: string;
  difficulty: Difficulty;
  explanation?: string;
  tags?: string[];
  options: QuestionOption[];
  status: DraftStatus;
  created_at: string;
  updated_at: string;
}

export interface ImportedQuestionDraftPayload {
  stem: string;
  question_type: QuestionType;
  answer_json?: Record<string, unknown>;
  answer_text?: string;
  difficulty: Difficulty;
  explanation?: string;
  tags?: string[];
  options: QuestionOption[];
  status?: DraftStatus;
}

export interface ImportPublishResponse {
  published_count: number;
  question_ids: number[];
}

// ── Admin ────────────────────────────────────────────────────────

export interface GlobalSettings {
  model_provider: string;
  model_base_url: string;
  model_name: string;
  has_api_key: boolean;
}

export interface GlobalSettingsUpdate {
  model_provider?: string;
  model_base_url?: string;
  model_name?: string;
  model_api_key?: string;
}

export interface ChangePasswordPayload {
  old_password: string;
  new_password: string;
}

// ── Model Settings ─────────────────────────────────────────────────

export interface ModelSettings {
  provider: string | null;
  base_url: string | null;
  model: string | null;
  has_api_key: boolean;
  platform_available: boolean;
  using_global: boolean;
}

export interface ModelSettingsPayload {
  provider: string;
  base_url: string;
  model: string;
  api_key?: string;
}

export interface ModelConnectionTestResponse {
  ok: boolean;
  provider: string;
  model: string;
  message?: string | null;
}

// ── Practice ───────────────────────────────────────────────────────

export interface PracticeSessionCreate {
  bank_id: number;
  mode: PracticeMode;
  question_count: number;
}

export interface PracticeAnswerPayload {
  question_id: number;
  user_answer: string | string[];
  elapsed_seconds?: number;
}

export interface PracticeAnswer {
  id: number;
  session_id: number;
  question_id: number;
  user_answer_json: { value?: unknown } & Record<string, unknown>;
  is_correct: boolean;
  correct_answer_text?: string | null;
  correct_option_labels?: string[];
  explanation?: string | null;
  feedback?: string | null;
  elapsed_seconds: number;
  created_at: string;
}

export interface PracticeSession {
  id: number;
  user_id: number;
  bank_id: number;
  mode: PracticeMode;
  question_count: number;
  started_at: string;
  finished_at: string | null;
  score: number;
  accuracy: number;
  answers: PracticeAnswer[];
}

// ── Wrong Questions ────────────────────────────────────────────────

export interface WrongQuestion {
  id: number;
  user_id: number;
  question_id: number;
  wrong_count: number;
  last_wrong_at: string | null;
  mastery_status: MasteryStatus;
  created_at: string;
  updated_at: string;
}

export interface DailyActivity {
  date: string;
  session_count: number;
  question_count: number;
  correct_count: number;
  elapsed_seconds: number;
}

export interface ActivityStats {
  days: number;
  total_sessions: number;
  total_questions: number;
  total_correct: number;
  total_elapsed_seconds: number;
  daily: DailyActivity[];
}
