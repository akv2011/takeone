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
import { ArrowLeft } from "lucide-react";
import TakeOneLogo from "../components/TakeOneLogo";
import { useVideoUrl } from "../lib/useVideoUrl";
import { MusicPicker, type MusicSelection } from "../components/MusicPicker";
import { api } from "../lib/convexApi";
import { CaptionRestyle } from "../components/CaptionRestyle";
import { TimelineControls } from "../components/TimelineControls";
import { useTimelinePlayer } from "../hooks/useTimelinePlayer";
import { button, field, panel } from "../lib/ui";

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
const VERSION_STATUS: Record<string, string> = { done: "Ready", queued: "Queued", dispatched: "Starting", processing: "Rendering", failed: "Failed", cancelled: "Cancelled" };
const RENDER_STATUS: Record<string, string> = { queued: "Waiting for a render slot…", dispatched: "Starting your render…", processing: "Rendering…" };
const QUICK_EDITS: { label: string; transforms: EditTransforms }[] = [
  { label: "Make it square (1:1)", transforms: { aspect: "1:1" } },
  { label: "Make it landscape (16:9)", transforms: { aspect: "16:9" } },
  { label: "Fit without cropping", transforms: { fit: "fit" } },
  { label: "Speed it up 1.5x", transforms: { speed: 1.5 } },
];

export default function Studio() {
  const { user } = useUser();
  return (
    <div className="min-h-screen overflow-x-hidden bg-paper text-ink">
      <SignedOut>
        <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <Link to="/" className="mb-8 flex items-center gap-2">
            <TakeOneLogo className="h-10 w-10 text-ink" />
            <span className="font-display text-2xl font-bold">
              TakeOne
            </span>
          </Link>
          <h1 className="font-display text-4xl font-extrabold md:text-5xl">
            Sign in to open Studio
          </h1>
          <p className="mt-3 max-w-sm text-sm text-muted">
            Studio holds your captions, trims, framing, music and versions.
          </p>
          <SignInButton mode="modal">
            <button className={`${button("primary")} mt-7`}>
              Continue with Google
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
        { role: "system", text: "Done. Playing the updated video." },
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
                ? "You're out of credits. Buy a pack on the pricing page to keep editing."
                : "The edit could not be queued. Check your connection and try again.",
        },
      ]);
    } finally {
      if (submittedView === viewEpoch.current) setBusy(false);
    }
  };

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-3.5 sm:px-6">
          <Link
            to="/create"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink underline-offset-4 hover:underline"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Back to your videos
          </Link>
          <Link to="/" className="flex items-center gap-2">
            <TakeOneLogo className="h-8 w-8 text-ink" />
            <span className="font-display text-xl font-bold">
              TakeOne
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-3 pb-8 pt-6 sm:px-6">
        <h1 className="mb-6 line-clamp-2 text-balance break-words font-display text-3xl font-extrabold leading-tight md:text-4xl">
          {job?.prompt || "Your video"}
        </h1>

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
                      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-line">
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
                          <p className="px-4 text-center text-sm font-semibold text-surface">
                            This render failed. Open a completed version to keep editing.
                          </p>
                        ) : job?.status === "cancelled" ? (
                          <p className="px-4 text-center text-sm">
                            This generation was cancelled. Your allowance was
                            restored.
                          </p>
                        ) : (
                          <>
                            <span aria-hidden="true" className="h-6 w-6 animate-spin rounded-full border-2 border-surface/25 border-t-surface" />
                            <span className="text-sm">
                              {(job && RENDER_STATUS[job.status]) ?? "Loading…"}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {ready && soundtrack && (
                  <p className="text-xs text-line">
                    Soundtrack: {soundtrack.label}. {soundtrack.attribution}
                  </p>
                )}
                {videoError && (
                  <button
                    type="button"
                    className="text-sm font-semibold text-cue underline underline-offset-4"
                    onClick={() => void refresh()}
                  >
                    {videoError}
                  </button>
                )}
                {url && (
                  <a
                    href={url}
                    download
                    className={button("primary")}
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
                  className={`${panel} w-full p-4`}
                >
                  <h2 className="text-base font-semibold">Version history</h2>
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
                            ? "sticky top-0 z-10 rounded-md bg-surface"
                            : undefined
                        }
                      >
                        <Link
                          to={`/studio/${version._id}`}
                          aria-current={
                            activeId === version._id ? "page" : undefined
                          }
                          className={`block rounded-md border p-2 text-xs ${activeId === version._id ? "border-ink bg-cue" : "border-line bg-surface hover:border-muted"}`}
                        >
                          <span className="font-semibold">
                            {version.original ? "Original" : version.prompt}
                          </span>
                          <span className={`mt-1 block ${activeId === version._id ? "text-ink" : "text-muted"}`}>
                            {VERSION_STATUS[version.status] ?? version.status} ·{" "}
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
                      className={`${button("secondary", "sm")} mt-3`}
                    >
                      {versionPages.status === "LoadingMore"
                        ? "Loading older edits…"
                        : "Load older edits"}
                    </button>
                  )}
                  {job?.status === "failed" && (
                    <p className="mt-2 text-xs text-warn">
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
                  className={`${button("primary")} w-full`}
                >
                  Apply soundtrack · uses 1 generation
                </button>
              )}
              {/* Edit console */}
              <div className={`${panel} flex flex-col p-4`}>
                <h2 className="text-base font-semibold">
                  Edit with AI
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Describe a change in plain words. Each edit uses 1 generation.
                </p>

                {/* Quick edits */}
                <div className="mt-5 flex flex-wrap gap-2">
                  {QUICK_EDITS.map((q) => (
                    <button
                      key={q.label}
                      onClick={() => void send(q.label, { transforms: { aspect: format.aspect, fit: format.fit, ...q.transforms } })}
                      disabled={!ready || busy || rendering}
                      className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>

                {/* Chat log */}
                <div className="mt-4 max-h-60 space-y-2.5 overflow-y-auto pr-1">
                  {messages.length === 0 && (
                    <p className="text-sm text-muted">
                      Try "make it square", "add captions" or "speed it up 1.5x".
                    </p>
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
                        className={`inline-block max-w-[85%] break-words rounded-[10px] px-3.5 py-2 text-sm ${m.role === "user" ? "bg-ink text-surface" : "border border-line bg-paper text-ink"}`}
                      >
                        {m.text}
                      </span>
                    </div>
                  ))}
                  {rendering && !!job?.hasSource && (
                    <div role="status" className="flex items-center gap-2 text-sm text-muted">
                      <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-muted/30 border-t-muted" />
                      Rendering…
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
                          : "Waiting for the video…"
                    }
                    disabled={!ready || busy || rendering}
                    className={`${field} min-w-0 flex-1 disabled:cursor-not-allowed disabled:opacity-50`}
                  />
                  <button
                    type="submit"
                    disabled={
                      !ready || busy || rendering || !instruction.trim()
                    }
                    className={button("primary")}
                  >
                    Edit
                  </button>
                </form>
                {edits > 0 && (
                  <p className="mt-2 text-xs text-muted">
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
