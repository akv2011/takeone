import { useState, type ReactNode } from "react";
import "./StudioWorkspace.css";

/** Slots keep the existing owner-scoped editing controls mounted across mobile tabs. */
export function StudioWorkspace({
  canvas,
  timeline,
  inspector,
  versions,
  activity,
}: {
  canvas: ReactNode;
  timeline: ReactNode;
  inspector: ReactNode;
  versions: ReactNode;
  activity: ReactNode;
}) {
  const [panel, setPanel] = useState<"inspector" | "versions">("inspector");
  return (
    <div className="studio-workspace">
      <section aria-label="Video canvas" className="studio-canvas rounded-[10px] border border-ink2 bg-ink p-4 text-surface">
        <div className="mb-4 flex justify-between gap-3 text-sm font-semibold text-line">
          <span>Current cut</span>
          <span className="font-normal">Preview is free</span>
        </div>
        {canvas}
      </section>
      <section aria-label="Video timeline" className="studio-timeline space-y-4">
        {timeline}
      </section>
      <nav aria-label="Workspace panels" className="studio-panel-switcher flex gap-2">
        {(["inspector", "versions"] as const).map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={panel === name}
            aria-controls={`studio-${name}`}
            onClick={() => setPanel(name)}
            className="flex-1 rounded-md border border-line bg-surface p-2.5 text-sm font-semibold text-ink aria-pressed:border-ink aria-pressed:bg-cue"
          >
            {name === "inspector" ? "Inspector" : "Versions"}
          </button>
        ))}
      </nav>
      <aside
        id="studio-versions"
        aria-label="Project versions"
        className="studio-versions space-y-4"
        data-active={panel === "versions"}
      >
        <div className="px-1">
          <h2 className="text-lg font-semibold">Project</h2>
          <p className="mt-1 text-sm text-muted">Keep every cut. Open a saved version to make a new edit.</p>
        </div>
        {versions}
      </aside>
      <aside
        id="studio-inspector"
        aria-label="Inspector"
        className="studio-inspector space-y-4"
        data-active={panel === "inspector"}
      >
        <div className="px-1">
          <h2 className="text-lg font-semibold">Inspector</h2>
          <p className="mt-1 text-sm text-muted">
            Preview changes and save project drafts for free. Applying a rendered
            video edit or exporting a saved project uses one generation.
          </p>
        </div>
        {inspector}
      </aside>
      <div className="studio-activity rounded-[10px] border border-line bg-surface">{activity}</div>
    </div>
  );
}
