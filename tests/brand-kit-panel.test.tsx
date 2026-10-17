// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ save: vi.fn(), kits: [] as any[], authenticated: true }));
vi.mock('convex/react', () => ({ useConvexAuth: () => ({ isAuthenticated: mocks.authenticated }), useQuery: () => mocks.kits, useMutation: () => mocks.save }));
import { BrandKitPanel } from '../src/components/BrandKitPanel';
const settings = { font: 'serif', captionStyle: 'clean', textColor: '#FFFFFF', outlineColor: '#000000' };
beforeEach(() => { mocks.kits = [{ _id: 'kit', name: 'Soap', revision: 1, settings }]; mocks.save.mockReset().mockResolvedValue({ kitId: 'kit', revision: 2 }); mocks.authenticated = true; });
afterEach(cleanup);
test('choosing and previewing kit is local and apply is explicit', () => {
 const change = vi.fn(), apply = vi.fn(); const view = render(<BrandKitPanel accountKey="owner" onChange={change} onApply={apply} />);
 fireEvent.click(screen.getByRole('button', { name: 'Brand kit' }));
 fireEvent.change(screen.getByLabelText('Saved brand kit'), { target: { value: 'kit' } }); expect(change).toHaveBeenCalledWith({ kitId: 'kit', revision: 1 }); expect(apply).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
 view.rerender(<BrandKitPanel accountKey="owner" value={{ kitId: 'kit', revision: 1 }} onChange={change} onApply={apply} />);
 fireEvent.click(screen.getByRole('button', { name: 'Apply kit' })); expect(apply).toHaveBeenCalledOnce();
});
test('save persists palette/font/style and no render is invoked', async () => {
 const apply = vi.fn(), change = vi.fn(); render(<BrandKitPanel accountKey="owner" onChange={change} onApply={apply} />);
 fireEvent.click(screen.getByRole('button', { name: 'Brand kit' }));
 fireEvent.click(screen.getByRole('button', { name: 'Create kit' }));
 fireEvent.change(screen.getByLabelText('Kit name'), { target: { value: 'My brand' } });
 fireEvent.change(screen.getByLabelText('Caption font'), { target: { value: 'mono' } });
 fireEvent.change(screen.getByLabelText('Text color'), { target: { value: '#12ab34' } });
 fireEvent.click(screen.getByRole('button', { name: 'Save kit' }));
 await screen.findByRole('button', { name: 'Create kit' });
 expect(mocks.save).toHaveBeenCalledWith({ name: 'My brand', settings: { ...settings, font: 'mono', textColor: '#12ab34' } }); expect(apply).not.toHaveBeenCalled();
});
test('late save after account change cannot select the prior owner kit', async () => {
 let resolve!: (value: any) => void; mocks.save.mockImplementation(() => new Promise(done => { resolve = done; }));
 const change = vi.fn(); const view = render(<BrandKitPanel accountKey="owner" onChange={change} />);
 fireEvent.click(screen.getByRole('button', { name: 'Brand kit' }));
 fireEvent.click(screen.getByRole('button', { name: 'Create kit' })); fireEvent.change(screen.getByLabelText('Kit name'), { target: { value: 'Private brand' } }); fireEvent.click(screen.getByRole('button', { name: 'Save kit' }));
 view.rerender(<BrandKitPanel accountKey="other" onChange={change} />);
 await act(async () => resolve({ kitId: 'private-kit', revision: 1 })); expect(change).not.toHaveBeenCalled(); expect(screen.queryByDisplayValue('Private brand')).toBeNull();
});
test('unsupported logo and missing archive cannot submit a render', () => {
 const apply = vi.fn(); render(<BrandKitPanel accountKey="owner" value={{ kitId: 'kit', revision: 1 }} onChange={vi.fn()} onApply={apply} unavailable />);
 fireEvent.click(screen.getByRole('button', { name: 'Brand kit' }));
 expect((screen.getByRole('button', { name: 'Apply kit' }) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button', { name: 'Edit selected kit' }));
 fireEvent.change(screen.getByLabelText(/PNG logo/), { target: { files: [new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })] } });
 expect(screen.getByRole('alert').textContent).toContain('Use a PNG'); expect(apply).not.toHaveBeenCalled();
});
test('a changed revision requires reselection before applying', () => {
 render(<BrandKitPanel accountKey="owner" value={{ kitId: 'kit', revision: 0 }} onChange={vi.fn()} onApply={vi.fn()} />);
 fireEvent.click(screen.getByRole('button', { name: 'Brand kit' }));
 expect(screen.getByRole('status').textContent).toContain('changed'); expect((screen.getByRole('button', { name: 'Apply kit' }) as HTMLButtonElement).disabled).toBe(true);
});

test.each(['invalid', 'cancel'])('a %s logo selection clears a pending file read without adopting its late bytes', async kind => {
 let resolve!: (value: ArrayBuffer) => void;
 const file = new File(['pending'], 'logo.png', { type: 'image/png' });
 Object.defineProperty(file, 'arrayBuffer', { value: () => new Promise(done => { resolve = done; }) });
 render(<BrandKitPanel accountKey="owner" value={{ kitId: 'kit', revision: 1 }} onChange={vi.fn()} />);
 fireEvent.click(screen.getByRole('button', { name: 'Brand kit' }));
 fireEvent.click(screen.getByRole('button', { name: 'Edit selected kit' }));
 const input = screen.getByLabelText(/PNG logo/);
 fireEvent.change(input, { target: { files: [file] } });
 expect((screen.getByRole('button', { name: 'Save kit' }) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(input, { target: { files: kind === 'cancel' ? [] : [new File(['bad'], 'logo.svg', { type: 'image/svg+xml' })] } });
 expect((screen.getByRole('button', { name: 'Save kit' }) as HTMLButtonElement).disabled).toBe(false);
 await act(async () => resolve(new ArrayBuffer(64)));
 fireEvent.click(screen.getByRole('button', { name: 'Save kit' }));
 await act(async () => {});
 expect(mocks.save).toHaveBeenCalledWith({ kitId: 'kit', revision: 1, name: 'Soap', settings });
});
