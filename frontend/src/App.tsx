import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { getMe, getToken, listQuestionBanks } from './api/client';
import type { QuestionBank, User } from './api/types';
import { AppShell } from './components/AppShell';
import type { AppPage } from './components/AppShell';
import { EmptyState } from './components/EmptyState';
import { StatusBadge } from './components/StatusBadge';
import { AuthPage } from './features/auth/AuthPage';
import { clearAuthState } from './features/auth/authStore';

const pageDescriptions: Record<AppPage, string> = {
  dashboard: '集中查看题库、导入和练习进度。',
  banks: '管理私有题库并准备后续题目维护。',
  imports: '上传文档后生成草稿题目。',
  practice: '从题库发起练习并记录结果。',
  mistakes: '复盘错题与掌握状态。',
  models: '配置模型服务和 API 凭据。'
};

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activePage, setActivePage] = useState<AppPage>('dashboard');
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [isBooting, setIsBooting] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function boot() {
      const token = getToken();
      if (!token) {
        setIsBooting(false);
        return;
      }

      try {
        const currentUser = await getMe();
        if (isMounted) {
          setUser(currentUser);
        }
      } catch {
        clearAuthState();
      } finally {
        if (isMounted) {
          setIsBooting(false);
        }
      }
    }

    void boot();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadBanks() {
      if (!user) {
        return;
      }

      try {
        const items = await listQuestionBanks();
        if (isMounted) {
          setBanks(items);
          setLoadError(null);
        }
      } catch (caught) {
        if (isMounted) {
          setLoadError(caught instanceof Error ? caught.message : '题库加载失败');
        }
      }
    }

    void loadBanks();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const dashboardStats = useMemo(
    () => [
      { label: '题库', value: banks.length.toString(), tone: 'success' as const },
      { label: '导入任务', value: '0', tone: 'neutral' as const },
      { label: '待复习', value: '0', tone: 'warning' as const }
    ],
    [banks.length]
  );

  if (isBooting) {
    return (
      <main className="boot-screen">
        <span>正在进入 101 Pro</span>
      </main>
    );
  }

  if (!user) {
    return <AuthPage onAuthenticated={setUser} />;
  }

  function handleLogout() {
    clearAuthState();
    setUser(null);
    setBanks([]);
    setActivePage('dashboard');
  }

  return (
    <AppShell activePage={activePage} user={user} onNavigate={setActivePage} onLogout={handleLogout}>
      {loadError ? (
        <div className="inline-alert" role="alert">
          {loadError}
        </div>
      ) : null}

      {activePage === 'dashboard' ? (
        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>工作台概览</h2>
              <p>{pageDescriptions.dashboard}</p>
            </div>
          </div>

          <div className="metric-grid">
            {dashboardStats.map((item) => (
              <div className="metric" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <StatusBadge tone={item.tone}>正常</StatusBadge>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activePage === 'banks' ? (
        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>题库</h2>
              <p>{pageDescriptions.banks}</p>
            </div>
            <button className="secondary-button" type="button">
              <Plus size={15} aria-hidden="true" />
              新建题库
            </button>
          </div>

          {banks.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>描述</th>
                  <th>可见性</th>
                  <th>更新时间</th>
                </tr>
              </thead>
              <tbody>
                {banks.map((bank) => (
                  <tr key={bank.id}>
                    <td>{bank.name}</td>
                    <td>{bank.description || '未填写'}</td>
                    <td>
                      <StatusBadge>{bank.visibility}</StatusBadge>
                    </td>
                    <td>{formatDate(bank.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="暂无题库" description="创建第一个题库后即可导入文档并生成练习题。" />
          )}
        </section>
      ) : null}

      {activePage !== 'dashboard' && activePage !== 'banks' ? (
        <section className="panel">
          <EmptyState title={routeTitle(activePage)} description={pageDescriptions[activePage]} />
        </section>
      ) : null}
    </AppShell>
  );
}

function routeTitle(page: AppPage): string {
  const titles: Record<AppPage, string> = {
    dashboard: '工作台',
    banks: '题库',
    imports: '文档导入',
    practice: '练习',
    mistakes: '错题本',
    models: '模型设置'
  };

  return titles[page];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}
