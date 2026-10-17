import { Scissors } from "@phosphor-icons/react";
import { GenerationCost, HelpNote } from "./StudioWorkspace";
import { useState } from "react";
import type { EditTransforms } from "../lib/editTransforms";
import { FramePreviews } from "./FramePreviews";
import { button, field, fieldsetPanel, label, legend } from "../lib/ui";

const timestamp = (seconds: number) => {
  const ms = Math.round(seconds * 1000);
  const whole = Math.floor(ms / 1000);
  const fraction = ms % 1000;
  return `${Math.floor(whole / 60)
    .toString()
    .padStart(
      2,
      "0",
    )}:${(whole % 60).toString().padStart(2, "0")}${fraction ? `.${fraction.toString().padStart(3, "0")}` : ""}`;
};
const preciseSeconds = (value: string) => /^\d+(?:\.\d{1,3})?$/.test(value);

export function TimelineControls({
  duration,
  videoUrl,
  disabled,
  currentTime = 0,
  onSeek,
  readCurrentTime,
  onPreview,
  onApply,
  onApplyTransforms,
}: {
  duration?: number;
  videoUrl?: string;
  disabled: boolean;
  currentTime?: number;
  onSeek?(seconds: number): void;
  readCurrentTime?(): number | undefined;
  onPreview(start: number, end: number, speed: number): void;
  onApply?(instruction: string): void;
  onApplyTransforms?(transforms: EditTransforms): void;
}) {
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("");
  const [speed, setSpeed] = useState("1");
  const limit =
    duration !== undefined && Number.isFinite(duration) && duration >= 0.001
      ? Math.floor(Math.min(duration, 300) * 1000) / 1000
      : undefined;
  const clamp = (value: number) =>
    Math.max(0, Math.min(limit ?? 0, Number.isFinite(value) ? value : 0));
  const playhead = clamp(currentTime);
  const mark = (set: (value: string) => void) => {
    const value = readCurrentTime?.();
    if (
      !disabled &&
      limit !== undefined &&
      value !== undefined &&
      Number.isFinite(value)
    )
      set(String(Math.round(clamp(value) * 1000) / 1000));
  };
  const from = Number(start),
    to = Number(end);
  const valid =
    preciseSeconds(start) &&
    preciseSeconds(end) &&
    Number.isFinite(from) &&
    Number.isFinite(to) &&
    from >= 0 &&
    to > from &&
    to <= Math.min(duration ?? 300, 300);
  const outputDuration = (to - from) / Number(speed);
  const withinExportLimit = outputDuration <= 300;
  const instruction = `Trim ${timestamp(from)} to ${timestamp(to)}${speed !== "1" ? ` and speed ${speed}x` : ""}`;
  return (
    <fieldset
      disabled={disabled}
      className={`${fieldsetPanel} min-w-0 w-full disabled:opacity-50`}
    >
      <legend className={`${legend} !text-sm `}><Scissors size={18} weight="regular" className="mr-2 inline" aria-hidden="true" />Trim & speed</legend>
      <div className="mb-3"><HelpNote>Select a frame to seek, then use the player to fine-tune. Times refer to the current video. Use decimals for fine cuts. Export boundaries follow source frames. Preview is free. Applying uses one generation.</HelpNote></div>
      {onSeek && videoUrl && (
        <div className="timeline-strip film-strip"><FramePreviews
          key={videoUrl}
          url={videoUrl}
          disabled={disabled}
          onSeek={onSeek}
        /><div className="timeline-edge edge-print"><span>TAKEONE 5063</span><span>▶ {timestamp(playhead)}</span></div><span className="timeline-playhead" style={{ left: `${limit ? playhead / limit * 100 : 0}%` }} /></div>
      )}
      <div className="timeline-ticks" aria-hidden="true">{[0, 1, 2, 3, 4].map(tick => <span key={tick}>{limit === undefined ? "--:--" : timestamp(limit * tick / 4)}</span>)}</div>
      <details className="mt-3 border-t border-line pt-3"><summary className="cursor-pointer text-sm font-medium">Trim controls</summary><div className="mt-3">
      {onSeek && (
        <div className="mb-4 rounded-control bg-paper/60 p-3">
          <div className="mb-2 flex justify-between font-mono text-[13px] text-ink2">
            <span>{timestamp(playhead)}</span>
            <span>
              {limit === undefined ? "Loading duration…" : timestamp(limit)}
            </span>
          </div>
          <div
            aria-hidden="true"
            className="relative mb-2 h-5 overflow-hidden  bg-line"
          >
            {limit !== undefined && valid && (
              <div
                className="absolute inset-y-0 bg-ink/15"
                style={{
                  left: `${(from / limit) * 100}%`,
                  width: `${((to - from) / limit) * 100}%`,
                }}
              />
            )}
            {limit !== undefined && (
              <div
                className="absolute inset-y-0 w-0.5 bg-signal"
                style={{ left: `calc(${(playhead / limit) * 100}% - 1px)` }}
              />
            )}
          </div>
          <label className={`block ${label}`}>
            Seek video
            <input
              type="range"
              min="0"
              max={limit ?? 0}
              step="0.001"
              value={playhead}
              disabled={disabled || limit === undefined}
              onChange={(e) => onSeek(Number(e.target.value))}
              className="mt-1 block w-full accent-ink"
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled || limit === undefined || !readCurrentTime}
              onClick={() => mark(setStart)}
              className={button("secondary", "sm")}
            >
              Set start here
            </button>
            <button
              type="button"
              disabled={disabled || limit === undefined || !readCurrentTime}
              onClick={() => mark(setEnd)}
              className={button("secondary", "sm")}
            >
              Set end here
            </button>
          </div>
          <label className={`mt-3 block ${label}`}>
            Selection start
            <input
              type="range"
              min="0"
              max={Math.max(
                0,
                (preciseSeconds(end) && to > 0 ? clamp(to) : (limit ?? 0)) -
                  0.001,
              )}
              step="0.001"
              value={clamp(from)}
              disabled={disabled || limit === undefined}
              onChange={(e) => {
                setStart(e.target.value);
                onSeek(Number(e.target.value));
              }}
              className="mt-1 block w-full accent-ink"
            />
          </label>
          <label className={`mt-2 block ${label}`}>
            Selection end
            <input
              type="range"
              min={Math.min(limit ?? 0, clamp(from) + 0.001)}
              max={limit ?? 0}
              step="0.001"
              value={end === "" ? (limit ?? 0) : clamp(to)}
              disabled={disabled || limit === undefined}
              onChange={(e) => {
                setEnd(e.target.value);
                onSeek(Number(e.target.value));
              }}
              className="mt-1 block w-full accent-ink"
            />
          </label>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          Start (seconds)
          <input
            type="number"
            min="0"
            step="0.001"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={`${field} mt-1 w-full`}
          />
        </label>
        <label className={label}>
          End (seconds)
          <input
            type="number"
            min="0.001"
            max={Math.min(duration ?? 300, 300)}
            step="0.001"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={`${field} mt-1 w-full`}
          />
        </label>
      </div>
      <label className={`mt-3 block ${label}`}>
        Playback speed
        <select
          value={speed}
          onChange={(e) => setSpeed(e.target.value)}
          className={`${field} ml-2`}
        >
          {["0.5", "1", "1.5", "2", "3"].map((value) => (
            <option key={value} value={value}>
              {value}×
            </option>
          ))}
        </select>
      </label>
      {end !== "" && !valid && (
        <p role="alert" className="mt-2 text-[13px] text-warn">
          Use up to three decimal places, with the end after the start, within
          the video (maximum 300 seconds).
        </p>
      )}
      {valid && !withinExportLimit && (
        <p role="alert" className="mt-2 text-[13px] text-warn">
          The edited video would exceed 300 seconds. Shorten the selection or
          increase the speed before applying.
        </p>
      )}
      {valid && (
        <p className="mt-2 text-[13px] text-ink2">
          Result: approximately {((to - from) / Number(speed)).toFixed(1)}{" "}
          seconds.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!valid || disabled}
          onClick={() => onPreview(from, to, Number(speed))}
          className={button("secondary", "sm")}
        >
          Preview selection
        </button>
        <div className="studio-cost-action"><button
          type="button"
          disabled={!valid || !withinExportLimit || disabled}
          onClick={() =>
            onApplyTransforms
              ? onApplyTransforms({
                  trim: { start: from, end: to },
                  speed: Number(speed) as EditTransforms["speed"],
                })
              : onApply?.(instruction)
          }
          className={button("primary", "sm")}
        >
          Apply edit
        </button><GenerationCost /></div>
      </div>
      </div></details>
    </fieldset>
  );
}
