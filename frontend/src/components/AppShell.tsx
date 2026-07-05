import { NavLink } from 'react-router-dom';
import {
  BookOpen,
  Bot,
  FileInput,
  LayoutDashboard,
  LogOut,
  NotebookTabs,
  Target,
  Command,
  Shield,
  Users,
  Settings2,
  Library,
  UserCog,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { User } from '../api/types';
import { cn } from '../lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface AppShellProps {
  user: User;
  onLogout: () => void;
  children: ReactNode;
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: '工作台', icon: LayoutDashboard },
  { to: '/banks', label: '题库管理', icon: BookOpen },
  { to: '/imports', label: '文档解析', icon: FileInput },
  { to: '/practice', label: '专属练习', icon: Target },
  { to: '/mistakes', label: '错题复盘', icon: NotebookTabs },
  { to: '/explore', label: '题集广场', icon: Library },
  { to: '/models', label: '引擎设置', icon: Bot },
  { to: '/profile', label: '个人设置', icon: UserCog },
];

const adminNavItems: NavItem[] = [
  { to: '/admin/users', label: '用户管理', icon: Users },
  { to: '/admin/settings', label: '全局设置', icon: Settings2 },
];

export function AppShell({ user, onLogout, children }: AppShellProps) {
  return (
    <div className="grid min-h-screen bg-transparent [grid-template-columns:240px_minmax(0,1fr)] max-md:[grid-template-columns:1fr] font-sans selection:bg-black/10">
      
      {/* Sidebar */}
      <aside 
        className="sticky top-0 h-screen overflow-y-auto flex flex-col gap-6 bg-[#FDFDFD]/80 backdrop-blur-3xl border-r border-black/[0.06] max-md:hidden relative z-40" 
        aria-label="主导航"
      >
        <div className="flex items-center gap-3 px-6 pt-8 pb-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-black text-white shadow-sm ring-1 ring-black/10">
            <Command size={14} />
          </div>
          <div>
            <strong className="block text-[14px] font-semibold text-black tracking-tight leading-none">W&W刷题</strong>
            <span className="block text-[11px] text-zinc-500 font-medium mt-1">Study Workspace</span>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-0.5">
          <div className="px-3 mb-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Menu</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-200',
                    isActive
                      ? 'bg-zinc-100/80 text-black shadow-sm ring-1 ring-black/[0.04]'
                      : 'text-zinc-500 hover:text-black hover:bg-zinc-50',
                  )
                }
              >
                <Icon
                  aria-hidden="true"
                  size={16}
                  strokeWidth={2}
                  className="opacity-70 group-hover:opacity-100 transition-opacity"
                />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          {user.role === 'admin' && (
            <>
              <div className="px-3 mt-4 mb-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                <Shield size={11} />
                管理
              </div>
              {adminNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-200',
                        isActive
                          ? 'bg-zinc-100/80 text-black shadow-sm ring-1 ring-black/[0.04]'
                          : 'text-zinc-500 hover:text-black hover:bg-zinc-50',
                      )
                    }
                  >
                    <Icon
                      aria-hidden="true"
                      size={16}
                      strokeWidth={2}
                      className="opacity-70 group-hover:opacity-100 transition-opacity"
                    />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-black/[0.04]">
          <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-zinc-50 transition-colors border border-transparent hover:border-black/[0.04]">
            <NavLink to="/profile" className="flex items-center gap-2.5 min-w-0 flex-1">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover ring-1 ring-black/[0.04]" />
              ) : (
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-zinc-200/50 text-zinc-700 font-bold text-xs shadow-inner ring-1 ring-black/[0.04]">
                  {(user.nickname || user.username).charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold text-zinc-900 truncate leading-none">{user.nickname || user.username}</div>
              </div>
            </NavLink>
            <button
              className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-zinc-400 hover:text-black hover:bg-zinc-200/50 transition-colors"
              type="button"
              aria-label="退出登录"
              onClick={onLogout}
            >
              <LogOut aria-hidden="true" size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="min-w-0 p-8 max-md:p-4 relative">
        {/* Subtle top inner shadow for depth */}
        <div className="absolute top-0 left-0 w-full h-8 bg-gradient-to-b from-black/[0.02] to-transparent pointer-events-none" />
        
        <div className="max-w-[1200px] mx-auto pb-20">
          {children}
        </div>
      </main>

      {/* Mobile Nav Header */}
      <div className="md:hidden sticky top-0 z-50 flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-xl border-b border-black/[0.06]">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded bg-black text-white">
            <Command size={12} />
          </div>
          <strong className="text-[13px] font-semibold text-black tracking-tight">W&W刷题</strong>
        </div>
        <button className="text-zinc-500" onClick={onLogout}><LogOut size={16} /></button>
      </div>
      
      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 w-full z-50 bg-white/80 backdrop-blur-xl border-t border-black/[0.06] flex items-center justify-around px-1 py-2 pb-safe">
         {navItems.filter((item) => ['工作台', '题库管理', '专属练习', '错题复盘', '题集广场', '个人设置'].includes(item.label)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center w-12 h-12 gap-1 rounded-xl transition-colors',
                  isActive ? 'text-black' : 'text-zinc-400'
                )
              }
            >
              {({ isActive }) => (
                <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              )}
            </NavLink>
          ))}
          {user.role === 'admin' && (
            <NavLink
              to="/admin/users"
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center w-12 h-12 gap-1 rounded-xl transition-colors',
                  isActive ? 'text-black' : 'text-zinc-400'
                )
              }
            >
              {({ isActive }) => (
                <Shield size={20} strokeWidth={isActive ? 2.5 : 2} />
              )}
            </NavLink>
          )}
      </div>
    </div>
  );
}
