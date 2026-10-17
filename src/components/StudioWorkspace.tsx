import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FilmStrip, Info, SlidersHorizontal, SquaresFour, type Icon } from "@phosphor-icons/react";
import { Tooltip } from "./Tooltip";
import "./StudioWorkspace.css";

export function GenerationTicket({ count = 1 }: { count?: number }) {
  return <span className="generation-ticket">{count} {count === 1 ? "generation" : "generations"}</span>;
}

export function HelpNote({ children }: { children: string }) {
  return <Tooltip label={children} side="bottom"><button type="button" aria-label="How this works" className="studio-help"><Info size={16} weight="regular" aria-hidden="true" /><span>How this works</span></button></Tooltip>;
}

export function InspectorSection({ title, icon: Icon, help, children, defaultOpen = false }: {
  title: string; icon: Icon; help?: string; children: ReactNode; defaultOpen?: boolean;
}) {
  return <details className="inspector-section" open={defaultOpen}>
    <summary><Icon size={19} weight="regular" aria-hidden="true" /><span>{title}</span><span className="inspector-toggle" aria-hidden="true" /></summary>
    <div className="inspector-content">{help && <HelpNote>{help}</HelpNote>}{children}</div>
  </details>;
}

export function PanelState({ children, error = false, loading = false }: { children: ReactNode; error?: boolean; loading?: boolean }) {
  return <div role={error ? "alert" : loading ? "status" : undefined} className={`studio-panel-state ${error ? "text-signal" : "text-ink2"}`}>
    {loading && <div aria-hidden="true" className="studio-skeleton" />}<p>{children}</p>
  </div>;
}

export function StudioWorkspace({ canvas, timeline, inspector, versions, activity }: {
  canvas: ReactNode; timeline: ReactNode; inspector: ReactNode; versions: ReactNode; activity: ReactNode;
}) {
  const [panel, setPanel] = useState<"inspector" | "versions">("inspector");
  const reduced = useReducedMotion();
  return <div className="studio-workspace">
    <section aria-label="Video canvas" className="studio-canvas">
      <div className="studio-canvas-label"><span><FilmStrip size={16} aria-hidden="true" /> Current cut</span><span>Preview / free</span></div>
      {canvas}
    </section>
    <section aria-label="Video timeline" className="studio-timeline">{timeline}</section>
    <nav aria-label="Workspace panels" className="studio-panel-switcher">
      {(["versions", "inspector"] as const).map(name => <button key={name} type="button" aria-pressed={panel === name} aria-controls={`studio-${name}`} onClick={() => setPanel(name)}>
        {name === "versions" ? <SquaresFour size={17} aria-hidden="true" /> : <SlidersHorizontal size={17} aria-hidden="true" />}{name === "versions" ? "Project" : "Inspector"}
        {panel === name && <motion.span className="studio-tab-line" layoutId="studio-panel-tab" transition={{ duration: reduced ? 0 : 0.18 }} />}
      </button>)}
    </nav>
    <aside id="studio-versions" aria-label="Project versions" className="studio-versions" data-active={panel === "versions"}>
      <div className="studio-panel-heading"><span className="eyebrow">01 / Project</span><SquaresFour size={17} aria-hidden="true" /></div>{versions}
    </aside>
    <aside id="studio-inspector" aria-label="Inspector" className="studio-inspector" data-active={panel === "inspector"}>
      <div className="studio-panel-heading"><span className="eyebrow">02 / Inspector</span><SlidersHorizontal size={17} aria-hidden="true" /></div>{inspector}
    </aside>
    <div className="studio-activity">{activity}</div>
  </div>;
}
