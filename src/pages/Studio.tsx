import { SpeakerReframe } from '../components/SpeakerReframe';
import { ShareReview } from "../components/ShareReview";
import { BrandKitPanel, type BrandSelection } from "../components/BrandKitPanel";
import { HookVariants } from '../components/HookVariants';
import { SceneInspector } from '../components/SceneInspector';
import { ProjectTimelinePanel } from '../components/ProjectTimelinePanel';
import { TranscriptNavigator } from '../components/TranscriptNavigator';
import { RenderProgress, type RenderAttempt } from "../components/RenderProgress";
import { TransformControls } from "../components/TransformControls";
import type {
  EditTransforms,
  OutputAspect,
  OutputFit,
} from "../lib/editTransforms";
import { StudioWorkspace } from "../components/StudioWorkspace";
import { PreviousVersionPlayer } from "../components/PreviousVersionPlayer";
import TelegramDeliveryStatus from "../components/TelegramDeliveryStatus";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { SignedIn, SignedOut, SignInButton, useUser } from "@clerk/clerk-react";
import {
  useConvexAuth,
  useQuery,
  useMutation,
  useAction,
  usePaginatedQuery,
} from "convex/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import PremiumBackground from "../components/PremiumBackground";
import TakeOneLogo from "../components/TakeOneLogo";
import { useVideoUrl } from "../lib/useVideoUrl";
import { MusicPicker, type MusicSelection } from "../components/MusicPicker";
import { api } from "../lib/convexApi";
import { CaptionRestyle } from "../components/CaptionRestyle";
import { TimelineControls } from "../components/TimelineControls";
import { useTimelinePlayer } from "../hooks/useTimelinePlayer";

type Job =
  | {
      _id: string;
      createdAt?: number;
      finishedAt?: number;
      refunded?: boolean;
      renderProgress?: RenderAttempt;
      parentJobId?: string;
      telegramDeliveryStatus?: string;
      mode: string;
      prompt: string;
      status: string;
      aspect?: string;
      hasCaptionArchive: boolean;
      hasOutput: boolean;
      hasSource: boolean;
      soundtrack?: { attribution: string; label: string } | null;
      resultUrl?: string | null;
    }
  | null
  | undefined;
type Msg = { role: "user" | "system"; text: string };

// One-tap edits the ffmpeg pipeline handles well.
const QUICK_EDITS: { label: string; transforms: EditTransforms }[] = [
  { label: "Make it square (1:1)", transforms: { aspect: "1:1" } },
  { label: "Make it landscape (16:9)", transforms: { aspect: "16:9" } },
  { label: "Fit without cropping", transforms: { fit: "fit" } },
  { label: "Speed it up 1.5x", transforms: { speed: 1.5 } },
];

export default function Studio() {
  const { user } = useUser();
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-paper text-ink selection:bg-cue/15">
      <div className="noise-overlay" />
      <PremiumBackground />
      <SignedOut>
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <Link to="/" className="mb-8 flex items-center gap-2">
            <TakeOneLogo className="h-10 w-10 text-ink" />
            <span className="font-display text-2xl font-bold tracking-tight">
              takeone
            </span>
          </Link>
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-cueInk">
            Studio
          </div>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-[-0.03em]">
            Sign in to open the studio
          </h1>
          <SignInButton mode="modal">
            <button className="group mt-7 inline-flex items-center gap-2 rounded-2xl bg-ink px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-cue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper">
              Continue with Google{" "}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </SignInButton>
        </div>
      </SignedOut>
      <SignedIn>
        <StudioInner key={user?.id ?? "signed-out"} />
      </SignedIn>
    </div>
  );
}

function StudioInner() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { user } = useUser();
  const { id } = useParams<{ id: string }>();
  const viewEpoch = useRef(0);
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<string | undefined>(id);
  useEffect(() => {
    const invalidateView = () => {
      viewEpoch.current++;
    };
    invalidateView();
    setActiveId(id);
    setMessages([]);
    setInstruction("");
    setMusic(undefined);
    setBrandKit(undefined);
    setFormatDraft(undefined);
    setBusy(false);
    pending.current = null;
    return invalidateView;
  }, [id]);
  const job = useQuery(
    api.generate.getJob,
    activeId && isAuthenticated ? { jobId: activeId } : "skip",
  ) as Job;
  const original = useQuery(
    api.generate.versions,
    activeId && isAuthenticated && user?.id
      ? { jobId: activeId, rootOnly: true, accountKey: user.id }
      : "skip",
  ) as
    | Array<{
        _id: string;
        parentJobId?: string;
        prompt: string;
        status: string;
        createdAt: number;
        original: boolean;
      }>
    | undefined;
  const versionPages = usePaginatedQuery(
    api.generate.listVersions,
    activeId && isAuthenticated && user?.id
      ? { jobId: activeId, accountKey: user.id }
      : "skip",
    { initialNumItems: 20 },
  );
  const versions = original
    ? [...original, ...versionPages.results]
    : undefined;
  const pending = useRef<{ payload: string; requestId: string } | null>(null);
  const requestEdit = useMutation(api.generate.requestEdit);
  const getCaptionCues = useAction(api.generate.getCaptionCues);
  const [brandKit, setBrandKit] = useState<BrandSelection>();
  const requestBrandEdit = useMutation(api.generate.requestBrandEdit);
  const requestCaptionEdit = useMutation(api.generate.requestCaptionEdit);

  const [music, setMusic] = useState<MusicSelection>();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastNotified, setLastNotified] = useState<string | null>(null);
  const [edits, setEdits] = useState(0);
  const player = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState<number>();
  const [currentTime, setCurrentTime] = useState(0);

  const timelinePlayer = useTimelinePlayer(player, activeId, setCurrentTime);
  useEffect(() => {
    setDuration(undefined);
    setCurrentTime(0);
  }, [activeId]);

  const [formatDraft, setFormatDraft] = useState<{
    jobId?: string;
    aspect: OutputAspect;
    fit: OutputFit;
  }>();
  const sourceAspect: OutputAspect =
    job?.aspect === "1:1" || job?.aspect === "16:9" ? job.aspect : "9:16";
  const format =
    formatDraft && formatDraft.jobId === activeId
      ? formatDraft
      : { aspect: sourceAspect, fit: "crop" as OutputFit };
  const previewAspect = format.aspect;

  const soundtrack = job?.soundtrack;
  const rendering =
    !!job && ["queued", "dispatched", "processing"].includes(job.status);
  const ready = !!job && job.status === "done" && job.hasOutput;
  const {
    url,
    error: videoError,
    refresh,
  } = useVideoUrl(
    job?.status === "done" ? job._id : undefined,
    job?.hasOutput,
    job?.resultUrl,
  );

  useEffect(() => {
    if (!job || !job.hasSource) return;
    const key = job._id + ":" + job.status;
    if (key === lastNotified) return;
    if (job.status === "done") {
      setMessages((m) => [
        ...m,
        { role: "system", text: "Done. Playing the updated reel." },
      ]);
      setLastNotified(key);
    } else if (job.status === "failed") {
      setMessages((m) => [
        ...m,
        {
          role: "system",
          text: "That edit failed. Your allowance was restored when applicable.",
        },
      ]);
      setLastNotified(key);
    }
  }, [job?._id, job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (
    text: string,
    {
      applyBrand,
      captionStyle,
      captionTexts,
      captionPosition,
      captionFont,
      transforms,
    }: {
      applyBrand?: boolean;
      captionStyle?: string;
      captionTexts?: string[];
      captionPosition?: string;
      captionFont?: string;
      transforms?: EditTransforms;
    } = {},
  ) => {
    const t = text.trim();
    if (!t || !ready || !job?.hasOutput || busy || rendering) return;
    const submittedView = viewEpoch.current;
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: t }]);
    setInstruction("");
    try {
      const payload = JSON.stringify(
        applyBrand
          ? { sourceJobId: job._id, brandKit }
          : captionStyle
          ? {
              sourceJobId: job._id,
              captionStyle,
              captionTexts,
              captionPosition,
              captionFont,
            }
          : {
              sourceJobId: job._id,
              ...(transforms ? { transforms } : { instruction: t }),
              music,
            },
      );
      if (pending.current?.payload !== payload)
        pending.current = { payload, requestId: crypto.randomUUID() };
      const { jobId } = (await (applyBrand
        ? requestBrandEdit({ sourceJobId: job._id, brandKit, requestId: pending.current.requestId })
        : captionStyle
        ? requestCaptionEdit({
            sourceJobId: job._id,
            captionStyle,
            ...(captionTexts ? { captionTexts } : {}),
            ...(captionPosition ? { captionPosition } : {}),
            ...(captionFont ? { captionFont } : {}),
            requestId: pending.current.requestId,
          })
        : requestEdit({
            sourceJobId: job._id,
            ...(transforms ? { transforms } : { instruction: t }),
            music,
            requestId: pending.current.requestId,
          }))) as { jobId: string };
      if (submittedView !== viewEpoch.current) return;
      setMessages((m) => [
        ...m,
        {
          role: "system",
          text: "Your edit is queued. It will appear here when ready.",
        },
      ]);
      setEdits((n) => n + 1);
      setActiveId(jobId);
      navigate(`/studio/${jobId}`);
      setMusic(undefined);
      pending.current = null;
    } catch (e: any) {
      if (submittedView !== viewEpoch.current) return;
      const code = typeof e?.data === "string" ? e.data : e?.data?.code;
      setMessages((m) => [
        ...m,
        {
          role: "system",
          text:
            code === "USE_CAPTION_CONTROLS"
              ? "Use the caption controls below to change style, font or wording. Submit timeline edits separately. No generation was used."
              : code === "NO_CREDITS"
                ? "You're out of credits. Grab a pack to keep editing."
                : "Something went wrong, try again.",
        },
      ]);
    } finally {
      if (submittedView === viewEpoch.current) setBusy(false);
    }
  };

  return (
    <>
      <header className="relative z-10 mx-auto flex max-w-[1600px] items-center justify-between px-6 py-5">
        <Link
          to="/create"
          className="group inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />{" "}
          Back to your reels
        </Link>
        <Link to="/" className="flex items-center gap-2">
          <TakeOneLogo className="h-8 w-8 text-ink" />
          <span className="font-display text-xl font-bold tracking-tight">
            takeone
          </span>
        </Link>
      </header>

      <main className="relative z-10 mx-auto min-h-[calc(100vh-76px)] max-w-[1600px] px-3 pb-8 sm:px-6">
        <div className="mb-7">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-cueInk">
            Studio
          </div>
          <h1 className="mt-1.5 text-balance font-display text-2xl font-extrabold leading-tight tracking-[-0.02em] md:text-[28px]">
            {job?.prompt || "Your reel"}
          </h1>
        </div>

        {job?.status === "done" && job.hasOutput && <ShareReview key={job._id} jobId={job._id} duration={duration} onSeek={timelinePlayer.seek} />}
        <StudioWorkspace
          canvas={
            <>
              {/* Player */}
              <div className="flex w-full flex-col items-center gap-4">
                <div className="studio-video-frame">
                  <div
                    style={
                      {
                        aspectRatio: previewAspect.replace(":", " / "),
                        "--video-ratio":
                          previewAspect === "16:9"
                            ? 16 / 9
                            : previewAspect === "1:1"
                              ? 1
                              : 9 / 16,
                      } as CSSProperties
                    }
                    className="studio-video"
                  >
                    {url ? (
                      <video
                        ref={player}
                        key={activeId}
                        src={url}
                        aria-label="Current video"
                        controls
                        playsInline
                        className="h-full w-full"
                        style={{
                          objectFit: format.fit === "fit" ? "contain" : "cover",
                        }}
                        onLoadedMetadata={(e) => {
                          if (Number.isFinite(e.currentTarget.duration))
                            setDuration(e.currentTarget.duration);
                        }}
                        onTimeUpdate={timelinePlayer.update}
                        onPause={timelinePlayer.cancel}
                      />
                    ) : job?.parentJobId &&
                      [
                        "queued",
                        "dispatched",
                        "processing",
                        "failed",
                        "cancelled",
                      ].includes(job.status) ? (
                      <PreviousVersionPlayer
                        key={job.parentJobId}
                        jobId={job.parentJobId}
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/70">
                        {!isAuthenticated ? (
                          <p
                            role={authLoading ? "status" : "alert"}
                            className="px-4 text-center text-sm"
                          >
                            {authLoading
                              ? "Connecting your sign-in…"
                              : "Could not connect your sign-in. Return to the dashboard and sign in again."}
                          </p>
                        ) : job === null ? (
                          <p className="px-4 text-center text-sm">
                            This video is unavailable. Check the link or return
                            to your dashboard.
                          </p>
                        ) : job?.status === "failed" ? (
                          <span className="font-mono text-xs text-red-400">
                            generation failed
                          </span>
                        ) : job?.status === "cancelled" ? (
                          <p className="px-4 text-center text-sm">
                            This generation was cancelled. Your allowance was
                            restored.
                          </p>
                        ) : (
                          <>
                            <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                            <span className="font-mono text-xs">
                              {job ? `${job.status}…` : "loading…"}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {ready && soundtrack && (
                  <p className="text-xs text-muted">
                    Soundtrack: {soundtrack.label}. {soundtrack.attribution}
                  </p>
                )}
                {videoError && (
                  <button
                    className="text-sm text-red-600"
                    onClick={() => void refresh()}
                  >
                    {videoError}
                  </button>
                )}
                {url && (
                  <a
                    href={url}
                    download
                    className="rounded-xl border border-ink/10 bg-white px-4 py-2 text-sm font-semibold shadow-sm transition-colors hover:border-ink/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                  >
                    Download
                  </a>
                )}
              </div>
            </>
          }
          timeline={
            <>
              <TimelineControls
                key={activeId}
                duration={duration}
                videoUrl={url}
                disabled={!ready || !url || busy || rendering}
                currentTime={currentTime}
                readCurrentTime={() => player.current?.currentTime}
                onSeek={timelinePlayer.seek}
                onApplyTransforms={(transforms) =>
                  void send("Apply trim and speed", {
                    transforms: {
                      ...transforms,
                      aspect: format.aspect,
                      fit: format.fit,
                    },
                  })
                }
                onPreview={timelinePlayer.preview}
              />
              {ready && activeId && isAuthenticated && <HookVariants jobId={activeId} accountKey={user?.id ?? ""} videoUrl={url} />}
              {ready && activeId && isAuthenticated && <SpeakerReframe jobId={activeId} accountKey={user?.id ?? ""} duration={duration} />}
              <TranscriptNavigator
                jobId={activeId ?? ''}
                accountKey={user?.id ?? ''}
                available={isAuthenticated && ready && !!job?.hasCaptionArchive}
                playbackDisabled={!url || !ready}
                duration={duration}
                currentTime={currentTime}
                loadCues={() => getCaptionCues({ jobId: activeId }) as Promise<{ start: number; end: number; text: string }[]>}
                onSeek={timelinePlayer.seek}
                onPreview={timelinePlayer.preview}
              />
            </>
          }
          versions={
            <>
              {ready && activeId && isAuthenticated && user?.id && (
                <ProjectTimelinePanel
                  sourceJobId={activeId}
                  accountKey={user.id}
                  duration={duration}
                  disabled={busy || rendering}
                />
              )}
              <SceneInspector
                onReplaced={id => navigate(`/studio/${id}`)}
                jobId={activeId ?? ''}
                accountKey={user?.id ?? ''}
                playbackDisabled={!url || !ready}
                currentTime={currentTime}
                duration={duration}
                onSeek={timelinePlayer.seek}
              />
              {versions && versions.length > 0 && (
                <section
                  aria-label="Version history"
                  className="w-full rounded-2xl border border-black/10 bg-white p-4"
                >
                  <h2 className="text-sm font-semibold">Version history</h2>
                  <p className="mt-1 text-xs text-muted">
                    Opening an earlier version is free. Editing it creates a
                    separate version. The original stays available below. Load
                    older edits to explore your full history.
                  </p>
                  <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                    {versions.map((version) => (
                      <li
                        key={version._id}
                        className={
                          version.original
                            ? "sticky top-0 z-10 rounded-lg bg-white"
                            : undefined
                        }
                      >
                        <Link
                          to={`/studio/${version._id}`}
                          aria-current={
                            activeId === version._id ? "page" : undefined
                          }
                          className={`block rounded-lg border p-2 text-xs ${activeId === version._id ? "border-ink bg-cue/5" : "border-black/10"}`}
                        >
                          <span className="font-semibold">
                            {version.original ? "Original" : version.prompt}
                          </span>
                          <span className="mt-1 block text-muted">
                            {version.status} ·{" "}
                            {new Date(version.createdAt).toLocaleString()}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {versionPages.status === "LoadingFirstPage" && (
                    <p
                      role="status"
                      className="mt-2 text-xs text-muted"
                    >
                      Loading edits…
                    </p>
                  )}
                  {(versionPages.status === "CanLoadMore" ||
                    versionPages.status === "LoadingMore") && (
                    <button
                      type="button"
                      disabled={versionPages.status === "LoadingMore"}
                      onClick={() => versionPages.loadMore(20)}
                      className="mt-3 rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
                    >
                      {versionPages.status === "LoadingMore"
                        ? "Loading older edits…"
                        : "Load older edits"}
                    </button>
                  )}
                  {job?.status === "failed" && (
                    <p className="mt-2 text-xs text-red-600">
                      This edit failed. Open a completed version above to
                      continue editing.
                    </p>
                  )}
                </section>
              )}
              {!versions?.length && (
                <p className="p-4 text-sm text-muted">
                  Saved versions will appear here.
                </p>
              )}
            </>
          }
          inspector={
            <div className="space-y-4">
              <TransformControls
                aspect={format.aspect}
                fit={format.fit}
                disabled={!ready || busy || rendering}
                onChange={(value) =>
                  setFormatDraft({ jobId: activeId, ...value })
                }
                onApply={() =>
                  void send(`Frame ${format.aspect} with ${format.fit}`, {
                    transforms: { aspect: format.aspect, fit: format.fit },
                  })
                }
              />
              <BrandKitPanel key={`brand-${user?.id}-${activeId}`} accountKey={user?.id ?? ""} value={brandKit} onChange={setBrandKit} disabled={!ready || busy || rendering} unavailable={!job?.hasCaptionArchive} onApply={() => void send("Apply saved brand kit", { applyBrand: true })} />
              <CaptionRestyle
                key={`captions-${activeId}`}
                available={!!job?.hasCaptionArchive}
                disabled={!ready || busy || rendering}
                loadCues={() =>
                  getCaptionCues({ jobId: activeId }) as Promise<
                    { start: number; end: number; text: string }[]
                  >
                }
                onApply={(style, texts, position, font) =>
                  void send(
                    style === "none"
                      ? "Remove TakeOne captions"
                      : `Edit captions: ${style}`,
                    {
                      captionStyle: style,
                      captionTexts: texts,
                      captionPosition: position,
                      captionFont: font,
                    },
                  )
                }
              />
              <MusicPicker
                value={music}
                onChange={setMusic}
                disabled={!ready || busy || rendering}
              />
              {music && (
                <button
                  disabled={!ready || busy || rendering}
                  onClick={() => void send("Add selected soundtrack")}
                  className="rounded-xl bg-ink px-4 py-2 text-sm text-white"
                >
                  Apply soundtrack · uses 1 generation
                </button>
              )}
              {/* Edit console */}
              <div className="flex flex-col rounded-2xl border border-black/[0.07] bg-white p-4">
                <h2 className="font-display text-lg font-bold leading-none">
                  Edit with AI
                </h2>
                <p className="mt-1.5 font-mono text-[11px] text-muted">
                  Describe a change and preview the result
                </p>

                {/* Quick edits */}
                <div className="mt-5 flex flex-wrap gap-2">
                  {QUICK_EDITS.map((q) => (
                    <button
                      key={q.label}
                      onClick={() => void send(q.label, { transforms: { aspect: format.aspect, fit: format.fit, ...q.transforms } })}
                      disabled={!ready || busy || rendering}
                      className="rounded-full border border-line bg-paper px-3.5 py-1.5 text-xs font-medium transition-colors hover:border-ink hover:text-cueInk disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>

                {/* Chat log */}
                <div className="mt-4 max-h-60 space-y-2.5 overflow-y-auto pr-1">
                  {messages.length === 0 && (
                    <div className="flex h-full flex-col items-start justify-center gap-1.5">
                      <p className="font-sans text-sm text-ink/80">
                        Tell it how to change the reel.
                      </p>
                      <p className="font-mono text-[11px] leading-relaxed text-muted">
                        “make it square” · “add a watermark”
                        <br />
                        “add captions” · “speed it up 1.5x”
                      </p>
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={
                        m.role === "user"
                          ? "flex justify-end"
                          : "flex justify-start"
                      }
                    >
                      <span
                        className={`inline-block max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${m.role === "user" ? "rounded-br-md bg-ink text-white" : "rounded-bl-md border border-black/[0.06] bg-paper text-ink"}`}
                      >
                        {m.text}
                      </span>
                    </div>
                  ))}
                  {rendering && !!job?.hasSource && (
                    <div className="flex items-center gap-2 font-mono text-xs text-muted">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted/30 border-t-muted" />{" "}
                      rendering…
                    </div>
                  )}
                </div>

                {/* Composer */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send(instruction);
                  }}
                  className="mt-4 flex items-center gap-2"
                >
                  <input
                    aria-label="Describe an edit"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder={
                      ready
                        ? "Describe an edit…"
                        : rendering
                          ? "Rendering…"
                          : "Waiting for the reel…"
                    }
                    disabled={!ready || busy || rendering}
                    className="min-w-0 flex-1 rounded-2xl border border-line bg-paper px-4 py-3 font-sans text-sm outline-none transition-colors focus:border-ink disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={
                      !ready || busy || rendering || !instruction.trim()
                    }
                    className="group flex items-center gap-1.5 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-cue disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                  >
                    Edit{" "}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </form>
                {edits > 0 && (
                  <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-wider text-muted">
                    {edits} edit{edits > 1 ? "s" : ""} · each edit uses 1
                    generation
                  </p>
                )}
              </div>
            </div>
          }
          activity=<section
            aria-label="Render activity"
            className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
          >
            <div>
              <RenderProgress key={job?._id} job={job} />
              {job?.parentJobId && rendering && (
                <p className="mt-1 text-xs text-muted">
                  Your previous version stays available while this edit renders.
                </p>
              )}
            </div>
            {job && (
              <TelegramDeliveryStatus
                key={`delivery-${job._id}`}
                jobId={job._id}
                status={job.telegramDeliveryStatus}
              />
            )}
          </section>
        />
      </main>
    </>
  );
}
