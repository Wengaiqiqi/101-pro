import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { PlugZap, Save, Settings2 } from 'lucide-react';
import { getGlobalSettings, saveGlobalSettings, testGlobalSettings } from '../../api/client';
import type { GlobalSettings as GlobalSettingsType } from '../../api/types';

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<GlobalSettingsType | null>(null);
  const [provider, setProvider] = useState('openai-compatible');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('gpt-4o-mini');
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    getGlobalSettings()
      .then((s) => {
        if (!isMounted) return;
        setSettings(s);
        setProvider(s.model_provider || 'openai-compatible');
        setBaseUrl(s.model_base_url || 'https://api.openai.com/v1');
        setModel(s.model_name || 'gpt-4o-mini');
      })
      .catch((e) => { if (isMounted) setMessage({ tone: 'danger', text: e instanceof Error ? e.message : '加载失败' }); });
    return () => { isMounted = false; };
  }, []);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      const updated = await saveGlobalSettings({
        model_provider: provider,
        model_base_url: baseUrl,
        model_name: model,
        ...(apiKey.trim() ? { model_api_key: apiKey.trim() } : {}),
      });
      setSettings(updated);
      setApiKey('');
      setMessage({ tone: 'success', text: '全局设置已保存' });
    } catch (e) {
      setMessage({ tone: 'danger', text: e instanceof Error ? e.message : '保存失败' });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTest() {
    setIsTesting(true);
    setMessage(null);
    try {
      const result = await testGlobalSettings();
      setMessage({ tone: result.ok ? 'success' : 'danger', text: result.ok ? `连接成功：${result.model}` : result.message ?? '连接失败' });
    } catch (e) {
      setMessage({ tone: 'danger', text: e instanceof Error ? e.message : '测试失败' });
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <header className="pb-6 border-b border-black/[0.06]">
        <h2 className="m-0 text-3xl font-bold text-black tracking-tight leading-tight">全局引擎设置</h2>
        <p className="mt-2 text-[14px] text-zinc-500 font-medium">配置系统默认的模型服务，未自定义配置的用户将使用此设置。</p>
      </header>

      <section className="bg-white rounded-xl shadow-sm border border-black/[0.06] overflow-hidden">
        <div className="p-5 border-b border-black/[0.06] flex items-center gap-2 bg-zinc-50/50">
          <Settings2 size={16} className="text-black" />
          <h3 className="text-[14px] font-bold text-black uppercase tracking-widest">默认模型配置</h3>
          {settings?.has_api_key && (
            <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              已配置
            </span>
          )}
        </div>

        <form className="p-6 md:p-8" onSubmit={handleSave}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <div className="grid gap-2">
              <label className="text-[13px] font-semibold text-zinc-700">服务商</label>
              <select
                className="w-full h-[40px] px-3 appearance-none bg-white border border-black/[0.1] rounded-md text-[13px] font-semibold text-black shadow-sm focus:border-black focus:ring-1 focus:ring-black transition-all cursor-pointer"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                <option value="openai-compatible">OpenAI 兼容接口</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-[13px] font-semibold text-zinc-700">Base URL</label>
              <input
                type="url"
                className="w-full h-[40px] px-3 bg-white border border-black/[0.1] rounded-md text-[13px] font-semibold text-black shadow-sm outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-[13px] font-semibold text-zinc-700">模型</label>
              <input
                type="text"
                className="w-full h-[40px] px-3 bg-white border border-black/[0.1] rounded-md text-[13px] font-semibold text-black shadow-sm outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4o-mini"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-[13px] font-semibold text-zinc-700">API Key</label>
              <input
                type="password"
                className="w-full h-[40px] px-3 bg-white border border-black/[0.1] rounded-md text-[13px] font-semibold text-black shadow-sm outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={settings?.has_api_key ? '已保存，留空则保持不变' : '输入 API Key'}
                autoComplete="new-password"
              />
            </div>
          </div>

          {message && (
            <div className={`mt-6 px-3 py-2.5 border rounded-md text-[13px] font-medium ${
              message.tone === 'success'
                ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                : 'border-red-200 text-red-700 bg-red-50'
            }`} role="status">
              {message.text}
            </div>
          )}

          <div className="mt-8 flex justify-end gap-2.5">
            <button
              className="inline-flex items-center gap-2 h-[40px] px-4 rounded-md border border-black/[0.1] text-zinc-700 bg-white text-[13px] font-semibold hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              type="button"
              onClick={handleTest}
              disabled={isTesting || isSaving}
            >
              {isTesting ? (
                <span className="animate-spin inline-block w-4 h-4 border-2 border-zinc-300 border-t-zinc-600 rounded-full" />
              ) : (
                <PlugZap size={16} />
              )}
              {isTesting ? '正在测试' : '测试连接'}
            </button>
            <button
              className="inline-flex items-center gap-2 h-[40px] px-6 rounded-md bg-black text-white text-[13px] font-semibold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              type="submit"
              disabled={isSaving || isTesting}
            >
              {isSaving ? (
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
              ) : (
                <Save size={16} />
              )}
              {isSaving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
