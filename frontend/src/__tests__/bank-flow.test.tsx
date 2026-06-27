import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App';
import type { QuestionBank, User } from '../api/types';

const currentUser: User = {
  id: 1,
  username: 'alice',
  email: 'alice@example.com',
  role: 'student',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z'
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
}

describe('bank flow', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs in, lists banks, creates a bank, and shows the new bank', async () => {
    const user = userEvent.setup();
    const banks: QuestionBank[] = [
      {
        id: 10,
        owner_id: 1,
        name: '算法基础',
        description: '数组、链表、递归',
        visibility: 'private',
        question_count: 3,
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z'
      }
    ];

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
        return jsonResponse(banks);
      }

      if (url === '/api/import-jobs' && method === 'GET') {
        return jsonResponse([]);
      }

      if (url === '/api/wrong-questions' && method === 'GET') {
        return jsonResponse([]);
      }

      if (url === '/api/question-banks' && method === 'POST') {
        const payload = JSON.parse(init?.body?.toString() ?? '{}');
        const created: QuestionBank = {
          id: 11,
          owner_id: 1,
          name: payload.name,
          description: payload.description,
          visibility: 'private',
          question_count: 0,
          created_at: '2026-01-03T00:00:00Z',
          updated_at: '2026-01-03T00:00:00Z'
        };
        banks.push(created);
        return jsonResponse(created, { status: 201 });
      }

      return jsonResponse({ detail: `Unhandled ${method} ${url}` }, { status: 500 });
    });

    render(<App />);

    await user.type(screen.getByLabelText('用户名'), 'alice');
    await user.type(screen.getByLabelText('密码'), 'correct-password');
    await user.click(screen.getByRole('button', { name: '登录' }));

    await screen.findByRole('heading', { name: '工作台' });

    await user.click(screen.getByRole('button', { name: '题库' }));
    expect(await screen.findByText('算法基础')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '新建题库' }));
    const form = screen.getByRole('form', { name: '新建题库' });
    await user.type(within(form).getByLabelText('名称'), '高频错题');
    await user.type(within(form).getByLabelText('描述'), '每周复盘题');
    await user.click(within(form).getByRole('button', { name: '创建题库' }));

    await waitFor(() => expect(screen.getByText('高频错题')).toBeInTheDocument());
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/question-banks',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
