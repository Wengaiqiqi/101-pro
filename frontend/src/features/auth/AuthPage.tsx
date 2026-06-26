import { FormEvent, useState } from 'react';
import { BookOpenCheck } from 'lucide-react';
import { getMe, login, register } from '../../api/client';
import type { User } from '../../api/types';
import { Field } from '../../components/Field';
import { persistToken } from './authStore';

interface AuthPageProps {
  onAuthenticated: (user: User) => void;
}

type AuthMode = 'login' | 'register';

export function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegistering = mode === 'register';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (isRegistering) {
        await register({ username, email, password });
      }

      const token = await login({
        username_or_email: username,
        password
      });
      persistToken(token.access_token);
      const user = await getMe();
      onAuthenticated(user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '认证失败，请稍后再试');
    } finally {
      setIsSubmitting(false);
    }
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-panel__intro">
          <span className="auth-logo" aria-hidden="true">
            <BookOpenCheck size={21} />
          </span>
          <div>
            <p>101 Pro</p>
            <h1 id="auth-title">{isRegistering ? '注册' : '登录'}</h1>
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <Field
            label="用户名"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder={isRegistering ? '输入用户名' : '用户名或邮箱'}
            required
          />

          {isRegistering ? (
            <Field
              label="邮箱"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              required
            />
          ) : null}

          <Field
            label="密码"
            name="password"
            type="password"
            autoComplete={isRegistering ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="至少 8 位"
            required
          />

          {error ? (
            <div className="form-error" role="alert">
              {error}
            </div>
          ) : null}

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? '处理中' : isRegistering ? '注册' : '登录'}
          </button>
        </form>

        <div className="auth-panel__switch">
          {isRegistering ? (
            <button className="text-button" type="button" onClick={() => switchMode('login')}>
              返回登录
            </button>
          ) : (
            <button className="text-button" type="button" onClick={() => switchMode('register')}>
              创建账号
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
