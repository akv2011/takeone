import { useAction, useQuery } from 'convex/react';
import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import { CAPTION_LANGUAGES } from '../../convex/captions';
import { parseYouTubeLink, watchUrl, type Moment, type MomentAnalysis, type MomentTranslation } from '../../convex/youtubeValues';
import { FilmStrip, LinkSimple, MagnifyingGlass, Translate, WarningCircle } from '@phosphor-icons/react';
import { api } from '../lib/convexApi';
import { clock } from '../lib/momentHandOff';
import { button, field, label } from '../lib/ui';

type CaptionLanguage = MomentTranslation['language'];

const LINK_ERRORS = {
  playlist: 'That link opens a playlist. Paste a link to one video.',
  invalid: 'Paste a link to one YouTube video: youtube.com/watch, youtu.be or youtube.com/shorts.',
} as const;
const ANALYZE_ERRORS = new Map([
  ['YOUTUBE_RATE_LIMIT', 'You can find moments 3 times an hour. Try again later.'],
  ['YOUTUBE_DAILY_CAP', "Today's moment searches are used up. Try again tomorrow."],
  ['YOUTUBE_URL', LINK_ERRORS.invalid],
  ['YOUTUBE_PLAYLIST', LINK_ERRORS.playlist],
]);

export function YouTubeLinkForm() {
  const analyze = useAction(api.youtubeMoments.analyze);
  const id = useId();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const link = parseYouTubeLink(url);
    if ('error' in link) { setError(LINK_ERRORS[link.error]); return; }
    setBusy(true); setError('');
    try { await analyze({ url: url.trim() }); }
    catch (caught) {
      const code = (caught as { data?: unknown } | null)?.data;
      setError((typeof code === 'string' ? ANALYZE_ERRORS.get(code) : undefined) ?? 'Gemini could not read this video. Check that it is public and under 45 minutes, then try again.');
    } finally { setBusy(false); }
  };
  // noValidate: the browser's url check rejects links pasted without https://, which parseYouTubeLink accepts.
  return <form noValidate onSubmit={submit} className="sheet-ruled">
    <label htmlFor={`${id}-url`} className={`${label} block px-4 pt-5 sm:px-6`}>YouTube link</label>
    <div className="flex items-center gap-3 px-4 pb-5 pt-2 sm:px-6">
      <LinkSimple aria-hidden="true" size={20} weight="light" className="shrink-0 text-muted" />
      <input id={`${id}-url`} name="youtube-link" type="url" inputMode="url" autoComplete="off" spellCheck={false}
        value={url} onChange={event => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=…"
        aria-invalid={error ? true : undefined} aria-describedby={`${id}-help ${id}-error`}
        className={`min-w-0 flex-1 border-b bg-transparent pb-1.5 font-mono text-base outline-none placeholder:text-faint ${error ? 'border-signal' : 'border-ink/40 focus:border-ink'}`} />
    </div>
    <div className={error ? 'flex items-center gap-3 px-4 pb-4 sm:px-6' : ''}>
      {error && <span aria-hidden="true" className="stamp -rotate-2 px-2! py-0.5! text-[10px]! text-signal">Check link</span>}
      <p id={`${id}-error`} role="alert" className="min-w-0 flex-1 text-sm text-signal">{error}</p>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink bg-surface px-3 py-2.5">
      <p id={`${id}-help`} className="flex min-w-0 flex-1 basis-56 flex-wrap gap-1.5">
        {['Public videos', 'Up to 45 min', 'Nothing downloaded', '3 searches an hour'].map(chip => <span key={chip} className="border border-ink/30 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink2">{chip}</span>)}
      </p>
      <button type="submit" disabled={busy} className={`${button('primary')} h-10 min-w-36`}>
        Find moments{busy ? <span aria-hidden="true" className="pat-dots size-4 bg-surface opacity-60 motion-safe:animate-pulse" /> : <MagnifyingGlass aria-hidden="true" size={16} />}
      </button>
    </div>
  </form>;
}

export function YouTubeMomentResults({ onRender }: { onRender?: (moment: Moment) => void }) {
  const latest = useQuery(api.youtubeMoments.latest, {}) as MomentAnalysis | null | undefined;
  const translate = useAction(api.youtubeMoments.translate), share = useAction(api.youtubeMoments.share);
  const heading = useId();
  if (!latest) return null;
  if (latest.status === 'running') return <div>
    <p className="eyebrow">Moments</p>
    <p role="status" className="display mt-2 text-3xl">Gemini is watching the video. This usually takes under a minute.</p>
    <div aria-hidden="true" className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map(slot => <div key={slot} className="sheet-ruled flex aspect-[9/16] max-h-[520px] w-full flex-col border border-ink/30 p-4 motion-safe:animate-pulse">
        <div className="h-3 w-24 bg-ink/15" />
        <div className="mt-3 h-6 w-3/4 bg-ink/15" />
        <div className="pat-dots mt-4 aspect-video w-full opacity-15" />
      </div>)}
    </div>
  </div>;
  if (latest.status !== 'done' || !latest.moments.length) return <div className="flex flex-wrap items-center gap-3 border border-signal/50 bg-warnBg/60 p-3">
    <span aria-hidden="true" className="stamp -rotate-2 px-2! py-0.5! text-[10px]! text-signal">No moments</span>
    <p role="status" className="min-w-0 flex-1 basis-56 text-sm">Gemini could not find moments in this video. Check that it is public, then try another link.</p>
  </div>;
  return <section aria-labelledby={heading}>
    <p className="eyebrow">{latest.moments.length} picked</p>
    <h2 id={heading} className="display mt-2 text-4xl">Moments from this video</h2>
    <div className="mt-6 grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
      {latest.moments.map((moment, index) => <MomentCard key={`${latest.id}:${index}`} order={index} videoId={latest.videoId} moment={moment}
        translations={latest.translations.filter(item => item.moment === index)}
        onTranslate={language => translate({ id: latest.id, moment: index, language })}
        onShare={() => share({ id: latest.id, moment: index })}
        onRender={onRender && (() => onRender(moment))} />)}
    </div>
  </section>;
}

type PlayerEvents = { onStateChange: (event: { data: number }) => void; onError: (event: { data: number }) => void };
type YouTubePlayer = { getCurrentTime: () => number };
type YouTubeApi = { Player: new (iframe: HTMLIFrameElement, options: { events: PlayerEvents }) => YouTubePlayer };
declare global { interface Window { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void } }

let youtubeApi: Promise<YouTubeApi> | undefined;
function loadYouTubeApi() {
  return youtubeApi ??= new Promise<YouTubeApi>(resolve => {
    if (window.YT?.Player) { resolve(window.YT); return; }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT!); };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.append(script);
  });
}

const PLAYING = 1;
function useYouTubePlayer(iframe: RefObject<HTMLIFrameElement | null>) {
  const [time, setTime] = useState<number>();
  const [error, setError] = useState<number>();
  const player = useRef<YouTubePlayer>(undefined);
  const events = useRef<PlayerEvents>(undefined);
  useEffect(() => {
    let poll: number | undefined;
    const stop = () => window.clearInterval(poll);
    events.current = {
      onStateChange: ({ data }) => {
        stop();
        if (data !== PLAYING) return;
        const read = () => setTime(player.current?.getCurrentTime());
        read(); poll = window.setInterval(read, 250);
      },
      onError: ({ data }) => setError(data),
    };
    // One player per iframe, kept across StrictMode's remount. destroy() would delete React's iframe.
    void loadYouTubeApi().then(YT => {
      if (player.current || !iframe.current) return;
      player.current = new YT.Player(iframe.current, { events: {
        onStateChange: event => events.current?.onStateChange(event),
        onError: event => events.current?.onError(event),
      } });
    });
    return () => { stop(); events.current = undefined; };
  }, [iframe]);
  return { time, error };
}

const OWNER_BLOCKED = 'The owner turned off playback on other sites.';
const PLAYER_ERRORS = new Map([[100, 'This video is private, removed or not found.'], [101, OWNER_BLOCKED], [150, OWNER_BLOCKED]]);

type MomentCardProps = {
  order?: number;
  videoId: string;
  moment: Moment;
  translations?: { language: CaptionLanguage; texts: string[] }[];
  onTranslate?: (language: CaptionLanguage) => Promise<string[]>;
  onShare?: () => Promise<{ token: string }>;
  onRender?: () => void;
};

export function MomentCard({ order, videoId, moment, translations, onTranslate, onShare, onRender }: MomentCardProps) {
  const id = useId();
  const iframe = useRef<HTMLIFrameElement>(null), list = useRef<HTMLOListElement>(null);
  const player = useYouTubePlayer(iframe);
  const [language, setLanguage] = useState<CaptionLanguage | ''>('');
  const [fetched, setFetched] = useState<Partial<Record<CaptionLanguage, string[]>>>({});
  const [translation, setTranslation] = useState<'idle' | 'translating' | 'failed'>('idle');
  const [shared, setShared] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [manualLink, setManualLink] = useState('');
  const start = Math.floor(moment.start_sec), end = Math.ceil(moment.end_sec);
  const time = player.time;
  const active = time === undefined ? -1 : moment.cues.findLastIndex(cue => cue.start_sec <= time);
  const cached = (code: CaptionLanguage) => translations?.find(item => item.language === code)?.texts ?? fetched[code];
  const texts = language ? cached(language) : undefined;
  const playerError = player.error === undefined ? undefined : PLAYER_ERRORS.get(player.error) ?? 'The player could not load.';

  useEffect(() => {
    const box = list.current, line = box?.children[active] as HTMLElement | undefined;
    if (box && line) box.scrollTop = line.offsetTop - (box.clientHeight - line.offsetHeight) / 2;
  }, [active]);
  useEffect(() => {
    if (shared !== 'copied') return;
    const timer = window.setTimeout(() => setShared('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [shared]);

  const chooseLanguage = async (next: CaptionLanguage | '') => {
    setLanguage(next); setTranslation('idle');
    if (!next || !onTranslate || cached(next)) return;
    setTranslation('translating');
    try {
      const result = await onTranslate(next);
      setFetched(current => ({ ...current, [next]: result }));
      setTranslation('idle');
    } catch { setLanguage(''); setTranslation('failed'); }
  };
  const copyShareLink = async () => {
    if (!onShare) return;
    setShared('idle'); setManualLink('');
    let link: string;
    try { link = `${window.location.origin}/clip/${(await onShare()).token}`; }
    catch { setShared('failed'); return; }
    try { await navigator.clipboard.writeText(link); setShared('copied'); }
    catch { setManualLink(link); }
  };

  // Policy: nothing sits over the player, and its box holds only the unmodified iframe.
  return <article aria-labelledby={`${id}-hook`} className="sheet flex min-w-0 flex-col shadow-hard-sm">
    <div className="px-4 pb-3 pt-4">
      <div className="flex items-center justify-between gap-2">
        {order !== undefined && <span className="eyebrow text-muted">Moment {String(order + 1).padStart(2, '0')}</span>}
        <span className="border border-ink px-1.5 py-0.5 font-mono text-[11px] tracking-[0.04em]">{clock(start)} to {clock(end)} · {end - start}&nbsp;s</span>
      </div>
      <h3 id={`${id}-hook`} className="display mt-2 break-words text-3xl text-balance">{moment.hook}</h3>
    </div>
    <div className="aspect-video min-h-[200px] w-full shrink-0 bg-ink">
      <iframe ref={iframe} title={`YouTube video player: ${moment.hook}`} className="h-full w-full"
        src={`https://www.youtube-nocookie.com/embed/${videoId}?start=${start}&end=${end}&rel=0&enablejsapi=1&playsinline=1&origin=${encodeURIComponent(window.location.origin)}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
    </div>
    {playerError && <p role="status" className="border-b border-line px-4 py-3 text-sm">
      <WarningCircle aria-hidden="true" size={14} className="mr-1.5 inline text-signal" />
      {playerError}
      {player.error !== 100 && <> <a href={`${watchUrl(videoId)}&t=${start}s`} target="_blank" rel="noopener" className="font-medium underline underline-offset-4">Watch it on YouTube</a></>}
    </p>}
    <p className="border-b border-line px-4 py-3 text-sm leading-snug"><span className="eyebrow mr-2 text-muted">Why it works</span>{moment.why}</p>
    <ol ref={list} aria-label="Captions" lang={texts ? language : undefined} className="relative max-h-36 overflow-y-auto px-2 py-2">
      {moment.cues.map((cue, index) => <li key={index} aria-current={index === active ? 'true' : undefined}
        className={`flex gap-3 px-2 py-0.5 ${index === active ? 'bg-cue text-surface' : 'text-ink2'}`}>
        <span className={`shrink-0 font-mono text-[11px] leading-6 ${index === active ? '' : 'text-muted'}`}>{clock(Math.floor(cue.start_sec))}</span>
        <span className="min-w-0 break-words text-sm leading-6">{texts?.[index] ?? cue.text}</span>
      </li>)}
    </ol>
    {(onTranslate || onShare || onRender) && <div className="space-y-3 border-t border-ink px-4 py-3">
      {onTranslate && <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label htmlFor={`${id}-language`} className={`${label} inline-flex items-center gap-1.5`}><Translate aria-hidden="true" size={14} />Caption language</label>
        <select id={`${id}-language`} value={language} disabled={translation === 'translating'}
          onChange={event => void chooseLanguage(event.target.value as CaptionLanguage | '')} className={`${field} min-w-0 flex-1 py-1.5 disabled:opacity-50`}>
          <option value="">Original</option>
          {CAPTION_LANGUAGES.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
        </select>
        <p aria-live="polite" className={`basis-full text-xs ${translation === 'failed' ? 'text-signal' : 'font-mono uppercase tracking-[0.06em] text-muted'}`}>
          {translation === 'translating' ? 'Translating…' : translation === 'failed' ? 'Could not translate the captions. Try again.' : ''}
        </p>
      </div>}
      {(onShare || onRender) && <div>
        <div className="flex flex-wrap gap-2">
          {onRender && <button type="button" onClick={onRender} className={button('primary', 'sm')}><FilmStrip aria-hidden="true" size={14} />Render as MP4 from your own copy</button>}
          {onShare && <button type="button" onClick={() => void copyShareLink()} className={button('secondary', 'sm')}><LinkSimple aria-hidden="true" size={14} />Copy share link</button>}
        </div>
        {onShare && <p aria-live="polite" className={`mt-1 text-xs ${shared === 'failed' ? 'text-signal' : 'font-mono uppercase tracking-[0.06em] text-ink'}`}>
          {shared === 'copied' ? 'Link copied' : shared === 'failed' ? 'Could not make a share link. Try again.' : ''}
        </p>}
        {manualLink && <div className="mt-2">
          <label htmlFor={`${id}-link`} className={`${label} block`}>Copy this link</label>
          <input id={`${id}-link`} readOnly value={manualLink} onFocus={event => event.currentTarget.select()} className={`${field} mt-1 block w-full font-mono`} />
        </div>}
      </div>}
    </div>}
  </article>;
}
