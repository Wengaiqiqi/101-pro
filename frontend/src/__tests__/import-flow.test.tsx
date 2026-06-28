import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App';
import type { ImportedQuestionDraft, ImportJob, QuestionBank, User } from '../api/types';

const currentUser: User = {
  id: 1,
  username: 'alice',
  email: 'alice@example.com',
  role: 'student',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z'
};

const bank: QuestionBank = {
  id: 20,
  owner_id: 1,
  name: '算法基础',
  description: '导入目标题库',
  visibility: 'private',
  question_count: 0,
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

describe('import flow', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates an import job, shows processing status, then reviews a generated draft', async () => {
    const user = userEvent.setup();
    const jobs: ImportJob[] = [];
    const completedJob: ImportJob = {
      id: 31,
      bank_id: 20,
      filename: 'questions.pdf',
      status: 'reviewing',
      question_count: 1,
      question_types: ['single_choice'],
      difficulty: 'medium',
      language: 'zh-CN',
      with_explanations: true,
      created_at: '2026-01-04T00:00:00Z',
      updated_at: '2026-01-04T00:00:05Z'
    };
    const drafts: ImportedQuestionDraft[] = [
      {
        id: 41,
        import_job_id: 31,
        stem: '二分查找的前提是什么？',
        question_type: 'single_choice',
        difficulty: 'medium',
        answer_json: { text: '数组已排序' },
        answer_text: '数组已排序',
        explanation: '二分查找要求搜索空间有序。',
        options: [
          { id: 1, content: '数组已排序', is_correct: true },
          { id: 2, content: '数组长度为偶数', is_correct: false }
        ],
        status: 'approved',
        created_at: '2026-01-04T00:00:05Z',
        updated_at: '2026-01-04T00:00:05Z'
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
        return jsonResponse([bank]);
      }

      if (url === '/api/import-jobs' && method === 'GET') {
        return jsonResponse(jobs);
      }

      if (url === '/api/wrong-questions' && method === 'GET') {
        return jsonResponse([]);
      }

      if (url === '/api/import-jobs' && method === 'POST') {
        expect(init?.body).toBeInstanceOf(FormData);
        const created: ImportJob = {
          ...completedJob,
          status: 'processing',
          updated_at: '2026-01-04T00:00:01Z'
        };
        jobs.push(created);
        return jsonResponse(created, { status: 201 });
      }

      if (url === '/api/import-jobs/31' && method === 'GET') {
        return jsonResponse(completedJob);
      }

      if (url === '/api/import-jobs/31/drafts' && method === 'GET') {
        return jsonResponse(drafts);
      }

      return jsonResponse({ detail: `Unhandled ${method} ${url}` }, { status: 500 });
    });

    render(<App />);

    await user.type(screen.getByLabelText('用户名'), 'alice');
    await user.type(screen.getByLabelText('密码'), 'correct-password');
    await user.click(screen.getByRole('button', { name: '登录' }));

    await screen.findByRole('heading', { name: '工作台概览' });

    await user.click(screen.getByRole('link', { name: '文档解析' }));
    await user.click(await screen.findByRole('button', { name: '新建导入' }));

    const form = screen.getByRole('form', { name: '新建导入任务' });
    await user.selectOptions(within(form).getAllByRole('combobox')[0], '20');
    await user.upload(within(form).getByText(/点击或拖拽上传文件/).closest('label')!, new File(['题目内容'], 'questions.pdf', { type: 'application/pdf' }));
    const countInput = within(form).getByPlaceholderText('自动');
    await user.clear(countInput);
    await user.type(countInput, '1');
    const submitButton = within(form).getByRole('button', { name: '提交智能导入' });
    expect(submitButton).toBeEnabled();
    fireEvent.submit(form);

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/import-jobs', expect.objectContaining({ method: 'POST' }))
    );
    expect(await screen.findByText('待审核')).toBeInTheDocument();

    expect(await screen.findByRole('button', { name: '审核草稿' }, { timeout: 3500 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '审核草稿' }));

    expect(await screen.findByText('二分查找的前提是什么？')).toBeInTheDocument();
    expect(screen.getAllByRole('cell', { name: /数组已排序/ }).length).toBeGreaterThanOrEqual(1);
  }, 10000);
});
