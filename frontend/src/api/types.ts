export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface LoginPayload {
  username_or_email: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}

export interface QuestionBank {
  id: number;
  owner_id: number;
  name: string;
  description: string;
  visibility: string;
  question_count?: number;
  created_at: string;
  updated_at: string;
}

export interface QuestionBankCreate {
  name: string;
  description?: string;
}

export interface QuestionOption {
  id?: number;
  label?: string;
  content: string;
  is_correct: boolean;
  order_index?: number;
  sort_order?: number;
}

export interface Question {
  id: number;
  bank_id: number;
  stem: string;
  question_type: string;
  type?: string;
  answer_text?: string;
  difficulty: string;
  explanation?: string;
  tags?: string[];
  source?: string;
  options: QuestionOption[];
  created_at: string;
  updated_at: string;
}

export interface QuestionPayload {
  stem: string;
  question_type: string;
  answer_text?: string;
  difficulty: string;
  explanation?: string;
  tags?: string[];
  source?: string;
  options: QuestionOption[];
}

export type ImportJobStatus = 'pending' | 'processing' | 'reviewing' | 'completed' | 'failed';

export interface ImportJob {
  id: number;
  bank_id: number;
  filename: string;
  status: ImportJobStatus | string;
  question_count: number;
  question_types: string[];
  difficulty: string;
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
  question_types: string[];
  difficulty: string;
  language: string;
  with_explanations: boolean;
}

export interface ImportedQuestionDraft {
  id: number;
  import_job_id: number;
  stem: string;
  question_type: string;
  answer_json: Record<string, unknown>;
  answer_text: string;
  difficulty: string;
  explanation?: string;
  options: QuestionOption[];
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ImportedQuestionDraftPayload {
  stem: string;
  question_type: string;
  answer_json?: Record<string, unknown>;
  answer_text?: string;
  difficulty: string;
  explanation?: string;
  options: QuestionOption[];
  status?: string;
}

export interface ModelSettings {
  provider: string | null;
  base_url: string | null;
  model: string | null;
  has_api_key: boolean;
  platform_available: boolean;
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

export interface PracticeAnswer {
  id: number;
  session_id: number;
  question_id: number;
  user_answer_json: { value?: unknown } & Record<string, unknown>;
  is_correct: boolean;
  elapsed_seconds: number;
  created_at: string;
}

export interface PracticeSessionCreate {
  bank_id: number;
  mode: string;
  question_count: number;
}

export interface PracticeAnswerPayload {
  question_id: number;
  user_answer: string | string[];
  elapsed_seconds?: number;
}

export interface PracticeSession {
  id: number;
  user_id: number;
  bank_id: number;
  mode: string;
  question_count: number;
  started_at: string;
  finished_at: string | null;
  score: number;
  accuracy: number;
  answers: PracticeAnswer[];
}

export interface WrongQuestion {
  id: number;
  user_id: number;
  question_id: number;
  wrong_count: number;
  last_wrong_at: string | null;
  mastery_status: string;
  created_at: string;
  updated_at: string;
}

export interface ImportPublishResponse {
  published_count: number;
  question_ids: number[];
}
