import { convexTest } from 'convex-test';
import { makeFunctionReference as ref } from 'convex/server';
import { expect, test } from 'vitest';
import schema from '../convex/schema';

const modules = import.meta.glob('../convex/**/*.ts');

async function setup() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert('users', { tokenIdentifier: 'creator-1', email: 'one@example.com', credits: 2, freeUsed: 1 });
    await ctx.db.insert('users', { tokenIdentifier: 'creator-2', email: 'two@example.com', credits: 0, freeUsed: 0 });
  });
  return t;
}

test('legacy users receive normalized creator preference defaults', async () => {
  const t = await setup();
  const result = await t.withIdentity({ subject: 'creator-1' }).query(ref<'query'>('users:currentUser'), {});

  expect(result?.preferences).toEqual({
    defaultMode: 'generate',
    defaultAspect: '9:16',
    defaultCaptionStyle: 'auto',
    openFinishedInStudio: true,
    showShortcutHints: true,
  });
});

test('preferences require authentication and an existing user row', async () => {
  const t = await setup();
  const values = {
    defaultMode: 'edit' as const,
    defaultAspect: '1:1' as const,
    defaultCaptionStyle: 'clean' as const,
    openFinishedInStudio: false,
    showShortcutHints: false,
  };

  await expect(t.mutation(ref<'mutation'>('users:updatePreferences'), values)).rejects.toThrow('UNAUTHENTICATED');
  await expect(t.withIdentity({ subject: 'missing' }).mutation(ref<'mutation'>('users:updatePreferences'), values)).rejects.toThrow('USER_NOT_FOUND');
});

test('preference validators reject unsupported values', async () => {
  const t = await setup();
  await expect(t.withIdentity({ subject: 'creator-1' }).mutation(ref<'mutation'>('users:updatePreferences'), {
    defaultMode: 'movie',
    defaultAspect: '4:3',
    defaultCaptionStyle: 'sparkles',
    openFinishedInStudio: true,
    showShortcutHints: true,
  })).rejects.toThrow();
});

test('preferences persist for the authenticated user without changing another account', async () => {
  const t = await setup();
  const values = {
    defaultMode: 'clip' as const,
    defaultAspect: '16:9' as const,
    defaultCaptionStyle: 'karaoke' as const,
    openFinishedInStudio: false,
    showShortcutHints: false,
  };

  await expect(t.withIdentity({ subject: 'creator-1' }).mutation(ref<'mutation'>('users:updatePreferences'), values)).resolves.toEqual(values);
  const first = await t.withIdentity({ subject: 'creator-1' }).query(ref<'query'>('users:currentUser'), {});
  const second = await t.withIdentity({ subject: 'creator-2' }).query(ref<'query'>('users:currentUser'), {});

  expect(first?.preferences).toEqual(values);
  expect(second?.preferences).toEqual({
    defaultMode: 'generate',
    defaultAspect: '9:16',
    defaultCaptionStyle: 'auto',
    openFinishedInStudio: true,
    showShortcutHints: true,
  });
});
