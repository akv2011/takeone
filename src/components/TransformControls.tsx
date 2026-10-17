import { FrameCorners } from "@phosphor-icons/react";
import { InspectorSection, GenerationCost } from "./StudioWorkspace";
import type { OutputAspect, OutputFit } from "../lib/editTransforms";
import { button, field, fieldsetPanel, label, legend } from "../lib/ui";
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
    <InspectorSection title="Transform video" icon={FrameCorners} defaultOpen help="Framing preview is free and approximate. Automatic crop may adjust subject focus. Fit adds a blurred background in the export. Existing captions and marks may be cropped."><fieldset
      disabled={disabled}
      className={`${fieldsetPanel} disabled:opacity-50`}
    >
      <legend className={legend}>Transform</legend>
      <label className={`block ${label}`}>
        Output ratio
        <select
          value={aspect}
          onChange={(e) =>
            onChange({ aspect: e.target.value as OutputAspect, fit })
          }
          className={`${field} mt-1 w-full`}
        >
          <option value="9:16">Portrait · 9:16</option>
          <option value="1:1">Square · 1:1</option>
          <option value="16:9">Landscape · 16:9</option>
        </select>
      </label>
      <label className={`mt-3 block ${label}`}>
        Frame sizing
        <select
          value={fit}
          onChange={(e) =>
            onChange({ aspect, fit: e.target.value as OutputFit })
          }
          className={`${field} mt-1 w-full`}
        >
          <option value="crop">Crop to fill</option>
          <option value="fit">Fit whole video</option>
        </select>
      </label>
      <div className="studio-cost-action"><button
        type="button"
        onClick={onApply}
        className={`${button("primary", "sm")} mt-3`}
      >
        Apply framing
      </button><GenerationCost /></div>
    </fieldset></InspectorSection>
  );
}
