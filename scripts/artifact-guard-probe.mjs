/** Falsifies overwrite and symlink output behavior in a disposable clone only. */
import {mkdtempSync,cpSync,rmSync,symlinkSync,writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const source=join(dirname(fileURLToPath(import.meta.url)),'..');
const scratch=mkdtempSync(join(tmpdir(),'antibody-artifact-guard-'));
const clone=join(scratch,'fixture');
let outcome;
try{
 cpSync(source,clone,{recursive:true});
 const {writeArtifactOnce}=await import(pathToFileURL(join(clone,'src','artifact-safe.mjs')));
 const name='guard-probe-synthetic.txt';
 const file=writeArtifactOnce(name,'expected');
 assert.equal(readFileSync(file,'utf8'),'expected');
 assert.equal(writeArtifactOnce(name,'expected'),file);
 let refusedDifferent=false;
 try{writeArtifactOnce(name,'tampered');}catch{refusedDifferent=true;}
 assert.equal(refusedDifferent,true);
 const external=join(scratch,'outside.txt');writeFileSync(external,'EXTERNAL_SENTINEL');
 const link=join(clone,'artifacts','guard-probe-symlink.txt');
 let refusedSymlink=false;
 try{symlinkSync(external,link);writeArtifactOnce('guard-probe-symlink.txt','changed');}catch{refusedSymlink=true;}
 assert.equal(refusedSymlink,true);assert.equal(readFileSync(external,'utf8'),'EXTERNAL_SENTINEL');
 outcome={scope:'disposable clone only',firstWrite:'PASS',identicalIdempotentWrite:'PASS',differentOverwriteRefused:refusedDifferent,externalSymlinkRefused:refusedSymlink,externalSentinelUnchanged:true};
 console.log(JSON.stringify(outcome,null,2));
}finally{rmSync(scratch,{recursive:true,force:true});}
