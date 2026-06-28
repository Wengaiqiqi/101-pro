import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { PlugZap, Save } from 'lucide-react';

import { getModelSettings, saveModelSettings, testModelSettings } from '../../api/client';
import type { ModelSettings } from '../../api/types';
import { Field } from '../../components/Field';
import { StatusBadge } from '../../components/StatusBadge';

export function ModelSettingsPage() {
  const [settings, setSettings] = useState<ModelSettings | null>(null);
  const [provider, setProvider] = useState('openai-compatible');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('gpt-4o-mini');
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    getModelSettings()
      .then((current) => {
        if (!isMounted) return;
        setSettings(current);
        setProvider(current.provider ?? 'openai-compatible');
        setBaseUrl(current.base_url ?? 'https://api.openai.com/v1');
        setModel(current.model ?? 'gpt-4o-mini');
      })
      .catch((caught) => {
        if (isMounted) setMessage({ tone: 'danger', text: caught instanceof Error ? caught.message : '模型设置加载失败' });
      });
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      const saved = await saveModelSettings({ provider, base_url: baseUrl, model, ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}) });
      setSettings(saved);
      setApiKey('');
      setMessage({ tone: 'success', text: '模型设置已保存' });
    } catch (caught) {
      setMessage({ tone: 'danger', text: caught instanceof Error ? caught.message : '模型设置保存失败' });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTest() {
    setIsTesting(true);
    setMessage(null);
    try {
      const result = await testModelSettings();
      setMessage({ tone: result.ok ? 'success' : 'danger', text: result.ok ? `连接成功：${result.model}` : result.message ?? '连接失败' });
    } catch (caught) {
      setMessage({ tone: 'danger', text: caught instanceof Error ? caught.message : '连接测试失败' });
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <header className="pb-6 border-b border-black/[0.06]">
        <h2 className="m-0 text-3xl font-bold text-black tracking-tight leading-tight">引擎设置</h2>
        <p className="mt-2 text-[14px] text-zinc-500 font-medium">配置与 OpenAI 兼容的模型服务，用于文档题库生成。</p>
      </header>

    <section className="border border-slate-200 rounded-xl bg-white shadow-sm">
      <div className="flex items-center justify-end gap-4 px-4 py-3.5 border-b border-slate-100">
        <StatusBadge
          className={
            settings?.has_api_key || settings?.platform_available
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-amber-50 text-amber-700'
          }
        >
          {settings?.has_api_key ? '已配置个人密钥' : settings?.platform_available ? '使用平台密钥' : '等待配置'}
        </StatusBadge>
      </div>
      <form className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5 p-5" aria-label="模型设置" onSubmit={handleSave}>
        <div className="grid gap-1.5">
          <label className="text-[13px] font-bold text-slate-700">服务商</label>
          <select
            className="w-full min-h-[38px] px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%236b7280%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-[length:20px] bg-[right_8px_center] bg-no-repeat pr-10"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
          >
            <option value="openai-compatible">OpenAI 兼容接口</option>
            <option value="openai">OpenAI</option>
          </select>
        </div>
        <Field label="Base URL" type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" required />
        <Field label="模型" value={model} onChange={(event) => setModel(event.target.value)} placeholder="gpt-4o-mini" required />
        <Field
          label="API Key"
          type="password"
          autoComplete="new-password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={settings?.has_api_key ? '已保存，留空则保持不变' : '输入 API Key'}
        />
        {message ? (
          <div
            className={`col-span-full px-3 py-2.5 border rounded-lg font-bold ${
              message.tone === 'success'
                ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                : 'border-red-200 text-red-700 bg-red-50'
            }`}
            role="status"
          >
            {message.text}
          </div>
        ) : null}
        <div className="col-span-full flex justify-end gap-2.5 max-md:flex-col-reverse">
          <button
            className="inline-flex items-center gap-2 min-h-[36px] px-3 rounded-lg border border-slate-300 text-slate-700 bg-white text-[13px] font-bold hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
            type="button"
            onClick={handleTest}
            disabled={isTesting || isSaving}
          >
            <PlugZap size={16} aria-hidden="true" />
            {isTesting ? '正在测试' : '测试连接'}
          </button>
          <button
            className="inline-flex items-center gap-2 min-h-[36px] min-w-[132px] px-3.5 rounded-lg border border-teal-600 bg-teal-600 text-white text-[13px] font-bold hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed"
            type="submit"
            disabled={isSaving || isTesting}
          >
            <Save size={16} aria-hidden="true" />
            {isSaving ? '正在保存' : '保存设置'}
          </button>
        </div>
      </form>
    </section>
    </div>
  );
}
