import { FilmStrip } from "@phosphor-icons/react";
import { InspectorSection, PanelState } from "./StudioWorkspace";
import { SceneReplacementControls } from './SceneReplacementControls';
import { Component, type ReactNode } from 'react';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '../lib/convexApi';
import { button, panel } from '../lib/ui';

type Scene = { startSec: number; endSec: number; purpose: string; searchTerms: string[]; shotType: string; motion: string };
type Plan = { state: 'completed' | 'rendering' | 'failed' | 'cancelled' | 'previous_attempt'; attempt: number; durationSec: number; scenes: Scene[] };
type Props = { onReplaced?(jobId: string): void; jobId: string; accountKey: string; playbackDisabled: boolean; currentTime: number; duration?: number; onSeek(seconds: number): void };
const messages: Record<Plan['state'], string> = {
  completed: 'Saved scenes for this version. Timing is approximate.',
  rendering: 'Planned scenes for this render. Open the finished version to navigate them.',
  failed: 'This attempt failed. These scenes were planned, not delivered.',
  cancelled: 'This attempt was cancelled. These scenes were not delivered.',
  previous_attempt: 'These scenes belong to an earlier attempt. The current attempt has not saved a plan.',
};
function validPlan(value: unknown): value is Plan {
  if (!value || typeof value !== 'object') return false;
  const p = value as Plan;
  if (!Object.hasOwn(messages, p.state) || !Number.isInteger(p.attempt) || p.attempt < 1 || !Number.isFinite(p.durationSec) || p.durationSec <= 0 || p.durationSec > 300 || !Array.isArray(p.scenes) || !p.scenes.length || p.scenes.length > 12) return false;
  let end = 0;
  return p.scenes.every(scene => {
    if (!scene || !Number.isFinite(scene.startSec) || !Number.isFinite(scene.endSec) || scene.startSec !== end || scene.endSec <= scene.startSec || scene.endSec > p.durationSec || typeof scene.purpose !== 'string' || !scene.purpose.trim() || scene.purpose.length > 300 || typeof scene.shotType !== 'string' || scene.shotType.length > 80 || typeof scene.motion !== 'string' || scene.motion.length > 120 || !Array.isArray(scene.searchTerms) || scene.searchTerms.length < 1 || scene.searchTerms.length > 4 || !scene.searchTerms.every(term => typeof term === 'string' && term.trim().length > 0 && term.length <= 240) || scene.searchTerms.join(' ').length > 240) return false;
    end = scene.endSec; return true;
  }) && Math.abs(end - p.durationSec) < 0.001;
}
export function SceneInspector(props: Props) {
  return <InspectorSection title="Scene plan" icon={FilmStrip}><section aria-label="Scene plan" className={`${panel} min-w-0 p-4`}>
    <SceneReadBoundary key={`${props.accountKey}:${props.jobId}`}><ScopedScenes {...props} /></SceneReadBoundary>
  </section></InspectorSection>;
}
class SceneReadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="mt-2 text-[13px]">
      <p role="alert">Scene details could not load. You can continue using the rest of Studio.</p>
      <button type="button" onClick={() => this.setState({ failed: false })} className={`${button('secondary', 'sm')} mt-2`}>Retry scene details</button>
    </div> : this.props.children;
  }
}
function ScopedScenes({ onReplaced, jobId, accountKey, playbackDisabled, currentTime, duration, onSeek }: Props) {
  const { isAuthenticated } = useConvexAuth();
  const result = useQuery(api.scenePlans.get, isAuthenticated && accountKey && jobId ? { jobId, accountKey } : 'skip') as unknown;
  if (!isAuthenticated || !accountKey) return <p className="mt-2 text-[13px] text-ink2">Connect your sign-in to view saved scenes.</p>;
  if (result === undefined) return <PanelState loading>Loading saved scenes…</PanelState>;
  if (!validPlan(result)) return <PanelState>No saved scene plan. Use the player or transcript to navigate this version.</PanelState>;
  const plan = result;
  const canSeek = plan.state === 'completed' && !playbackDisabled && duration !== undefined && Number.isFinite(duration) && duration > 0 && plan.durationSec <= duration + 0.1;
  return <>
    <p className="mt-2 text-[13px] text-ink2">{messages[plan.state]}</p>
    <p className="mt-1 text-[13px] text-ink2">Attempt {plan.attempt} · {plan.scenes.length} scenes · Free to inspect</p>
    <ol className="mt-3 max-h-80 space-y-2 overflow-y-auto" aria-label="Saved scenes">
      {plan.scenes.map((scene, index) => <li key={index}>
        <button type="button" disabled={!canSeek || scene.startSec >= (duration ?? 0)} onClick={() => onSeek(scene.startSec)} aria-current={canSeek && currentTime >= scene.startSec && currentTime < scene.endSec ? 'true' : undefined} className="block w-full min-w-0 rounded-control border border-line p-3 text-left hover:border-muted aria-[current=true]:border-transparent aria-[current=true]:bg-surface aria-[current=true]:shadow-[inset_2px_0_var(--grease)] disabled:cursor-default disabled:hover:border-line">
          <span className="flex justify-between gap-2 text-[13px] text-ink2"><span className="font-semibold">Scene {index + 1}</span><span className="font-mono">{scene.startSec.toFixed(2)} to {scene.endSec.toFixed(2)}s</span></span>
          <span className="mt-1 block break-words text-sm font-medium [overflow-wrap:anywhere]">{scene.purpose}</span>
          <span className="mt-1 block break-words text-[13px] text-ink2 [overflow-wrap:anywhere]">{scene.shotType} · {scene.motion}</span>
          <span className="mt-2 block break-words text-[13px] [overflow-wrap:anywhere]">{scene.searchTerms.join(' · ')}</span>
        </button>
      </li>)}
    </ol>
    {onReplaced && plan.state === 'completed' && <SceneReplacementControls key={`${accountKey}:${jobId}`} jobId={jobId} accountKey={accountKey} sceneCount={plan.scenes.length} onReplaced={onReplaced} />}
  </>;
}
