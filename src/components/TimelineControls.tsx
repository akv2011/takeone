import { useState } from "react";
import type { EditTransforms } from "../lib/editTransforms";
import { FramePreviews } from "./FramePreviews";

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
      className="min-w-0 w-full rounded-2xl border border-black/10 bg-white p-4 disabled:opacity-50"
    >
      <legend className="px-1 text-sm font-semibold">Trim & speed</legend>
      <p className="mb-3 text-xs text-muted">
        Times refer to the current video; decimals allow fine cuts. Export
        boundaries follow source frames. Preview is free; applying uses 1
        generation.
      </p>
      {onSeek && videoUrl && (
        <FramePreviews
          key={videoUrl}
          url={videoUrl}
          disabled={disabled}
          onSeek={onSeek}
        />
      )}
      {onSeek && (
        <div className="mb-4 rounded-xl bg-paper p-3">
          <div className="mb-2 flex justify-between font-mono text-[10px] text-muted">
            <span>{timestamp(playhead)}</span>
            <span>
              {limit === undefined ? "Loading duration…" : timestamp(limit)}
            </span>
          </div>
          <div
            aria-hidden="true"
            className="relative mb-2 h-5 overflow-hidden rounded bg-ink/10"
          >
            {limit !== undefined && valid && (
              <div
                className="absolute inset-y-0 bg-cue/35"
                style={{
                  left: `${(from / limit) * 100}%`,
                  width: `${((to - from) / limit) * 100}%`,
                }}
              />
            )}
            {limit !== undefined && (
              <div
                className="absolute inset-y-0 w-0.5 bg-ink"
                style={{ left: `calc(${(playhead / limit) * 100}% - 1px)` }}
              />
            )}
          </div>
          <label className="block text-xs">
            Seek video
            <input
              type="range"
              min="0"
              max={limit ?? 0}
              step="0.001"
              value={playhead}
              disabled={disabled || limit === undefined}
              onChange={(e) => onSeek(Number(e.target.value))}
              className="mt-1 block w-full accent-cue"
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled || limit === undefined || !readCurrentTime}
              onClick={() => mark(setStart)}
              className="rounded-lg border border-black/15 bg-white px-2 py-2 text-xs disabled:opacity-40"
            >
              Set start here
            </button>
            <button
              type="button"
              disabled={disabled || limit === undefined || !readCurrentTime}
              onClick={() => mark(setEnd)}
              className="rounded-lg border border-black/15 bg-white px-2 py-2 text-xs disabled:opacity-40"
            >
              Set end here
            </button>
          </div>
          <label className="mt-3 block text-xs">
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
              className="mt-1 block w-full accent-cue"
            />
          </label>
          <label className="mt-2 block text-xs">
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
              className="mt-1 block w-full accent-cue"
            />
          </label>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs">
          Start (seconds)
          <input
            type="number"
            min="0"
            step="0.001"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 w-full rounded-lg border p-2"
          />
        </label>
        <label className="text-xs">
          End (seconds)
          <input
            type="number"
            min="0.001"
            max={Math.min(duration ?? 300, 300)}
            step="0.001"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="mt-1 w-full rounded-lg border p-2"
          />
        </label>
      </div>
      <label className="mt-3 block text-xs">
        Playback speed
        <select
          value={speed}
          onChange={(e) => setSpeed(e.target.value)}
          className="ml-2 rounded-lg border p-2"
        >
          {["0.5", "1", "1.5", "2", "3"].map((value) => (
            <option key={value} value={value}>
              {value}×
            </option>
          ))}
        </select>
      </label>
      {end !== "" && !valid && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          Use up to three decimal places, with the end after the start, within
          the video (maximum 300 seconds).
        </p>
      )}
      {valid && !withinExportLimit && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          The edited video would exceed 300 seconds. Shorten the selection or
          increase the speed before applying.
        </p>
      )}
      {valid && (
        <p className="mt-2 text-xs text-muted">
          Result: approximately {((to - from) / Number(speed)).toFixed(1)}{" "}
          seconds.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!valid || disabled}
          onClick={() => onPreview(from, to, Number(speed))}
          className="rounded-lg border px-3 py-2 text-xs disabled:opacity-40"
        >
          Preview selection
        </button>
        <button
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
          className="rounded-lg bg-ink px-3 py-2 text-xs text-white disabled:opacity-40"
        >
          Apply trim & speed · 1 generation
        </button>
      </div>
    </fieldset>
  );
}
