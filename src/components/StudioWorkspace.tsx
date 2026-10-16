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
      <section aria-label="Video canvas" className="studio-canvas">
        <div className="studio-canvas-label">
          <span>Current cut</span>
          <span>Preview is free</span>
        </div>
        {canvas}
      </section>
      <section aria-label="Video timeline" className="studio-timeline">
        {timeline}
      </section>
      <nav aria-label="Workspace panels" className="studio-panel-switcher">
        {(["inspector", "versions"] as const).map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={panel === name}
            aria-controls={`studio-${name}`}
            onClick={() => setPanel(name)}
          >
            {name === "inspector" ? "Inspector" : "Versions"}
          </button>
        ))}
      </nav>
      <aside
        id="studio-versions"
        aria-label="Project versions"
        className="studio-versions"
        data-active={panel === "versions"}
      >
        <div className="studio-panel-heading">
          <h2>Project</h2>
          <p>Keep every cut. Open a saved version to make a new edit.</p>
        </div>
        {versions}
      </aside>
      <aside
        id="studio-inspector"
        aria-label="Inspector"
        className="studio-inspector"
        data-active={panel === "inspector"}
      >
        <div className="studio-panel-heading">
          <h2>Inspector</h2>
          <p>
            Preview changes and save project drafts for free. Applying a rendered
            video edit or exporting a saved project uses one generation.
          </p>
        </div>
        {inspector}
      </aside>
      <div className="studio-activity">{activity}</div>
    </div>
  );
}
