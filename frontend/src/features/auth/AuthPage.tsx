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
        await register({ username, password });
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
    <main className="relative min-h-screen flex items-center justify-center p-6 bg-transparent overflow-hidden selection:bg-teal-200 selection:text-teal-900">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none flex justify-center items-center">
        <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] max-w-[700px] max-h-[700px] rounded-full bg-teal-400/60 mix-blend-multiply filter blur-[90px] animate-blob"></div>
        <div className="absolute top-[-20%] right-[-10%] w-[60vw] h-[60vw] max-w-[700px] max-h-[700px] rounded-full bg-purple-400/60 mix-blend-multiply filter blur-[90px] animate-blob" style={{ animationDelay: '2s' }}></div>
        <div className="absolute bottom-[-30%] left-[10%] w-[60vw] h-[60vw] max-w-[700px] max-h-[700px] rounded-full bg-pink-400/60 mix-blend-multiply filter blur-[90px] animate-blob" style={{ animationDelay: '4s' }}></div>
        <div className="absolute bottom-[-20%] right-[10%] w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] rounded-full bg-amber-300/50 mix-blend-multiply filter blur-[90px] animate-blob" style={{ animationDelay: '6s' }}></div>
      </div>

      <section className="relative z-10 w-full max-w-[400px] p-8 sm:p-10 border border-white/60 rounded-3xl bg-white/60 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] transition-all duration-300" aria-labelledby="auth-title">
        <div className="flex flex-col items-center gap-2 mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 text-white shadow-lg shadow-teal-500/30 mb-3 transform transition-transform hover:scale-105">
            <BookOpenCheck size={28} />
          </div>
          <h1 id="auth-title" className="m-0 text-2xl font-extrabold text-slate-800 tracking-tight">
            {isRegistering ? '创建你的账号' : '欢迎回来'}
          </h1>
          <p className="m-0 text-[15px] text-slate-500 font-medium">
            101 Pro · 专属刷题系统
          </p>
        </div>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Field
            label="用户名"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder={isRegistering ? '输入用户名' : '用户名或邮箱'}
            required
          />

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
            <div className="px-3.5 py-3 border border-red-200 rounded-xl text-red-600 bg-red-50/80 backdrop-blur-sm text-[13px] font-medium shadow-sm animate-in fade-in slide-in-from-top-1" role="alert">
              {error}
            </div>
          ) : null}

          <button
            className="w-full inline-flex items-center justify-center gap-2 mt-2 min-h-[44px] rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 text-white text-[15px] font-bold shadow-md shadow-teal-500/20 hover:from-teal-600 hover:to-teal-700 hover:shadow-lg hover:shadow-teal-500/30 active:scale-[0.98] transition-all disabled:opacity-60 disabled:active:scale-100 disabled:cursor-not-allowed"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                处理中...
              </>
            ) : isRegistering ? '立即注册' : '登录系统'}
          </button>
        </form>

        <div className="flex justify-center mt-8 text-[14px]">
          <span className="text-slate-500 mr-2">
            {isRegistering ? '已有账号？' : '还没有账号？'}
          </span>
          <button 
            className="border-0 bg-transparent text-teal-600 font-bold hover:text-teal-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded px-1 -mx-1" 
            type="button" 
            onClick={() => switchMode(isRegistering ? 'login' : 'register')}
          >
            {isRegistering ? '直接登录' : '免费注册'}
          </button>
        </div>
      </section>
    </main>
  );
}
