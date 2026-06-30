import { useMemo } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAuth } from './hooks/useAuth';
import { useBanks } from './hooks/useBanks';
import { useImportJob } from './hooks/useImportJob';
import { useImports } from './hooks/useImports';
import { useQuestions } from './hooks/useQuestions';
import { useActivityStats } from './hooks/useActivityStats';
import { useWrongQuestions } from './hooks/useWrongQuestions';
import { AuthPage } from './features/auth/AuthPage';
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
import { AdminUsersPage } from './features/admin/AdminUsersPage';
import { AdminSettingsPage } from './features/admin/AdminSettingsPage';
import { PublicBanksPage } from './features/explore/PublicBanksPage';
import { ProfileSettingsPage } from './features/profile/ProfileSettingsPage';
import { getImportJob } from './api/client';
import type { User } from './api/types';

// ── Route wrappers ──────────────────────────────────────────────────

function DashboardWrapper({ user }: { user: User }) {
  const { banks } = useBanks(user.id);
  const { importJobs } = useImports(user.id);
  const { wrongQuestions } = useWrongQuestions(user.id);
  const { data: activityStats } = useActivityStats(7);

  const sortedJobs = useMemo(
    () => [...importJobs].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [importJobs]
  );
  const wrongCount = useMemo(
    () => wrongQuestions.filter((w) => w.mastery_status !== 'mastered').length,
    [wrongQuestions]
  );

  return (
    <DashboardPage
      banks={banks}
      importJobs={sortedJobs}
      wrongQuestionCount={wrongCount}
      activityStats={activityStats}
    />
  );
}

function BanksListWrapper({ user }: { user: User }) {
  const { banks, deleteBank, refreshBanks } = useBanks(user.id);
  return <QuestionBankListPage banks={banks} onDelete={deleteBank} onBankUpdated={refreshBanks} />;
}

function BankDetailWrapper({ user }: { user: User }) {
  const { bankId } = useParams<{ bankId: string }>();
  const numericId = Number(bankId);
  const { banks, refreshBanks } = useBanks(user.id);
  const { questions, createQuestion, updateQuestion, deleteQuestion } = useQuestions(numericId);
  const bank = banks.find((b) => b.id === numericId);

  if (isNaN(numericId)) {
    return <Navigate to="/banks" replace />;
  }

  if (!bank) return <div className="px-3 py-2.5 border border-orange-300 rounded-lg text-amber-800 bg-orange-50" role="alert">题库未找到</div>;

  return (
    <BankDetailPage
      bank={bank}
      questions={questions}
      onCreateQuestion={async (payload) => { await createQuestion(payload); await refreshBanks(); }}
      onUpdateQuestion={updateQuestion}
      onDeleteQuestion={async (id) => { await deleteQuestion(id); await refreshBanks(); }}
      onBankUpdated={refreshBanks}
    />
  );
}

function ImportsListWrapper({ user }: { user: User }) {
  const { importJobs, deleteImport } = useImports(user.id);
  const { banks } = useBanks(user.id);
  return <ImportJobsPage jobs={importJobs} banks={banks} onDelete={deleteImport} />;
}

function NewImportWrapper({ user }: { user: User }) {
  const navigate = useNavigate();
  const { banks, createBank } = useBanks(user.id);
  const { createImport } = useImports(user.id);
  return <NewImportPage banks={banks} onCreateBank={createBank} onCreate={async (payload) => { await createImport(payload); }} onDone={() => navigate('/imports')} />;
}

function ImportDetailWrapper() {
  const { jobId } = useParams<{ jobId: string }>();
  const numericId = Number(jobId);
  const { job, setJob, loading, error } = useImportJob(numericId);

  if (isNaN(numericId)) {
    return <Navigate to="/imports" replace />;
  }

  if (loading) return <div className="px-3 py-2.5 border border-slate-200 rounded-lg text-slate-500 bg-slate-50">加载中...</div>;
  if (error || !job) return <div className="px-3 py-2.5 border border-orange-300 rounded-lg text-amber-800 bg-orange-50" role="alert">{error ?? '导入任务未找到'}</div>;
  return <ImportJobDetailPage job={job} onJobChange={(j) => setJob(j)} />;
}

function DraftReviewWrapper({ user }: { user: User }) {
  const { jobId } = useParams<{ jobId: string }>();
  const id = Number(jobId);
  const navigate = useNavigate();
  const { job, setJob, loading, error } = useImportJob(id);
  const { refreshBanks } = useBanks(user.id);
  const { refreshImports } = useImports(user.id);

  if (isNaN(id)) {
    return <Navigate to="/imports" replace />;
  }

  if (loading) return <div className="px-3 py-2.5 border border-slate-200 rounded-lg text-slate-500 bg-slate-50">加载中...</div>;
  if (error || !job) return <div className="px-3 py-2.5 border border-orange-300 rounded-lg text-amber-800 bg-orange-50" role="alert">{error ?? '导入任务未找到'}</div>;
  return <DraftReviewPage job={job} onPublished={async () => { await Promise.all([refreshImports(), refreshBanks()]); navigate(`/banks/${job.bank_id}`); }} />;
}

function PracticeWrapper({ user }: { user: User }) {
  const { banks } = useBanks(user.id);
  const { wrongQuestions, refreshWrongQuestions } = useWrongQuestions(user.id);
  return <PracticePage banks={banks} wrongQuestions={wrongQuestions} onPracticeFinished={refreshWrongQuestions} />;
}

function MistakesWrapper({ user }: { user: User }) {
  const { banks } = useBanks(user.id);
  const { wrongQuestions, markMastered } = useWrongQuestions(user.id);
  return <WrongQuestionsPage banks={banks} wrongQuestions={wrongQuestions} onChanged={(w) => markMastered(w.id)} />;
}

function ProfileWrapper({ user, setUser }: { user: User; setUser: (u: User) => void }) {
  return <ProfileSettingsPage user={user} onUserUpdated={setUser} />;
}

// ── App ─────────────────────────────────────────────────────────────

export function App() {
  const { user, isBooting, bootError, logout, setUser } = useAuth();

  if (isBooting) {
    return (
      <main className="min-h-screen grid place-items-center p-6 bg-slate-50">
        <span className="text-slate-500 font-semibold">正在进入 101 Pro</span>
      </main>
    );
  }

  if (bootError) {
    return (
      <main className="min-h-screen grid place-items-center p-6 bg-slate-50">
        <div className="grid justify-items-center gap-2.5 w-full max-w-[360px] p-5 border border-orange-200 rounded-lg text-amber-800 bg-orange-50" role="alert">
          <strong className="text-base text-red-800">启动失败</strong>
          <span>{bootError}</span>
          <button
            className="inline-flex items-center justify-center gap-2 min-h-[36px] px-3 rounded-lg border border-slate-300 text-slate-700 bg-white text-[13px] font-bold hover:bg-slate-50"
            type="button"
            onClick={() => window.location.reload()}
          >
            重试
          </button>
        </div>
      </main>
    );
  }

  if (!user) return <AuthPage onAuthenticated={setUser} />;

  return (
    <BrowserRouter>
      <AppShell user={user} onLogout={logout}>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardWrapper user={user} />} />
            <Route path="banks" element={<BanksListWrapper user={user} />} />
            <Route path="banks/:bankId" element={<BankDetailWrapper user={user} />} />
            <Route path="imports" element={<ImportsListWrapper user={user} />} />
            <Route path="imports/new" element={<NewImportWrapper user={user} />} />
            <Route path="imports/:jobId" element={<ImportDetailWrapper />} />
            <Route path="imports/:jobId/review" element={<DraftReviewWrapper user={user} />} />
            <Route path="practice" element={<PracticeWrapper user={user} />} />
            <Route path="mistakes" element={<MistakesWrapper user={user} />} />
            <Route path="explore" element={<PublicBanksPage />} />
            <Route path="models" element={<ModelSettingsPage />} />
            <Route path="profile" element={<ProfileWrapper user={user} setUser={setUser} />} />
            <Route path="admin/users" element={<AdminUsersPage currentUser={user} />} />
            <Route path="admin/settings" element={<AdminSettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ErrorBoundary>
      </AppShell>
    </BrowserRouter>
  );
}
