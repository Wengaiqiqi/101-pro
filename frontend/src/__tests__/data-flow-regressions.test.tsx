import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { listQuestions } from '../api/client';
import type { QuestionBank, WrongQuestion } from '../api/types';
import { WrongQuestionsPage } from '../features/practice/WrongQuestionsPage';
import { useImports } from '../hooks/useImports';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('data flow regressions', () => {
  it('loads every question page instead of truncating at 100', async () => {
    let requestCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      requestCount += 1;
      const count = requestCount === 1 ? 100 : 1;
      return jsonResponse(Array.from({ length: count }, (_, index) => ({
        id: (requestCount - 1) * 100 + index + 1,
        bank_id: 1,
        type: 'fill_blank',
        stem: `Q${index}`,
        difficulty: 'medium',
        options: [],
        created_at: '',
        updated_at: '',
      })));
    });

    const questions = await listQuestions(1);

    expect(questions).toHaveLength(101);
    expect(requestCount).toBe(2);
  });

  it('starts polling after the initial import load discovers an active job', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([{
      id: 1, bank_id: 1, original_filename: 'x.pdf', status: 'processing', progress: 10,
      generation_config: {}, created_at: '', updated_at: '',
    }]));

    renderHook(() => useImports(1));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('delegates mastering a wrong question without issuing its own duplicate request', async () => {
    const user = userEvent.setup();
    const item: WrongQuestion = {
      id: 7, user_id: 1, question_id: 9, wrong_count: 1, last_wrong_at: null,
      mastery_status: 'unmastered', created_at: '', updated_at: '',
    };
    const onChanged = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([]));

    render(<WrongQuestionsPage banks={[] as QuestionBank[]} wrongQuestions={[item]} onChanged={onChanged} />);
    await user.click(screen.getByRole('button', { name: '标记已掌握' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(item));
    expect(fetchSpy).not.toHaveBeenCalledWith('/api/wrong-questions/7/mastered', expect.anything());
  });
});
