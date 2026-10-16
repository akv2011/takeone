import {test,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ff,ffprobe} from './ffmpeg.js';
import {mediaCore} from './index.js';
import {structuredOps} from './structuredEdit.js';
const exec=promisify(execFile);
test('real 3x video and audio shorten together while audio pitch stays 440Hz',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'speed3-'));
 try {
 const source=join(dir,'source.mp4');
 await ff(['-f','lavfi','-i','testsrc2=s=160x90:r=30:d=6','-f','lavfi','-i','sine=frequency=440:duration=6','-c:v','libx264','-threads','2','-c:a','aac',source]);
 expect(structuredOps({speed:3})).toContainEqual({op:'speed',factor:3});
 const ctx={tmpDir:dir,isPro:true,strictMedia:true};
 const {outputPath}=await mediaCore.runOp(source,{op:'speed',factor:3},ctx);
 expect((await ffprobe(outputPath)).durationSec).toBeCloseTo(2,0);
 const {stdout}=await exec('ffmpeg',['-v','error','-i',outputPath,'-map','0:a:0','-ac','1','-ar','8000','-f','s16le','-'],{encoding:'buffer'});
 const samples=stdout.length/2;expect(samples/8000).toBeGreaterThan(1.8);expect(samples/8000).toBeLessThan(2.2);
 let crossings=0;for(let i=801;i<samples-800;i++)if(stdout.readInt16LE((i-1)*2)<=0&&stdout.readInt16LE(i*2)>0)crossings++;
 expect(crossings/((samples-1600)/8000)).toBeGreaterThan(430);expect(crossings/((samples-1600)/8000)).toBeLessThan(450);
 await ff(['-i',outputPath,'-f','null','-']);
 for(const factor of [3.01,4,13,NaN])await expect(mediaCore.runOp(source,{op:'speed',factor},ctx)).rejects.toThrow('0.5x and 3x');
 }finally{await rm(dir,{recursive:true,force:true});}
},60000);
