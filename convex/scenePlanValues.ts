import { v, ConvexError } from 'convex/values';
export const savedScenePlanValidator = v.object({
  version: v.literal(1), durationSec: v.number(), scenes: v.array(v.object({
    startSec: v.number(), endSec: v.number(), purpose: v.string(),
    searchTerms: v.array(v.string()), shotType: v.string(), motion: v.string(),
  })),
});
export type SavedScenePlan = { version: 1; durationSec: number; scenes: {
  startSec: number; endSec: number; purpose: string; searchTerms: string[]; shotType: string; motion: string;
}[] };
export function validateSavedScenePlan(plan: SavedScenePlan) {
  const text = (s: string, max: number) => s.trim().length > 0 && s.length <= max && !Array.from(s).some(c => c.charCodeAt(0) < 32);
  const invalid = () => { throw new ConvexError('INVALID_SCENE_PLAN'); };
  if (!Number.isFinite(plan.durationSec) || plan.durationSec <= 0 || plan.durationSec > 300 || plan.scenes.length < 1 || plan.scenes.length > 12) invalid();
  let end = 0;
  for (const scene of plan.scenes) {
    if (!Number.isFinite(scene.startSec) || !Number.isFinite(scene.endSec) || scene.startSec !== end || scene.endSec <= scene.startSec ||
      scene.endSec > plan.durationSec || !text(scene.purpose, 300) || !text(scene.shotType, 80) || !text(scene.motion, 120) ||
      scene.searchTerms.length < 1 || scene.searchTerms.length > 4 || !scene.searchTerms.every(t => text(t, 240)) || scene.searchTerms.join(' ').length > 240) invalid();
    end = scene.endSec;
  }
  if (end !== plan.durationSec) invalid();
}
