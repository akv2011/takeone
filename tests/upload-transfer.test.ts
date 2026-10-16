// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { uploadVideo } from '../src/lib/uploadVideo';
class Transfer {
  static last: Transfer;
  upload = { onprogress: null as any }; onload: any; onerror: any; ontimeout: any; onabort: any;
  status = 200; responseText = '{"storageId":"stored"}'; timeout = 0;
  open = vi.fn(); setRequestHeader = vi.fn(); send = vi.fn(); abort = vi.fn(() => this.onabort?.());
  constructor() { Transfer.last = this; }
}
afterEach(() => vi.unstubAllGlobals());
const file = () => new File(['video'], 'video.mp4', { type: 'video/mp4' });
test('transfer reports progress and reads successful provider response', async () => {
  vi.stubGlobal('XMLHttpRequest', Transfer); const progress = vi.fn();
  const result = uploadVideo('https://example.invalid/upload', file(), progress);
  Transfer.last.upload.onprogress({ lengthComputable: true, loaded: 3, total: 5 });
  Transfer.last.onload();
  expect(progress).toHaveBeenCalledWith(60); expect(await result).toBe('stored');
  expect(Transfer.last.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'video/mp4');
});
test.each(['error', 'timeout', 'invalid', 'status'])('transfer rejects %s without a usable storage ID', async kind => {
  vi.stubGlobal('XMLHttpRequest', Transfer);
  const result = uploadVideo('https://example.invalid/upload', file(), vi.fn());
  const rejected = expect(result).rejects.toThrow('Upload');
  if (kind === 'error') Transfer.last.onerror();
  else if (kind === 'timeout') Transfer.last.ontimeout();
  else { if (kind === 'invalid') Transfer.last.responseText = '{}'; else Transfer.last.status = 500; Transfer.last.onload(); }
  await rejected;
});
test('cancellation aborts the live request', async () => {
  vi.stubGlobal('XMLHttpRequest', Transfer); const controller = new AbortController();
  const result = uploadVideo('https://example.invalid/upload', file(), vi.fn(), controller.signal);
  const rejected = expect(result).rejects.toThrow('cancelled'); controller.abort(); await rejected;
  expect(Transfer.last.abort).toHaveBeenCalledTimes(1);
});
