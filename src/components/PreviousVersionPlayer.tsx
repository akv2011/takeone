import { FilmStrip } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../lib/convexApi";
import { useVideoUrl } from "../lib/useVideoUrl";
import { button } from "../lib/ui";

export function PreviousVersionPlayer({ jobId }: { jobId: string }) {
  const { isAuthenticated } = useConvexAuth();
  const previous = useQuery(
    api.generate.getJob,
    isAuthenticated ? { jobId } : "skip",
  ) as
    | {
        _id: string;
        status: string;
        hasOutput: boolean;
        resultUrl?: string | null;
      }
    | null
    | undefined;
  const available = previous?.status === "done";
  const { url, error, refresh } = useVideoUrl(
    available ? previous._id : undefined,
    available ? previous.hasOutput : undefined,
    available ? previous.resultUrl : undefined,
  );
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      {url ? (
        <video
          aria-label="Previous completed version"
          src={url}
          controls
          playsInline
          className="min-h-0 w-full flex-1 object-contain"
        />
      ) : (
        <div className="w-full px-4 text-center text-sm text-surface">
          <div aria-hidden="true" className="studio-skeleton mx-auto w-24" />
          <p role={previous === undefined ? "status" : undefined}>
            {previous === undefined
              ? "Loading the previous version…"
              : "Previous video preview is unavailable."}
          </p>
        </div>
      )}
      <Link
        to={`/studio/${jobId}`}
        className={`${button("primary", "sm")} mb-3`}
      >
        Open previous version
      </Link>
      {error && (
        <button
          type="button"
          onClick={() => void refresh()}
          className="px-3 pb-3 text-[13px] font-semibold text-surface underline underline-offset-4"
        >
          Reload previous video preview
        </button>
      )}
    </div>
  );
}

export function VersionThumbnail({
  jobId,
  ready,
}: {
  jobId: string;
  ready: boolean;
}) {
  const { isAuthenticated } = useConvexAuth();
  const { user } = useAuth();
  const sign = useAction(api.generate.getCover);
  const scope = `${user?.id ?? ""}:${jobId}`;
  const [image, setImage] = useState<{ scope: string; url: string }>();
  useEffect(() => {
    let active = true;
    if (!isAuthenticated || !user?.id || !ready) return;
    void sign({ jobId })
      .then((result: unknown) => {
        if (
          active &&
          result &&
          typeof result === "object" &&
          "url" in result &&
          typeof result.url === "string" &&
          result.url.startsWith("https://")
        )
          setImage({ scope, url: result.url });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isAuthenticated, user?.id, jobId, ready, scope, sign]);
  const url =
    ready && isAuthenticated && image?.scope === scope ? image.url : undefined;
  return (
    <span className="version-thumbnail" aria-hidden="true">
      {url ? (
        <img src={url} alt="" onError={() => setImage(undefined)} />
      ) : (
        <FilmStrip size={18} weight="regular" />
      )}
    </span>
  );
}
