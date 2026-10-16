// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const mocks=vi.hoisted(()=>({options:{eligible:true,uploads:[{id:'upload',name:'Owned clip'}]},request:vi.fn()}));
vi.mock('convex/react',()=>({useQuery:()=>mocks.options,useMutation:()=>mocks.request}));
import { SceneReplacementControls } from '../src/components/SceneReplacementControls';
afterEach(cleanup);beforeEach(()=>{mocks.options={eligible:true,uploads:[{id:'upload',name:'Owned clip'}]};mocks.request.mockReset();});
const props=()=>({jobId:'source',accountKey:'owner',sceneCount:3,onReplaced:vi.fn()});
const select=()=>{fireEvent.change(screen.getByLabelText('Scene to replace'),{target:{value:'1'}});fireEvent.change(screen.getByLabelText('Replacement video'),{target:{value:'upload'}});fireEvent.click(screen.getByRole('checkbox'));};
test('requires a selected owned video and rights confirmation, then queues one explicit scene',async()=>{
 const p=props();mocks.request.mockResolvedValue({jobId:'new-version'});render(<SceneReplacementControls {...p}/>);
 expect((screen.getByRole('button',{name:'Replace scene'}) as HTMLButtonElement).disabled).toBe(true);
 select();fireEvent.click(screen.getByRole('button',{name:'Replace scene'}));
 await waitFor(()=>expect(p.onReplaced).toHaveBeenCalledWith('new-version'));
 expect(mocks.request).toHaveBeenCalledExactlyOnceWith({sourceJobId:'source',index:1,uploadId:'upload',requestId:expect.any(String),confirmedOwnership:true});
});
test('reuses retry identity after a failed response and does not navigate after unmount',async()=>{
 const p=props();mocks.request.mockRejectedValueOnce(Error('offline'));
 const view=render(<SceneReplacementControls {...p}/>);select();fireEvent.click(screen.getByRole('button',{name:'Replace scene'}));
 await screen.findByRole('alert');const requestId=mocks.request.mock.calls[0][0].requestId;
 let resolve!:(value:unknown)=>void;mocks.request.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 fireEvent.click(screen.getByRole('button',{name:'Replace scene'}));expect(mocks.request.mock.calls[1][0].requestId).toBe(requestId);
 view.unmount();resolve({jobId:'late'});await Promise.resolve();expect(p.onReplaced).not.toHaveBeenCalled();
});
test('does not expose replacement actions for old missing archives or empty libraries',()=>{
 mocks.options={eligible:false,uploads:[]};const p=props();const view=render(<SceneReplacementControls {...p}/>);
 expect(screen.queryByRole('button',{name:'Replace scene'})).toBeNull();
 mocks.options={eligible:true,uploads:[]};view.rerender(<SceneReplacementControls {...p}/>);
 expect(screen.getByText(/Upload an owned video/)).toBeTruthy();expect(mocks.request).not.toHaveBeenCalled();
});
