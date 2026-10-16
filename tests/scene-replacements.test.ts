import { convexTest } from 'convex-test';
import { afterEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
const modules = import.meta.glob('../convex/**/*.ts');
const outputMetadata = { mediaDurationMs: 1_000, mediaWidth: 1080, mediaHeight: 1920, mediaHasAudio: true };
const plan = { version: 1 as const, durationSec: 6, scenes: [0,1,2].map(i => ({ startSec:i*2,endSec:(i+1)*2,purpose:'Original',searchTerms:['original footage'],shotType:'wide',motion:'still' })) };
afterEach(()=>{vi.unstubAllEnvs();});
async function setup() {
 vi.stubEnv('WORKER_SECRET','scene-secret'); const t=convexTest(schema,modules);
 await t.run(ctx=>ctx.db.insert('users',{tokenIdentifier:'owner',credits:5,freeUsed:0}));
 const sourceJobId=await t.run(ctx=>ctx.db.insert('genJobs',{userId:'owner',mode:'generate',prompt:'Make a video',status:'done',createdAt:Date.now(),attempts:1,leaseToken:'source-1',scenePlanLeaseToken:'source-1',scenePlanAttempt:1,scenePlan:plan,brand:{font:'mono',captionStyle:'clean',textColor:'#AABBCC',outlineColor:'#112233'},captionStyle:'clean',captionFont:'serif',captionPosition:'top'}));
 await t.run(ctx=>ctx.db.patch(sourceJobId,{storageKey:`videos/${sourceJobId}/source-1.mp4`,cleanStorageKey:`videos/${sourceJobId}/source-1-clean.mp4`,captionStorageKey:`captions/${sourceJobId}/source-1.json`}));
 const storageId=await t.run(ctx=>ctx.storage.store(new Blob(['fixture'],{type:'video/mp4'})));
 const uploadId=await t.run(ctx=>ctx.db.insert('uploads',{userId:'owner',status:'ready',kind:'video',name:'My scene',size:7,contentType:'video/mp4',createdAt:Date.now(),storageId,mediaDurationMs:6000,mediaWidth:1920,mediaHeight:1080,mediaHasAudio:true}));
 const args={sourceJobId,uploadId,index:1,requestId:'replace-request-1',confirmedOwnership:true};
 const owner=t.withIdentity({subject:'owner'});
 const request=(extra={})=>owner.mutation(ref<'mutation'>('sceneReplacements:request'),{...args,...extra});
 const call=(name:string,input:object)=>t.mutation(ref<'mutation'>(`generate:${name}`),{workerSecret:'scene-secret',...input});
 return {t,owner,sourceJobId,uploadId,storageId,args,request,call};
}
test('snapshots owned replacement, original archives and captions, with one reservation and exact retries',async()=>{
 const {t,owner,args,request,storageId,sourceJobId}=await setup();
 const first=await request();expect(await request()).toEqual(first);
 const job=await t.run(ctx=>ctx.db.get(first.jobId));
 expect(job).toMatchObject({mode:'edit',sourceStorageId:storageId,sourceStorageKey:`videos/${sourceJobId}/source-1-clean.mp4`,parentJobId:sourceJobId,rootJobId:sourceJobId,captionStyle:'clean',captionFont:'serif',captionPosition:'top',sceneReplacement:{index:1,uploadId:args.uploadId}});
 expect(job!.brand).toMatchObject({font:'mono',textColor:'#AABBCC',outlineColor:'#112233'});
 expect(job!.sceneReplacement.plan.scenes[0]).toEqual(plan.scenes[0]);expect(job!.sceneReplacement.plan.scenes[2]).toEqual(plan.scenes[2]);
 expect(job!.sceneReplacement.plan.scenes[1]).toMatchObject({startSec:2,endSec:4,purpose:'Creator-uploaded replacement'});
 expect((await t.run(ctx=>ctx.db.query('users').first()))!.freeUsed).toBe(1);
 await expect(request({index:0})).rejects.toThrow('REQUEST_CONTENT_CONFLICT');
 await expect(owner.mutation(ref<'mutation'>('uploads:remove'),{uploadId:args.uploadId})).rejects.toThrow('UPLOAD_IN_USE');
 await owner.mutation(ref<'mutation'>('generate:cancelJob'),{jobId:first.jobId});
 await expect(owner.mutation(ref<'mutation'>('generate:cancelJob'),{jobId:first.jobId})).rejects.toThrow('CANNOT_CANCEL_RUNNING_JOB');
 expect((await t.run(ctx=>ctx.db.query('users').first()))!.freeUsed).toBe(0);
 await owner.mutation(ref<'mutation'>('uploads:remove'),{uploadId:args.uploadId});
 expect(await request()).toEqual(first);
});
test('enforces ownership, readiness, video kind, rights and scene bounds before spending',async()=>{
 const {t,owner,args,request,uploadId,sourceJobId}=await setup();
 await expect(t.withIdentity({subject:'other'}).mutation(ref<'mutation'>('sceneReplacements:request'),args)).rejects.toThrow();
 for(const index of [-1,3,1.5]) await expect(request({index})).rejects.toThrow('INVALID_SCENE_INDEX');
 await expect(request({confirmedOwnership:false})).rejects.toThrow('CONFIRM_VIDEO_RIGHTS');
 for(const patch of [{kind:'audio'}, {kind:'video',status:'pending'}, {status:'ready',userId:'other'}]) {
  await t.run(ctx=>ctx.db.patch(uploadId,patch as any));await expect(request()).rejects.toThrow('UPLOAD_NOT_READY');
 }
 await t.run(ctx=>ctx.db.patch(sourceJobId,{cleanStorageKey:undefined}));
 expect(await owner.query(ref<'query'>('sceneReplacements:options'),{jobId:sourceJobId,accountKey:'owner'})).toEqual({eligible:false,uploads:[]});
 await expect(request()).rejects.toThrow('SCENE_SOURCE_UNAVAILABLE');
 expect((await t.run(ctx=>ctx.db.query('users').first()))!.freeUsed).toBe(0);
});
test('unprobed legacy ready video is excluded and cannot replace a scene',async()=>{
 const {t,owner,request,uploadId,sourceJobId}=await setup();
 await t.run(ctx=>ctx.db.patch(uploadId,{mediaDurationMs:undefined,mediaWidth:undefined,mediaHeight:undefined,mediaHasAudio:undefined}));
 expect((await owner.query(ref<'query'>('sceneReplacements:options'),{jobId:sourceJobId,accountKey:'owner'})).uploads).toEqual([]);
 await expect(request()).rejects.toThrow('UPLOAD_NOT_READY');
 expect((await t.run(ctx=>ctx.db.query('users').first()))!.freeUsed).toBe(0);
});
test('new attempt receives the immutable plan and exact completion enables another replacement',async()=>{
 const {t,owner,request,call}=await setup();const {jobId}=await request();
 await t.run(ctx=>ctx.db.patch(jobId,{status:'dispatched',attempts:1,leaseExpiresAt:Date.now()+60000}));
 const claim=await call('claimJob',{jobId,workerId:'replacement-worker'});
 expect(claim.sceneReplacement.index).toBe(1);expect(claim.sourceUploadUrl).toBeTruthy();
 const save=(leaseToken:string,plan:any)=>t.mutation(ref<'mutation'>('scenePlans:save'),{workerSecret:'scene-secret',jobId,leaseToken,plan});
 expect(await save('stale',claim.sceneReplacement.plan)).toBe(false);
 const invalid=structuredClone(claim.sceneReplacement.plan);invalid.scenes[0].purpose='Change another scene';
 await expect(save(claim.leaseToken,invalid)).rejects.toThrow('SCENE_PLAN_CONFLICT');
 expect(await save(claim.leaseToken,claim.sceneReplacement.plan)).toBe(true);
 const output={...outputMetadata,jobId,leaseToken:claim.leaseToken,storageKey:`videos/${jobId}/${claim.leaseToken}.mp4`,cleanStorageKey:`videos/${jobId}/${claim.leaseToken}-clean.mp4`,captionStorageKey:`captions/${jobId}/${claim.leaseToken}.json`};
 await expect(call('completeJob',{...outputMetadata,jobId,leaseToken:claim.leaseToken,storageKey:output.storageKey})).rejects.toThrow('SCENE_ARCHIVE_REQUIRED');
 expect(await call('completeJob',output)).toBe(true);
 expect((await owner.query(ref<'query'>('sceneReplacements:options'),{jobId,accountKey:'owner'})).eligible).toBe(true);
 expect((await owner.query(ref<'query'>('scenePlans:get'),{jobId,accountKey:'owner'})).state).toBe('completed');
 expect(await owner.query(ref<'query'>('generate:getJob'),{jobId})).not.toHaveProperty('sceneReplacement');
});
test('options exclude foreign owners, accounts, missing IDs and stale plan attempts',async()=>{
 const {t,owner,sourceJobId}=await setup();
 expect((await owner.query(ref<'query'>('sceneReplacements:options'),{jobId:sourceJobId,accountKey:'owner'})).uploads).toHaveLength(1);
 for(const args of [{jobId:sourceJobId,accountKey:'other'},{jobId:'invalid',accountKey:'owner'}]) expect((await owner.query(ref<'query'>('sceneReplacements:options'),args)).eligible).toBe(false);
 await t.run(ctx=>ctx.db.patch(sourceJobId,{scenePlanAttempt:2}));
 expect((await owner.query(ref<'query'>('sceneReplacements:options'),{jobId:sourceJobId,accountKey:'owner'})).eligible).toBe(false);
});
test('caption-free completion keeps scene retention private and does not offer empty caption restyling',async()=>{
 const {t,owner,sourceJobId,request,call}=await setup();
 await t.run(ctx=>ctx.db.patch(sourceJobId,{captionStyle:'none'}));
 const {jobId}=await request();
 await t.run(ctx=>ctx.db.patch(jobId,{status:'dispatched',attempts:1,leaseExpiresAt:Date.now()+60000}));
 const claim=await call('claimJob',{jobId,workerId:'empty-caption-worker'});
 await t.mutation(ref<'mutation'>('scenePlans:save'),{workerSecret:'scene-secret',jobId,leaseToken:claim.leaseToken,plan:claim.sceneReplacement.plan});
 await call('completeJob',{...outputMetadata,jobId,leaseToken:claim.leaseToken,storageKey:`videos/${jobId}/${claim.leaseToken}.mp4`,cleanStorageKey:`videos/${jobId}/${claim.leaseToken}-clean.mp4`,captionStorageKey:`captions/${jobId}/${claim.leaseToken}.json`,sceneArchiveOnly:true});
 const raw=await t.run(ctx=>ctx.db.get(jobId));expect(raw!.sceneArchive).toBeTruthy();expect(raw!.captionStorageKey).toBeUndefined();
 expect((await owner.query(ref<'query'>('sceneReplacements:options'),{jobId,accountKey:'owner'})).eligible).toBe(true);
 const visible=await owner.query(ref<'query'>('generate:getJob'),{jobId});expect(visible).not.toHaveProperty('sceneArchive');expect(visible.captionStorageKey).toBeUndefined();
 await expect(owner.mutation(ref<'mutation'>('generate:requestCaptionEdit'),{sourceJobId:jobId,captionStyle:'clean',requestId:'empty-caption-request'})).rejects.toThrow('CAPTION_SOURCE_UNAVAILABLE');
});
