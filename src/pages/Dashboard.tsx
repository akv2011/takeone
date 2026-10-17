import { BrandKitPanel, type BrandSelection } from "../components/BrandKitPanel";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GuestNotice, SignedIn, SignedOut, SignInChoices, useAuth } from "../lib/auth";
import { useAction, useConvexAuth, useMutation, useQuery, usePaginatedQuery } from "convex/react";
import { ArrowClockwise, ArrowRight, FilmSlate, Play, Scissors, SlidersHorizontal, WarningCircle, YoutubeLogo } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import TakeOneLogo, { TakeOneWordmark } from "../components/TakeOneLogo";
import { RenderStrip, type RenderAttempt } from "../components/RenderProgress";
import TelegramConnect from "../components/TelegramConnect";
import { useVideoUrl } from "../lib/useVideoUrl";
import { VideoUpload } from "../components/VideoUpload";
import { api } from "../lib/convexApi";
import { AssemblyStarter } from "../components/AssemblyStarter";
import { Tooltip } from "../components/Tooltip";
import TakeOneUserButton from "../components/account/TakeOneUserButton";
import { normalizeAccountPreferences, type AccountPreferencesValue } from "../lib/accountPreferences";
import { useProductCapabilities } from "../hooks/useProductCapabilities";
import { button, field, label } from "../lib/ui";
import { ease } from "../lib/motion";
import { CAPTION_LANGUAGES } from "../../convex/captions";
import type { Moment } from "../../convex/youtubeValues";
import { YouTubeLinkForm, YouTubeMomentResults } from "../components/YouTubeMoments";
import { momentHandOff } from "../lib/momentHandOff";

const MODES = [
  { id: "edit", label: "Edit upload", title: "Edit your video", shortLabel: "Edit", Icon: Scissors, help: "Upload footage, then describe the trim, speed, framing or caption changes.", placeholder: "What should change in your video?" },
  { id: "generate", label: "Generate", title: "Create from a prompt", shortLabel: "Create", Icon: FilmSlate, help: "Turn an idea into a narrated video with matching footage.", placeholder: "Describe the video you want to create…" },
  { id: "clip", label: "Clip", title: "YouTube moments", shortLabel: "YouTube", Icon: YoutubeLogo, help: "Paste a YouTube link. Gemini finds up to 3 moments worth sharing.", placeholder: "Paste a YouTube link or describe the moment to clip…" },
] as const;
const STATUS: Record<string, string> = { queued: "Queued", dispatched: "Starting", processing: "Rendering", failed: "Failed", cancelled: "Cancelled", done: "Ready" };
const ASPECTS = [{ id: "9:16", label: "9:16" }, { id: "1:1", label: "1:1" }, { id: "16:9", label: "16:9" }] as const;

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <SignedOut><SignInGate /></SignedOut>
      <SignedIn><DashboardInner /></SignedIn>
    </div>
  );
}

function SignInGate() {
  const reduced = useReducedMotion();
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-16">
      <div aria-hidden="true" className="halftone pointer-events-none absolute left-1/2 top-1/2 size-[min(130vw,880px)] -translate-x-1/2 -translate-y-1/2 opacity-60" />
      <motion.div
        initial={reduced ? false : { opacity: 0, scale: 0.94, rotate: -1.5 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: 0.5, ease }}
        className="sheet relative w-full max-w-md px-6 py-10 text-center shadow-hard sm:px-10 sm:py-12 sm:shadow-hard-lg"
      >
        <Link to="/" aria-label="TakeOne home" className="mx-auto inline-flex"><TakeOneLogo className="h-12 w-12 text-ink" /></Link>
        <p className="eyebrow mt-6">Take 01 · Sign in</p>
        <h1 className="display mt-3 text-5xl sm:text-6xl">Sign in to start creating</h1>
        <SignInChoices className="mt-8" />
        <motion.p
          initial={reduced ? false : { opacity: 0, scale: 1.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35, duration: 0.3, ease }}
          className="absolute -top-6 right-2 rotate-6 font-hand text-[26px] leading-none text-signal sm:-right-10"
        >5 free videos, no card</motion.p>
      </motion.div>
    </div>
  );
}

type Me = { credits: number; creditAdjustment?: number; freeRemaining: number; freeLimit: number; founding: boolean; canGenerate: boolean; preferences?: Partial<AccountPreferencesValue> } | null | undefined;
type Job = { _id: string; mode: string; prompt: string; status: string; resultUrl?: string | null; hasOutput: boolean; hasCover?: boolean; createdAt?: number; renderProgress?: RenderAttempt | null };

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
  // Stock footage needs a provider key. When only AI video can run, start there instead of on a disabled button.
  useEffect(() => {
    if (!capabilities || capabilities.stockVideo.available || !capabilities.aiVideo.available) return;
    setGenerationKind(kind => kind === 'stock' ? 'ai' : kind);
    setAspect(current => current === '1:1' ? '9:16' : current);
  }, [capabilities]);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"note" | "error" | "retry">("note");
  const note = (text: string) => { setStatus(text); setStatusTone("note"); };
  const fail = (text: string, tone: "error" | "retry" = "error") => { setStatus(text); setStatusTone(tone); };
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
    setMode(next); setConfirmedOwnership(false); note('');
    if (next !== 'edit') { setUploadId(undefined); setEditChoice('describe'); }
  };
  const renderMoment = (moment: Moment) => {
    const handOff = momentHandOff(moment);
    chooseMode('edit'); setPrompt(handOff.prompt); note(handOff.note);
    window.scrollTo({ top: 0, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  const generate = async () => {
    if (busy) return;
    if (!me) { fail("Your account is still being set up. Wait a moment, or retry setup if it fails."); return; }
    if (mode === "edit" && !uploadId) { fail("Upload a video first."); return; }
    if ((mode === "clip" || mode === "edit") && !confirmedOwnership) { fail("Confirm that you have permission to use this video."); return; }
    if (!pickMoment && !prompt.trim()) { fail("Type a prompt to start."); return; }
    setBusy(true); note("");
    const payload = JSON.stringify({ brandKit: selectedBrandKit, captionStyle: selectedCaptionStyle, captionLanguage: selectedCaptionLanguage, mode, pickMoment, generationKind, aspect, prompt: prompt.trim(), confirmedOwnership, uploadId });
    if (pending.current?.payload !== payload) pending.current = { payload, requestId: crypto.randomUUID() };
    try {
      const r = (await (mode === "edit" ? requestUploadEdit({ brandKit: selectedBrandKit, captionStyle: selectedCaptionStyle, captionLanguage: selectedCaptionLanguage, uploadId, aspect, ...(pickMoment ? { mode: 'clip' } : { instruction: prompt.trim() }), confirmedOwnership, requestId: pending.current.requestId }) : requestGeneration({ brandKit: selectedBrandKit, captionStyle: selectedCaptionStyle, captionLanguage: selectedCaptionLanguage, mode, generationKind: mode === "generate" ? generationKind : undefined, aspect, prompt: prompt.trim(), confirmedOwnership, requestId: pending.current.requestId }))) as { billing: string; jobId?: string };
      if (r.jobId) setSubmittedJob({ id: r.jobId, openWhenDone: preferences.openFinishedInStudio });
      note(r.billing === "free" ? "Queued. One free video reserved. It'll appear below shortly." : "Queued. One credit reserved. It'll appear below shortly.");
      setPrompt("");
      pending.current = null;
    } catch (e: any) {
      if (e?.data?.code === "NO_CREDITS") setStatus("out-of-credits");
      else if (e?.data?.code === "RENDER_UNAVAILABLE") fail(e.data.message);
      else if (e?.data?.code === "FREE_DAILY_CAP") fail("Today's free renders are used up. Try again tomorrow.");
      else if (e?.data?.code === "AI_DAILY_CAP") fail("Today's AI video renders are used up. Try again tomorrow, or make a stock or upload video.");
      else fail("Could not queue the video. Check your prompt and try again; at most three videos can wait per account.", "retry");
    } finally { setBusy(false); }
  };

  const free = me?.freeRemaining ?? 0;
  const activeMode = MODES.find((m) => m.id === mode)!;
  const actionLabel = mode === 'clip' || pickMoment ? 'Create clip' : mode === 'edit' ? 'Edit video' : 'Create video';
  const activeCapability = mode === 'edit' ? capabilities?.rendering : mode === 'clip' ? capabilities?.youtubeClips : generationKind === 'ai' ? capabilities?.aiVideo : capabilities?.stockVideo;
  const reduced = useReducedMotion();
  const promptBox = useRef<HTMLTextAreaElement>(null);
  const startFirstVideo = () => {
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    if (mode === 'clip') chooseMode('generate');
    window.setTimeout(() => promptBox.current?.focus({ preventScroll: true }), 0);
  };
  const segment = (active: boolean) => `relative inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${active ? "bg-cue text-surface" : "text-ink2 hover:bg-paper2"}`;

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-ink bg-paper/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="TakeOne home"><TakeOneWordmark className="text-[26px] text-ink" /></Link>
          <div className="flex items-center gap-3 sm:gap-4">
            {me?.founding && <span className="stamp hidden -rotate-2 px-2! py-0.5! text-[10px]! text-signal md:inline-grid">Founding creator</span>}
            <AllowanceStub me={me} />
            <Link to="/pricing" className="hidden font-mono text-[11px] uppercase tracking-[0.08em] text-ink2 underline-offset-4 hover:text-ink hover:underline sm:inline">Buy credits</Link>
            <TakeOneUserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
        <div className="mx-auto max-w-3xl">
          <div className="space-y-3">
            <GuestNotice />
            {!!me?.creditAdjustment && <p role="status" className="border-y border-ink py-2 text-sm">A refund removed credits that had already been used. Your next purchased credits will first cover this {me.creditAdjustment}-credit adjustment. Your purchase history shows the refund.</p>}
            {!authLoading && !isAuthenticated && <ErrorNote stamp="Offline" action={<button type="button" onClick={() => window.location.reload()} className={button("secondary", "sm")}><ArrowClockwise aria-hidden="true" size={14} />Reload</button>}>Your sign-in did not reach the video service. Reload the page to try again.</ErrorNote>}
            {accountError && <ErrorNote stamp="Not set up" action={<button disabled={preparingAccount} onClick={() => void initializeAccount()} className={button("secondary", "sm")}><ArrowClockwise aria-hidden="true" size={14} />Retry account setup</button>}>
              We could not finish setting up your account. Your allowance has not been charged.
            </ErrorNote>}
            {!me && !accountError && (authLoading || isAuthenticated) && <p role="status" className="eyebrow flex items-center gap-2 text-muted"><span aria-hidden="true" className="pat-dots h-3 w-10 opacity-30 motion-safe:animate-pulse" />Preparing your account and video allowance…</p>}
          </div>

          <motion.div className="mt-6" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
            <p className="eyebrow">New take</p>
            <h1 className="display mt-2 text-5xl sm:text-6xl">Create a video</h1>
          </motion.div>

          <div className="mt-6 border border-ink bg-surface shadow-hard transition-shadow duration-300 ease-paper focus-within:shadow-hard-lg">
            <div role="group" aria-label="Choose a video task" className="grid grid-cols-3 border-b border-ink [&>span]:flex [&>span>button]:flex-1">
              {MODES.map((m) => {
                const active = mode === m.id;
                return <Tooltip key={m.id} label={m.help} side="bottom">
                  <button aria-label={m.label} aria-pressed={active} onClick={() => chooseMode(m.id)}
                    className={`relative inline-flex min-h-12 items-center justify-center gap-2 px-2 py-3 text-sm transition-colors ${active ? "font-medium text-ink" : "text-muted hover:bg-paper2 hover:text-ink"}`}>
                    <m.Icon aria-hidden="true" size={18} weight={active ? "regular" : "light"} />
                    <span className="sm:hidden">{m.shortLabel}</span>
                    <span className="hidden sm:inline">{m.title}</span>
                    {active && <motion.span layoutId="mode-ink" aria-hidden="true" transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }} className="absolute inset-x-3 -bottom-px h-[3px] bg-ink" />}
                  </button>
                </Tooltip>;
              })}
            </div>
            {mode === "clip" ? <YouTubeLinkForm /> : <>
            <div className="relative">
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-9 w-px bg-signal/50 sm:left-11" />
              <textarea
                ref={promptBox}
                value={prompt}
                maxLength={4000}
                aria-label="Video prompt"
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void generate(); } }}
                rows={5}
                disabled={pickMoment}
                placeholder={pickMoment ? "Gemini watches your upload and picks the best 15 to 30 seconds." : activeMode.placeholder}
                className="sheet-ruled block w-full resize-none bg-[repeating-linear-gradient(180deg,transparent_0_22px,rgba(14,14,13,.09)_22px_23px)] bg-[position:0_12px] pb-4 pl-12 pr-4 pt-3 text-[17px] leading-[23px] outline-none [background-attachment:local] placeholder:text-muted disabled:cursor-not-allowed disabled:text-muted sm:pl-15 sm:pr-6"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <Tooltip label="Format, captions, video source and brand kit">
                  <button type="button" aria-label="Settings" aria-expanded={settingsOpen} aria-controls="creation-settings" onClick={() => setSettingsOpen(open => !open)}
                    className={`inline-flex size-10 items-center justify-center border border-ink transition-colors ${settingsOpen ? 'bg-ink text-surface' : 'bg-surface text-ink hover:bg-paper2'}`}>
                    <SlidersHorizontal aria-hidden="true" size={18} weight="regular" />
                  </button>
                </Tooltip>
                <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  {me && <span>{free > 0 ? "Uses 1 free video" : "Uses 1 credit"}</span>}
                  {preferences.showShortcutHints && <span className="hidden items-center gap-1 sm:inline-flex" aria-label="Command plus Enter to run">
                    <span aria-hidden="true">·</span>
                    <kbd aria-hidden="true" className="inline-flex size-5 items-center justify-center border border-ink/30 bg-surface text-xs leading-none">⌘</kbd>
                    <kbd aria-hidden="true" className="inline-flex size-5 items-center justify-center border border-ink/30 bg-surface text-xs leading-none">↵</kbd>
                  </span>}
                </span>
              </div>
              <button aria-label={actionLabel} onClick={generate} disabled={busy || !me || capabilities === undefined || !activeCapability?.available}
                className={`${button("primary")} h-10 min-w-36`}>
                {busy ? "Queuing…" : <>{actionLabel}<ArrowRight aria-hidden="true" size={16} /></>}
              </button>
            </div>
            </>}
          </div>

          {mode === "edit" && <VideoUpload onReady={setUploadId} />}
          {mode === "edit" && <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <fieldset className="flex border border-ink">
              <legend className="sr-only">How to edit the upload</legend>
              <label className={`${segment(editChoice === 'describe')} cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-offset-2`}><input type="radio" name="edit-choice" className="sr-only" checked={editChoice === 'describe'} onChange={() => setEditChoice('describe')} />Describe the edit</label>
              <label className={`${segment(editChoice === 'moment')} cursor-pointer border-l border-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-offset-2`}><input type="radio" name="edit-choice" className="sr-only" checked={editChoice === 'moment'} onChange={() => setEditChoice('moment')} />Let Gemini pick the best moment</label>
            </fieldset>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-ink" checked={confirmedOwnership} onChange={e => setConfirmedOwnership(e.target.checked)} />I own or have permission to use this video.</label>
          </div>}

          <AnimatePresence initial={false}>
            {settingsOpen && mode !== "clip" && <motion.section key="settings" id="creation-settings" aria-label="Video settings"
              initial={reduced ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.2, ease }}
              className="sheet mt-4 p-4 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <fieldset><legend className={`mb-2 ${label}`}>Format</legend><div className="flex w-fit border border-ink">{ASPECTS.map((a, index) => (
                  <button type="button" key={a.id} aria-pressed={aspect === a.id} onClick={() => setAspect(a.id)} disabled={mode === 'generate' && generationKind === 'ai' && a.id === '1:1'}
                    className={`${segment(aspect === a.id)} font-mono ${index ? 'border-l border-ink' : ''}`}>{a.label}</button>
                ))}</div></fieldset>
                {mode === 'generate' && <label className={label}>Video source
                  <select aria-label="Video type" value={generationKind} onChange={e => { setGenerationKind(e.target.value); if (e.target.value === 'ai' && aspect === '1:1') setAspect('9:16'); }} className={`${field} mt-2 block w-full normal-case tracking-normal`}>
                    <option value="stock" disabled={!capabilities?.stockVideo.available}>Narration + stock footage{!capabilities?.stockVideo.available ? ' · unavailable' : ''}</option>
                    <option value="ai" disabled={!capabilities?.aiVideo.available}>AI video{!capabilities?.aiVideo.available ? ' · unavailable' : ''}</option>
                  </select>
                </label>}
                {!(mode === 'generate' && generationKind === 'ai') && !brandKit && <label className={label}>Captions
                  <select aria-label="Caption style" value={captionStyle} onChange={e => setCaptionStyle(e.target.value)} className={`${field} mt-2 block w-full normal-case tracking-normal`}>
                    <option value="auto">Automatic</option><option value="clean">Clean</option><option value="meme">Bold pop</option><option value="karaoke">Pop-in</option><option value="none">None</option>
                  </select>
                </label>}
                {!(mode === 'generate' && generationKind === 'ai') && <label className={label}>Language
                  <select aria-label="Caption language" value={captionLanguage} onChange={e => setCaptionLanguage(e.target.value)} className={`${field} mt-2 block w-full normal-case tracking-normal`}>
                    <option value="">Same as the video</option>
                    {CAPTION_LANGUAGES.map(language => <option key={language.code} value={language.code}>{language.label}</option>)}
                  </select>
                </label>}
              </div>
              {!(mode === 'generate' && generationKind === 'ai') && <BrandKitPanel compact key={user?.id} accountKey={user?.id ?? ''} value={brandKit} onChange={setBrandKit} disabled={busy} />}
            </motion.section>}
          </AnimatePresence>

          <div className="mt-4 flex flex-wrap items-start gap-2">
            {user?.id && capabilities?.rendering.available && <AssemblyStarter compact key={user.id} accountKey={user.id} />}
            {capabilities?.telegram.available && <TelegramConnect compact />}
          </div>
          {mode !== "clip" && status !== "out-of-credits" && (status && statusTone !== "note"
            ? <ErrorNote className="mt-4" stamp={statusTone === "retry" ? "Not queued" : "Check"} action={statusTone === "retry" ? <button type="button" disabled={busy} onClick={() => void generate()} className={button("secondary", "sm")}><ArrowClockwise aria-hidden="true" size={14} />Retry</button> : undefined}>{status}</ErrorNote>
            : (status || (activeCapability && !activeCapability.available)) && <div className="mt-3 border-l-2 border-ink pl-3 text-sm text-ink2">
              {status ? <p>{status}</p> : <p>{activeCapability?.reason}</p>}
            </div>)}
          {status === "out-of-credits" && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y border-ink py-3">
              <span aria-hidden="true" className="stamp -rotate-2 px-2! py-0.5! text-[10px]! text-signal">Out of credits</span>
              <p className="min-w-0 flex-1 text-sm">You're out of credits. Buy a pack to keep creating.</p>
              <Link to="/pricing" className={button("primary", "sm")}>Get credits</Link>
            </div>
          )}
        </div>
        {mode === "clip" && <div className="mt-12"><YouTubeMomentResults onRender={renderMoment} /></div>}

        <section aria-labelledby="your-videos" className="mt-16 border-t border-ink pt-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="your-videos" className="display text-4xl">Your videos</h2>
            {jobs && jobs.length > 0 && <span className="eyebrow text-muted">{jobs.length} shown</span>}
          </div>

          {jobs === undefined ? (
            <div aria-hidden="true" className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 4 }).map((_, i) => <div key={i}>
                <ContactFrame><div className="pat-dots h-full w-full opacity-15 motion-safe:animate-pulse" /></ContactFrame>
                <div className="mt-3 h-3 w-2/3 bg-ink/10" />
              </div>)}
            </div>
          ) : jobs.length === 0 ? (
            <div className="mt-6 flex flex-col items-center gap-6 border border-dashed border-ink/40 px-6 py-10 text-center sm:flex-row sm:text-left">
              <ContactFrame className="w-24 shrink-0"><div className="pat-hatch h-full w-full opacity-15" /></ContactFrame>
              <div>
                <p className="display text-3xl">No takes yet.</p>
                <button type="button" onClick={startFirstVideo} className={`${button("primary", "sm")} mt-4`}>Write your first prompt<ArrowRight aria-hidden="true" size={14} /></button>
              </div>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {jobs.map((j) => <ReelTile key={j._id} job={j} />)}
            </div>
          )}
          {history.status === 'CanLoadMore' && <button type="button" onClick={() => history.loadMore(20)} className={`${button("secondary", "sm")} mt-8`}>Load older videos</button>}
          {history.status === 'LoadingMore' && <p role="status" className="eyebrow mt-8 text-muted">Loading older videos…</p>}
        </section>
      </main>
    </>
  );
}

type Allowance = Pick<NonNullable<Me>, "freeRemaining" | "freeLimit" | "credits"> | null | undefined;

// A ticket stub: one tick per free video, filled while it is still unused.
function AllowanceStub({ me }: { me: Allowance }) {
  const stub = "relative inline-flex h-8 items-center gap-2 border border-ink bg-surface pl-3 pr-3 font-mono text-[11px] uppercase tracking-[0.06em] before:absolute before:-left-[5px] before:top-1/2 before:size-2.5 before:-translate-y-1/2 before:rounded-full before:border before:border-ink before:bg-paper after:absolute after:-right-[5px] after:top-1/2 after:size-2.5 after:-translate-y-1/2 after:rounded-full after:border after:border-ink after:bg-paper";
  if (!me) return <span className={`${stub} text-muted`}><span aria-hidden="true" className="pat-dots h-3 w-8 opacity-25 motion-safe:animate-pulse" /><span className="sr-only">Loading allowance…</span></span>;
  const free = me.freeRemaining;
  return <span className={stub}>
    {free > 0 && <span aria-hidden="true" className="flex items-center gap-[3px] border-r border-dashed border-ink/40 pr-2">
      {Array.from({ length: Math.max(me.freeLimit, free) }, (_, i) => <span key={i} className={`h-3 w-[3px] ${i < free ? 'bg-ink' : 'bg-ink/15'}`} />)}
    </span>}
    <span>{free > 0 ? `${free} free left` : `${me.credits} credits`}</span>
  </span>;
}

function ErrorNote({ stamp, action, className = "", children }: { stamp: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return <div className={`flex flex-wrap items-center gap-3 border border-signal/50 bg-warnBg/60 p-3 ${className}`}>
    <span aria-hidden="true" className="stamp -rotate-2 px-2! py-0.5! text-[10px]! text-signal">{stamp}</span>
    <p role="alert" className="min-w-0 flex-1 basis-56 text-sm text-ink">{children}</p>
    {action}
  </div>;
}

// A single 35mm frame: ink border with sprocket holes down both edges.
function ContactFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  const holes = "pointer-events-none absolute inset-y-1.5 w-[5px] bg-[repeating-linear-gradient(180deg,var(--paper)_0_5px,transparent_5px_11px)]";
  return <div className={`relative bg-ink px-[13px] py-[4px] ${className}`}>
    <span aria-hidden="true" className={`${holes} left-[4px]`} />
    <span aria-hidden="true" className={`${holes} right-[4px]`} />
    <div className="relative aspect-[9/16] overflow-hidden bg-ink2">{children}</div>
  </div>;
}

const stampTone: Record<string, string> = { done: "text-ink", failed: "text-signal", cancelled: "text-signal" };
const shotTime = (at: number) => {
  const d = new Date(at);
  return `${d.getDate()} ${d.toLocaleString("en", { month: "short" })} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function ReelTile({ job }: { job: Job }) {
  const cancel = useMutation(api.generate.cancelJob);
  const [cancelError, setCancelError] = useState("");
  const done = job.status === "done" && !!(job.hasOutput || job.resultUrl);
  const { url } = useVideoUrl(done ? job._id : undefined, job.hasOutput, job.resultUrl);
  const cover = useCoverUrl(done && job.hasCover ? job._id : undefined);
  const failed = job.status === "failed" || job.status === "cancelled";
  const statusLabel = done ? "Ready" : STATUS[job.status] ?? "Finishing";
  const stamp = <span className={`stamp absolute right-1.5 top-2 z-10 rotate-[-5deg] bg-surface px-1.5! py-0.5! text-[9px]! ${stampTone[done ? "done" : job.status] ?? "text-ink2"}`}>{statusLabel}</span>;
  const meta = (
    <div className="mt-3 min-w-0">
      <p className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-muted">{MODES.find((m) => m.id === job.mode)?.shortLabel ?? job.mode}{job.createdAt !== undefined && <> · <time dateTime={new Date(job.createdAt).toISOString()}>{shotTime(job.createdAt)}</time></>}</p>
      <p className="mt-1 line-clamp-2 break-words text-sm leading-snug text-ink">{job.prompt}</p>
    </div>
  );
  const lift = "transition-[transform,box-shadow] duration-200 ease-paper shadow-hard-sm";
  if (done) return (
    <Link to={`/studio/${job._id}`} aria-label={`Open in Studio: ${job.prompt}`} className="group block">
      <ContactFrame className={`${lift} group-hover:-translate-y-0.5 group-hover:shadow-hard group-focus-visible:-translate-y-0.5 group-focus-visible:shadow-hard`}>
        <video
          src={url}
          poster={cover}
          muted loop playsInline preload="metadata"
          onMouseEnter={(e) => { void e.currentTarget.play().catch(() => {}); }}
          onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
          className="h-full w-full object-cover"
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-ink/85 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-surface opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Play aria-hidden="true" size={12} weight="fill" />Open in Studio
        </span>
        {stamp}
      </ContactFrame>
      {meta}
    </Link>
  );
  return (
    <div className="group">
      <ContactFrame className={lift}>
        {failed
          ? <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface">
            <div aria-hidden="true" className="pat-hatch absolute inset-0 opacity-[0.07]" />
            <WarningCircle aria-hidden="true" size={28} weight="light" className="relative text-signal" />
            <span className="relative font-mono text-[10px] uppercase tracking-[0.08em] text-signal">{STATUS[job.status]}</span>
          </div>
          : <div className="flex h-full w-full flex-col justify-end p-2.5">
            <FilmSlate aria-hidden="true" size={28} weight="light" className="absolute left-1/2 top-[38%] -translate-x-1/2 text-surface/40" />
            <RenderStrip job={{ _id: job._id, status: job.status, createdAt: job.createdAt, renderProgress: job.renderProgress ?? undefined }} />
          </div>}
        {['queued', 'dispatched'].includes(job.status) && <button type="button" className={`${button("secondary", "sm")} absolute left-2 top-2 px-2! py-1!`} onClick={() => { void cancel({ jobId: job._id }).catch(() => setCancelError('This video already started rendering, so it cannot be cancelled.')); }}>Cancel</button>}
        {cancelError && <p role="status" className="absolute inset-x-2 top-11 z-20 border border-signal/50 bg-surface p-2 text-xs">{cancelError}</p>}
        {stamp}
      </ContactFrame>
      {meta}
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
