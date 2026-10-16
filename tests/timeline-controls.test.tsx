// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TimelineControls } from '../src/components/TimelineControls';
afterEach(cleanup);
test('preview is separate from a paid submission and carries the selected speed', () => {
 const onApply = vi.fn(), onPreview = vi.fn();
 render(<TimelineControls duration={90} disabled={false} onApply={onApply} onPreview={onPreview} />);
 fireEvent.change(screen.getByLabelText('Start (seconds)'), { target: { value: '65' } });
 fireEvent.change(screen.getByLabelText('End (seconds)'), { target: { value: '75' } });
 fireEvent.change(screen.getByLabelText('Playback speed'), { target: { value: '2' } });
 fireEvent.click(screen.getByText('Preview selection'));
 expect(onPreview).toHaveBeenCalledWith(65, 75, 2);
 expect(onApply).not.toHaveBeenCalled();
 fireEvent.click(screen.getByText('Apply trim & speed · 1 generation'));
 expect(onApply).toHaveBeenCalledWith('Trim 01:05 to 01:15 and speed 2x');
});
test.each(['0', '31', '1.0001', '-1'])('invalid end %s cannot preview or spend', end => {
 const onApply = vi.fn(), onPreview = vi.fn();
 render(<TimelineControls duration={30} disabled={false} onApply={onApply} onPreview={onPreview} />);
 fireEvent.change(screen.getByLabelText('End (seconds)'), { target: { value: end } });
 fireEvent.click(screen.getByText('Preview selection'));
 fireEvent.click(screen.getByText('Apply trim & speed · 1 generation'));
 expect(onPreview).not.toHaveBeenCalled(); expect(onApply).not.toHaveBeenCalled();
 expect(screen.getByRole('alert')).toBeTruthy();
});

test('fractional cuts preserve milliseconds in preview and render instructions', () => {
 const onApply = vi.fn(), onPreview = vi.fn();
 render(<TimelineControls duration={90} disabled={false} onApply={onApply} onPreview={onPreview} />);
 fireEvent.change(screen.getByLabelText('Start (seconds)'), { target: { value: '65.125' } });
 fireEvent.change(screen.getByLabelText('End (seconds)'), { target: { value: '75.375' } });
 fireEvent.click(screen.getByText('Preview selection'));
 expect(onPreview).toHaveBeenCalledWith(65.125, 75.375, 1);
 fireEvent.click(screen.getByText('Apply trim & speed · 1 generation'));
 expect(onApply).toHaveBeenCalledWith('Trim 01:05.125 to 01:15.375');
});

test('seeking and marking read the player without submitting a generation', () => {
 const onApply = vi.fn(), onPreview = vi.fn(), onSeek = vi.fn();
 const readCurrentTime = vi.fn().mockReturnValue(2.1254);
 render(<TimelineControls duration={10} currentTime={1} disabled={false} onSeek={onSeek} readCurrentTime={readCurrentTime} onApply={onApply} onPreview={onPreview} />);
 fireEvent.change(screen.getByLabelText('Seek video'), { target: { value: '2.125' } });
 expect(onSeek).toHaveBeenCalledWith(2.125);
 fireEvent.click(screen.getByText('Set start here'));
 readCurrentTime.mockReturnValue(7.8754);
 fireEvent.click(screen.getByText('Set end here'));
 expect((screen.getByLabelText('Start (seconds)') as HTMLInputElement).value).toBe('2.125');
 expect((screen.getByLabelText('End (seconds)') as HTMLInputElement).value).toBe('7.875');
 expect(onApply).not.toHaveBeenCalled(); expect(onPreview).not.toHaveBeenCalled();
 fireEvent.click(screen.getByText('Apply trim & speed · 1 generation'));
 expect(onApply).toHaveBeenCalledWith('Trim 00:02.125 to 00:07.875');
});

test('range controls synchronize numeric boundaries and seek their preview', () => {
 const onApply = vi.fn(), onSeek = vi.fn();
 render(<TimelineControls duration={10} disabled={false} onSeek={onSeek} onApply={onApply} onPreview={vi.fn()} />);
 fireEvent.change(screen.getByLabelText('Selection end'), { target: { value: '8' } });
 fireEvent.change(screen.getByLabelText('Selection start'), { target: { value: '3' } });
 expect(onSeek.mock.calls).toEqual([[8], [3]]);
 expect((screen.getByLabelText('Start (seconds)') as HTMLInputElement).value).toBe('3');
 expect((screen.getByLabelText('End (seconds)') as HTMLInputElement).value).toBe('8');
 expect((screen.getByLabelText('Selection start') as HTMLInputElement).max).toBe('7.999');
 expect((screen.getByLabelText('Selection end') as HTMLInputElement).min).toBe('3.001');
 expect(onApply).not.toHaveBeenCalled();
});

test.each([undefined, NaN, Infinity, 0])('unknown duration %s disables seeking and marking', duration => {
 const onSeek = vi.fn(), readCurrentTime = vi.fn();
 render(<TimelineControls duration={duration} disabled={false} onSeek={onSeek} readCurrentTime={readCurrentTime} onApply={vi.fn()} onPreview={vi.fn()} />);
 expect((screen.getByLabelText('Seek video') as HTMLInputElement).disabled).toBe(true);
 fireEvent.click(screen.getByText('Set start here'));
 expect(readCurrentTime).not.toHaveBeenCalled(); expect(onSeek).not.toHaveBeenCalled();
});

test('marking an end before the start is visible but cannot spend', () => {
 const onApply = vi.fn();
 render(<TimelineControls duration={10} disabled={false} onSeek={vi.fn()} readCurrentTime={() => 1} onApply={onApply} onPreview={vi.fn()} />);
 fireEvent.change(screen.getByLabelText('Start (seconds)'), { target: { value: '2' } });
 fireEvent.click(screen.getByText('Set end here'));
 expect(screen.getByRole('alert')).toBeTruthy();
 fireEvent.click(screen.getByText('Apply trim & speed · 1 generation'));
 expect(onApply).not.toHaveBeenCalled();
});


test('structured application preserves fractional seconds and never also submits an instruction', () => {
 const onApply=vi.fn(), onApplyTransforms=vi.fn();
 render(<TimelineControls duration={20} disabled={false} onPreview={vi.fn()} onApply={onApply} onApplyTransforms={onApplyTransforms} />);
 fireEvent.change(screen.getByLabelText('Start (seconds)'), {target:{value:'1.125'}});
 fireEvent.change(screen.getByLabelText('End (seconds)'), {target:{value:'3.875'}});
 fireEvent.change(screen.getByLabelText('Playback speed'), {target:{value:'3'}});
 fireEvent.click(screen.getByText('Apply trim & speed · 1 generation'));
 expect(onApplyTransforms).toHaveBeenCalledWith({trim:{start:1.125,end:3.875},speed:3});
 expect(onApply).not.toHaveBeenCalled();
});

test('slowdown permits exactly 300 output seconds and blocks longer exports while keeping free preview', () => {
 const onApplyTransforms=vi.fn(), onPreview=vi.fn();
 render(<TimelineControls duration={200} disabled={false} onPreview={onPreview} onApplyTransforms={onApplyTransforms} />);
 fireEvent.change(screen.getByLabelText('End (seconds)'), {target:{value:'150'}});
 fireEvent.change(screen.getByLabelText('Playback speed'), {target:{value:'0.5'}});
 const apply=screen.getByText('Apply trim & speed · 1 generation') as HTMLButtonElement;
 expect(apply.disabled).toBe(false);
 fireEvent.click(apply);
 expect(onApplyTransforms).toHaveBeenCalledOnce();
 fireEvent.change(screen.getByLabelText('End (seconds)'), {target:{value:'150.001'}});
 expect(apply.disabled).toBe(true);
 expect(screen.getByRole('alert').textContent).toContain('exceed 300 seconds');
 fireEvent.click(apply);
 expect(onApplyTransforms).toHaveBeenCalledOnce();
 fireEvent.click(screen.getByText('Preview selection'));
 expect(onPreview).toHaveBeenCalledWith(0,150.001,0.5);
});
