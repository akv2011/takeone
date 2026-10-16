import { BrandKitPanel, type BrandSelection } from "../components/BrandKitPanel";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GuestNotice, SignedIn, SignedOut, SignInChoices, useAuth } from "../lib/auth";
import { useAction, useConvexAuth, useMutation, useQuery, usePaginatedQuery } from "convex/react";
import { Clapperboard, Scissors, SlidersHorizontal } from "lucide-react";
import TakeOneLogo from "../components/TakeOneLogo";
import TelegramConnect from "../components/TelegramConnect";
import { useVideoUrl } from "../lib/useVideoUrl";
import { VideoUpload } from "../components/VideoUpload";
import { api } from "../lib/convexApi";
import { AssemblyStarter } from "../components/AssemblyStarter";
import { Tooltip } from "../components/Tooltip";
import TakeOneUserButton from "../components/account/TakeOneUserButton";
import { normalizeAccountPreferences, type AccountPreferencesValue } from "../lib/accountPreferences";
import { useProductCapabilities } from "../hooks/useProductCapabilities";
import { button, field, label, panel } from "../lib/ui";
import { CAPTION_LANGUAGES } from "../../convex/captions";

const MODES = [
  { id: "edit", label: "Edit upload", shortLabel: "Edit", help: "Upload footage, then describe the trim, speed, framing or caption changes.", placeholder: "What should change in your video?" },
  { id: "generate", label: "Generate", shortLabel: "Create", help: "Turn an idea into a narrated video with matching footage.", placeholder: "Describe the video you want to create…" },
  { id: "clip", label: "Clip", shortLabel: "YouTube", help: "Paste a YouTube link and optionally include the moment you want.", placeholder: "Paste a YouTube link or describe the moment to clip…" },
] as const;
const STATUS: Record<string, string> = { queued: "Queued", dispatched: "Starting", processing: "Rendering", failed: "Failed", cancelled: "Cancelled" };
const ASPECTS = [{ id: "9:16", label: "9:16" }, { id: "1:1", label: "1:1" }, { id: "16:9", label: "16:9" }] as const;

function YouTubeIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="M22 12s0-3.4-.4-5a2.5 2.5 0 0 0-1.8-1.8C18.2 4.8 12 4.8 12 4.8s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7C2 8.6 2 12 2 12s0 3.4.4 5a2.5 2.5 0 0 0 1.8 1.8c1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-5 .4-5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="m10 15.2 5-3.2-5-3.2v6.4Z" fill="currentColor" />
  </svg>;
}

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <SignedOut><SignInGate /></SignedOut>
      <SignedIn><DashboardInner /></SignedIn>
    </div>
  );
}

function SignInGate() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Link to="/" className="mb-8 flex items-center gap-2">
        <TakeOneLogo className="h-10 w-10 text-ink" />
        <span className="font-display text-2xl font-bold">TakeOne</span>
      </Link>
      <h1 className="font-display text-4xl font-extrabold md:text-5xl">Sign in to start creating</h1>
      <p className="mt-3 max-w-sm font-sans text-sm text-muted">
        Use your Google account or a guest session to get five free videos.
      </p>
      <SignInChoices className="mt-7" />
    </div>
  );
}

type Me = { credits: number; creditAdjustment?: number; freeRemaining: number; freeLimit: number; founding: boolean; canGenerate: boolean; preferences?: Partial<AccountPreferencesValue> } | null | undefined;
type Job = { _id: string; mode: string; prompt: string; status: string; resultUrl?: string | null; hasOutput: boolean; hasCover?: boolean };

function DashboardInner() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { user } = useAuth();
  const me = useQuery(api.users.currentUser, isAuthenticated ? {} : "skip") as Me;
  const ensureUser = useMutation(api.users.ensureUser);
  const [uploadId, setUploadId] = useState<string>();
  const requestUploadEdit = useMutation(api.uploads.requestEdit);
  const requestGeneration = useMutation(api.generate.requestGeneration);
  const history = usePaginatedQuery(api.generate.listJobs, isAuthenticated && user?.id ? { accountKey: user.id } : "skip", { initialNumItems: 20 });
  const jobs = !isAuthenticated || history.status === "LoadingFirstPage" ? undefined : history.results as Job[];

  const [accountError, setAccountError] = useState(false);
  const [preparingAccount, setPreparingAccount] = useState(false);
  const capabilities = useProductCapabilities();
  const [generationKind, setGenerationKind] = useState('stock');
  const [brandKit, setBrandKit] = useState<BrandSelection>();
  const [captionStyle, setCaptionStyle] = useState('auto');
  const [mode, setMode] = useState<string>("generate");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const selectedBrandKit = generationKind === 'ai' && mode === 'generate' ? undefined : brandKit;
  const selectedCaptionStyle = (mode === 'generate' && generationKind === 'ai') || captionStyle === 'auto' ? undefined : captionStyle;
  const [captionLanguage, setCaptionLanguage] = useState('');
  const selectedCaptionLanguage = (mode === 'generate' && generationKind === 'ai') || !captionLanguage ? undefined : captionLanguage;
  const [editChoice, setEditChoice] = useState<'describe' | 'moment'>('describe');
  const pickMoment = mode === 'edit' && editChoice === 'moment';
  const [aspect, setAspect] = useState<string>("9:16");
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmedOwnership, setConfirmedOwnership] = useState(false);
  const pending = useRef<{ payload: string; requestId: string } | null>(null);
  const initializedForUser = useRef<string | undefined>(undefined);
  const [submittedJob, setSubmittedJob] = useState<{ id: string; openWhenDone: boolean }>();
  const preferences = normalizeAccountPreferences(me?.preferences);

  const initializeAccount = useCallback(async () => {
    if (!user?.id || !isAuthenticated) return;
    setPreparingAccount(true); setAccountError(false);
    try { await ensureUser({ email: user.email, name: user.name }); }
    catch { setAccountError(true); }
    finally { setPreparingAccount(false); }
  }, [ensureUser, isAuthenticated, user?.id, user?.email, user?.name]);
  useEffect(() => { void initializeAccount(); }, [initializeAccount]);
  useEffect(() => { setBrandKit(undefined); }, [user?.id]);
  useEffect(() => {
    if (!user?.id) {
      initializedForUser.current = undefined;
      return;
    }
    if (!me || initializedForUser.current === user.id) return;
    const defaults = normalizeAccountPreferences(me.preferences);
    setMode(defaults.defaultMode);
    setAspect(defaults.defaultAspect);
    setCaptionStyle(defaults.defaultCaptionStyle);
    setConfirmedOwnership(false);
    setUploadId(undefined);
    initializedForUser.current = user.id;
  }, [me, user?.id]);
  useEffect(() => {
    if (!submittedJob?.openWhenDone || !jobs) return;
    const job = jobs.find((item) => item._id === submittedJob.id);
    if (job?.status === 'done' && (job.hasOutput || job.resultUrl)) {
      const id = submittedJob.id;
      setSubmittedJob(undefined);
      navigate(`/studio/${id}`);
    } else if (job && ['failed', 'cancelled'].includes(job.status)) {
      setSubmittedJob(undefined);
    }
  }, [jobs, navigate, submittedJob]);
  const chooseMode = (next: string) => {
    setMode(next); setConfirmedOwnership(false); setStatus('');
    if (next !== 'edit') { setUploadId(undefined); setEditChoice('describe'); }
  };

  const generate = async () => {
    if (busy) return;
    if (!me) { setStatus("Your account is still being set up. Wait a moment, or retry setup if it fails."); return; }
    if (mode === "edit" && !uploadId) { setStatus("Upload a video first."); return; }
    if ((mode === "clip" || mode === "edit") && !confirmedOwnership) { setStatus("Confirm that you have permission to use this video."); return; }
    if (!pickMoment && !prompt.trim()) { setStatus("Type a prompt to start."); return; }
    setBusy(true); setStatus("");
    const payload = JSON.stringify({ brandKit: selectedBrandKit, captionStyle: selectedCaptionStyle, captionLanguage: selectedCaptionLanguage, mode, pickMoment, generationKind, aspect, prompt: prompt.trim(), confirmedOwnership, uploadId });
    if (pending.current?.payload !== payload) pending.current = { payload, requestId: crypto.randomUUID() };
    try {
      const r = (await (mode === "edit" ? requestUploadEdit({ brandKit: selectedBrandKit, captionStyle: selectedCaptionStyle, captionLanguage: selectedCaptionLanguage, uploadId, aspect, ...(pickMoment ? { mode: 'clip' } : { instruction: prompt.trim() }), confirmedOwnership, requestId: pending.current.requestId }) : requestGeneration({ brandKit: selectedBrandKit, captionStyle: selectedCaptionStyle, captionLanguage: selectedCaptionLanguage, mode, generationKind: mode === "generate" ? generationKind : undefined, aspect, prompt: prompt.trim(), confirmedOwnership, requestId: pending.current.requestId }))) as { billing: string; jobId?: string };
      if (r.jobId) setSubmittedJob({ id: r.jobId, openWhenDone: preferences.openFinishedInStudio });
      setStatus(r.billing === "free" ? "Queued. One free video reserved. It'll appear below shortly." : "Queued. One credit reserved. It'll appear below shortly.");
      setPrompt("");
      pending.current = null;
    } catch (e: any) {
      if (e?.data?.code === "NO_CREDITS") setStatus("out-of-credits");
      else if (e?.data?.code === "RENDER_UNAVAILABLE") setStatus(e.data.message);
      else if (e?.data?.code === "FREE_DAILY_CAP") setStatus("Today's free renders are used up. Try again tomorrow.");
      else setStatus("Could not queue the video. Check your prompt and try again; at most three videos can wait per account.");
    } finally { setBusy(false); }
  };

  const free = me?.freeRemaining ?? 0;
  const credits = me?.credits ?? 0;
  const activeMode = MODES.find((m) => m.id === mode)!;
  const actionLabel = mode === 'clip' || pickMoment ? 'Create clip' : mode === 'edit' ? 'Edit video' : 'Create video';
  const activeCapability = mode === 'edit' ? capabilities?.rendering : mode === 'clip' ? capabilities?.youtubeClips : generationKind === 'ai' ? capabilities?.aiVideo : capabilities?.stockVideo;

  return (
    <>
      {/* App bar */}
      <header className="sticky top-0 z-20 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link to="/" className="flex items-center gap-2">
            <TakeOneLogo className="h-8 w-8 text-ink" />
            <span className="font-display text-xl font-bold">TakeOne</span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-4">
            {me?.founding && (
              <span className="hidden rounded-md border border-cueInk/30 bg-cue/20 px-2.5 py-1 text-xs font-semibold text-cueInk sm:inline">
                Founding creator
              </span>
            )}
            <span className="rounded-md border border-line bg-paper px-2.5 py-1 text-sm font-semibold">
              {!me ? "Loading allowance…" : free > 0 ? `${free} free left` : `${credits} credits`}
            </span>
            <Link to="/pricing" className="hidden text-sm font-semibold underline-offset-4 hover:underline sm:inline">Buy credits</Link>
            <TakeOneUserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
        {/* Composer */}
        <div className="mx-auto max-w-3xl">
          {!!me?.creditAdjustment && <p role="status" className={`${panel} mb-4 p-4 text-sm`}>A refund removed credits that had already been used. Your next purchased credits will first cover this {me.creditAdjustment}-credit adjustment. Your purchase history shows the refund.</p>}
          <GuestNotice className="mb-4" />
          {!authLoading && !isAuthenticated && <p role="alert" className="mb-4 rounded-[10px] border border-warn/40 bg-surface p-4 text-sm">Your sign-in did not reach the video service. Reload the page to try again.</p>}
          {accountError && <div role="alert" className="mb-4 rounded-[10px] border border-warn/40 bg-surface p-4 text-sm">
            We could not finish setting up your account. Your allowance has not been charged.
            <button disabled={preparingAccount} onClick={() => void initializeAccount()} className="ml-2 font-semibold underline">Retry account setup</button>
          </div>}
          {!me && !accountError && (authLoading || isAuthenticated) && <p role="status" className="mb-4 text-sm text-muted">Preparing your account and video allowance…</p>}
          <h1 className="font-display text-4xl font-extrabold sm:text-5xl">Create a video</h1>
          <div className="mt-5 rounded-[10px] border border-line bg-surface focus-within:border-ink focus-within:ring-1 focus-within:ring-ink">
            <div role="group" className="flex items-center gap-1 border-b border-line px-3 py-2.5" aria-label="Choose a video task">
              {MODES.map((m) => {
                const Icon = m.id === 'generate' ? Clapperboard : m.id === 'edit' ? Scissors : YouTubeIcon;
                return <Tooltip key={m.id} label={m.help} side="bottom">
                  <button aria-label={m.label} aria-pressed={mode === m.id} onClick={() => chooseMode(m.id)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${mode === m.id ? "bg-cue text-ink" : "text-muted hover:bg-paper hover:text-ink"}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {m.shortLabel}
                  </button>
                </Tooltip>;
              })}
            </div>
            <textarea
              value={prompt}
              maxLength={4000}
              aria-label="Video prompt"
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void generate(); } }}
              rows={4}
              disabled={pickMoment}
              placeholder={pickMoment ? "Gemini watches your upload and picks the best 15 to 30 seconds." : activeMode.placeholder}
              className="w-full resize-none bg-transparent px-5 pt-5 pb-3 text-base leading-relaxed outline-none placeholder:text-muted disabled:cursor-not-allowed"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-3">
              <Tooltip label="Choose format, captions, video source and brand kit">
                <button type="button" aria-expanded={settingsOpen} aria-controls="creation-settings" onClick={() => setSettingsOpen(open => !open)}
                  className={`inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors ${settingsOpen ? 'bg-ink text-surface' : 'bg-paper text-ink hover:bg-line'}`}>
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Settings
                </button>
              </Tooltip>
              <div className="flex items-center gap-2">
                <button aria-label={actionLabel} onClick={generate} disabled={busy || !me || capabilities === undefined || !activeCapability?.available}
                  className={`${button("primary")} h-10 min-w-32`}>
                  {busy ? (
                    <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
                  ) : actionLabel}
                </button>
              </div>
            </div>
          </div>
          {mode === "edit" && <VideoUpload onReady={setUploadId} />}
          {mode === "edit" && <fieldset className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <legend className="sr-only">How to edit the upload</legend>
            <label className="flex items-center gap-2"><input type="radio" name="edit-choice" className="size-4 accent-ink" checked={editChoice === 'describe'} onChange={() => setEditChoice('describe')} />Describe the edit</label>
            <label className="flex items-center gap-2"><input type="radio" name="edit-choice" className="size-4 accent-ink" checked={editChoice === 'moment'} onChange={() => setEditChoice('moment')} />Let Gemini pick the best moment</label>
          </fieldset>}
          {(mode === "clip" || mode === "edit") && <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-ink" checked={confirmedOwnership} onChange={e => setConfirmedOwnership(e.target.checked)} />I own or have permission to use this video.</label>}
          {settingsOpen && <section id="creation-settings" aria-label="Video settings" className={`${panel} mt-3 p-4`}>
            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset><legend className={`mb-2 ${label}`}>Format</legend><div className="flex w-fit items-center gap-1 rounded-md border border-line bg-paper p-1">{ASPECTS.map((a) => (
                <button type="button" key={a.id} aria-pressed={aspect === a.id} onClick={() => setAspect(a.id)} disabled={mode === 'generate' && generationKind === 'ai' && a.id === '1:1'}
                  className={`rounded-[4px] px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${aspect === a.id ? "bg-cue text-ink" : "text-muted hover:text-ink"}`}>{a.label}</button>
              ))}</div></fieldset>
              {mode === 'generate' && <label className={label}>Video source
                <select aria-label="Video type" value={generationKind} onChange={e => { setGenerationKind(e.target.value); if (e.target.value === 'ai' && aspect === '1:1') setAspect('9:16'); }} className={`${field} mt-2 block w-full`}>
                  <option value="stock" disabled={!capabilities?.stockVideo.available}>Narration + stock footage{!capabilities?.stockVideo.available ? ' · unavailable' : ''}</option>
                  <option value="ai" disabled={!capabilities?.aiVideo.available}>AI video{!capabilities?.aiVideo.available ? ' · unavailable' : ''}</option>
                </select>
              </label>}
              {!(mode === 'generate' && generationKind === 'ai') && !brandKit && <label className={label}>Captions
                <select aria-label="Caption style" value={captionStyle} onChange={e => setCaptionStyle(e.target.value)} className={`${field} mt-2 block w-full`}>
                  <option value="auto">Automatic</option><option value="clean">Clean</option><option value="meme">Bold pop</option><option value="karaoke">Pop-in</option><option value="none">None</option>
                </select>
              </label>}
              {!(mode === 'generate' && generationKind === 'ai') && <label className={label}>Language
                <select aria-label="Caption language" value={captionLanguage} onChange={e => setCaptionLanguage(e.target.value)} className={`${field} mt-2 block w-full`}>
                  <option value="">Same as the video</option>
                  {CAPTION_LANGUAGES.map(language => <option key={language.code} value={language.code}>{language.label}</option>)}
                </select>
              </label>}
            </div>
            {!(mode === 'generate' && generationKind === 'ai') && <BrandKitPanel compact key={user?.id} accountKey={user?.id ?? ''} value={brandKit} onChange={setBrandKit} disabled={busy} />}
          </section>}
          <div className="mt-3 flex flex-wrap items-start gap-2">
            {user?.id && capabilities?.rendering.available && <AssemblyStarter compact key={user.id} accountKey={user.id} />}
            {capabilities?.telegram.available && <TelegramConnect compact />}
          </div>
          <div className="mt-2 flex min-h-5 items-center px-1 text-sm text-muted">
            {status !== "out-of-credits" && (status ? <p>{status}</p> : activeCapability && !activeCapability.available ? <p>{activeCapability.reason}</p> : (
              <div className="flex items-center gap-1.5">
                <span>{free > 0 ? "Uses 1 free video" : "Uses 1 credit"}</span>
                {preferences.showShortcutHints && <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1" aria-label="Command plus Enter">
                    <kbd aria-hidden="true" className="inline-flex size-5 items-center justify-center rounded border border-line bg-surface text-xs leading-none">⌘</kbd>
                    <span aria-hidden="true">+</span>
                    <kbd aria-hidden="true" className="inline-flex size-5 items-center justify-center rounded border border-line bg-surface text-xs leading-none">↵</kbd>
                  </span>
                  <span>to run</span>
                </>}
              </div>
            ))}
          </div>
          {status === "out-of-credits" && (
            <div className={`${panel} mt-3 flex items-center justify-between gap-3 px-4 py-3`}>
              <p className="text-sm">You're out of credits. Buy a pack to keep creating.</p>
              <Link to="/pricing" className={button("primary", "sm")}>Get credits</Link>
            </div>
          )}
        </div>

        {/* Gallery */}
        <div className="mt-14">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">Your videos</h2>
            {jobs && jobs.length > 0 && <span className="text-sm text-muted">{jobs.length} shown</span>}
          </div>

          {jobs === undefined ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-[9/16] rounded-xl bg-line motion-safe:animate-pulse" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No videos yet. Write a prompt above and your finished videos appear here.</p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {jobs.map((j) => <ReelTile key={j._id} job={j} />)}
            </div>
          )}
          {history.status === 'CanLoadMore' && <button type="button" onClick={() => history.loadMore(20)} className={`${button("secondary", "sm")} mt-5`}>Load older videos</button>}
          {history.status === 'LoadingMore' && <p role="status" className="mt-5 text-sm text-muted">Loading older videos…</p>}

        </div>
      </main>
    </>
  );
}

export function ReelTile({ job }: { job: Job }) {
  const cancel = useMutation(api.generate.cancelJob);
  const [cancelError, setCancelError] = useState("");
  const done = job.status === "done" && !!(job.hasOutput || job.resultUrl);
  const { url } = useVideoUrl(done ? job._id : undefined, job.hasOutput, job.resultUrl);
  const cover = useCoverUrl(done && job.hasCover ? job._id : undefined);
  const failed = job.status === "failed" || job.status === "cancelled";
  const frame = "group relative block aspect-[9/16] overflow-hidden rounded-xl border border-line";
  const caption = (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-ink/85 p-2.5">
      <div className="text-xs font-semibold text-cue">{MODES.find((m) => m.id === job.mode)?.label ?? job.mode}</div>
      <div className="mt-0.5 line-clamp-2 text-xs text-surface">{job.prompt}</div>
    </div>
  );
  if (done) return (
    <Link to={`/studio/${job._id}`} aria-label={`Open in Studio: ${job.prompt}`} className={`${frame} bg-ink`}>
      <video
        src={url}
        poster={cover}
        muted loop playsInline preload="metadata"
        onMouseEnter={(e) => { void e.currentTarget.play().catch(() => {}); }}
        onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
        className="h-full w-full object-cover"
      />
      {caption}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink/30 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        <span className="rounded-md bg-cue px-3 py-1.5 text-xs font-bold text-ink">Open in Studio</span>
      </div>
    </Link>
  );
  return (
    <div className={`${frame} bg-paper`}>
      <div className="flex h-full w-full items-center justify-center">
        {failed
          ? <span className="text-sm font-semibold text-warn">{STATUS[job.status]}</span>
          : <span className="flex flex-col items-center gap-2 text-muted"><span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-muted/30 border-t-muted" /><span className="text-sm font-semibold">{STATUS[job.status] ?? "Finishing"}</span></span>}
      </div>
      {['queued', 'dispatched'].includes(job.status) && <button type="button" className={`${button("secondary", "sm")} absolute left-2 top-2`} onClick={() => { void cancel({ jobId: job._id }).catch(() => setCancelError('This video already started rendering, so it cannot be cancelled.')); }}>Cancel</button>}
      {cancelError && <p role="status" className="absolute inset-x-2 top-12 rounded-md border border-warn/40 bg-surface p-2 text-xs">{cancelError}</p>}
      {caption}
    </div>
  );
}

// The poster loads once, so a one-time signed URL is enough; the tile signs again when it remounts.
function useCoverUrl(jobId?: string) {
  const sign = useAction(api.generate.getCover);
  const [cover, setCover] = useState<{ jobId: string; url: string }>();
  useEffect(() => {
    if (!jobId) return;
    let current = true;
    sign({ jobId }).then((result: { url?: unknown }) => {
      if (current && typeof result?.url === "string" && result.url.startsWith("https://")) setCover({ jobId, url: result.url });
    }, () => {});
    return () => { current = false; };
  }, [jobId, sign]);
  return cover && cover.jobId === jobId ? cover.url : undefined;
}
