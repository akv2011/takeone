import { useId, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  CaretDown,
  FilmStrip,
  Info,
  SlidersHorizontal,
  SquaresFour,
  WarningCircle,
  type Icon,
} from "@phosphor-icons/react";
import { Tooltip } from "./Tooltip";
import "./StudioWorkspace.css";

export function GenerationCost({ count = 1 }: { count?: number }) {
  return (
    <span className="generation-cost">
      {count} {count === 1 ? "generation" : "generations"}
    </span>
  );
}

export function HelpNote({ children }: { children: string }) {
  return (
    <Tooltip label={children} side="bottom">
      <button type="button" aria-label="How this works" className="studio-help">
        <Info size={18} weight="regular" aria-hidden="true" />
        <span>How this works</span>
      </button>
    </Tooltip>
  );
}

export function InspectorSection({
  title,
  icon: Icon,
  help,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: Icon;
  help?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const body = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  return (
    <section className="inspector-section" data-open={open}>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
          className="inspector-trigger"
        >
          <Icon size={18} weight="regular" aria-hidden="true" />
          <span>{title}</span>
          <CaretDown
            size={16}
            weight="regular"
            className="inspector-chevron"
            aria-hidden="true"
          />
        </button>
      </h3>
      <motion.div
        ref={body}
        id={id}
        initial={false}
        style={{ overflow: defaultOpen ? "visible" : "hidden" }}
        onAnimationStart={() => {
          if (body.current) body.current.style.overflow = "hidden";
        }}
        onAnimationComplete={() => {
          if (body.current)
            body.current.style.overflow = open ? "visible" : "hidden";
        }}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : 0.2, ease: [0.2, 0.8, 0.2, 1] }}
        aria-hidden={!open}
        inert={!open}
        className="inspector-body"
      >
        <div className="inspector-content">
          {help && <HelpNote>{help}</HelpNote>}
          {children}
        </div>
      </motion.div>
    </section>
  );
}

export function PanelState({
  children,
  error = false,
  loading = false,
}: {
  children: ReactNode;
  error?: boolean;
  loading?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : loading ? "status" : undefined}
      className={`studio-panel-state ${error ? "text-grease" : "text-ink2"}`}
    >
      {error ? (
        <WarningCircle size={20} weight="regular" aria-hidden="true" />
      ) : (
        <div
          aria-hidden="true"
          className={`state-frames ${loading ? "is-loading" : ""}`}
        >
          <i />
          <i />
          <i />
        </div>
      )}
      <p>{children}</p>
    </div>
  );
}

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
  const reduced = useReducedMotion();
  return (
    <div className="studio-workspace">
      <div className="studio-center">
        <section aria-label="Video canvas" className="studio-canvas">
          <div className="studio-canvas-label">
            <span>
              <FilmStrip size={18} weight="regular" aria-hidden="true" />{" "}
              Current cut
            </span>
            <span>Free preview</span>
          </div>
          {canvas}
        </section>
        <section aria-label="Video timeline" className="studio-timeline">
          {timeline}
        </section>
        <div className="studio-activity glass rounded-card">{activity}</div>
      </div>
      <nav
        aria-label="Workspace panels"
        className="studio-panel-switcher glass rounded-card"
      >
        {(["versions", "inspector"] as const).map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={panel === name}
            aria-controls={`studio-${name}`}
            onClick={() => setPanel(name)}
          >
            {name === "versions" ? (
              <SquaresFour size={18} weight="regular" aria-hidden="true" />
            ) : (
              <SlidersHorizontal
                size={18}
                weight="regular"
                aria-hidden="true"
              />
            )}
            {name === "versions" ? "Project" : "Inspector"}
            {panel === name && (
              <motion.span
                className="studio-tab-line"
                layoutId="studio-panel-tab"
                transition={{ duration: reduced ? 0 : 0.2 }}
              />
            )}
          </button>
        ))}
      </nav>
      <aside
        id="studio-versions"
        aria-label="Project versions"
        className="studio-versions glass rounded-card"
        data-active={panel === "versions"}
      >
        <div className="studio-panel-heading">
          <span>Project</span>
          <SquaresFour size={18} weight="regular" aria-hidden="true" />
        </div>
        {versions}
      </aside>
      <aside
        id="studio-inspector"
        aria-label="Inspector"
        className="studio-inspector glass rounded-card"
        data-active={panel === "inspector"}
      >
        <div className="studio-panel-heading">
          <span>Inspector</span>
          <SlidersHorizontal size={18} weight="regular" aria-hidden="true" />
        </div>
        {inspector}
      </aside>
    </div>
  );
}
