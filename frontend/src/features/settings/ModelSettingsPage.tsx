import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { KeyRound, PlugZap, Save } from 'lucide-react';

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
    return () => { isMounted = false; };
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
    <section className="panel model-settings">
      <div className="panel__header">
        <div><h2>模型设置</h2><p>配置与 OpenAI API 兼容的模型服务，用于文档题库生成。</p></div>
        <StatusBadge tone={settings?.has_api_key || settings?.platform_available ? 'success' : 'warning'}>{settings?.has_api_key ? '已配置个人密钥' : settings?.platform_available ? '使用平台密钥' : '等待配置'}</StatusBadge>
      </div>
      <form className="model-settings__form" aria-label="模型设置" onSubmit={handleSave}>
        <label className="field"><span className="field__label">服务商</span><select className="field__control" value={provider} onChange={(event) => setProvider(event.target.value)}><option value="openai-compatible">OpenAI 兼容接口</option><option value="openai">OpenAI</option></select></label>
        <Field label="Base URL" type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" required />
        <Field label="模型" value={model} onChange={(event) => setModel(event.target.value)} placeholder="gpt-4o-mini" required />
        <div className="model-key-field"><KeyRound size={18} aria-hidden="true" /><Field label="API Key" type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings?.has_api_key ? '已保存，留空则保持不变' : '输入 API Key'} hint="密钥只在本次保存时提交，页面不会回显已保存内容。" /></div>
        {message ? <div className={`settings-message settings-message--${message.tone}`} role="status">{message.text}</div> : null}
        <div className="settings-actions"><button className="secondary-button" type="button" onClick={handleTest} disabled={isTesting || isSaving}><PlugZap size={16} aria-hidden="true" />{isTesting ? '正在测试' : '测试连接'}</button><button className="primary-button" type="submit" disabled={isSaving || isTesting}><Save size={16} aria-hidden="true" />{isSaving ? '正在保存' : '保存设置'}</button></div>
      </form>
    </section>
  );
}
