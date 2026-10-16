import { useAction, useQuery } from 'convex/react';
import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import { CAPTION_LANGUAGES } from '../../convex/captions';
import { parseYouTubeLink, watchUrl, type Moment, type MomentAnalysis, type MomentTranslation } from '../../convex/youtubeValues';
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
  return <form noValidate onSubmit={submit}>
    <label htmlFor={`${id}-url`} className={`${label} block px-5 pt-4`}>YouTube link</label>
    <input id={`${id}-url`} name="youtube-link" type="url" inputMode="url" autoComplete="off" spellCheck={false}
      value={url} onChange={event => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=…"
      aria-invalid={error ? true : undefined} aria-describedby={`${id}-help ${id}-error`}
      className="w-full bg-transparent px-5 pb-4 pt-1 text-base outline-none placeholder:text-muted" />
    <p id={`${id}-error`} role="alert" className={`px-5 text-sm font-semibold text-warn ${error ? 'pb-3' : ''}`}>{error}</p>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-3">
      <p id={`${id}-help`} className="min-w-0 flex-1 basis-56 px-2 text-sm text-muted">Gemini reads public videos up to 45 minutes long on YouTube. Nothing is downloaded. 3 searches an hour.</p>
      <button type="submit" disabled={busy} className={`${button('primary')} h-10 min-w-32`}>
        {busy && <span aria-hidden="true" className="h-4 w-4 rounded-full border-2 border-ink/30 border-t-ink motion-safe:animate-spin" />}
        Find moments
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
    <p role="status" className="text-sm font-semibold">Gemini is watching the video. This usually takes under a minute.</p>
    <div aria-hidden="true" className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map(slot => <div key={slot} className="aspect-[9/16] rounded-xl bg-line motion-safe:animate-pulse" />)}
    </div>
  </div>;
  if (latest.status !== 'done' || !latest.moments.length) return <p role="status" className="text-sm">Gemini could not find moments in this video. Check that it is public, then try another link.</p>;
  return <section aria-labelledby={heading}>
    <h2 id={heading} className="text-lg font-semibold">Moments from this video</h2>
    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
  // Without overflow-hidden the card keeps 9:16 when its content fits and grows on narrow phones instead of clipping.
  return <article aria-labelledby={`${id}-hook`} className="flex aspect-[9/16] min-w-0 flex-col rounded-xl border border-line bg-surface">
    <div className="px-4 pb-3 pt-4">
      <h3 id={`${id}-hook`} className="break-words font-display text-2xl font-bold leading-tight text-balance">{moment.hook}</h3>
      <p className="mt-1 font-mono text-xs text-muted">{clock(start)} to {clock(end)} · {end - start}&nbsp;s</p>
    </div>
    <div className="aspect-video min-h-[200px] w-full shrink-0 bg-ink">
      <iframe ref={iframe} title={`YouTube video player: ${moment.hook}`} className="h-full w-full"
        src={`https://www.youtube-nocookie.com/embed/${videoId}?start=${start}&end=${end}&rel=0&enablejsapi=1&playsinline=1&origin=${encodeURIComponent(window.location.origin)}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
    </div>
    {playerError && <p role="status" className="px-4 pt-3 text-sm">
      {playerError}
      {player.error !== 100 && <> <a href={`${watchUrl(videoId)}&t=${start}s`} target="_blank" rel="noopener" className="font-semibold underline underline-offset-4">Watch it on YouTube</a></>}
    </p>}
    <div className="relative min-h-32 flex-1">
      <ol ref={list} aria-label="Captions" lang={texts ? language : undefined} className="absolute inset-0 overflow-y-auto p-2">
        {moment.cues.map((cue, index) => <li key={index} aria-current={index === active ? 'true' : undefined}
          className={`flex gap-3 rounded-md px-2 py-1 ${index === active ? 'bg-cue text-ink' : 'text-muted'}`}>
          <span className="shrink-0 font-mono text-xs leading-6">{clock(Math.floor(cue.start_sec))}</span>
          <span className="min-w-0 break-words text-sm leading-6">{texts?.[index] ?? cue.text}</span>
        </li>)}
      </ol>
    </div>
    <div className="border-t border-line px-4 py-3">
      <h4 className="text-xs font-semibold text-muted">Why it works</h4>
      <p className="mt-1 break-words text-sm">{moment.why}</p>
    </div>
    {(onTranslate || onShare || onRender) && <div className="space-y-3 border-t border-line px-4 py-3">
      {onTranslate && <div>
        <label htmlFor={`${id}-language`} className="block text-xs font-semibold text-muted">Caption language</label>
        <select id={`${id}-language`} value={language} disabled={translation === 'translating'}
          onChange={event => void chooseLanguage(event.target.value as CaptionLanguage | '')} className={`${field} mt-1 block w-full`}>
          <option value="">Original</option>
          {CAPTION_LANGUAGES.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
        </select>
        <p aria-live="polite" className={`mt-1 text-xs ${translation === 'failed' ? 'font-semibold text-warn' : 'text-muted'}`}>
          {translation === 'translating' ? 'Translating…' : translation === 'failed' ? 'Could not translate the captions. Try again.' : ''}
        </p>
      </div>}
      {(onShare || onRender) && <div>
        <div className="flex flex-wrap gap-2">
          {onShare && <button type="button" onClick={() => void copyShareLink()} className={button('secondary', 'sm')}>Copy share link</button>}
          {onRender && <button type="button" onClick={onRender} className={button('primary', 'sm')}>Render as MP4 from your own copy</button>}
        </div>
        {onShare && <p aria-live="polite" className={`mt-1 text-xs font-semibold ${shared === 'failed' ? 'text-warn' : 'text-ink'}`}>
          {shared === 'copied' ? 'Link copied' : shared === 'failed' ? 'Could not make a share link. Try again.' : ''}
        </p>}
        {manualLink && <div className="mt-2">
          <label htmlFor={`${id}-link`} className="block text-xs font-semibold text-muted">Copy this link</label>
          <input id={`${id}-link`} readOnly value={manualLink} onFocus={event => event.currentTarget.select()} className={`${field} mt-1 block w-full font-mono`} />
        </div>}
      </div>}
    </div>}
  </article>;
}
