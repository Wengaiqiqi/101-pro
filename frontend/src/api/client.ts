import type {
  LoginPayload,
  QuestionBank,
  QuestionBankCreate,
  RegisterPayload,
  TokenResponse,
  User
} from './types';

const TOKEN_KEY = 'question-bank-token';

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
