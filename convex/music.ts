declare const process: { env: Record<string, string | undefined> };
import { queryGeneric as query, internalQueryGeneric as internalQuery, actionGeneric as action, makeFunctionReference as ref } from 'convex/server';
import { dispatcher } from './jobs';
import { v, ConvexError } from 'convex/values';
export const musicSelection = v.object({ trackId: v.string(), volume: v.number(), duck: v.boolean(), replaceSourceAudio: v.optional(v.boolean()) });
export const musicSnapshot = v.object({ trackId: v.string(), label: v.string(), storageKey: v.optional(v.string()), storageId: v.optional(v.id('_storage')), attribution: v.string(), volume: v.number(), duck: v.boolean(), replaceSourceAudio: v.optional(v.boolean()) });
type Track = { id: string; label: string; storageKey: string; attribution: string };
function catalog(): Track[] {
  const raw = process.env.MUSIC_CATALOG_JSON;
  if (!raw) return [];
  const tracks: unknown = JSON.parse(raw);
  if (!Array.isArray(tracks) || tracks.length > 100) throw new Error('Invalid music catalog');
  const ids = new Set<string>();
  for (const t of tracks) {
    if (!t || typeof t.id !== 'string' || !/^[a-z0-9-]{1,60}$/.test(t.id) || ids.has(t.id) ||
      typeof t.label !== 'string' || !t.label.trim() || t.label.length > 120 ||
      typeof t.attribution !== 'string' || !t.attribution.trim() || t.attribution.length > 500 ||
      typeof t.storageKey !== 'string' || !/^music\/[a-zA-Z0-9_-]{1,100}\.(mp3|wav|m4a)$/.test(t.storageKey)) throw new Error('Invalid music catalog');
    ids.add(t.id);
  }
  return tracks;
}
export function resolveMusic(selection?: { trackId: string; volume: number; duck: boolean; replaceSourceAudio?: boolean }) {
  if (!selection) return undefined;
  const track = catalog().find(t => t.id === selection.trackId);
  if (!track || !Number.isFinite(selection.volume) || selection.volume < 0 || selection.volume > 1) throw new ConvexError('MUSIC_UNAVAILABLE');
  return { trackId: track.id, label: track.label, storageKey: track.storageKey, attribution: track.attribution, volume: selection.volume, duck: selection.duck, ...(selection.replaceSourceAudio === undefined ? {} : { replaceSourceAudio: selection.replaceSourceAudio }) };
}
export const availableTracks = () => catalog().map(({ id, label, attribution }) => ({ id, label, attribution }));
export async function resolveOwnedMusic(ctx: any, userId: string, selection?: { trackId: string; volume: number; duck: boolean; replaceSourceAudio?: boolean }): Promise<{ trackId: string; label: string; storageKey?: string; storageId?: string; attribution: string; volume: number; duck: boolean; replaceSourceAudio?: boolean } | undefined> {
  if (!selection?.trackId.startsWith('upload:')) return resolveMusic(selection);
  const id = ctx.db.normalizeId('uploads', selection.trackId.slice(7));
  const upload = id ? await ctx.db.get(id) : null;
  if (!upload || upload.userId !== userId || upload.kind !== 'audio' || upload.status !== 'ready' || !upload.confirmedOwnership || !upload.storageId || !Number.isFinite(selection.volume) || selection.volume < 0 || selection.volume > 1) throw new ConvexError('MUSIC_UNAVAILABLE');
  return { ...selection, label: upload.name, storageId: upload.storageId, attribution: 'Your uploaded audio' };
}
export async function tracksForOwner(ctx: any, userId?: string): Promise<{ id: string; label: string; attribution: string }[]> {
  const tracks = availableTracks();
  if (!userId) return tracks;
  const uploads = await ctx.db.query('uploads').withIndex('by_user_status', (q: any) => q.eq('userId', userId).eq('status', 'ready')).order('desc').take(10);
  return [...tracks, ...uploads.filter((u: any) => u.kind === 'audio' && u.confirmedOwnership && u.storageId).map((u: any) => ({ id: `upload:${u._id}`, label: u.name, attribution: 'Your uploaded audio' }))];
}
export const listTracks = query({ args: {}, handler: async ctx => tracksForOwner(ctx, (await ctx.auth.getUserIdentity())?.subject) });
export const resolvePreview = internalQuery({ args: { trackId: v.string() }, handler: async (ctx, { trackId }): Promise<any> => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError('UNAUTHENTICATED');
  const track = await resolveOwnedMusic(ctx, identity.subject, { trackId, volume: 0.18, duck: true });
  if (!track) throw new ConvexError('MUSIC_UNAVAILABLE');
  return track.storageId ? { url: await ctx.storage.getUrl(track.storageId) } : { storageKey: track.storageKey };
} });
export const preview = action({ args: { trackId: v.string() }, handler: async (ctx, { trackId }): Promise<{ url: string }> => {
  if (!await ctx.auth.getUserIdentity()) throw new ConvexError('UNAUTHENTICATED');
  const track = await ctx.runQuery(ref<'query'>('music:resolvePreview'), { trackId });
  if ('url' in track) {
    if (typeof track.url !== 'string') throw new ConvexError('PREVIEW_UNAVAILABLE');
    return { url: track.url };
  }
  const result = await (await dispatcher('sign-music', { storageKey: track.storageKey })).json();
  if (typeof result.url !== 'string' || !result.url.startsWith('https://')) throw new ConvexError('PREVIEW_UNAVAILABLE');
  return { url: result.url };
}});
