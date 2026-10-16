import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../lib/convexApi';
import {
  DEFAULT_ACCOUNT_PREFERENCES,
  normalizeAccountPreferences,
  type AccountPreferencesValue,
} from '../../lib/accountPreferences';
import { button, field } from '../../lib/ui';

type Choice<T extends string> = { value: T; label: string };

const modes: Choice<AccountPreferencesValue['defaultMode']>[] = [
  { value: 'edit', label: 'Edit' },
  { value: 'generate', label: 'Create' },
  { value: 'clip', label: 'YouTube' },
];
const aspects: Choice<AccountPreferencesValue['defaultAspect']>[] = [
  { value: '9:16', label: 'Vertical' },
  { value: '1:1', label: 'Square' },
  { value: '16:9', label: '16:9' },
];
const captions: Choice<AccountPreferencesValue['defaultCaptionStyle']>[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'clean', label: 'Clean' },
  { value: 'meme', label: 'Bold pop' },
  { value: 'karaoke', label: 'Pop-in' },
  { value: 'none', label: 'None' },
];

function PreferenceSelect<T extends string>({
  label,
  name,
  choices,
  value,
  onChange,
}: {
  label: string;
  name: string;
  choices: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-6 border-b border-line py-4">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <select
        aria-label={label}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className={`${field} min-w-36 cursor-pointer`}
      >
        {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select>
    </label>
  );
}

function Toggle({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-5 border-b border-line py-4">
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted">{detail}</span>
      </span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${checked ? 'border-ink bg-cue' : 'border-muted bg-line'}`}>
        <input className="peer sr-only" type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-transform ${checked ? 'translate-x-4 bg-ink' : 'translate-x-0.5 bg-surface'}`} />
      </span>
    </label>
  );
}

export default function AccountPreferences() {
  const me = useQuery(api.users.currentUser) as { preferences?: Partial<AccountPreferencesValue> } | null | undefined;
  const savePreferences = useMutation(api.users.updatePreferences);
  const [saved, setSaved] = useState<AccountPreferencesValue>(DEFAULT_ACCOUNT_PREFERENCES);
  const [draft, setDraft] = useState<AccountPreferencesValue>(DEFAULT_ACCOUNT_PREFERENCES);
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const serverPreferenceKey = me === undefined ? undefined : JSON.stringify(normalizeAccountPreferences(me?.preferences));

  useEffect(() => {
    if (serverPreferenceKey === undefined) return;
    const next = JSON.parse(serverPreferenceKey) as AccountPreferencesValue;
    setSaved(next);
    setDraft(next);
    setHydrated(true);
  }, [serverPreferenceKey]);

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);
  const update = <K extends keyof AccountPreferencesValue>(key: K, value: AccountPreferencesValue[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setState('idle');
  };

  const submit = async () => {
    if (!dirty || state === 'saving' || !me) return;
    setState('saving');
    try {
      const result = await savePreferences(draft) as AccountPreferencesValue;
      const next = normalizeAccountPreferences(result ?? draft);
      setSaved(next);
      setDraft(next);
      setState('saved');
    } catch {
      setState('error');
    }
  };

  if (!hydrated) {
    return <div className="min-h-[31rem] rounded-[10px] border border-line bg-paper motion-safe:animate-pulse" aria-label="Loading preferences" />;
  }

  return (
    <section className="max-w-2xl text-ink">
      <p className="mb-6 text-sm leading-6 text-muted">Choose how a fresh project begins. You can still change every setting before a render.</p>
      <div>
        <PreferenceSelect label="Starting point" name="default-mode" choices={modes} value={draft.defaultMode} onChange={(value) => update('defaultMode', value)} />
        <PreferenceSelect label="Aspect ratio" name="default-aspect" choices={aspects} value={draft.defaultAspect} onChange={(value) => update('defaultAspect', value)} />
        <PreferenceSelect label="Caption style" name="default-caption" choices={captions} value={draft.defaultCaptionStyle} onChange={(value) => update('defaultCaptionStyle', value)} />
        <div>
          <Toggle label="Open finished videos in Studio" detail="Go straight to the timeline when a render finishes." checked={draft.openFinishedInStudio} onChange={(value) => update('openFinishedInStudio', value)} />
          <Toggle label="Show keyboard shortcuts" detail="Keep the Command and Enter hint beneath the composer." checked={draft.showShortcutHints} onChange={(value) => update('showShortcutHints', value)} />
        </div>
      </div>
      <div className="mt-7 flex items-center gap-3">
        <button type="button" onClick={submit} disabled={!dirty || state === 'saving' || !me} className={button('primary', 'sm')}>
          {state === 'saving' ? 'Saving…' : 'Save preferences'}
        </button>
        {state === 'saved' && <p role="status" aria-live="polite" className="text-sm text-go">Saved</p>}
        {state === 'error' && <p role="alert" className="text-sm text-warn">Could not save your preferences. Try again.</p>}
      </div>
    </section>
  );
}
