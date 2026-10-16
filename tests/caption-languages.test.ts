import { expect, test } from 'vitest';
import { CAPTION_LANGUAGES } from '../convex/captions';
import { CAPTION_LANGUAGES as WORKER_LANGUAGES } from '../backend/src/languages';

test('the app offers exactly the caption languages the worker can translate and narrate', () => {
  expect(CAPTION_LANGUAGES.map(language => language.code)).toEqual(Object.keys(WORKER_LANGUAGES));
});
