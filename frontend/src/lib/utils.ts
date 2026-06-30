import type { QuestionType } from '../api/types';

function parseDate(iso: string): Date {
  // If the string doesn't have timezone info, treat it as UTC
  if (iso && !iso.endsWith('Z') && !iso.includes('+') && !iso.includes('-', 10)) {
    return new Date(iso + 'Z');
  }
  return new Date(iso);
}

export function formatDate(iso: string): string {
  return parseDate(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDate(iso: string): string {
  return parseDate(iso).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function isChoiceQuestion(type: QuestionType): boolean {
  return type === 'single_choice' || type === 'multiple_choice' || type === 'true_false';
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePassword(password: string, confirmPassword?: string): PasswordValidationResult {
  if (!password) {
    return { valid: false, error: '请输入密码' };
  }
  if (password.length < 8) {
    return { valid: false, error: '密码长度不能少于8位' };
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  if (!hasLetter || !hasDigit) {
    return { valid: false, error: '密码必须包含至少一个字母和一个数字' };
  }
  if (confirmPassword !== undefined && password !== confirmPassword) {
    return { valid: false, error: '两次输入的密码不一致' };
  }
  return { valid: true };
}
