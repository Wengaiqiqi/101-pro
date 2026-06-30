import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App';
import type { PracticeSession, Question, QuestionBank, User } from '../api/types';
import { PracticePage } from '../features/practice/PracticePage';

const currentUser: User = {
  id: 1,
  username: 'alice',
  nickname: 'Alice',
  role: 'student',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z'
};

const bank: QuestionBank = {
  id: 10,
  owner_id: 1,
  name: '算法基础',
  description: '数组与查找',
  visibility: 'private',
  question_count: 1,
  created_at: '2026-01-02T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z'
};

const question: Question = {
  id: 20,
  bank_id: 10,
  stem: '二分查找要求数组具备什么条件？',
  question_type: 'single_choice',
  answer_text: 'B',
  difficulty: 'medium',
  explanation: '二分查找依赖有序搜索空间。',
  options: [
    { id: 1, label: 'A', content: '长度为偶数', is_correct: false },
    { id: 2, label: 'B', content: '数组已排序', is_correct: true }
  ],
  created_at: '2026-01-02T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z'
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
}

describe('practice flow', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('practice mode: select answer, reveal, and see result', async () => {
    const user = userEvent.setup();
    const session: PracticeSession = {
      id: 30,
      user_id: 1,
      bank_id: 10,
      mode: 'sequential',
      question_count: 1,
      started_at: '2026-01-03T00:00:00Z',
      finished_at: null,
      score: 0,
      accuracy: 0,
      answers: []
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input.toString();
      const method = init?.method ?? 'GET';

      if (url === '/api/auth/login' && method === 'POST') {
        return jsonResponse({ access_token: 'token-1', token_type: 'bearer' });
      }
      if (url === '/api/auth/me' && method === 'GET') {
        return jsonResponse(currentUser);
      }
      if (url === '/api/question-banks' && method === 'GET') {
        return jsonResponse([bank]);
      }
      if (url === '/api/import-jobs' && method === 'GET') {
        return jsonResponse([]);
      }
      if (url === '/api/wrong-questions' && method === 'GET') {
        return jsonResponse([]);
      }
      if (url.startsWith('/api/question-banks/10/practice-questions?') && method === 'GET') {
        return jsonResponse([question]);
      }
      if (url === '/api/practice-sessions' && method === 'POST') {
        return jsonResponse(session, { status: 201 });
      }
      if (url === '/api/practice-sessions/30/answers' && method === 'POST') {
        return jsonResponse(
          {
            id: 40,
            session_id: 30,
            question_id: 20,
            user_answer_json: { value: 'B' },
            is_correct: true,
            elapsed_seconds: 2,
            created_at: '2026-01-03T00:00:02Z'
          },
          { status: 201 }
        );
      }
      if (url === '/api/practice-sessions/30/finish' && method === 'POST') {
        return jsonResponse({
          ...session,
          finished_at: '2026-01-03T00:00:03Z',
          score: 1,
          accuracy: 100,
          answers: [
            {
              id: 40,
              session_id: 30,
              question_id: 20,
              user_answer_json: { value: 'B' },
              is_correct: true,
              elapsed_seconds: 2,
              created_at: '2026-01-03T00:00:02Z'
            }
          ]
        });
      }

      return jsonResponse({ detail: `Unhandled ${method} ${url}` }, { status: 500 });
    });

    render(<App />);

    await user.type(screen.getByLabelText('用户名'), 'alice');
    await user.type(screen.getByLabelText('密码'), 'correct-password');
    await user.click(screen.getByRole('button', { name: '登录系统' }));
    await screen.findByRole('heading', { name: '工作台概览' });

    // Navigate to practice
    await user.click(screen.getByRole('link', { name: '专属练习' }));
    const setup = await screen.findByRole('form', { name: '开始练习' });

    // Select bank; the default count includes all available questions.
    await user.selectOptions(within(setup).getAllByRole('combobox')[0], '10');

    // Start practice (default: practice mode)
    await user.click(within(setup).getByRole('button', { name: '开始练习' }));

    // All questions shown on one page
    expect(await screen.findByText(question.stem)).toBeInTheDocument();

    // Select answer B (auto-reveals in practice mode)
    await user.click(screen.getByRole('radio', { name: 'B. 数组已排序' }));

    // Verify correct answer is shown immediately
    await waitFor(() => {
      expect(screen.getByText('正确')).toBeInTheDocument();
    });
  });

  it('waits for explicit confirmation before submitting a multiple-choice answer', async () => {
    const user = userEvent.setup();
    const multipleChoice: Question = {
      ...question,
      id: 21,
      stem: '选择两个正确答案',
      question_type: 'multiple_choice',
      answer_text: undefined,
      options: [
        { id: 1, label: 'A', content: '甲', is_correct: false },
        { id: 2, label: 'B', content: '乙', is_correct: false },
        { id: 3, label: 'C', content: '丙', is_correct: false },
      ],
    };
    const answerRequests: RequestInit[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input.toString();
      if (url.includes('/practice-questions') || url.endsWith('/questions')) {
        return jsonResponse([multipleChoice]);
      }
      if (url === '/api/practice-sessions') {
        return jsonResponse({
          id: 31, user_id: 1, bank_id: 10, mode: 'sequential', question_count: 1,
          started_at: '2026-01-03T00:00:00Z', finished_at: null, score: 0, accuracy: 0, answers: [],
        }, { status: 201 });
      }
      if (url === '/api/practice-sessions/31/answers') {
        answerRequests.push(init ?? {});
        return jsonResponse({
          id: 41, session_id: 31, question_id: 21, user_answer_json: { value: ['A', 'C'] },
          is_correct: true, correct_option_labels: ['A', 'C'], elapsed_seconds: 0,
          created_at: '2026-01-03T00:00:01Z',
        }, { status: 201 });
      }
      return jsonResponse({ detail: `Unhandled ${url}` }, { status: 500 });
    });

    render(<PracticePage banks={[bank]} wrongQuestions={[]} onPracticeFinished={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '开始练习' }));
    await user.click(await screen.findByRole('checkbox', { name: 'A. 甲' }));
    await user.click(screen.getByRole('checkbox', { name: 'C. 丙' }));

    expect(answerRequests).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: '确认答案' }));
    expect(answerRequests).toHaveLength(1);
  });

  it('renders true-false questions as choice controls', async () => {
    const user = userEvent.setup();
    const trueFalse: Question = {
      ...question,
      id: 22,
      stem: '地球是行星。',
      question_type: 'true_false',
      answer_text: undefined,
      options: [
        { id: 1, label: 'A', content: '正确', is_correct: false },
        { id: 2, label: 'B', content: '错误', is_correct: false },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input.toString();
      if (url.includes('/practice-questions') || url.endsWith('/questions')) return jsonResponse([trueFalse]);
      if (url === '/api/practice-sessions') {
        return jsonResponse({
          id: 32, user_id: 1, bank_id: 10, mode: 'sequential', question_count: 1,
          started_at: '2026-01-03T00:00:00Z', finished_at: null, score: 0, accuracy: 0, answers: [],
        }, { status: 201 });
      }
      return jsonResponse({ detail: `Unhandled ${url}` }, { status: 500 });
    });

    render(<PracticePage banks={[bank]} wrongQuestions={[]} onPracticeFinished={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '开始练习' }));

    expect(await screen.findByRole('radio', { name: 'A. 正确' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'B. 错误' })).toBeInTheDocument();
  });
});
