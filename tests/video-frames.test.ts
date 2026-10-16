import { expect, test } from 'vitest';
import { frameTimes } from '../src/lib/videoFrames';
test('samples inside the source endpoints and caps the supported duration', () => {
 expect(frameTimes(10)).toEqual([0.625, 1.875, 3.125, 4.375, 5.625, 6.875, 8.125, 9.375]);
 for (const invalid of [0, -1, NaN, Infinity, 301]) expect(() => frameTimes(invalid)).toThrow();
 expect(frameTimes(0.001)).toHaveLength(8);
 expect(frameTimes(300).at(-1)).toBeLessThan(300);
});
