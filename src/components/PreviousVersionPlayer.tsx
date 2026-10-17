import { useConvexAuth, useQuery } from "convex/react";
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
