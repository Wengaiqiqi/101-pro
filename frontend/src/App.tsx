import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  createImportJob,
  createQuestion,
  createQuestionBank,
  deleteQuestion,
  getImportJob,
  getMe,
  getToken,
  listImportJobs,
  listQuestionBanks,
  listQuestions,
  setUnauthorizedHandler,
  updateQuestion
} from './api/client';
import type { ImportJob, ImportJobCreate, Question, QuestionBank, QuestionPayload, User } from './api/types';
import { AppShell } from './components/AppShell';
import type { AppPage } from './components/AppShell';
import { EmptyState } from './components/EmptyState';
import { AuthPage } from './features/auth/AuthPage';
import { clearAuthState } from './features/auth/authStore';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { DraftReviewPage } from './features/imports/DraftReviewPage';
import { ImportJobDetailPage } from './features/imports/ImportJobDetailPage';
import { ImportJobsPage } from './features/imports/ImportJobsPage';
import { NewImportPage } from './features/imports/NewImportPage';
import { BankDetailPage } from './features/questionBanks/BankDetailPage';
import { QuestionBankListPage } from './features/questionBanks/QuestionBankListPage';

type ImportView = 'list' | 'new' | 'detail' | 'drafts';

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
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [importView, setImportView] = useState<ImportView>('list');
  const [selectedJob, setSelectedJob] = useState<ImportJob | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const selectedBank = useMemo(
    () => banks.find((bank) => bank.id === selectedBankId) ?? null,
    [banks, selectedBankId]
  );

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
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          clearAuthState();
        } else if (isMounted) {
          setBootError(caught instanceof Error ? caught.message : '启动失败，请稍后重试');
        }
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

  const refreshBanks = useCallback(async () => {
    const items = await listQuestionBanks();
    setBanks(items);
  }, []);

  const refreshImportJobs = useCallback(async () => {
    const items = await listImportJobs();
    setImportJobs(items);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadWorkspace() {
      if (!user) {
        return;
      }

      try {
        const [bankItems, jobItems] = await Promise.all([listQuestionBanks(), listImportJobs()]);
        if (isMounted) {
          setBanks(bankItems);
          setImportJobs(jobItems);
          setLoadError(null);
        }
      } catch (caught) {
        if (!isMounted) {
          return;
        }
        if (caught instanceof ApiError && caught.status === 401) {
          clearAuthState();
          setUser(null);
          resetWorkspace();
          return;
        }
        setLoadError(caught instanceof Error ? caught.message : '工作台数据加载失败');
      }
    }

    void loadWorkspace();

    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
    let isMounted = true;

    async function loadQuestions() {
      if (!selectedBankId) {
        setQuestions([]);
        return;
      }

      try {
        const items = await listQuestions(selectedBankId);
        if (isMounted) {
          setQuestions(items);
          setLoadError(null);
        }
      } catch (caught) {
        if (isMounted) {
          setLoadError(caught instanceof Error ? caught.message : '题目加载失败');
        }
      }
    }

    void loadQuestions();

    return () => {
      isMounted = false;
    };
  }, [selectedBankId]);

  function resetWorkspace() {
    setBanks([]);
    setImportJobs([]);
    setSelectedBankId(null);
    setQuestions([]);
    setImportView('list');
    setSelectedJob(null);
    setActivePage('dashboard');
  }

  const handleUnauthorized = useCallback(() => {
    clearAuthState();
    setUser(null);
    resetWorkspace();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(handleUnauthorized);
    return () => setUnauthorizedHandler(null);
  }, [handleUnauthorized]);

  function handleLogout() {
    clearAuthState();
    setUser(null);
    resetWorkspace();
  }

  function handleNavigate(page: AppPage) {
    setActivePage(page);
    if (page === 'banks') {
      setSelectedBankId(null);
    }
    if (page === 'imports') {
      setImportView('list');
      setSelectedJob(null);
    }
  }

  async function handleCreateBank(payload: { name: string; description?: string }) {
    const created = await createQuestionBank(payload);
    setBanks((current) => [...current, created]);
  }

  async function handleCreateQuestion(payload: QuestionPayload) {
    if (!selectedBankId) {
      return;
    }
    const created = await createQuestion(selectedBankId, payload);
    setQuestions((current) => [...current, created]);
    await refreshBanks();
  }

  async function handleUpdateQuestion(questionId: number, payload: QuestionPayload) {
    const updated = await updateQuestion(questionId, payload);
    setQuestions((current) => current.map((question) => (question.id === questionId ? updated : question)));
  }

  async function handleDeleteQuestion(questionId: number) {
    await deleteQuestion(questionId);
    setQuestions((current) => current.filter((question) => question.id !== questionId));
    await refreshBanks();
  }

  async function handleCreateImport(payload: ImportJobCreate) {
    const created = await createImportJob(payload);
    setImportJobs((current) => [created, ...current]);
    setSelectedJob(created);
    setImportView('detail');
  }

  const handleJobChange = useCallback((job: ImportJob) => {
    setSelectedJob(job);
    setImportJobs((current) => current.map((item) => (item.id === job.id ? job : item)));
  }, []);

  async function handlePublished() {
    await refreshImportJobs();
    await refreshBanks();
    if (selectedJob) {
      const nextJob = await getImportJob(selectedJob.id);
      setSelectedJob(nextJob);
      setImportJobs((current) => current.map((item) => (item.id === nextJob.id ? nextJob : item)));
    }
    setImportView('detail');
  }

  if (isBooting) {
    return (
      <main className="boot-screen">
        <span>正在进入 101 Pro</span>
      </main>
    );
  }

  if (bootError) {
    return (
      <main className="boot-screen">
        <div className="boot-error" role="alert">
          <strong>启动失败</strong>
          <span>{bootError}</span>
          <button className="secondary-button" type="button" onClick={() => window.location.reload()}>
            重试
          </button>
        </div>
      </main>
    );
  }

  if (!user) {
    return <AuthPage onAuthenticated={setUser} />;
  }

  return (
    <AppShell activePage={activePage} user={user} onNavigate={handleNavigate} onLogout={handleLogout}>
      {loadError ? (
        <div className="inline-alert" role="alert">
          {loadError}
          <button className="text-button inline-alert__action" type="button" onClick={() => setLoadError(null)}>
            关闭
          </button>
        </div>
      ) : null}

      {activePage === 'dashboard' ? (
        <DashboardPage
          banks={banks}
          importJobs={[...importJobs].sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())}
          wrongQuestionCount={0}
          onNavigateBanks={() => handleNavigate('banks')}
          onNavigateImports={() => handleNavigate('imports')}
          onNavigatePractice={() => handleNavigate('practice')}
          onNavigateMistakes={() => handleNavigate('mistakes')}
        />
      ) : null}

      {activePage === 'banks' && !selectedBank ? (
        <QuestionBankListPage banks={banks} onCreate={handleCreateBank} onSelect={(bank) => setSelectedBankId(bank.id)} />
      ) : null}

      {activePage === 'banks' && selectedBank ? (
        <BankDetailPage
          bank={selectedBank}
          questions={questions}
          onBack={() => setSelectedBankId(null)}
          onCreateQuestion={handleCreateQuestion}
          onUpdateQuestion={handleUpdateQuestion}
          onDeleteQuestion={handleDeleteQuestion}
        />
      ) : null}

      {activePage === 'imports' && importView === 'list' ? (
        <ImportJobsPage
          jobs={importJobs}
          banks={banks}
          onNew={() => setImportView('new')}
          onSelect={(job) => {
            setSelectedJob(job);
            setImportView('detail');
          }}
        />
      ) : null}

      {activePage === 'imports' && importView === 'new' ? (
        <NewImportPage banks={banks} onCreate={handleCreateImport} onCancel={() => setImportView('list')} />
      ) : null}

      {activePage === 'imports' && importView === 'detail' && selectedJob ? (
        <ImportJobDetailPage
          job={selectedJob}
          onBack={() => setImportView('list')}
          onReview={(job) => {
            setSelectedJob(job);
            setImportView('drafts');
          }}
          onJobChange={handleJobChange}
        />
      ) : null}

      {activePage === 'imports' && importView === 'drafts' && selectedJob ? (
        <DraftReviewPage job={selectedJob} onBack={() => setImportView('detail')} onPublished={handlePublished} />
      ) : null}

      {activePage !== 'dashboard' && activePage !== 'banks' && activePage !== 'imports' ? (
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
