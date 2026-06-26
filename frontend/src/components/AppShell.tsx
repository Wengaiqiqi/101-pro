import {
  BookOpen,
  Bot,
  FileInput,
  LayoutDashboard,
  LogOut,
  NotebookTabs,
  Target
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { User } from '../api/types';

export type AppPage = 'dashboard' | 'banks' | 'imports' | 'practice' | 'mistakes' | 'models';

interface NavItem {
  key: AppPage;
  label: string;
  icon: LucideIcon;
}

interface AppShellProps {
  activePage: AppPage;
  user: User;
  onNavigate: (page: AppPage) => void;
  onLogout: () => void;
  children: ReactNode;
}

const navItems: NavItem[] = [
  { key: 'dashboard', label: '工作台', icon: LayoutDashboard },
  { key: 'banks', label: '题库', icon: BookOpen },
  { key: 'imports', label: '文档导入', icon: FileInput },
  { key: 'practice', label: '练习', icon: Target },
  { key: 'mistakes', label: '错题本', icon: NotebookTabs },
  { key: 'models', label: '模型设置', icon: Bot }
];

export function AppShell({ activePage, user, onNavigate, onLogout, children }: AppShellProps) {
  const activeItem = navItems.find((item) => item.key === activePage) ?? navItems[0];

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <div className="sidebar__brand">
          <span className="brand-mark">101</span>
          <div>
            <strong>101 Pro</strong>
            <span>题库工作台</span>
          </div>
        </div>

        <nav className="sidebar__nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.key;

            return (
              <button
                key={item.key}
                className="nav-button"
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onNavigate(item.key)}
              >
                <Icon aria-hidden="true" size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <button className="logout-button" type="button" aria-label="退出登录" onClick={onLogout}>
          <LogOut aria-hidden="true" size={16} />
          <span>退出登录</span>
        </button>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <p className="topbar__label">101 Pro</p>
            <h1>{activeItem.label}</h1>
          </div>
          <div className="topbar__user">
            <span>{user.username}</span>
            <small>{user.email}</small>
          </div>
        </header>

        <main className="workspace__content">{children}</main>
      </div>
    </div>
  );
}
