import { expect, test } from 'vitest';
import { toAss, titleAss } from './captions.js';
test.each([{ width: 1080, height: 1920 }, { width: 1080, height: 1080 }, { width: 1920, height: 1080 }])('captions and titles use the actual %j canvas with inset text', canvas => {
  for (const ass of [toAss([{ start: 0, end: 1, text: 'Readable text' }], 'clean', canvas), titleAss('Opening hook', 1, canvas)]) {
    expect(ass).toContain(`PlayResX: ${canvas.width}`); expect(ass).toContain(`PlayResY: ${canvas.height}`);
    const fields = ass.split('\n').find(line => line.startsWith('Style:'))!.split(',');
    expect(Number(fields.at(-4))).toBeGreaterThanOrEqual(canvas.width * 0.07);
    expect(Number(fields.at(-2))).toBeGreaterThanOrEqual(canvas.height * 0.09);
  }
});
test('invalid dimensions fail rather than produce malformed subtitle coordinates', () => {
  expect(() => toAss([], 'clean', { width: 0, height: 1080 })).toThrow('canvas');
});
