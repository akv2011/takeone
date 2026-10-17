import { useAction, useQuery } from 'convex/react';
import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import { CAPTION_LANGUAGES } from '../../convex/captions';
import { parseYouTubeLink, watchUrl, type Moment, type MomentAnalysis, type MomentTranslation } from '../../convex/youtubeValues';
import { FilmStrip, LinkSimple, Translate, WarningCircle } from '@phosphor-icons/react';
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

export function YouTubeLinkForm({ initialUrl = '' }: { initialUrl?: string }) {
  const analyze = useAction(api.youtubeMoments.analyze);
  const id = useId();
  const [url, setUrl] = useState(initialUrl);
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
  return <form noValidate onSubmit={submit}>
    <label htmlFor={`${id}-url`} className="sr-only">YouTube link</label>
    <div className={`glass flex h-16 items-center gap-3 rounded-card pl-[18px] pr-2 transition-shadow duration-200 ease-paper focus-within:shadow-[0_0_0_1.5px_#141311,0_8px_24px_-12px_rgba(20,19,17,.25)] ${error ? 'shadow-[0_0_0_1.5px_#c4321f,0_8px_24px_-12px_rgba(20,19,17,.18)]' : ''}`}>
      <LinkSimple aria-hidden="true" size={20} className="shrink-0 text-muted" />
      <input id={`${id}-url`} name="youtube-link" type="url" inputMode="url" autoComplete="off" spellCheck={false}
        value={url} onChange={event => setUrl(event.target.value)} placeholder="youtube.com/watch?v=…"
        aria-invalid={error ? true : undefined} aria-describedby={`${id}-help ${id}-error`}
        className="h-12 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted" />
      <button type="submit" disabled={busy} className={`${button('primary', 'lg')} relative shrink-0`}>
        <span className={`inline-flex items-center gap-2.5 ${busy ? 'invisible' : ''}`}>Find moments<kbd aria-hidden="true" className="hidden h-5 min-w-5 place-items-center rounded-[5px] bg-surface/15 px-1 font-sans text-[11px] text-surface/75 sm:inline-grid">↵</kbd></span>
        {busy && <span aria-hidden="true" className="absolute inset-0 grid place-items-center"><span className="flex gap-[3px]">{[0, 1, 2].map(i => <span key={i} style={{ animationDelay: `${i * 120}ms` }} className="h-[11px] w-[6px] rounded-[1px] bg-[#efe9dc] motion-safe:animate-pulse" />)}</span></span>}
      </button>
    </div>
    <p id={`${id}-error`} role="alert" className={`text-sm text-grease ${error ? 'mt-3' : ''}`}>{error}</p>
    <p id={`${id}-help`} className="mt-3 text-[13px] text-muted">Public videos up to 45 minutes. Nothing is downloaded. 3 searches an hour.</p>
  </form>;
}

export function YouTubeMomentResults({ onRender }: { onRender?: (moment: Moment) => void }) {
  const latest = useQuery(api.youtubeMoments.latest, {}) as MomentAnalysis | null | undefined;
  const translate = useAction(api.youtubeMoments.translate), share = useAction(api.youtubeMoments.share);
  const heading = useId();
  if (!latest) return null;
  if (latest.status === 'running') return <div>
    <p role="status" className="font-display text-[22px] font-semibold tracking-[-0.02em]">Gemini is watching the video. This usually takes under a minute.</p>
    <div aria-hidden="true" className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map(slot => <div key={slot} style={{ animationDelay: `${slot * 160}ms` }} className="flex aspect-[9/16] max-h-[460px] w-full flex-col gap-3 rounded-card bg-surface/80 p-4 shadow-card motion-safe:animate-pulse">
        <div className="h-3 w-24 rounded-full bg-ink/10" />
        <div className="h-5 w-3/4 rounded-full bg-ink/10" />
        <div className="aspect-video w-full rounded-[10px] bg-film/80" />
        <div className="h-3 w-5/6 rounded-full bg-ink/10" />
      </div>)}
    </div>
  </div>;
  if (latest.status !== 'done' || !latest.moments.length) return <div className="flex items-start gap-3 rounded-card bg-warnBg/80 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(196,50,31,.18)]">
    <WarningCircle aria-hidden="true" size={20} className="mt-px shrink-0 text-grease" />
    <p role="status" className="text-sm text-ink">Gemini could not find moments in this video. Check that it is public, then try another link.</p>
  </div>;
  return <section aria-labelledby={heading}>
    <h2 id={heading} className="display text-[26px]">Moments from this video</h2>
    <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {latest.moments.map((moment, index) => <MomentCard key={`${latest.id}:${index}`} videoId={latest.videoId} moment={moment}
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
  videoId: string;
  moment: Moment;
  translations?: { language: CaptionLanguage; texts: string[] }[];
  onTranslate?: (language: CaptionLanguage) => Promise<string[]>;
  onShare?: () => Promise<{ token: string }>;
  onRender?: () => void;
};

export function MomentCard({ videoId, moment, translations, onTranslate, onShare, onRender }: MomentCardProps) {
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
  return <article aria-labelledby={`${id}-hook`} className="flex min-w-0 flex-col overflow-hidden rounded-card bg-surface shadow-card">
    <div className="px-4 pb-3 pt-4">
      <p className="font-mono text-[12px] text-ink2">{clock(start)} to {clock(end)} · {end - start}&nbsp;s</p>
      <h3 id={`${id}-hook`} className="mt-1 break-words font-display text-[20px] font-semibold leading-tight tracking-[-0.02em]">{moment.hook}</h3>
    </div>
    <div className="aspect-video min-h-[200px] w-full shrink-0 bg-ink">
      <iframe ref={iframe} title={`YouTube video player: ${moment.hook}`} className="h-full w-full"
        src={`https://www.youtube-nocookie.com/embed/${videoId}?start=${start}&end=${end}&rel=0&enablejsapi=1&playsinline=1&origin=${encodeURIComponent(window.location.origin)}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
    </div>
    {playerError && <p role="status" className="px-4 pt-3 text-sm text-ink">
      {playerError}
      {player.error !== 100 && <> <a href={`${watchUrl(videoId)}&t=${start}s`} target="_blank" rel="noopener" className="font-semibold underline underline-offset-4">Watch it on YouTube</a></>}
    </p>}
    <p className="px-4 pt-3 text-sm leading-snug text-ink2"><span className="font-semibold text-ink">Why it works </span>{moment.why}</p>
    <ol ref={list} aria-label="Captions" lang={texts ? language : undefined} className="relative mx-2 mb-3 mt-2 max-h-32 overflow-y-auto">
      {moment.cues.map((cue, index) => <li key={index} aria-current={index === active ? 'true' : undefined}
        className={`flex gap-3 rounded-[8px] px-2 py-0.5 transition-colors ${index === active ? 'bg-cue text-white' : 'text-ink2'}`}>
        <span className={`shrink-0 font-mono text-[12px] leading-6 ${index === active ? '' : 'text-muted'}`}>{clock(Math.floor(cue.start_sec))}</span>
        <span className="min-w-0 break-words text-sm leading-6">{texts?.[index] ?? cue.text}</span>
      </li>)}
    </ol>
    {(onTranslate || onShare || onRender) && <div className="mt-auto space-y-3 px-4 pb-4 pt-3 hairline-top">
      {onTranslate && <div>
        <label htmlFor={`${id}-language`} className={`${label} flex items-center gap-1.5`}><Translate aria-hidden="true" size={18} />Caption language</label>
        <select id={`${id}-language`} value={language} disabled={translation === 'translating'}
          onChange={event => void chooseLanguage(event.target.value as CaptionLanguage | '')} className={`${field} mt-1.5 block w-full disabled:opacity-50`}>
          <option value="">Original</option>
          {CAPTION_LANGUAGES.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
        </select>
        <p aria-live="polite" className={`text-[13px] ${translation === 'failed' ? 'mt-1 text-grease' : translation === 'translating' ? 'mt-1 text-muted' : ''}`}>
          {translation === 'translating' ? 'Translating…' : translation === 'failed' ? 'Could not translate the captions. Try again.' : ''}
        </p>
      </div>}
      {(onShare || onRender) && <div>
        <div className="flex flex-wrap gap-2">
          {onRender && <button type="button" onClick={onRender} className={button('primary', 'md')}><FilmStrip aria-hidden="true" size={18} />Render as MP4 from your own copy</button>}
          {onShare && <button type="button" onClick={() => void copyShareLink()} className={button('secondary', 'md')}><LinkSimple aria-hidden="true" size={18} />Copy share link</button>}
        </div>
        {onShare && <p aria-live="polite" className={`text-[13px] ${shared === 'failed' ? 'mt-1.5 text-grease' : shared === 'copied' ? 'mt-1.5 font-medium text-go' : ''}`}>
          {shared === 'copied' ? 'Link copied' : shared === 'failed' ? 'Could not make a share link. Try again.' : ''}
        </p>}
        {manualLink && <div className="mt-2">
          <label htmlFor={`${id}-link`} className={`${label} block`}>Copy this link</label>
          <input id={`${id}-link`} readOnly value={manualLink} onFocus={event => event.currentTarget.select()} className={`${field} mt-1.5 block w-full font-mono text-[13px]`} />
        </div>}
      </div>}
    </div>}
  </article>;
}
