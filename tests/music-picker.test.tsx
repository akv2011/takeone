// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MusicPicker, type MusicSelection } from '../src/components/MusicPicker';
const { query, preview } = vi.hoisted(() => ({ query: vi.fn(), preview: vi.fn() }));
vi.mock('convex/react', () => ({ useQuery: query, useAction: () => preview, useMutation: () => vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function Harness() {
  const [value, setValue] = useState<MusicSelection>();
  return <><MusicPicker value={value} onChange={setValue} /><output data-testid="selection">{JSON.stringify(value)}</output></>;
}
test('picker selects approved music and updates level, ducking and removal', () => {
  query.mockReturnValue([{ id: 'upbeat', label: 'Upbeat', attribution: 'Test artist' }]);
  render(<Harness />);
  fireEvent.change(screen.getByLabelText('Soundtrack'), { target: { value: 'upbeat' } });
  expect(screen.getByTestId('selection').textContent).toContain('"volume":0.18');
  expect(screen.getByText('Test artist')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Music level'), { target: { value: '30' } });
  fireEvent.click(screen.getByLabelText('Lower music while someone speaks'));
  expect(JSON.parse(screen.getByTestId('selection').textContent!)).toEqual({ trackId: 'upbeat', volume: 0.3, duck: false, replaceSourceAudio: false });
  expect(preview).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Soundtrack'), { target: { value: '' } });
  expect(screen.getByTestId('selection').textContent).toBe('');
});
test('removing original audio is opt-in and disables speech ducking with an explicit warning', () => {
  query.mockReturnValue([{ id: 'upbeat', label: 'Upbeat', attribution: 'Test artist' }]);
  render(<Harness />);
  fireEvent.change(screen.getByLabelText('Soundtrack'), { target: { value: 'upbeat' } });
  const replacement = screen.getByLabelText('Remove all original audio, including speech') as HTMLInputElement;
  const ducking = screen.getByLabelText('Lower music while someone speaks') as HTMLInputElement;
  expect(replacement.checked).toBe(false);
  fireEvent.click(replacement);
  expect(JSON.parse(screen.getByTestId('selection').textContent!).replaceSourceAudio).toBe(true);
  expect(ducking.disabled).toBe(true);
  expect(ducking.checked).toBe(false);
  expect(screen.getByText(/Speech, original music and sound effects will be removed/)).toBeTruthy();
  fireEvent.click(replacement);
  expect(ducking.disabled).toBe(false);
  expect(ducking.checked).toBe(true);
});
test('preview retries failures and refreshes an expired audio URL without changing the edit selection', async () => {
  query.mockReturnValue([{ id: 'upbeat', label: 'Upbeat', attribution: 'Test artist' }]);
  preview.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce({ url: 'https://media.example/first' }).mockResolvedValueOnce({ url: 'https://media.example/renewed' });
  render(<Harness />);
  fireEvent.change(screen.getByLabelText('Soundtrack'), { target: { value: 'upbeat' } });
  const selected = screen.getByTestId('selection').textContent;
  fireEvent.click(screen.getByRole('button', { name: 'Preview soundtrack · free' }));
  expect(await screen.findByText('Preview unavailable. Try again when the music service is connected.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Preview soundtrack · free' }));
  const audio = await screen.findByLabelText('Soundtrack preview');
  expect(audio.getAttribute('src')).toBe('https://media.example/first');
  fireEvent.error(audio);
  expect(screen.queryByLabelText('Soundtrack preview')).toBeNull();
  expect(screen.getByText('Preview expired or unavailable. Load it again.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Preview soundtrack · free' }));
  await waitFor(() => expect(screen.getByLabelText('Soundtrack preview').getAttribute('src')).toBe('https://media.example/renewed'));
  expect(preview).toHaveBeenCalledTimes(3);
  expect(preview).toHaveBeenLastCalledWith({ trackId: 'upbeat' });
  expect(screen.getByTestId('selection').textContent).toBe(selected);
});
test('unconfigured library explains why no tracks are available', () => {
  query.mockReturnValue([]); render(<Harness />);
  expect(screen.getByText('Choose your own audio below, or use the music library when it is connected.')).toBeTruthy();
  expect(screen.getAllByRole('option')).toHaveLength(1);
});
