declare const process: { env: Record<string, string | undefined> };
import { httpRouter, httpActionGeneric, makeFunctionReference } from 'convex/server';
import { readRequestText, RequestBodyError } from './requestBody';
const http = httpRouter();
http.route({ path: '/telegram', method: 'POST', handler: httpActionGeneric(async (ctx: any, req: Request) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get('x-telegram-bot-api-secret-token') !== secret) return new Response('Unauthorized', { status: 401 });
  let body: string;
  try { body = await readRequestText(req, 65536); }
  catch (error) { return new Response(error instanceof RequestBodyError ? error.message : 'Invalid request body', { status: error instanceof RequestBodyError ? error.status : 400 }); }
  let update;
  try { update = JSON.parse(body); } catch { return new Response('Invalid JSON', { status: 400 }); }
  await ctx.runMutation(makeFunctionReference<'mutation'>('telegram:receive'), { update });
  return new Response('ok');
}) });
http.route({ path: '/dodo-webhook', method: 'POST', handler: httpActionGeneric(async (ctx, req) => {
  if (!process.env.DODO_WEBHOOK_SECRET) return new Response('Payment integration is not configured', { status: 503 });
  let body: string;
  try { body = await readRequestText(req, 262144); }
  catch (error) { return new Response(error instanceof RequestBodyError ? error.message : 'Invalid request body', { status: error instanceof RequestBodyError ? error.status : 400 }); }
  const headers = Object.fromEntries(['webhook-id', 'webhook-timestamp', 'webhook-signature'].map(key => [key, req.headers.get(key) ?? '']));
  const status = await ctx.runAction(makeFunctionReference<'action'>('dodoWebhook:receive'), { body, headers });
  return new Response(status === 200 ? 'ok' : 'Payment verification failed', { status });
}) });
export default http;
