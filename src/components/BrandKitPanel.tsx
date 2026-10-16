import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { api } from '../lib/convexApi';
import { button, field, label, panel } from '../lib/ui';
export type BrandSelection = { kitId: string; revision: number };
type Settings = { font: string; captionStyle: string; textColor: string; outlineColor: string; logo?: ArrayBuffer };
type Kit = { _id: string; name: string; revision: number; settings: Settings };
type Props = { accountKey: string; value?: BrandSelection; onChange(value?: BrandSelection): void; disabled?: boolean; onApply?: () => void; unavailable?: boolean; compact?: boolean };
const initial: Settings = { font: 'sans', captionStyle: 'clean', textColor: '#FFFFFF', outlineColor: '#000000' };
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="status" className="text-sm">Brand kits could not load. <button type="button" className="font-semibold underline underline-offset-4" onClick={() => this.setState({ failed: false })}>Retry brand kits</button></p> : this.props.children; }
}
export function BrandKitPanel(props: Props) { return <Boundary key={props.accountKey}><Panel {...props} /></Boundary>; }
function Panel({ accountKey, value, onChange, disabled, onApply, unavailable, compact = false }: Props) {
  const { isAuthenticated } = useConvexAuth();
  const result = useQuery(api.brandKits.list, isAuthenticated && accountKey ? { accountKey } : 'skip');
  const kits = Array.isArray(result) ? result as Kit[] : [];
  const save = useMutation(api.brandKits.save);
  const [editing, setEditing] = useState<Kit>();
  const [open, setOpen] = useState(false), [name, setName] = useState(''), [settings, setSettings] = useState<Settings>(initial);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const alive = useRef(true), fileEpoch = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; fileEpoch.current++; }; }, []);
  const active = kits.find(k => k._id === value?.kitId && k.revision === value?.revision);
  const [preview, setPreview] = useState<string>();
  useEffect(() => { const logo = open ? settings.logo : active?.settings.logo; if (!logo) { setPreview(undefined); return; } const url = URL.createObjectURL(new Blob([logo], { type: 'image/png' })); setPreview(url); return () => URL.revokeObjectURL(url); }, [open, settings.logo, active?.settings.logo]);
  const edit = (kit?: Kit) => { fileEpoch.current++; setReading(false); setEditing(kit); setName(kit?.name ?? ''); setSettings(kit?.settings ?? initial); setOpen(true); setError(''); };
  const persist = async () => {
    if (busy || reading) return;
    setBusy(true); setError('');
    try { const selection = await save({ ...(editing ? { kitId: editing._id, revision: editing.revision } : {}), name, settings }) as BrandSelection; if (!alive.current) return; onChange(selection); setOpen(false); }
    catch { if (alive.current) setError('Could not save. Check the name and PNG limits, or reopen a kit that changed.'); }
    finally { if (alive.current) setBusy(false); }
  };
  if (!isAuthenticated) return null;
  return <section className={`${compact ? 'mt-4 border-t border-line pt-4' : `${panel} p-4`} space-y-3`} aria-label="Brand kit">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className={compact ? label : 'text-base font-semibold'}>Brand kit</h3>{!compact && <span className="text-xs text-muted">Free to save · renders use allowance</span>}</div>
    <label className={`block ${label}`}>Saved kit<select aria-label="Saved brand kit" className={`${field} mt-1 block w-full max-w-full`} disabled={disabled || busy} value={value?.kitId ?? ''} onChange={e => { const kit = kits.find(k => k._id === e.target.value); onChange(kit ? { kitId: kit._id, revision: kit.revision } : undefined); }}><option value="">No kit selected</option>{kits.map(k => <option key={k._id} value={k._id}>{k.name}</option>)}</select></label>
    {value && !active && result !== undefined && <p role="status" className="text-sm text-cueInk">This kit changed. Select it again to use its latest settings.</p>}
    {preview && <img src={preview} alt="Brand logo preview" width={48} height={48} className="h-12 w-12 object-contain" />}
    {active && !open && <p className="rounded-md bg-ink p-3 text-center" style={{ fontFamily: active.settings.font === 'serif' ? 'serif' : active.settings.font === 'mono' ? 'monospace' : 'sans-serif', color: active.settings.textColor, textShadow: `1px 1px ${active.settings.outlineColor}` }}>Your caption style · {active.settings.captionStyle}</p>}
    <div className="flex flex-wrap gap-2"><button type="button" className={button('secondary', 'sm')} disabled={disabled || busy || kits.length >= 5} onClick={() => edit()}>Create kit</button>{active && <button type="button" className={button('secondary', 'sm')} disabled={disabled || busy} onClick={() => edit(active)}>Edit selected kit</button>}{onApply && <button type="button" className={button('primary', 'sm')} disabled={disabled || busy || !active || unavailable} onClick={onApply}>Apply brand kit · 1 generation</button>}</div>
    {onApply && unavailable && <p className="text-xs text-muted">Applying a kit needs this version's saved clean video and captions. Use a kit on a new render instead.</p>}
    {!compact && <p className="text-xs text-muted">Kit captions replace the caption-style choice for a new render. The logo appears at the upper right. Existing marks in uploaded footage remain; free renders still add TakeOne branding.</p>}
    {open && <div className="space-y-3 border-t border-line pt-3">
      <label className={`block ${label}`}>Kit name<input className={`${field} mt-1 block w-full`} maxLength={60} value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>
      <label className={`block ${label}`}>Caption font<select className={`${field} mt-1 block w-full`} value={settings.font} disabled={busy} onChange={e => setSettings(s => ({ ...s, font: e.target.value }))}><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select></label>
      <label className={`block ${label}`}>Kit caption style<select className={`${field} mt-1 block w-full`} value={settings.captionStyle} disabled={busy} onChange={e => setSettings(s => ({ ...s, captionStyle: e.target.value }))}><option value="clean">Clean</option><option value="meme">Bold pop</option><option value="karaoke">Pop-in</option><option value="none">No added captions</option></select></label>
      <div className="flex flex-wrap gap-4"><label className={`flex items-center gap-2 ${label}`}>Text color<input aria-label="Text color" type="color" className="h-8 w-10 rounded-md border border-line bg-surface" value={settings.textColor} disabled={busy} onChange={e => setSettings(s => ({ ...s, textColor: e.target.value }))} /></label><label className={`flex items-center gap-2 ${label}`}>Outline color<input aria-label="Outline color" type="color" className="h-8 w-10 rounded-md border border-line bg-surface" value={settings.outlineColor} disabled={busy} onChange={e => setSettings(s => ({ ...s, outlineColor: e.target.value }))} /></label></div>
      <label className={`block ${label}`}>PNG logo · up to 64 KiB and 512 × 512<input className="mt-1 block max-w-full text-xs font-normal text-ink file:mr-3 file:rounded-md file:border file:border-ink file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink" type="file" accept="image/png" disabled={busy} onChange={async e => { const file = e.target.files?.[0], epoch = ++fileEpoch.current; setReading(false); if (!file) return; if (file.type !== 'image/png' || file.size > 65536) { setError('Use a PNG up to 64 KiB and 512 × 512.'); return; } setReading(true); try { const logo = await file.arrayBuffer(); if (alive.current && epoch === fileEpoch.current) { setSettings(s => ({ ...s, logo })); setError(''); } } catch { if (alive.current && epoch === fileEpoch.current) setError('Could not read that PNG. Choose it again.'); } finally { if (alive.current && epoch === fileEpoch.current) setReading(false); } }} /></label>
      {settings.logo && <button type="button" className="text-sm font-semibold underline underline-offset-4" disabled={busy} onClick={() => { fileEpoch.current++; setReading(false); setSettings(s => ({ ...s, logo: undefined })); }}>Remove logo from kit</button>}
      <div className="flex gap-2"><button type="button" className={button('primary', 'sm')} disabled={busy || reading || !name.trim()} onClick={() => void persist()}>{busy ? 'Saving kit…' : 'Save kit'}</button><button type="button" className={button('secondary', 'sm')} disabled={busy} onClick={() => { fileEpoch.current++; setReading(false); setOpen(false); }}>Cancel</button></div>
    </div>}
    {error && <p role="alert" className="text-sm text-warn">{error}</p>}
  </section>;
}
