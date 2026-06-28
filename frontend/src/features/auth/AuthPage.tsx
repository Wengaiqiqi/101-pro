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
        await register({ username, email: email.trim() || undefined, password });
      }

      const token = await login({
        username_or_email: username,
        password,
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
    <main className="min-h-screen grid place-items-center p-6 bg-slate-50">
      <section className="w-full max-w-[392px] p-6 border border-slate-200 rounded-xl bg-white shadow-lg" aria-labelledby="auth-title">
        <div className="flex items-center gap-3 mb-6">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-teal-200 text-teal-700 bg-teal-50" aria-hidden="true">
            <BookOpenCheck size={21} />
          </span>
          <div>
            <p className="m-0 text-xs font-bold text-slate-500">101 Pro</p>
            <h1 id="auth-title" className="m-0 text-xl font-bold text-slate-900 leading-tight">
              {isRegistering ? '注册' : '登录'}
            </h1>
          </div>
        </div>

        <form className="grid gap-3.5" onSubmit={handleSubmit}>
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
              label="邮箱（选填）"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
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
            <div className="px-3 py-2.5 border border-orange-300 rounded-lg text-amber-800 bg-orange-50 text-[13px]" role="alert">
              {error}
            </div>
          ) : null}

          <button
            className="w-full inline-flex items-center justify-center gap-2 min-h-[38px] rounded-lg border border-teal-600 bg-teal-600 text-white text-[13px] font-bold hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? '处理中' : isRegistering ? '注册' : '登录'}
          </button>
        </form>

        <div className="flex justify-center mt-4">
          {isRegistering ? (
            <button className="border-0 bg-transparent text-teal-600 text-[13px] font-bold hover:underline" type="button" onClick={() => switchMode('login')}>
              返回登录
            </button>
          ) : (
            <button className="border-0 bg-transparent text-teal-600 text-[13px] font-bold hover:underline" type="button" onClick={() => switchMode('register')}>
              创建账号
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
