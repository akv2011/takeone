// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { getFunctionName } from 'convex/server';
const mocks = vi.hoisted(() => ({ begin: vi.fn(), finish: vi.fn(), remove: vi.fn(), upload: vi.fn(), rows: [] as any[], statuses: [] as any[] }));
vi.mock('convex/react', () => ({ useQuery: (ref: any) => getFunctionName(ref) === 'uploads:probeStatuses' ? mocks.statuses : mocks.rows, useMutation: (ref: any) => ({ 'uploads:begin': mocks.begin, 'uploads:finish': mocks.finish, 'uploads:remove': mocks.remove })[getFunctionName(ref)] }));
vi.mock('../src/lib/uploadVideo', () => ({ uploadVideo: mocks.upload }));
import { VideoUpload } from '../src/components/VideoUpload';
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.rows = []; mocks.statuses = []; });
test('valid file uploads and becomes selectable only after server finalization', async () => {
  mocks.begin.mockResolvedValue({ uploadId: 'upload1', url: 'https://example.invalid/upload' });
  mocks.upload.mockResolvedValue('storage1'); mocks.finish.mockResolvedValue({ uploadId: 'upload1' });
  const ready = vi.fn(); const view = render(<VideoUpload onReady={ready} />);
  fireEvent.change(screen.getByLabelText('Upload video'), { target: { files: [new File(['video'], 'video.mp4', { type: 'video/mp4' })] } });
  await waitFor(() => expect(mocks.finish).toHaveBeenCalledWith({ uploadId: 'upload1', storageId: 'storage1' }));
  expect(ready).not.toHaveBeenCalledWith('upload1');
  expect(screen.getByRole('status').textContent).toContain('being checked');
  mocks.rows = [{ _id: 'upload1', name: 'video.mp4', size: 5 }]; view.rerender(<VideoUpload onReady={ready} />);
  await waitFor(() => expect(ready).toHaveBeenCalledWith('upload1'));
  expect(screen.getByRole('status').textContent).toContain('is ready');
});
test('terminal probe failure stops waiting and remains owner-removable', async () => {
  mocks.begin.mockResolvedValue({ uploadId: 'upload1', url: 'https://example.invalid/upload' });
  mocks.upload.mockResolvedValue('storage1'); mocks.finish.mockResolvedValue({ uploadId: 'upload1' }); mocks.remove.mockResolvedValue(null);
  const ready = vi.fn(); const view = render(<VideoUpload onReady={ready} />);
  fireEvent.change(screen.getByLabelText('Upload video'), { target: { files: [new File(['video'], 'video.mp4', { type: 'video/mp4' })] } });
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('being checked'));
  mocks.statuses = [{ _id: 'upload1', name: 'video.mp4', size: 5, status: 'failed' }]; view.rerender(<VideoUpload onReady={ready} />);
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('could not be prepared'));
  fireEvent.click(screen.getByText('Remove failed upload'));
  await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith({ uploadId: 'upload1' }));
});
test('unsupported file is rejected without upload; failed network does not yield ready source', async () => {
  const ready = vi.fn(); render(<VideoUpload onReady={ready} />);
  fireEvent.change(screen.getByLabelText('Upload video'), { target: { files: [new File(['bad'], 'file.txt', { type: 'text/plain' })] } });
  expect(mocks.begin).not.toHaveBeenCalled();
  mocks.begin.mockResolvedValue({ uploadId: 'upload1', url: 'https://example.invalid/upload' });
  mocks.upload.mockRejectedValue(new Error('Upload connection failed'));
  fireEvent.change(screen.getByLabelText('Upload video'), { target: { files: [new File(['video'], 'video.mp4', { type: 'video/mp4' })] } });
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('connection failed'));
  expect(ready).not.toHaveBeenCalledWith('upload1'); expect(mocks.finish).not.toHaveBeenCalled();
});
test('previous upload selection and removal update the source', async () => {
  mocks.rows = [{ _id: 'upload1', name: 'My video.mp4', size: 500 }]; mocks.remove.mockResolvedValue(null);
  const ready = vi.fn(); render(<VideoUpload onReady={ready} />);
  fireEvent.change(screen.getByLabelText('Uploaded video'), { target: { value: 'upload1' } });
  expect(ready).toHaveBeenCalledWith('upload1');
  fireEvent.click(screen.getByText('Remove uploaded source'));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Upload removed'));
  expect(ready).toHaveBeenLastCalledWith(undefined);
});

import { AudioUpload } from '../src/components/AudioUpload';
test('audio upload requires rights and selects only after finalization', async () => {
 const ready = vi.fn();
 mocks.begin.mockResolvedValue({ uploadId: 'audio1', url: 'https://example.invalid/upload' });
 mocks.upload.mockResolvedValue('audio-storage'); mocks.finish.mockResolvedValue({ uploadId: 'audio1' });
 render(<AudioUpload onReady={ready} />);
 expect((screen.getByLabelText('Upload soundtrack') as HTMLInputElement).disabled).toBe(true);
 fireEvent.click(screen.getByLabelText('I have permission to use this audio in exported videos.'));
 fireEvent.change(screen.getByLabelText('Upload soundtrack'), { target: { files: [new File(['sound'], 'track.mp3', { type: 'audio/mpeg' })] } });
 await waitFor(() => expect(ready).toHaveBeenCalledWith('upload:audio1'));
 expect(mocks.begin).toHaveBeenCalledWith({ kind: 'audio', confirmedOwnership: true, name: 'track.mp3', contentType: 'audio/mpeg', size: 5 });
 expect(mocks.finish).toHaveBeenCalledWith({ uploadId: 'audio1', storageId: 'audio-storage' });
});
test('non-audio files cannot be uploaded as a soundtrack', () => {
 render(<AudioUpload onReady={vi.fn()} />);
 fireEvent.click(screen.getByLabelText('I have permission to use this audio in exported videos.'));
 fireEvent.change(screen.getByLabelText('Upload soundtrack'), { target: { files: [new File(['video'], 'video.mp4', { type: 'video/mp4' })] } });
 expect(mocks.begin).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
 expect(screen.getByRole('status').textContent).toContain('MP3, WAV or M4A');
});
