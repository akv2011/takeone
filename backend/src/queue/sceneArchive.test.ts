import { afterEach, expect, test, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createExecutor } from './index.js';
import { DEFAULT_LIMITS, type JobSpec } from '../types.js';
const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});
test.each([true,false])('uncaptioned archive receives the pre-branding source only when captions are absent (%s)',async noCaptions=>{
 const dir=await mkdtemp(join(tmpdir(),'archive-boundary-'));dirs.push(dir);const source=join(dir,'source.mp4');await writeFile(source,'clean pixels and audio');
 const archive=vi.fn(async(path:string)=>{expect(await readFile(path,'utf8')).toBe('clean pixels and audio');});
 const executor=createExecutor({runOp:async(_input,op,ctx)=>{const outputPath=join(ctx.tmpDir,`${op.op}.mp4`);await writeFile(outputPath,op.op);return {outputPath};}},{outDir:dir,onUncaptionedOutput:archive});
 const job:JobSpec={id:'scene',userId:'u',platform:'cli',mode:'generate',source:{kind:'upload',path:source},isPro:false,limits:DEFAULT_LIMITS,
  ops:[...(noCaptions?[]:[{op:'captions' as const,source:'script' as const,style:'clean' as const}]),{op:'watermark',platform:true,text:'TakeOne',show:true}]};
 expect((await executor.enqueue(job)).ok).toBe(true);expect(archive).toHaveBeenCalledTimes(noCaptions?1:0);
});
