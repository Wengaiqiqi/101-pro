import type {
  ImportedQuestionDraft,
  ImportedQuestionDraftPayload,
  ImportJob,
  ImportJobCreate,
  ImportPublishResponse,
  LoginPayload,
  ModelConnectionTestResponse,
  ModelSettings,
  ModelSettingsPayload,
  PracticeAnswer,
  PracticeAnswerPayload,
  PracticeSession,
  PracticeSessionCreate,
  Question,
  QuestionBank,
  QuestionBankCreate,
  QuestionOption,
  QuestionPayload,
  RegisterPayload,
  TokenResponse,
  User,
  WrongQuestion
} from './types';

const TOKEN_KEY = 'question-bank-token';
let unauthorizedHandler: (() => void) | null = null;

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(message: string, status: number, detail: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

export function setToken(token: string | null): void {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }

  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getToken();
  const hasBody = options.body !== undefined;
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (hasBody && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  if (!response.ok) {
    const detail = await parseResponse(response);
    if (response.status === 401) {
      unauthorizedHandler?.();
    }
    throw new ApiError(readErrorMessage(detail, response.statusText), response.status, detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return parseResponse(response) as Promise<T>;
}

export function login(payload: LoginPayload): Promise<TokenResponse> {
  return apiRequest<TokenResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function register(payload: RegisterPayload): Promise<User> {
  return apiRequest<User>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function getMe(): Promise<User> {
  return apiRequest<User>('/api/auth/me');
}

export function listQuestionBanks(): Promise<QuestionBank[]> {
  return apiRequest<QuestionBank[]>('/api/question-banks');
}

export function createQuestionBank(payload: QuestionBankCreate): Promise<QuestionBank> {
  return apiRequest<QuestionBank>('/api/question-banks', {
    method: 'POST',
    body: JSON.stringify({
      description: '',
      ...payload
    })
  });
}

export async function listQuestions(bankId: number): Promise<Question[]> {
  const items = await apiRequest<unknown[]>(`/api/question-banks/${bankId}/questions`);
  return items.map(normalizeQuestion);
}

export function createQuestion(bankId: number, payload: QuestionPayload): Promise<Question> {
  return apiRequest<unknown>(`/api/question-banks/${bankId}/questions`, {
    method: 'POST',
    body: JSON.stringify(serializeQuestionPayload(payload))
  }).then(normalizeQuestion);
}

export function updateQuestion(questionId: number, payload: QuestionPayload): Promise<Question> {
  return apiRequest<unknown>(`/api/questions/${questionId}`, {
    method: 'PUT',
    body: JSON.stringify(serializeQuestionPayload(payload))
  }).then(normalizeQuestion);
}

export function deleteQuestion(questionId: number): Promise<void> {
  return apiRequest<void>(`/api/questions/${questionId}`, {
    method: 'DELETE'
  });
}

export async function listImportJobs(): Promise<ImportJob[]> {
  const items = await apiRequest<unknown[]>('/api/import-jobs');
  return items.map(normalizeImportJob);
}

export function createImportJob(payload: ImportJobCreate): Promise<ImportJob> {
  const formData = new FormData();
  formData.set('bank_id', String(payload.bank_id));
  formData.set('question_types', payload.question_types.join(','));
  formData.set('question_count', String(payload.question_count));
  formData.set('difficulty', payload.difficulty);
  formData.set('language', payload.language);
  formData.set('with_explanations', String(payload.with_explanations));
  formData.set('file', payload.file);

  return apiRequest<unknown>('/api/import-jobs', {
    method: 'POST',
    body: formData
  }).then(normalizeImportJob);
}

export function getImportJob(jobId: number): Promise<ImportJob> {
  return apiRequest<unknown>(`/api/import-jobs/${jobId}`).then(normalizeImportJob);
}

export async function listDrafts(jobId: number): Promise<ImportedQuestionDraft[]> {
  const items = await apiRequest<unknown[]>(`/api/import-jobs/${jobId}/drafts`);
  return items.map(normalizeDraft);
}

export function updateDraft(draftId: number, payload: ImportedQuestionDraftPayload): Promise<ImportedQuestionDraft> {
  return apiRequest<unknown>(`/api/import-drafts/${draftId}`, {
    method: 'PUT',
    body: JSON.stringify(serializeDraftPayload(payload))
  }).then(normalizeDraft);
}

export function publishDrafts(jobId: number): Promise<ImportPublishResponse> {
  return apiRequest<ImportPublishResponse>(`/api/import-jobs/${jobId}/publish`, {
    method: 'POST'
  });
}

export function createPracticeSession(payload: PracticeSessionCreate): Promise<PracticeSession> {
  return apiRequest<PracticeSession>('/api/practice-sessions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function getPracticeSession(sessionId: number): Promise<PracticeSession> {
  return apiRequest<PracticeSession>(`/api/practice-sessions/${sessionId}`);
}

export function submitPracticeAnswer(sessionId: number, payload: PracticeAnswerPayload): Promise<PracticeAnswer> {
  return apiRequest<PracticeAnswer>(`/api/practice-sessions/${sessionId}/answers`, {
    method: 'POST',
    body: JSON.stringify({ elapsed_seconds: 0, ...payload })
  });
}

export function finishPracticeSession(sessionId: number): Promise<PracticeSession> {
  return apiRequest<PracticeSession>(`/api/practice-sessions/${sessionId}/finish`, {
    method: 'POST'
  });
}

export function listWrongQuestions(): Promise<WrongQuestion[]> {
  return apiRequest<WrongQuestion[]>('/api/wrong-questions');
}

export function markWrongQuestionMastered(wrongQuestionId: number): Promise<WrongQuestion> {
  return apiRequest<WrongQuestion>(`/api/wrong-questions/${wrongQuestionId}/mastered`, {
    method: 'POST'
  });
}

export function getModelSettings(): Promise<ModelSettings> {
  return apiRequest<ModelSettings>('/api/model-settings');
}

export function saveModelSettings(payload: ModelSettingsPayload): Promise<ModelSettings> {
  return apiRequest<ModelSettings>('/api/model-settings', {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export function testModelSettings(): Promise<ModelConnectionTestResponse> {
  return apiRequest<ModelConnectionTestResponse>('/api/model-settings/test', {
    method: 'POST'
  });
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function readErrorMessage(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') {
    return detail;
  }

  if (detail && typeof detail === 'object' && 'detail' in detail) {
    const nested = (detail as { detail?: unknown }).detail;
    if (typeof nested === 'string') {
      return nested;
    }
  }

  return fallback || '请求失败';
}

function normalizeQuestion(raw: unknown): Question {
  const item = asRecord(raw);
  const options = Array.isArray(item.options) ? item.options.map(normalizeOption) : [];
  return {
    id: Number(item.id),
    bank_id: Number(item.bank_id),
    stem: String(item.stem ?? ''),
    question_type: String(item.question_type ?? item.type ?? 'single_choice'),
    type: typeof item.type === 'string' ? item.type : undefined,
    answer_text: typeof item.answer_text === 'string' ? item.answer_text : undefined,
    difficulty: String(item.difficulty ?? 'medium'),
    explanation: typeof item.explanation === 'string' ? item.explanation : '',
    tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
    source: typeof item.source === 'string' ? item.source : '',
    options,
    created_at: String(item.created_at ?? ''),
    updated_at: String(item.updated_at ?? '')
  };
}

function normalizeImportJob(raw: unknown): ImportJob {
  const item = asRecord(raw);
  const generationConfig = asRecord(item.generation_config);
  return {
    id: Number(item.id),
    bank_id: Number(item.bank_id),
    filename: String(item.filename ?? item.original_filename ?? ''),
    status: String(item.status ?? 'pending'),
    question_count: Number(item.question_count ?? generationConfig.question_count ?? 0),
    question_types: toStringArray(item.question_types ?? generationConfig.question_types ?? ['single_choice']),
    difficulty: String(item.difficulty ?? generationConfig.difficulty ?? 'medium'),
    language: String(item.language ?? generationConfig.language ?? 'zh-CN'),
    with_explanations: Boolean(item.with_explanations ?? generationConfig.with_explanations ?? true),
    error_message: typeof item.error_message === 'string' ? item.error_message : null,
    created_at: String(item.created_at ?? ''),
    updated_at: String(item.updated_at ?? '')
  };
}

function normalizeDraft(raw: unknown): ImportedQuestionDraft {
  const item = asRecord(raw);
  const rawOptions = Array.isArray(item.options) ? item.options : Array.isArray(item.options_json) ? item.options_json : [];
  const answer = asRecord(item.answer_json);
  const correctLabels = toStringArray(answer.correct_options ?? answer.labels ?? answer.label ?? answer.answer ?? []);
  const correctText = toStringArray(answer.answers ?? answer.answer_text ?? answer.text ?? []);
  const options = rawOptions.map((option) => normalizeOption(option, correctLabels, correctText));

  return {
    id: Number(item.id),
    import_job_id: Number(item.import_job_id),
    stem: String(item.stem ?? ''),
    question_type: String(item.question_type ?? item.type ?? 'single_choice'),
    answer_json: answer,
    answer_text: readAnswerTextFromAnswer(answer),
    difficulty: String(item.difficulty ?? 'medium'),
    explanation: typeof item.explanation === 'string' ? item.explanation : '',
    options,
    status: String(item.status ?? 'draft'),
    created_at: String(item.created_at ?? ''),
    updated_at: String(item.updated_at ?? '')
  };
}

function normalizeOption(raw: unknown, correctLabels: string[] = [], correctText: string[] = []): QuestionOption {
  const item = asRecord(raw);
  const label = typeof item.label === 'string' ? item.label : undefined;
  const content = String(item.content ?? item.text ?? '');
  const explicitCorrect = typeof item.is_correct === 'boolean' ? item.is_correct : undefined;
  const inferredCorrect = (label ? correctLabels.includes(label) : false) || correctText.includes(content);
  return {
    id: typeof item.id === 'number' ? item.id : undefined,
    label,
    content,
    is_correct: explicitCorrect ?? inferredCorrect,
    order_index: typeof item.order_index === 'number' ? item.order_index : undefined,
    sort_order: typeof item.sort_order === 'number' ? item.sort_order : undefined
  };
}

function serializeQuestionPayload(payload: QuestionPayload) {
  const options = payload.options.map((option, index) => ({
    label: option.label ?? optionLabel(index),
    content: option.content,
    is_correct: option.is_correct,
    sort_order: option.sort_order ?? option.order_index ?? index
  }));

  return {
    type: payload.question_type,
    stem: payload.stem,
    answer_text: payload.answer_text ?? readAnswerText(options),
    explanation: payload.explanation ?? '',
    difficulty: payload.difficulty,
    tags: payload.tags ?? [],
    source: payload.source ?? 'manual',
    options
  };
}

function serializeDraftPayload(payload: ImportedQuestionDraftPayload) {
  const options = payload.options.map((option, index) => ({
    label: option.label ?? optionLabel(index),
    content: option.content,
    is_correct: option.is_correct,
    sort_order: option.sort_order ?? option.order_index ?? index
  }));

  const answerJson = payload.answer_json ?? {};
  const answerText = payload.answer_text?.trim();

  const isChoice = payload.question_type === 'single_choice' || payload.question_type === 'multiple_choice';

  return {
    type: payload.question_type,
    stem: payload.stem,
    options_json: isChoice ? options : [],
    answer_json: isChoice
      ? {
          ...answerJson,
          label: options.filter((option) => option.is_correct).map((option) => option.label),
          text: readAnswerText(options)
        }
      : {
          ...answerJson,
          text: answerText || readAnswerTextFromAnswer(answerJson)
        },
    explanation: payload.explanation ?? '',
    difficulty: payload.difficulty,
    status: payload.status
  };
}

function readAnswerText(options: Array<{ label?: string; content: string; is_correct: boolean }>): string {
  return options
    .filter((option) => option.is_correct)
    .map((option) => option.label ?? option.content)
    .join(' ') || '待补充';
}

function readAnswerTextFromAnswer(answer: Record<string, unknown>): string {
  const value = answer.text ?? answer.answer_text ?? answer.answer ?? answer.label ?? answer.labels;
  if (Array.isArray(value)) {
    return value.map(String).join(' ');
  }
  return typeof value === 'string' ? value : '';
}

function optionLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}
