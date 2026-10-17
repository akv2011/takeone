import { BrandKitPanel, type BrandSelection } from "../components/BrandKitPanel";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { GuestNotice, SignedIn, SignedOut, SignInChoices, useAuth } from "../lib/auth";
import { useAction, useConvexAuth, useMutation, useQuery, usePaginatedQuery } from "convex/react";
import { ArrowClockwise, ArrowRight, CheckCircle, Clock, CreditCard, FilmStrip, Info, LinkSimple, PencilSimple, Play, SlidersHorizontal, UploadSimple, WarningCircle, X } from "@phosphor-icons/react";
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
import { CAPTION_LANGUAGES } from "../../convex/captions";
import type { Moment } from "../../convex/youtubeValues";
import { YouTubeLinkForm, YouTubeMomentResults } from "../components/YouTubeMoments";
import { momentHandOff } from "../lib/momentHandOff";

const ease = [0.2, 0.8, 0.2, 1] as const;
const MODES = [
  { id: "clip", label: "Clip", title: "Link", Icon: LinkSimple, help: "Paste a YouTube link. Gemini finds up to 3 moments worth sharing.", placeholder: "" },
  { id: "edit", label: "Edit upload", title: "Upload", Icon: UploadSimple, help: "Upload footage, then describe the trim, speed, framing or caption changes.", placeholder: "What should change in your video?" },
  { id: "generate", label: "Generate", title: "Prompt", Icon: PencilSimple, help: "Turn an idea into a narrated video with matching footage.", placeholder: "Describe the video you want to create…" },
] as const;
// Landing hands off with /create?mode=link&url=…, ?mode=prompt&q=… or ?mode=upload.
const ENTRY_MODES: Record<string, string> = { link: "clip", upload: "edit", prompt: "generate" };
const JOB_KIND: Record<string, string> = { generate: "From a prompt", edit: "Edited upload", clip: "YouTube clip" };
const ASPECTS = [{ id: "9:16", label: "9:16" }, { id: "1:1", label: "1:1" }, { id: "16:9", label: "16:9" }] as const;

export default function Dashboard() {
  return (
    <div className="min-h-screen text-ink">
      <SignedOut><SignInGate /></SignedOut>
      <SignedIn><DashboardInner /></SignedIn>
    </div>
  );
}

function SignInGate() {
  const reduced = useReducedMotion();
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-20">
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease }}
        className="glass relative w-full max-w-[420px] rounded-[20px] px-6 pb-8 pt-10 text-center sm:px-10"
      >
        <Link to="/" aria-label="TakeOne home" className="mx-auto inline-flex rounded-control p-1"><TakeOneLogo className="h-9 w-10 text-ink" /></Link>
        <h1 className="display mx-auto mt-6 max-w-[12ch] text-[36px] sm:text-[40px]">Sign in to start creating</h1>
        <SignInChoices className="mt-8" />
        <motion.p
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.5, ease }}
          className="pointer-events-none absolute -top-9 right-4 -rotate-3 font-hand text-[22px] leading-none text-grease lg:-right-48 lg:top-[44%] lg:rotate-[-5deg]"
        >
          <svg aria-hidden="true" viewBox="0 0 60 24" className="absolute -left-16 top-0 hidden h-6 w-14 lg:block" fill="none"><path d="M58 10 C 40 2, 20 4, 4 16 M4 16 l 9 -1 M4 16 l 3 -8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          5 free shorts, no card
        </motion.p>
      </motion.div>
    </main>
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
  const [searchParams] = useSearchParams();
  const entry = useRef({ mode: ENTRY_MODES[searchParams.get("mode") ?? ""], url: searchParams.get("url") ?? "", q: searchParams.get("q") ?? "" });
  const [mode, setMode] = useState<string>(entry.current.mode ?? "generate");
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
  const [prompt, setPrompt] = useState(entry.current.mode === "generate" ? entry.current.q : "");
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
    setMode(entry.current.mode ?? defaults.defaultMode);
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
  const retryJob = (job: Job) => {
    chooseMode(job.mode === 'clip' ? 'edit' : job.mode);
    setPrompt(job.prompt);
    startFirstVideo();
  };
  const newestDone = jobs?.find(job => job.status === 'done' && (job.hasOutput || job.resultUrl))?._id;
  const spring = reduced ? { duration: 0 } : { type: "spring" as const, stiffness: 520, damping: 42 };

  return (
    <>
      <header className="sticky top-0 z-30 bg-paper/70 backdrop-blur-md hairline-bottom">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" aria-label="TakeOne home" className="rounded-control"><TakeOneWordmark className="text-[19px] text-ink" /></Link>
          <div className="flex items-center gap-2 sm:gap-4">
            {me?.founding && <span className="hidden text-[13px] font-medium text-ink2 md:inline">Founding creator</span>}
            <Allowance me={me} />
            <span className="hidden sm:block"><Link to="/pricing" className={button("ghost", "sm")}>Buy credits</Link></span>
            <TakeOneUserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
        <div className="mx-auto max-w-[680px]">
          <motion.div initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease }}>
            <h1 className="display -ml-[0.04em] text-[40px] sm:text-[52px]">Create a video</h1>
          </motion.div>
          <div className="mt-4 space-y-3">
            <GuestNotice />
            {!!me?.creditAdjustment && <p role="status" className="text-sm text-ink2">A refund removed credits that had already been used. Your next purchased credits will first cover this {me.creditAdjustment}-credit adjustment. Your purchase history shows the refund.</p>}
            {!authLoading && !isAuthenticated && <ErrorNote action={<button type="button" onClick={() => window.location.reload()} className={button("secondary", "sm")}><ArrowClockwise aria-hidden="true" size={16} />Reload</button>}>Your sign-in did not reach the video service. Reload the page to try again.</ErrorNote>}
            {accountError && <ErrorNote action={<button disabled={preparingAccount} onClick={() => void initializeAccount()} className={button("secondary", "sm")}><ArrowClockwise aria-hidden="true" size={16} />Retry account setup</button>}>
              We could not finish setting up your account. Your allowance has not been charged.
            </ErrorNote>}
            {!me && !accountError && (authLoading || isAuthenticated) && <p role="status" className="flex items-center gap-2 text-[13px] text-muted"><FrameMeter filled={0} total={5} loading />Preparing your account and video allowance…</p>}
          </div>

          <motion.div className="mt-7" initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.08, ease }}>
            {mode === "clip" ? <YouTubeLinkForm initialUrl={entry.current.mode === "clip" ? entry.current.url : undefined} /> : (
              <div className="glass flex items-start gap-3 rounded-card py-2 pl-[18px] pr-2 transition-shadow duration-200 ease-paper focus-within:shadow-[0_0_0_1.5px_#141311,0_8px_24px_-12px_rgba(20,19,17,.25)]">
                <activeMode.Icon aria-hidden="true" size={20} className="mt-[14px] shrink-0 text-muted" />
                <textarea
                  ref={promptBox}
                  value={prompt}
                  maxLength={4000}
                  aria-label="Video prompt"
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void generate(); } }}
                  rows={1}
                  disabled={pickMoment}
                  placeholder={pickMoment ? "Gemini watches your upload and picks the best 15 to 30 seconds." : activeMode.placeholder}
                  className="max-h-52 min-h-12 min-w-0 flex-1 resize-none bg-transparent py-[13px] text-base leading-[22px] text-ink outline-none [field-sizing:content] placeholder:text-muted disabled:cursor-not-allowed"
                />
                <button aria-label={actionLabel} onClick={generate} disabled={busy || !me || capabilities === undefined || !activeCapability?.available}
                  className={`${button("primary", "lg")} relative shrink-0`}>
                  <span className={`inline-flex items-center gap-2.5 ${busy ? "invisible" : ""}`}>
                    {actionLabel}
                    {preferences.showShortcutHints && <kbd aria-hidden="true" className="hidden h-5 min-w-5 place-items-center rounded-[5px] bg-surface/15 px-1 font-sans text-[11px] text-surface/75 sm:inline-grid">↵</kbd>}
                  </span>
                  {busy && <span aria-hidden="true" className="absolute inset-0 grid place-items-center"><FrameMeter filled={3} total={3} loading light /></span>}
                </button>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div role="group" aria-label="Choose a video task" className="glass inline-flex rounded-control p-1 [&>span]:flex">
                {MODES.map((m) => {
                  const active = mode === m.id;
                  return <Tooltip key={m.id} label={m.help} side="bottom">
                    <button aria-label={m.label} aria-pressed={active} onClick={() => chooseMode(m.id)}
                      className={`relative inline-flex h-9 items-center gap-2 rounded-[8px] px-3 text-[14px] font-medium transition-colors duration-150 ${active ? "text-surface" : "text-ink2 hover:text-ink"}`}>
                      {active && <motion.span layoutId="mode-ink" aria-hidden="true" transition={spring} className="absolute inset-0 rounded-[8px] bg-ink" />}
                      <m.Icon aria-hidden="true" size={18} className="relative" />
                      <span className="relative">{m.title}</span>
                    </button>
                  </Tooltip>;
                })}
              </div>
              {mode !== "clip" && <div className="flex items-center gap-1">
                {me && <span className="mr-1 text-[13px] text-muted">{free > 0 ? "Uses 1 free short" : "Uses 1 credit"}</span>}
                <SettingsPopover open={settingsOpen} onOpenChange={setSettingsOpen}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <fieldset><legend className={`mb-1.5 ${label}`}>Format</legend><div className="inline-flex rounded-control bg-paper2/70 p-1">{ASPECTS.map((a) => (
                      <button type="button" key={a.id} aria-pressed={aspect === a.id} onClick={() => setAspect(a.id)} disabled={mode === 'generate' && generationKind === 'ai' && a.id === '1:1'}
                        className={`h-8 rounded-[8px] px-3 font-mono text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${aspect === a.id ? "bg-cue text-white" : "text-ink2 hover:text-ink"}`}>{a.label}</button>
                    ))}</div></fieldset>
                    {mode === 'generate' && <label className={`${label} sm:col-span-2`}>Video source
                      <select aria-label="Video type" value={generationKind} onChange={e => { setGenerationKind(e.target.value); if (e.target.value === 'ai' && aspect === '1:1') setAspect('9:16'); }} className={`${field} mt-1.5 block w-full`}>
                        <option value="stock" disabled={!capabilities?.stockVideo.available}>Narration + stock footage{!capabilities?.stockVideo.available ? ' · unavailable' : ''}</option>
                        <option value="ai" disabled={!capabilities?.aiVideo.available}>AI video{!capabilities?.aiVideo.available ? ' · unavailable' : ''}</option>
                      </select>
                    </label>}
                    {!(mode === 'generate' && generationKind === 'ai') && !brandKit && <label className={label}>Captions
                      <select aria-label="Caption style" value={captionStyle} onChange={e => setCaptionStyle(e.target.value)} className={`${field} mt-1.5 block w-full`}>
                        <option value="auto">Automatic</option><option value="clean">Clean</option><option value="meme">Bold pop</option><option value="karaoke">Pop-in</option><option value="none">None</option>
                      </select>
                    </label>}
                    {!(mode === 'generate' && generationKind === 'ai') && <label className={label}>Language
                      <select aria-label="Caption language" value={captionLanguage} onChange={e => setCaptionLanguage(e.target.value)} className={`${field} mt-1.5 block w-full`}>
                        <option value="">Same as the video</option>
                        {CAPTION_LANGUAGES.map(language => <option key={language.code} value={language.code}>{language.label}</option>)}
                      </select>
                    </label>}
                  </div>
                  {!(mode === 'generate' && generationKind === 'ai') && <BrandKitPanel compact key={user?.id} accountKey={user?.id ?? ''} value={brandKit} onChange={setBrandKit} disabled={busy} />}
                </SettingsPopover>
              </div>}
            </div>
          </motion.div>

          {mode === "edit" && <VideoUpload onReady={setUploadId} />}
          {mode === "edit" && <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <fieldset className="flex w-full rounded-control bg-paper2/70 p-1 sm:inline-flex sm:w-auto">
              <legend className="sr-only">How to edit the upload</legend>
              {([['describe', 'Describe the edit'], ['moment', 'Let Gemini pick the best moment']] as const).map(([value, text]) => (
                <label key={value} className={`relative inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center rounded-[8px] px-3 py-1.5 text-center text-[14px] font-medium leading-tight sm:flex-none transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink ${editChoice === value ? "text-ink" : "text-ink2 hover:text-ink"}`}>
                  {editChoice === value && <motion.span layoutId="edit-choice" aria-hidden="true" transition={spring} className="absolute inset-0 rounded-[8px] bg-surface shadow-card" />}
                  <input type="radio" name="edit-choice" className="sr-only" checked={editChoice === value} onChange={() => setEditChoice(value)} />
                  <span className="relative">{text}</span>
                </label>
              ))}
            </fieldset>
            <label className="flex min-h-10 items-center gap-2.5 text-sm text-ink"><input type="checkbox" className="size-[18px] accent-ink" checked={confirmedOwnership} onChange={e => setConfirmedOwnership(e.target.checked)} />I own or have permission to use this video.</label>
          </div>}

          <div className="mt-4 flex flex-wrap items-start gap-2">
            {user?.id && capabilities?.rendering.available && <AssemblyStarter compact key={user.id} accountKey={user.id} />}
            {capabilities?.telegram.available && <TelegramConnect compact />}
          </div>
          {mode !== "clip" && status !== "out-of-credits" && (status && statusTone !== "note"
            ? <ErrorNote className="mt-4" action={statusTone === "retry" ? <button type="button" disabled={busy} onClick={() => void generate()} className={button("secondary", "sm")}><ArrowClockwise aria-hidden="true" size={16} />Retry</button> : undefined}>{status}</ErrorNote>
            : (status || (activeCapability && !activeCapability.available)) && <p className="mt-4 flex items-start gap-2 text-sm text-ink2">
              <Info aria-hidden="true" size={18} className="mt-px shrink-0 text-muted" />
              {status || activeCapability?.reason}
            </p>)}
          {status === "out-of-credits" && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-card bg-surface/90 px-4 py-3 shadow-card">
              <CreditCard aria-hidden="true" size={20} className="shrink-0 text-ink" />
              <p className="min-w-0 flex-1 text-sm text-ink">You're out of credits. Buy a pack to keep creating.</p>
              <Link to="/pricing" className={button("primary", "sm")}>Get credits</Link>
            </div>
          )}
        </div>
        {mode === "clip" && <div className="mt-14"><YouTubeMomentResults onRender={renderMoment} /></div>}

        <section aria-labelledby="your-videos" className="mt-20">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="your-videos" className="display text-[26px]">Your videos</h2>
            {jobs && jobs.length > 0 && <span className="text-[13px] text-muted">{jobs.length} shown</span>}
          </div>

          {jobs === undefined ? (
            <div aria-busy="true" className="mt-6">
              <span className="sr-only">Loading your videos</span>
              <BlankStrip loading />
            </div>
          ) : jobs.length === 0 ? (
            <div className="mt-6">
              <BlankStrip />
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
                <p className="text-[15px] text-ink2">Your finished shorts land here, one frame each.</p>
                <button type="button" onClick={startFirstVideo} className={button("primary", "md")}>Write your first prompt<ArrowRight aria-hidden="true" size={16} /></button>
              </div>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
              {jobs.map((j, index) => <ReelTile key={j._id} job={j} frame={index + 1} marked={j._id === newestDone} onRetry={() => retryJob(j)} />)}
            </div>
          )}
          {history.status === 'CanLoadMore' && <button type="button" onClick={() => history.loadMore(20)} className={`${button("secondary", "md")} mt-10`}>Load older videos</button>}
          {history.status === 'LoadingMore' && <p role="status" className="mt-10 text-sm text-muted">Loading older videos…</p>}
        </section>
      </main>
    </>
  );
}

type Allowance = Pick<NonNullable<Me>, "freeRemaining" | "freeLimit" | "credits"> | null | undefined;

function Allowance({ me }: { me: Allowance }) {
  if (!me) return <span className="flex items-center gap-2 text-[13px] text-muted"><FrameMeter filled={0} total={5} loading /><span className="sr-only">Loading allowance…</span></span>;
  const free = me.freeRemaining;
  const total = Math.max(me.freeLimit, free);
  if (free <= 0) return <span className="text-[13px] text-ink2"><strong className="font-semibold text-ink">{me.credits}</strong> credits</span>;
  return <span className="flex items-center gap-2 whitespace-nowrap text-[13px] text-ink2">
    <FrameMeter filled={free} total={total} />
    <span><strong className="font-semibold text-ink">{free}</strong> of {total}<span className="hidden sm:inline"> free shorts</span> left</span>
  </span>;
}

// A short strip of film frames; filled frames are the ones still available.
function FrameMeter({ filled, total, loading = false, light = false }: { filled: number; total: number; loading?: boolean; light?: boolean }) {
  return <span aria-hidden="true" className={`inline-flex gap-[2px] rounded-[3px] p-[2px] ${light ? "" : "bg-film"}`}>
    {Array.from({ length: total }, (_, i) => <span key={i}
      style={loading ? { animationDelay: `${i * 120}ms` } : undefined}
      className={`h-[11px] w-[6px] rounded-[1px] ${loading ? "bg-[#efe9dc] motion-safe:animate-pulse" : i < filled ? "bg-[#efe9dc]" : "bg-[#3a352d]"}`} />)}
  </span>;
}

function ErrorNote({ action, className = "", children }: { action?: ReactNode; className?: string; children: ReactNode }) {
  return <div className={`flex flex-wrap items-center gap-3 rounded-card bg-warnBg/80 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(196,50,31,.18)] ${className}`}>
    <WarningCircle aria-hidden="true" size={20} className="shrink-0 text-grease" />
    <p role="alert" className="min-w-0 flex-1 basis-56 text-sm text-ink">{children}</p>
    {action}
  </div>;
}

function SettingsPopover({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  const reduced = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) onOpenChange(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onOpenChange(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open, onOpenChange]);
  return <div ref={box} className="relative">
    <button type="button" aria-label="Settings" aria-expanded={open} aria-controls="creation-settings" onClick={() => onOpenChange(!open)}
      className={`${button("ghost", "md")} w-10 px-0! ${open ? "bg-ink/5 text-ink" : ""}`}>
      <SlidersHorizontal aria-hidden="true" size={20} />
    </button>
    <AnimatePresence>
      {open && <motion.section key="settings" id="creation-settings" aria-label="Video settings"
        initial={reduced ? false : { opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduced ? undefined : { opacity: 0, y: -4 }} transition={{ duration: 0.18, ease }}
        className="fixed inset-x-3 bottom-3 z-40 max-h-[75vh] overflow-y-auto rounded-card bg-surface p-5 shadow-lift sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-12 sm:max-h-[70vh] sm:w-[460px] sm:origin-top-right">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em]">Video settings</h2>
          <button type="button" aria-label="Close settings" onClick={() => onOpenChange(false)} className={`${button("ghost", "sm")} w-8 px-0!`}><X aria-hidden="true" size={16} /></button>
        </div>
        {children}
      </motion.section>}
    </AnimatePresence>
  </div>;
}

const sprockets = "before:absolute before:inset-x-0 before:top-[6px] before:h-[9px] before:bg-[repeating-linear-gradient(90deg,#efebe3_0_9px,transparent_9px_20px)] before:opacity-90 after:absolute after:inset-x-0 after:bottom-[6px] after:h-[9px] after:bg-[repeating-linear-gradient(90deg,#efebe3_0_9px,transparent_9px_20px)] after:opacity-90";

// Blank frames on a strip: the empty and loading states of the contact sheet.
function BlankStrip({ loading = false }: { loading?: boolean }) {
  return <div className={`relative grid grid-cols-3 gap-[8px] rounded-[3px] bg-film px-[10px] pb-[24px] pt-[22px] shadow-film sm:grid-cols-5 ${sprockets}`}>
    {Array.from({ length: 5 }, (_, i) => <div key={i} className={`aspect-[9/16] rounded-[2px] bg-[#28241e] ${i > 2 ? "hidden sm:block" : ""}`}>
      {loading && <div style={{ animationDelay: `${i * 140}ms` }} className="h-full w-full rounded-[2px] bg-[#3a352d] motion-safe:animate-pulse" />}
    </div>)}
  </div>;
}

const shotDate = (at: number) => {
  const d = new Date(at);
  return `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleString("en", { month: "short" }).toUpperCase()}`;
};
const shotTime = (at: number) => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function ReelTile({ job, frame, marked = false, onRetry }: { job: Job; frame?: number; marked?: boolean; onRetry?: () => void }) {
  const cancel = useMutation(api.generate.cancelJob);
  const [cancelError, setCancelError] = useState("");
  const reduced = useReducedMotion();
  const done = job.status === "done" && !!(job.hasOutput || job.resultUrl);
  const { url } = useVideoUrl(done ? job._id : undefined, job.hasOutput, job.resultUrl);
  const cover = useCoverUrl(done && job.hasCover ? job._id : undefined);
  const failed = job.status === "failed";
  const cancelled = job.status === "cancelled";
  const waiting = ['queued', 'dispatched'].includes(job.status);
  const strip = (content: ReactNode) => (
    <div className={`relative bg-film px-[5px] pb-[34px] pt-[22px] ${sprockets}`}>
      <div className="relative aspect-[9/16] overflow-hidden rounded-[2px] bg-[#28241e]">{content}</div>
      <div aria-hidden="true" className="edge-print absolute inset-x-[7px] bottom-[17px] flex justify-between text-[10px] leading-none tracking-[0.12em]">
        <span>{job.createdAt !== undefined ? shotDate(job.createdAt) : "TAKEONE"}</span>
        <span>▶ {String(frame ?? 1).padStart(2, "0")}</span>
      </div>
      {marked && <svg aria-hidden="true" viewBox="0 0 96 200" preserveAspectRatio="none" className="pointer-events-none absolute -inset-x-[14%] -top-[6%] z-10 h-[108%] w-[128%] overflow-visible">
        <motion.path d="M50 6 C 12 4, 4 60, 8 110 C 12 168, 30 196, 54 192 C 86 186, 92 120, 88 70 C 84 22, 66 6, 40 12" fill="none" stroke="#c4321f" strokeWidth="3.4" strokeLinecap="round" vectorEffect="non-scaling-stroke"
          strokeDasharray={900} initial={reduced ? false : { strokeDashoffset: 900 }} animate={{ strokeDashoffset: 0 }} transition={{ duration: 1, delay: 0.6, ease }} />
      </svg>}
    </div>
  );
  const statusLine = done ? <><CheckCircle aria-hidden="true" size={16} className="text-go" />Ready</>
    : failed ? <><WarningCircle aria-hidden="true" size={16} className="text-grease" />Failed</>
      : cancelled ? <><X aria-hidden="true" size={16} />Cancelled</>
        : waiting ? <><Clock aria-hidden="true" size={16} />{job.status === 'queued' ? 'Queued' : 'Starting'}</>
          : <><FilmStrip aria-hidden="true" size={16} />Rendering</>;
  const caption = (
    <div className="px-[6px] pt-3">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <p className={`flex items-center gap-1.5 text-[13px] font-medium ${failed ? "text-grease" : "text-ink2"}`}>{statusLine}</p>
        {waiting && <button type="button" className={`${button("ghost", "sm")} -mr-2`} onClick={() => { void cancel({ jobId: job._id }).catch(() => setCancelError('This video already started rendering, so it cannot be cancelled.')); }}>Cancel</button>}
        {failed && onRetry && <button type="button" className={`${button("ghost", "sm")} -mr-2`} onClick={onRetry}><ArrowClockwise aria-hidden="true" size={14} />Try again</button>}
      </div>
      <p className="mt-1 line-clamp-2 break-words text-sm leading-snug text-ink">{job.prompt}</p>
      <p className="mt-1 text-[13px] text-muted">{JOB_KIND[job.mode] ?? job.mode}{job.createdAt !== undefined && <> · <time dateTime={new Date(job.createdAt).toISOString()}>{shotTime(job.createdAt)}</time></>}</p>
      {cancelError && <p role="status" className="mt-1 text-[13px] text-grease">{cancelError}</p>}
    </div>
  );
  if (done) return (
    <Link to={`/studio/${job._id}`} aria-label={`Open in Studio: ${job.prompt}`} className="group block min-w-0 rounded-[4px]">
      {strip(<>
        <video
          src={url}
          poster={cover}
          muted loop playsInline preload="metadata"
          onMouseEnter={(e) => { void e.currentTarget.play().catch(() => {}); }}
          onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
          className="h-full w-full object-cover transition-transform duration-500 ease-paper group-hover:scale-[1.03]"
        />
        <span className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-center gap-1.5 rounded-control bg-surface/90 py-1.5 text-[13px] font-medium text-ink opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
          <Play aria-hidden="true" size={14} weight="fill" />Open in Studio
        </span>
      </>)}
      {caption}
    </Link>
  );
  return (
    <article className="min-w-0">
      {strip(failed || cancelled
        ? <div className="grid h-full w-full place-items-center"><WarningCircle aria-hidden="true" size={28} className={failed ? "text-grease/80" : "text-[#6b6458]"} /></div>
        : <div className="flex h-full w-full flex-col justify-end p-2"><RenderStrip job={{ _id: job._id, status: job.status, createdAt: job.createdAt, renderProgress: job.renderProgress ?? undefined }} /></div>)}
      {caption}
    </article>
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
