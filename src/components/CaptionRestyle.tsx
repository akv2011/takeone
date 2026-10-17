import { Subtitles } from "@phosphor-icons/react";
import { InspectorSection, GenerationCost } from "./StudioWorkspace";
import { useEffect, useRef, useState } from 'react';
import { validCaptionTexts } from '../../convex/captions';
import { button, field, fieldsetPanel, label, legend } from '../lib/ui';
type Cue = { start: number; end: number; text: string };
export function CaptionRestyle({ available, disabled, loadCues, onApply }: { available: boolean; disabled: boolean; loadCues?(): Promise<Cue[]>; onApply(style: string, texts?: string[], position?: string, font?: string): void }) {
  const [style, setStyle] = useState('clean');
  const [position, setPosition] = useState('');
  const [font, setFont] = useState('');
  const [cues, setCues] = useState<Cue[]>(), [loading, setLoading] = useState(false), [error, setError] = useState(''), [page, setPage] = useState(0);
  const alive = useRef(true), lock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const texts = cues?.map(cue => cue.text), valid = !texts || validCaptionTexts(texts);
  return <InspectorSection title="Caption style" icon={Subtitles} help="Replace TakeOne captions using saved timing. Existing audio and source text stay unchanged. Applying creates a new version."><fieldset disabled={disabled || !available} className={`${fieldsetPanel} w-full disabled:opacity-60`}>
    <legend className={legend}>Restyle captions</legend>
    {!available ? <p className="text-sm text-ink2">This version has no editable caption layer. Use a new source render; text already embedded in your footage cannot be removed.</p> : <>
      <label className={`block ${label}`}>New caption style<select value={style} onChange={event => setStyle(event.target.value)} className={`${field} mt-1 block w-full`}>
        <option value="clean">Clean · static</option><option value="meme">Bold pop · uppercase</option><option value="karaoke">Pop-in · short phrases</option><option value="none">Remove TakeOne captions</option>
      </select></label>
      <label className={`mt-3 block ${label}`}>Caption position<select value={position} onChange={e => setPosition(e.target.value)} className={`${field} mt-1 block w-full`}><option value="">Keep saved position</option><option value="auto">Style default</option><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></label>
      <label className={`mt-3 block ${label}`}>Caption font<select value={font} onChange={e => setFont(e.target.value)} className={`${field} mt-1 block w-full`}><option value="">Keep saved font</option><option value="sans">Sans · DejaVu Sans</option><option value="serif">Serif · DejaVu Serif</option><option value="mono">Mono · DejaVu Sans Mono</option></select></label>
      {loadCues && !cues && <button type="button" disabled={loading} className="mt-3 block text-sm font-semibold underline underline-offset-4" onClick={async () => {
        if (lock.current) return; lock.current = true; setLoading(true); setError('');
        try { const loaded = await loadCues(); if (alive.current) setCues(loaded); }
        catch { if (alive.current) setError('Could not load saved captions. Try again. No generation used.'); }
        finally { if (alive.current) { setLoading(false); lock.current = false; } }
      }}>{loading ? 'Loading captions…' : 'Edit caption wording · free to load'}</button>}
      {error && <p role="alert" className="mt-2 text-[13px] text-warn">{error}</p>}
      {cues && <div className="mt-3">
        <p className="text-[13px]">Correct the wording below. Timing and speech audio stay unchanged.</p>
        <div className="mt-2 max-h-64 overflow-y-auto space-y-2">{cues.slice(page * 20, (page + 1) * 20).map((cue, i) => <label key={page * 20 + i} className="block text-[13px] font-semibold text-ink2">Caption {page * 20 + i + 1} · {cue.start.toFixed(2)} to {cue.end.toFixed(2)}s<textarea maxLength={4000} value={cue.text} onChange={e => { const text = e.target.value; setCues(previous => previous?.map((item, index) => index === page * 20 + i ? { ...item, text } : item)); }} className={`${field} mt-1 block w-full`} /></label>)}</div>
        {cues.length > 20 && <div className="mt-2 flex items-center gap-3 text-[13px]"><button type="button" className={button('secondary', 'sm')} disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous captions</button><span>Page {page + 1} of {Math.ceil(cues.length / 20)}</span><button type="button" className={button('secondary', 'sm')} disabled={(page + 1) * 20 >= cues.length} onClick={() => setPage(p => p + 1)}>Next captions</button></div>}
        {!valid && <p role="alert" className="mt-2 text-[13px] text-warn">Each caption needs text. Keep the total wording under 256 KB.</p>}
      </div>}
      <div className="studio-cost-action"><button type="button" disabled={loading || !valid} onClick={() => onApply(style, texts, position || undefined, font || undefined)} className={`${button('primary', 'sm')} mt-3`}>Apply style</button><GenerationCost /></div>
    </>}
  </fieldset></InspectorSection>;
}
