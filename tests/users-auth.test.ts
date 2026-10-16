import { convexTest } from 'convex-test';
import { makeFunctionReference as ref } from 'convex/server';
import { expect, test } from 'vitest';
import schema from '../convex/schema';
import { FOUNDING_CREDITS } from '../convex/config';

const modules = import.meta.glob('../convex/**/*.ts');
const issuer = 'https://securetoken.google.com/demo';
const ensureUser = ref<'mutation'>('users:ensureUser');
const currentUser = ref<'query'>('users:currentUser');

async function waitlisted() {
  const t = convexTest(schema, modules);
  await t.run(ctx => ctx.db.insert('waitlist', { email: 'early@example.com', position: 1, at: 1 }));
  return t;
}

test('an anonymous guest with only a subject gets an account with the free allowance', async () => {
  const guest = convexTest(schema, modules).withIdentity({ subject: 'guest-uid', issuer });
  await guest.mutation(ensureUser, {});
  const user = await guest.query(currentUser, {});
  expect(user).toMatchObject({ freeRemaining: 3, credits: 0, founding: false, canGenerate: true });
  expect(user?.email).toBeUndefined();
});

test('a verified waitlisted email becomes a founding creator', async () => {
  const t = await waitlisted();
  const member = t.withIdentity({ subject: 'google-uid', issuer, email: 'Early@Example.com', emailVerified: true });
  await member.mutation(ensureUser, {});
  expect(await member.query(currentUser, {})).toMatchObject({ founding: true, credits: FOUNDING_CREDITS, email: 'early@example.com' });
});

test('an unverified waitlisted email is not trusted for the founding bonus', async () => {
  for (const emailVerified of [undefined, false]) {
    const t = await waitlisted();
    const member = t.withIdentity({ subject: `uid-${emailVerified}`, issuer, email: 'early@example.com', emailVerified });
    await member.mutation(ensureUser, {});
    expect(await member.query(currentUser, {})).toMatchObject({ founding: false, credits: 0 });
    const [row, ...others] = await t.run(ctx => ctx.db.query('users').collect());
    expect(others).toEqual([]);
    expect(row).toMatchObject({ tokenIdentifier: `uid-${emailVerified}`, founding: false });
    expect(row.email).toBeUndefined();
  }
});
