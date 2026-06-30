import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Camera, Save, User, Lock, Eye, EyeOff } from 'lucide-react';
import type { User as UserType } from '../../api/types';
import { updateProfile, uploadAvatar, changeMyPassword } from '../../api/client';
import { ErrorAlert } from '../../components/ErrorAlert';
import { validatePassword } from '../../lib/utils';

interface ProfileSettingsPageProps {
  user: UserType;
  onUserUpdated: (user: UserType) => void;
}

export function ProfileSettingsPage({ user, onUserUpdated }: ProfileSettingsPageProps) {
  const [nickname, setNickname] = useState(user.nickname || user.username);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password change state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  async function handleSaveNickname(event: FormEvent) {
    event.preventDefault();
    if (!nickname.trim()) {
      setError('昵称不能为空');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await updateProfile({ nickname: nickname.trim() });
      onUserUpdated(updated);
      setSuccess('昵称已更新');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '更新失败');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await uploadAvatar(file);
      onUserUpdated(updated);
      setSuccess('头像已更新');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '上传失败');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordError('请填写所有密码字段');
      return;
    }

    const validation = validatePassword(newPassword, confirmPassword);
    if (!validation.valid) {
      setPasswordError(validation.error!);
      return;
    }

    setIsChangingPassword(true);
    try {
      await changeMyPassword({ old_password: oldPassword, new_password: newPassword });
      setPasswordSuccess('密码修改成功');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (caught) {
      setPasswordError(caught instanceof Error ? caught.message : '密码修改失败');
    } finally {
      setIsChangingPassword(false);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <header className="pb-6 border-b border-black/[0.06]">
        <h2 className="m-0 text-3xl font-bold text-black tracking-tight leading-tight">个人设置</h2>
        <p className="mt-2 text-[14px] text-zinc-500 font-medium">管理你的头像、个人信息和密码。</p>
      </header>

      {error && <ErrorAlert message={error} />}

      {success && (
        <div className="px-4 py-3 border border-emerald-200 rounded-md text-emerald-700 bg-emerald-50 flex items-center gap-2" role="alert">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-sm font-medium">{success}</span>
        </div>
      )}

      {/* Avatar Section */}
      <section className="bg-white rounded-xl shadow-sm border border-black/[0.06] overflow-hidden">
        <div className="p-5 border-b border-black/[0.06] flex items-center gap-2 bg-zinc-50/50">
          <Camera size={16} className="text-black" />
          <h3 className="text-[14px] font-bold text-black uppercase tracking-widest">头像</h3>
        </div>
        <div className="p-6 flex items-center gap-6">
          <div className="relative">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt="头像"
                className="w-20 h-20 rounded-full object-cover ring-2 ring-black/[0.06]"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-zinc-100 flex items-center justify-center ring-2 ring-black/[0.06]">
                <User size={32} className="text-zinc-400" />
              </div>
            )}
            {isUploading && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                <div className="animate-spin w-6 h-6 border-2 border-white/30 border-t-white rounded-full" />
              </div>
            )}
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 h-[38px] px-4 rounded-lg border border-black/[0.1] bg-white text-[13px] font-semibold text-black hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Camera size={14} />
              更换头像
            </button>
            <p className="mt-2 text-[12px] text-zinc-400">支持 JPG、PNG、GIF、WebP，最大 5MB</p>
          </div>
        </div>
      </section>

      {/* Nickname Section */}
      <section className="bg-white rounded-xl shadow-sm border border-black/[0.06] overflow-hidden">
        <div className="p-5 border-b border-black/[0.06] flex items-center gap-2 bg-zinc-50/50">
          <User size={16} className="text-black" />
          <h3 className="text-[14px] font-bold text-black uppercase tracking-widest">个人信息</h3>
        </div>
        <form className="p-6 space-y-4" onSubmit={handleSaveNickname}>
          <div className="grid gap-2">
            <label className="text-[13px] font-semibold text-zinc-700">用户名</label>
            <input
              type="text"
              value={user.username}
              disabled
              className="w-full h-[40px] px-3 bg-zinc-50 border border-black/[0.06] rounded-md text-[13px] text-zinc-500 cursor-not-allowed"
            />
            <span className="text-[11px] text-zinc-400">用户名不可修改</span>
          </div>
          <div className="grid gap-2">
            <label className="text-[13px] font-semibold text-zinc-700">昵称</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={80}
              className="w-full h-[40px] px-3 bg-white border border-black/[0.1] rounded-md text-[13px] text-black outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
            />
          </div>
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 h-[38px] px-5 rounded-lg bg-black text-white text-[13px] font-semibold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isSaving ? (
                <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
              ) : (
                <Save size={14} />
              )}
              {isSaving ? '保存中...' : '保存昵称'}
            </button>
          </div>
        </form>
      </section>

      {/* Password Section */}
      <section className="bg-white rounded-xl shadow-sm border border-black/[0.06] overflow-hidden">
        <div className="p-5 border-b border-black/[0.06] flex items-center gap-2 bg-zinc-50/50">
          <Lock size={16} className="text-black" />
          <h3 className="text-[14px] font-bold text-black uppercase tracking-widest">修改密码</h3>
        </div>
        <form className="p-6 space-y-4" onSubmit={handleChangePassword}>
          {passwordError && <ErrorAlert message={passwordError} />}
          {passwordSuccess && (
            <div className="px-3 py-2 border border-emerald-200 rounded-md text-emerald-700 bg-emerald-50 text-[13px]" role="alert">
              {passwordSuccess}
            </div>
          )}
          <div className="grid gap-2">
            <label className="text-[13px] font-semibold text-zinc-700">当前密码</label>
            <div className="relative">
              <input
                type={showOldPassword ? 'text' : 'password'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full h-[40px] px-3 pr-10 bg-white border border-black/[0.1] rounded-md text-[13px] text-black outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
                placeholder="输入当前密码"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600"
                onClick={() => setShowOldPassword(!showOldPassword)}
              >
                {showOldPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="grid gap-2">
            <label className="text-[13px] font-semibold text-zinc-700">新密码</label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full h-[40px] px-3 pr-10 bg-white border border-black/[0.1] rounded-md text-[13px] text-black outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
                placeholder="至少8位，包含字母和数字"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600"
                onClick={() => setShowNewPassword(!showNewPassword)}
              >
                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="grid gap-2">
            <label className="text-[13px] font-semibold text-zinc-700">确认新密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full h-[40px] px-3 bg-white border border-black/[0.1] rounded-md text-[13px] text-black outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
              placeholder="再次输入新密码"
            />
          </div>
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isChangingPassword}
              className="inline-flex items-center gap-2 h-[38px] px-5 rounded-lg bg-black text-white text-[13px] font-semibold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isChangingPassword ? (
                <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
              ) : (
                <Lock size={14} />
              )}
              {isChangingPassword ? '修改中...' : '修改密码'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
