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
  listWrongQuestions,
  setUnauthorizedHandler,
  updateQuestion
} from './api/client';
import type { ImportJob, ImportJobCreate, Question, QuestionBank, QuestionPayload, User, WrongQuestion } from './api/types';
import { AppShell } from './components/AppShell';
import type { AppPage } from './components/AppShell';
import { AuthPage } from './features/auth/AuthPage';
import { clearAuthState } from './features/auth/authStore';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { DraftReviewPage } from './features/imports/DraftReviewPage';
import { ImportJobDetailPage } from './features/imports/ImportJobDetailPage';
import { ImportJobsPage } from './features/imports/ImportJobsPage';
import { NewImportPage } from './features/imports/NewImportPage';
import { PracticePage } from './features/practice/PracticePage';
import { WrongQuestionsPage } from './features/practice/WrongQuestionsPage';
import { BankDetailPage } from './features/questionBanks/BankDetailPage';
import { QuestionBankListPage } from './features/questionBanks/QuestionBankListPage';
import { ModelSettingsPage } from './features/settings/ModelSettingsPage';

type ImportView = 'list' | 'new' | 'detail' | 'drafts';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activePage, setActivePage] = useState<AppPage>('dashboard');
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
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

  const refreshWrongQuestions = useCallback(async () => {
    const items = await listWrongQuestions();
    setWrongQuestions(items);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadWorkspace() {
      if (!user) {
        return;
      }

      try {
        const [bankItems, jobItems, wrongItems] = await Promise.all([listQuestionBanks(), listImportJobs(), listWrongQuestions()]);
        if (isMounted) {
          setBanks(bankItems);
          setImportJobs(jobItems);
          setWrongQuestions(wrongItems);
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
    setWrongQuestions([]);
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
          wrongQuestionCount={wrongQuestions.filter((item) => item.mastery_status !== 'mastered').length}
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

      {activePage === 'practice' ? <PracticePage banks={banks} wrongQuestions={wrongQuestions} onPracticeFinished={refreshWrongQuestions} /> : null}

      {activePage === 'mistakes' ? (
        <WrongQuestionsPage
          banks={banks}
          wrongQuestions={wrongQuestions}
          onChanged={(updated) => setWrongQuestions((current) => current.map((item) => (item.id === updated.id ? updated : item)))}
        />
      ) : null}

      {activePage === 'models' ? <ModelSettingsPage /> : null}
    </AppShell>
  );
}
