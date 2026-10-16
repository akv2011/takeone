import { configuredTelegramUsername } from './capabilities';
import { captionArchiveSource, captionTransformSource } from './captions';
declare const process: { env: Record<string, string | undefined> };
import { mutationGeneric as mutation, internalMutationGeneric as internalMutation, internalActionGeneric as internalAction, queryGeneric as query, makeFunctionReference as ref } from 'convex/server';
import { v, ConvexError } from 'convex/values';
import { owner, enqueue, cancelQueuedJob } from './jobs';
import { FREE_LIMIT } from './config';
import { tracksForOwner } from './music';
import { queueReply } from './telegramMessages';

function appLink(path: string) {
  try { const url = new URL(process.env.APP_URL ?? ''); return url.protocol === 'https:' && !url.username && !url.password ? `${url.origin}${path}` : undefined; } catch { return undefined; }
}
function botUsername() {
  return configuredTelegramUsername(process.env);
}

export const createLink = mutation({ args: {}, handler: async (ctx: any) => {
  const user = await owner(ctx);
  const username = botUsername();
  if (!username) throw new ConvexError('TELEGRAM_UNCONFIGURED');
  const existing = await ctx.db.query('telegramLinks').withIndex('by_user', (q: any) => q.eq('userId', user.tokenIdentifier)).unique();
  // Convex supplies deterministic seeded randomness inside a mutation.
  const code = Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
  const fields = { code, expiresAt: Date.now() + 10 * 60_000 };
  if (existing) await ctx.db.patch(existing._id, fields);
  else await ctx.db.insert('telegramLinks', { userId: user.tokenIdentifier, ...fields });
  return { ...fields, botUsername: username };
}});
export const status = query({ args: {}, handler: async (ctx: any) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const link = await ctx.db.query('telegramLinks').withIndex('by_user', (q: any) => q.eq('userId', identity.subject)).unique();
  const username = botUsername();
  return { linked: !!link?.telegramUserId, configured: !!username, botUsername: username };
}});
export const unlink = mutation({ args: {}, handler: async (ctx: any) => {
  const user = await owner(ctx);
  const link = await ctx.db.query('telegramLinks').withIndex('by_user', (q: any) => q.eq('userId', user.tokenIdentifier)).unique();
  if (link) await ctx.db.delete(link._id);
}});
async function reply(ctx: any, chatId: string, text: string) {
  await queueReply(ctx, chatId, text);
}
export const sendMessage = internalAction({ args: { chatId: v.string(), text: v.string() }, handler: async (_ctx: any, args: any) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Telegram is not configured');
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: args.chatId, text: args.text }), signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok || (await r.json()).ok !== true) throw new Error('Telegram message delivery failed');
}});
export const receive = internalMutation({ args: { update: v.any() }, handler: async (ctx: any, { update }: any) => {
  if (!Number.isSafeInteger(update?.update_id)) return;
  if (await ctx.db.query('telegramUpdates').withIndex('by_update', (q: any) => q.eq('updateId', update.update_id)).unique()) return;
  const m = update.message;
  if (!m?.from?.id || !m?.chat?.id || m.chat.type !== 'private') return;
  await ctx.db.insert('telegramUpdates', { updateId: update.update_id, at: Date.now() });
  const telegramUserId = String(m.from.id), chatId = String(m.chat.id);
  if (!botUsername()) return reply(ctx, chatId, 'This bot is not fully configured yet. Please try again later. No generation used.');
  let text = String(m.text ?? m.caption ?? '').trim();
  if (text.length > 4000) return reply(ctx, chatId, 'Please keep your prompt under 4,000 characters.');
  const code = text.match(/^\/link\s+([a-z0-9]{24})$/)?.[1];
  if (code) {
    const link = await ctx.db.query('telegramLinks').withIndex('by_code', (q: any) => q.eq('code', code)).unique();
    if (!link || link.expiresAt < Date.now()) return reply(ctx, chatId, 'That link code expired. Create a new code in your dashboard.');
    const previous = await ctx.db.query('telegramLinks').withIndex('by_telegram', (q: any) => q.eq('telegramUserId', telegramUserId)).unique();
    if (previous && previous._id !== link._id) return reply(ctx, chatId, 'Unlink your existing account in the dashboard before linking another.');
    await ctx.db.patch(link._id, { telegramUserId, code: undefined, expiresAt: undefined, pendingPrompt: undefined, pendingUntil: undefined });
    return reply(ctx, chatId, 'Connected. Web and Telegram now share your five free videos and purchased credits. Send a topic, YouTube link, or video.');
  }
  const link = await ctx.db.query('telegramLinks').withIndex('by_telegram', (q: any) => q.eq('telegramUserId', telegramUserId)).unique();
  if (!link) return reply(ctx, chatId, `Sign in at ${appLink('/create')} and choose Connect Telegram. Send /link followed by the code shown there.`);
  if (/^\/(start|help)$/.test(text)) return reply(ctx, chatId, 'Send a topic to generate a reel, a YouTube link to clip its best moment, or upload a video with editing instructions. Each render reserves one allowance, restored if it fails. Use /jobs for your recent videos and /cancel JOB_ID to cancel a queued render and restore its allowance. Your reels also appear in the dashboard. Use /music to choose a library soundtrack or audio uploaded on your dashboard for future videos; /music off disables it. Use /captions to choose caption styling. Reply to a delivered video with trim, speed or framing instructions, or captions clean|bold|pop|none, to create a new version using one generation. For a font choice, reply with captions clean serif (or sans/mono). Caption restyling requires a saved editable layer; source-embedded text stays.');
  const user = await ctx.db.query('users').withIndex('by_token', (q: any) => q.eq('tokenIdentifier', link.userId)).unique();
  if (!user) return reply(ctx, chatId, 'Please sign in to your dashboard again.');
  if (text === '/jobs') {
    const jobs = await ctx.db.query('genJobs').withIndex('by_user', (q: any) => q.eq('userId', user.tokenIdentifier)).order('desc').take(5);
    return reply(ctx, chatId, jobs.length ? `Your five most recent videos:\n${jobs.map((job: any) => `${job._id} — ${job.status}\n${job.prompt.slice(0, 80)}\n${appLink(`/studio/${job._id}`)}`).join('\n\n')}\nUse /cancel JOB_ID for queued/dispatched videos. Viewing this list uses no generation.` : 'You have no videos yet. Send a topic or video to begin. No generation used.');
  }
  if (/^\/cancel(?:\s|$)/.test(text)) {
    const parts = text.split(/\s+/);
    const id = parts.length === 2 ? ctx.db.normalizeId('genJobs', parts[1]) : null;
    if (!id) return reply(ctx, chatId, 'Use /jobs to find a video, then /cancel JOB_ID. No generation used.');
    try { await cancelQueuedJob(ctx, user, id); }
    catch (error) {
      if (error instanceof ConvexError && error.data === 'NOT_FOUND') return reply(ctx, chatId, 'That video is not available in your linked account. No generation used.');
      if (error instanceof ConvexError && error.data === 'CANNOT_CANCEL_RUNNING_JOB') return reply(ctx, chatId, 'Only queued videos can be cancelled. This video has already started or finished, or is already cancelled. Use /jobs to check it. No generation used.');
      throw error;
    }
    return reply(ctx, chatId, 'Video cancelled. Its reserved allowance has been restored.');
  }
  if (/^\/captions(?:\s|$)/.test(text)) {
    const choices: Record<string, 'clean' | 'meme' | 'karaoke' | 'none' | undefined> = { auto: undefined, clean: 'clean', bold: 'meme', pop: 'karaoke', none: 'none' };
    const labels: Record<string, string> = { clean: 'clean static text', meme: 'uppercase bold pop', karaoke: 'short-phrase pop-in', none: 'no added captions' };
    const parts = text.split(/\s+/);
    const guide = 'Use /captions auto, clean, bold, pop or none. Settings apply to new topic, clip and upload requests. Trim/speed/framing reply edits preserve existing captions and audio. To restyle an existing saved layer, reply to its video with captions clean, bold, pop or none (one generation). Existing text in source footage remains; use a clean source to avoid overlapping captions. No generation used.';
    if (parts.length === 1) return reply(ctx, chatId, `Captions: ${labels[link.captionStyle] ?? 'automatic (follow your prompt)'}. ${guide}`);
    if (parts.length !== 2 || !Object.hasOwn(choices, parts[1])) return reply(ctx, chatId, `Caption setting unchanged. ${guide}`);
    const captionStyle = choices[parts[1]];
    await ctx.db.patch(link._id, { captionStyle });
    return reply(ctx, chatId, `Captions set to ${captionStyle ? labels[captionStyle] : 'automatic (follow your prompt)'}. ${guide}`);
  }
  if (/^\/music(?:\s|$)/.test(text)) {
    const parts = text.split(/\s+/);
    if (parts[1] === 'off' && parts.length === 2) {
      await ctx.db.patch(link._id, { music: undefined });
      return reply(ctx, chatId, 'Soundtrack disabled for future videos. No generation used.');
    }
    const tracks = await tracksForOwner(ctx, user.tokenIdentifier);
    if (!parts[1] || parts[1] === 'list') {
      const page = parts[2] === undefined ? 1 : Number(parts[2]);
      const pages = Math.max(1, Math.ceil(tracks.length / 10));
      if (parts.length > 3 || !Number.isInteger(page) || page < 1 || page > pages) return reply(ctx, chatId, `Use /music list PAGE, from 1 to ${pages}.`);
      if (!tracks.length) return reply(ctx, chatId, 'No approved soundtracks are connected yet. Your videos can still use their original audio.');
      const selected = link.music ? tracks.find(t => t.id === link.music.trackId)?.label ?? 'unavailable track' : 'off';
      return reply(ctx, chatId, `Soundtrack: ${selected}. Audio: ${link.music?.replaceSourceAudio ? 'replace all original audio, including speech' : 'mix with original audio'}. Library ${page}/${pages}:\n${tracks.slice((page - 1) * 10, page * 10).map(t => `${t.id} — ${t.label}`).join('\n')}\nUse /music TRACK_ID [LEVEL_PERCENT] [mix|replace], e.g. /music ${tracks[0].id} 20 mix. Mix keeps original audio and ducks music under speech. Replace removes ALL original audio, including speech and sound effects. This applies to future videos. Selection is free; rendering uses one generation. /music off disables it.${pages > 1 ? '\nUse /music list PAGE for more tracks.' : ''}`);
    }
    const track = tracks.find(t => t.id === parts[1]);
    const level = parts[2] === undefined ? 20 : Number(parts[2]);
    const audioMode = parts[3] ?? 'mix';
    if (!track || parts.length > 4 || !['mix', 'replace'].includes(audioMode) || !Number.isFinite(level) || level < 0 || level > 100) return reply(ctx, chatId, 'Use /music to find a track, then /music TRACK_ID LEVEL_PERCENT (0–100) mix or replace. Replace removes ALL original audio, including speech. No generation used.');
    const replaceSourceAudio = audioMode === 'replace';
    await ctx.db.patch(link._id, { music: { trackId: track.id, volume: level / 100, duck: !replaceSourceAudio, replaceSourceAudio } });
    return reply(ctx, chatId, `Selected ${track.label} at ${level}% for future videos. ${track.attribution}\nSelection used no generation. Rendering uses one generation. ${replaceSourceAudio ? 'WARNING: ALL original audio, including speech, music and sound effects, will be removed from new renders. Only the selected soundtrack remains.' : 'Existing source audio remains in the mix; music ducks under speech.'} Use /music TRACK_ID LEVEL_PERCENT mix to keep original audio, or /music off to disable.`);
  }
  if (/^captions\s+(clean|bold|pop|none)(?:\s+(sans|serif|mono))?$/i.test(text) && !m.reply_to_message) return reply(ctx, chatId, 'Reply to a delivered video with that instruction to restyle it. To set your default for future videos, use /captions. No generation used.');
  if (text.startsWith('/')) return reply(ctx, chatId, 'Unknown command. Use /help, /jobs, /cancel JOB_ID, /music or /captions. No generation used.');
  const file = m.video ?? m.document;
  let editSource: any;
  let restyle: { captionFont?: 'sans' | 'serif' | 'mono'; captionStyle: 'clean' | 'meme' | 'karaoke' | 'none'; sourceStorageKey: string; sourceCaptionStorageKey: string | undefined } | undefined;
  const confirming = /^(yes|confirm)$/i.test(text) && link.pendingPrompt && link.pendingUntil > Date.now();
  if (m.reply_to_message && !file && !confirming) {
    const messageId = m.reply_to_message.message_id;
    if (Number.isSafeInteger(messageId) && messageId > 0) editSource = await ctx.db.query('genJobs').withIndex('by_telegram_message', (q: any) => q.eq('telegramChatId', chatId).eq('telegramMessageId', messageId)).unique();
    if (!editSource || editSource.userId !== user.tokenIdentifier || editSource.status !== 'done' || !editSource.storageKey) return reply(ctx, chatId, 'I cannot edit that message. Reply to a video delivered to this linked account, or open your video in the dashboard. No generation used.');
    const captionMatch = text.match(/^captions\s+(clean|bold|pop|none)(?:\s+(sans|serif|mono))?$/i);
    if (captionMatch) {
      const archive = captionArchiveSource(editSource);
      if (!archive) return reply(ctx, chatId, 'This video has no editable caption layer. Create a new source video with captions first. Text embedded in source footage cannot be removed. No generation used.');
      const styles = { clean: 'clean', bold: 'meme', pop: 'karaoke', none: 'none' } as const;
      restyle = { ...archive, captionFont: (captionMatch[2]?.toLowerCase() ?? editSource.captionFont) as 'sans' | 'serif' | 'mono' | undefined, captionStyle: styles[captionMatch[1].toLowerCase() as keyof typeof styles] };
    } else if (/\b(?:captions?|subtitles?|subs|meme|karaoke)\b/i.test(text)) return reply(ctx, chatId, 'Reply with captions clean, captions bold, captions pop or captions none. This creates a new version from its saved editable layer, keeps audio and uses one generation. Optionally add sans, serif or mono after the style, for example captions clean serif. Send other edits separately. No generation used.');
    if (/https?:\/\//i.test(text)) return reply(ctx, chatId, 'To clip a new link, send it as a new message. Reply edits use the selected video. No generation used.');
    if (!restyle && !/\b(?:speed|faster|slower|square|landscape|vertical|fit|crop)\b|(?:9:16|16:9|1:1)|\d+:\d+(?:\.\d+)?\s+(?:to|-)\s+\d+:\d+(?:\.\d+)?/i.test(text)) return reply(ctx, chatId, 'Reply with an edit, such as trim 00:02 to 00:08, make it square, or speed it up 1.5x. No generation used.');
  }
  if (!editSource && link.music && !(await tracksForOwner(ctx, user.tokenIdentifier)).some(t => t.id === link.music.trackId)) return reply(ctx, chatId, 'Your selected soundtrack is no longer available. Use /music to choose another or /music off, then resend your request. No generation used.');
  let confirmed = false;
  if (confirming) {
    text = link.pendingPrompt; confirmed = true;
    await ctx.db.patch(link._id, { pendingPrompt: undefined, pendingUntil: undefined });
  }
  const isYoutube = /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(text);
  if (isYoutube && !confirmed) {
    await ctx.db.patch(link._id, { pendingPrompt: text, pendingUntil: Date.now() + 10 * 60_000 });
    return reply(ctx, chatId, 'Do you own or have permission to use this video? Reply yes to create one clip.');
  }
  if (!file && !text) return reply(ctx, chatId, 'Send a topic, a YouTube link, or a video file. Photos, stickers and voice messages do not start a render. No generation used.');
  if (file && (file.file_size > 20 * 1024 * 1024 || !String(file.mime_type ?? '').startsWith('video/'))) return reply(ctx, chatId, 'Please send a video smaller than 20 MB.');
  const input = { mode: file || editSource ? 'edit' : isYoutube ? 'clip' : 'generate', prompt: text || 'Add captions to this video', aspect: /\b(?:square|1:1)\b/i.test(text) ? '1:1' : /\b(?:landscape|16:9)\b/i.test(text) ? '16:9' : /\b(?:vertical|9:16)\b/i.test(text) ? '9:16' : editSource?.aspect ?? '9:16', requestId: `telegram-${update.update_id}`, telegramChatId: chatId, ...(file ? { telegramFileId: file.file_id } : {}), ...(editSource ? { sourceStorageKey: editSource.storageKey, parentJobId: editSource._id, rootJobId: editSource.rootJobId ?? editSource._id } : {}) };
  // Admission errors occur before a debit or insert. Do not catch unexpected database errors.
  if (user.freeUsed >= FREE_LIMIT && user.credits < 1) return reply(ctx, chatId, `Your free videos are used up. Get a video pack at ${appLink('/pricing')}.`);
  if (input.prompt.length < 6) return reply(ctx, chatId, 'Describe your video in a little more detail.');
  const active = await ctx.db.query('genJobs').withIndex('by_user', (q: any) => q.eq('userId', link.userId)).order('desc').take(50);
  if (active.filter((j: any) => ['queued', 'dispatched', 'processing'].includes(j.status)).length >= 3) return reply(ctx, chatId, 'You already have three videos waiting. Please wait for one to finish.');
  try {
    await enqueue(ctx, user, { ...input, brand: editSource && captionArchiveSource(editSource) ? editSource.brand : undefined, music: editSource ? undefined : link.music, captionStyle: editSource ? 'none' : link.captionStyle, ...(editSource && !restyle ? { ...captionTransformSource(editSource), retainedMusic: editSource.music ?? editSource.retainedMusic } : {}), ...(restyle ? { ...restyle, captionPosition: editSource.captionPosition, retainedMusic: editSource.music ?? editSource.retainedMusic } : {}) });
  } catch (error) {
    // This specific admission error is raised before any debit or job insert.
    // Acknowledge it to Telegram instead of silently retrying a full queue.
    // Unexpected failures must still abort the whole mutation.
    if (error instanceof ConvexError && error.data === 'QUEUE_FULL') return reply(ctx, chatId, 'The video queue is full. No generation was used. Please resend your request in a few minutes.');
    if (error instanceof ConvexError && typeof error.data === 'object' && error.data !== null && 'code' in error.data && ['RENDER_UNAVAILABLE', 'FREE_DAILY_CAP'].includes(String(error.data.code))) return reply(ctx, chatId, String(error.data.message));
    throw error;
  }
  return reply(ctx, chatId, restyle ? 'Caption edit queued as a new version using one generation. Existing audio and source-embedded text stay. Your caption and music defaults are unchanged. I will send it here when ready.' : editSource ? 'Edit queued as a new version using one generation. Existing captions and audio are retained; your /captions and /music defaults are not reapplied. I will send it here when ready.' : 'Queued. I will send the finished video here; you can also check your dashboard.');
}});
