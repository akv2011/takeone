import { v, ConvexError } from 'convex/values';
import { actionGeneric as action, queryGeneric as query, internalMutationGeneric as internalMutation, internalQueryGeneric as internalQuery, makeFunctionReference as ref } from 'convex/server';
import { dispatcher } from './jobs';
import { captionLanguageValidator } from './captions';
import { momentValidator, parseYouTubeLink, watchUrl, SHARE_TOKEN, type MomentAnalysis, type MomentAnalysisRow, type SharedMoment } from './youtubeValues';
declare const process: { env: Record<string, string | undefined> };

const HOUR = 3_600_000, DAY = 86_400_000;
type Row = MomentAnalysisRow & { _id: string };
type DoneRow = Extract<Row, { status: 'done' }>;

// Same parse rule as freeDailyRenderCap in config.ts; 0 turns the feature off.
export function youtubeDailyCap(env: Record<string, string | undefined>) {
  const value = env.YOUTUBE_DAILY_CAP?.trim() ?? '';
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 100;
}
async function identity(ctx: any) {
  const auth = await ctx.auth.getUserIdentity();
  if (!auth) throw new ConvexError('UNAUTHENTICATED');
  return auth.subject as string;
}
async function ownedMoment(ctx: any, id: string, moment: number): Promise<DoneRow> {
  const userId = await identity(ctx), row: Row | null = await ctx.db.get(id);
  if (row?.userId !== userId || row.status !== 'done' || !Number.isInteger(moment) || !row.moments[moment]) throw new ConvexError('MOMENTS_UNAVAILABLE');
  return row;
}
const storedTexts = (row: DoneRow, moment: number, language: string) => row.translations.find(entry => entry.moment === moment && entry.language === language)?.texts;
const validTexts = (texts: unknown, count: number): texts is string[] =>
  Array.isArray(texts) && texts.length === count && texts.every(text => typeof text === 'string' && text.trim().length > 0 && text.length <= 500);
export const sharedMoment = (row: Row | null, index: number): SharedMoment | null =>
  row?.status === 'done' && row.moments[index] ? { videoId: row.videoId, moment: row.moments[index] } : null;

export const analyze = action({ args: { url: v.string() }, handler: async (ctx, { url }): Promise<{ id: string }> => {
  await identity(ctx);
  const link = parseYouTubeLink(url);
  if ('error' in link) throw new ConvexError(link.error === 'playlist' ? 'YOUTUBE_PLAYLIST' : 'YOUTUBE_URL');
  const id: string = await ctx.runMutation(ref<'mutation'>('youtubeMoments:reserve'), { videoId: link.videoId });
  try {
    const data = await (await dispatcher('youtube-moments', { videoId: link.videoId }, 60_000)).json();
    await ctx.runMutation(ref<'mutation'>('youtubeMoments:finish'), { id, moments: data?.moments });
  } catch {
    await ctx.runMutation(ref<'mutation'>('youtubeMoments:fail'), { id });
    throw new ConvexError('MOMENTS_UNAVAILABLE');
  }
  return { id };
}});
export const reserve = internalMutation({ args: { videoId: v.string() }, handler: async (ctx, { videoId }) => {
  const userId = await identity(ctx), now = Date.now();
  if ((await ctx.db.query('youtubeMoments').withIndex('by_user_created', (q: any) => q.eq('userId', userId).gt('createdAt', now - HOUR)).take(3)).length >= 3) throw new ConvexError('YOUTUBE_RATE_LIMIT');
  const cap = youtubeDailyCap(process.env), dayStart = Math.floor(now / DAY) * DAY;
  // ponytail: an index scan bounded by the cap; move to a per-day counter row if the cap grows past about a thousand.
  if (cap === 0 || (await ctx.db.query('youtubeMoments').withIndex('by_created', q => q.gte('createdAt', dayStart)).take(cap)).length >= cap) throw new ConvexError('YOUTUBE_DAILY_CAP');
  const id = await ctx.db.insert('youtubeMoments', { userId, videoId, url: watchUrl(videoId), createdAt: now, status: 'running' });
  await ctx.scheduler.runAfter(120_000, ref<'mutation'>('youtubeMoments:fail'), { id });
  return id;
}});
export const finish = internalMutation({ args: { id: v.id('youtubeMoments'), moments: v.array(momentValidator) }, handler: async (ctx, { id, moments }) => {
  const row = await ctx.db.get(id);
  if (row?.status !== 'running') throw new ConvexError('MOMENTS_UNAVAILABLE');
  await ctx.db.patch(id, { status: 'done', moments, translations: [] });
}});
export const fail = internalMutation({ args: { id: v.id('youtubeMoments') }, handler: async (ctx, { id }) => {
  const row = await ctx.db.get(id);
  if (row?.status === 'running') await ctx.db.patch(id, { status: 'failed' });
}});
export const latest = query({ args: {}, handler: async (ctx: any): Promise<MomentAnalysis | null> => {
  const auth = await ctx.auth.getUserIdentity();
  if (!auth) return null;
  const row: Row | null = await ctx.db.query('youtubeMoments').withIndex('by_user_created', (q: any) => q.eq('userId', auth.subject)).order('desc').first();
  if (!row) return null;
  const base = { id: row._id, videoId: row.videoId, createdAt: row.createdAt };
  return row.status === 'done' ? { ...base, status: 'done', moments: row.moments, translations: row.translations } : { ...base, status: row.status };
}});

const translateArgs = { id: v.id('youtubeMoments'), moment: v.number(), language: captionLanguageValidator };
export const translationSource = internalQuery({ args: translateArgs, handler: async (ctx, { id, moment, language }) => {
  const row = await ownedMoment(ctx, id, moment);
  return { cached: storedTexts(row, moment, language) ?? null, cues: row.moments[moment].cues.map(cue => cue.text) };
}});
export const translate = action({ args: translateArgs, handler: async (ctx, args): Promise<string[]> => {
  await identity(ctx);
  const { cached, cues }: { cached: string[] | null; cues: string[] } = await ctx.runQuery(ref<'query'>('youtubeMoments:translationSource'), args);
  if (cached) return cached;
  if (!cues.length) return [];
  let texts: unknown;
  try { texts = (await (await dispatcher('translate-cues', { language: args.language, texts: cues }, 30_000)).json())?.texts; } catch { throw new ConvexError('TRANSLATION_UNAVAILABLE'); }
  if (!validTexts(texts, cues.length)) throw new ConvexError('TRANSLATION_UNAVAILABLE');
  return ctx.runMutation(ref<'mutation'>('youtubeMoments:storeTranslation'), { ...args, texts });
}});
export const storeTranslation = internalMutation({ args: { ...translateArgs, texts: v.array(v.string()) }, handler: async (ctx, { id, moment, language, texts }) => {
  const row = await ownedMoment(ctx, id, moment), stored = storedTexts(row, moment, language);
  if (stored) return stored;
  // ponytail: translations live in the analysis row; 3 moments x 60 cues x 12 languages at 500 characters nears the 1 MiB document limit, move them to their own table if replies run that long.
  await ctx.db.patch(id, { translations: [...row.translations, { moment, language, texts }] });
  return texts;
}});

const shareArgs = { id: v.id('youtubeMoments'), moment: v.number() };
export const share = action({ args: shareArgs, handler: async (ctx, args): Promise<{ token: string }> => {
  await identity(ctx);
  // Action randomness is cryptographic. The token is stored as is: it only opens one moment of a public video.
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  return { token: await ctx.runMutation(ref<'mutation'>('youtubeMoments:storeShare'), { ...args, token }) };
}});
export const storeShare = internalMutation({ args: { ...shareArgs, token: v.string() }, handler: async (ctx, { id, moment, token }) => {
  const row = await ownedMoment(ctx, id, moment);
  const existing = await ctx.db.query('youtubeShares').withIndex('by_analysis_moment', (q: any) => q.eq('analysisId', id).eq('moment', moment)).first();
  if (existing) return existing.token;
  await ctx.db.insert('youtubeShares', { token, userId: row.userId, analysisId: id, moment, createdAt: Date.now() });
  return token;
}});
export const shared = query({ args: { token: v.string() }, handler: async (ctx: any, { token }): Promise<SharedMoment | null> => {
  if (!SHARE_TOKEN.test(token)) return null;
  const link = await ctx.db.query('youtubeShares').withIndex('by_token', (q: any) => q.eq('token', token)).unique();
  return link ? sharedMoment(await ctx.db.get(link.analysisId), link.moment) : null;
}});
