import type { OutputAspect, OutputFit } from "../lib/editTransforms";
export function TransformControls({
  aspect,
  fit,
  disabled,
  onChange,
  onApply,
}: {
  aspect: OutputAspect;
  fit: OutputFit;
  disabled: boolean;
  onChange(value: { aspect: OutputAspect; fit: OutputFit }): void;
  onApply(): void;
}) {
  return (
    <fieldset
      disabled={disabled}
      className="rounded-2xl border border-black/10 bg-white p-4 disabled:opacity-50"
    >
      <legend className="px-1 text-sm font-semibold">Transform</legend>
      <label className="block text-xs">
        Output ratio
        <select
          value={aspect}
          onChange={(e) =>
            onChange({ aspect: e.target.value as OutputAspect, fit })
          }
          className="mt-1 w-full rounded-lg border p-2"
        >
          <option value="9:16">Portrait · 9:16</option>
          <option value="1:1">Square · 1:1</option>
          <option value="16:9">Landscape · 16:9</option>
        </select>
      </label>
      <label className="mt-3 block text-xs">
        Frame sizing
        <select
          value={fit}
          onChange={(e) =>
            onChange({ aspect, fit: e.target.value as OutputFit })
          }
          className="mt-1 w-full rounded-lg border p-2"
        >
          <option value="crop">Crop to fill</option>
          <option value="fit">Fit whole video</option>
        </select>
      </label>
      <p className="mt-3 text-xs text-muted">
        Framing preview is free and approximate. Automatic crop may adjust
        subject focus; Fit adds a blurred background in the export. Existing
        captions and marks in the video may be cropped.
      </p>
      <button
        type="button"
        onClick={onApply}
        className="mt-3 rounded-lg bg-ink px-3 py-2 text-xs text-white"
      >
        Apply framing · 1 generation
      </button>
    </fieldset>
  );
}
