import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App';
import type { PracticeSession, Question, QuestionBank, User } from '../api/types';

const currentUser: User = {
  id: 1,
  username: 'alice',
  email: 'alice@example.com',
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
    vi.restoreAllMocks();
  });

  it('creates a session, submits an answer, finishes, and shows the result', async () => {
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
      if (url === '/api/question-banks/10/questions' && method === 'GET') {
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
    await user.click(screen.getByRole('button', { name: '登录' }));
    await screen.findByRole('heading', { name: '工作台' });

    await user.click(screen.getByRole('button', { name: '练习' }));
    const setup = await screen.findByRole('form', { name: '开始练习' });
    await user.selectOptions(within(setup).getByLabelText('题库'), '10');
    await user.clear(within(setup).getByLabelText('题目数量'));
    await user.type(within(setup).getByLabelText('题目数量'), '1');
    await user.click(within(setup).getByRole('button', { name: '开始练习' }));

    expect(await screen.findByRole('heading', { name: question.stem })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'B. 数组已排序' }));
    await user.click(screen.getByRole('button', { name: '提交并查看结果' }));

    const result = await screen.findByRole('region', { name: '练习结果' });
    expect(within(result).getByRole('heading', { name: '练习结果' })).toBeInTheDocument();
    expect(within(result).getByText('100%')).toBeInTheDocument();
    expect(within(result).getByText('回答正确')).toBeInTheDocument();
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/practice-sessions/30/finish',
        expect.objectContaining({ method: 'POST' })
      )
    );
  });
});
