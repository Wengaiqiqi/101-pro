import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AuthPage } from '../features/auth/AuthPage';

describe('AuthPage', () => {
  it('switches between login and registration modes', async () => {
    const user = userEvent.setup();
    render(<AuthPage onAuthenticated={vi.fn()} />);

    expect(screen.getByRole('heading', { name: '欢迎回来' })).toBeInTheDocument();
    expect(screen.getByLabelText('用户名')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录系统' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '免费注册' }));

    expect(screen.getByRole('heading', { name: '创建你的账号' })).toBeInTheDocument();
    expect(screen.getByLabelText('用户名')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '立即注册' })).toBeInTheDocument();
  });
});
