import type { ScenePlan } from './scenes.js';
import type { Op, SavedScenePlan } from '../types.js';
import { wordsAtCaption } from '../media/timeline.js';

// Match the scene encoder's 30 fps grid, then the actual ordered timeline ops.
// These are planned shot boundaries, not frame-accurate footage annotations.
export function scenePlanAtOutput(plan: ScenePlan, ops: Op[]): SavedScenePlan {
  const duration = plan.scenes.at(-1)!.endSec;
  const scenes = plan.scenes.flatMap(scene => {
    const range = wordsAtCaption([{ text: '', start: Math.ceil(scene.startSec * 30) / 30,
      end: Math.min(duration, Math.ceil(scene.endSec * 30) / 30) }], ops)[0];
    return range ? [{ startSec: range.start, endSec: range.end, purpose: scene.purpose,
      searchTerms: [...scene.searchTerms], shotType: scene.shotType, motion: scene.motion }] : [];
  });
  if (!scenes.length || scenes.at(-1)!.endSec > 300) throw Error('Scene timeline exceeds video limits');
  return { version: 1, durationSec: scenes.at(-1)!.endSec, scenes };
}
