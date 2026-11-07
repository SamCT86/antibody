/** Isolated manifest checks only: no experiment, SQLite or legacy suite. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,symlinkSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {verifyOnDisk,verifyManifestRaw,buildManifest} from '../scripts/package-integrity.mjs';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
const base=fileURLToPath(new URL('../',import.meta.url));
const script=fileURLToPath(new URL('../scripts/package-integrity.mjs',import.meta.url));
const temporary=mkdtempSync(join(tmpdir(),'antibody-export-integrity-'));
test.after(()=>rmSync(temporary,{recursive:true,force:true}));
const run=(args,input)=>spawnSync(process.execPath,args,{input,encoding:'utf8',timeout:3000,maxBuffer:65536});
function sourceCopy(name){
 const dir=join(temporary,name);cpSync(base,dir,{recursive:true,
  filter:source=>resolve(source)!==resolve(base,'.git')});
 writeFileSync(join(dir,'SHA256SUMS.txt'),buildManifest(dir));
 assert.equal(verifyOnDisk(dir).ok,true,'independent fixture must initially verify');
 return dir;
}
test('unlisted root source files cannot pass the export manifest',()=>{
 const dir=sourceCopy('extra-root-file');
 writeFileSync(join(dir,'PRIVATE_CANARY_EXTRA.mjs'),'// inert source, never executed\n');
 const result=verifyOnDisk(dir);assert.equal(result.ok,false);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE_CANARY/);
});
test('unlisted root directories cannot pass the export manifest',()=>{
 const dir=sourceCopy('extra-root-directory');
 mkdirSync(join(dir,'unexpected-source'));
 writeFileSync(join(dir,'unexpected-source','data.txt'),'inert synthetic data');
 assert.equal(verifyOnDisk(dir).ok,false);
});
test('ordinary Git metadata is excluded explicitly without allowing other root files',()=>{
 const dir=sourceCopy('git-metadata');mkdirSync(join(dir,'.git'));
 assert.equal(verifyOnDisk(dir).ok,true);
 writeFileSync(join(dir,'unexpected.txt'),'inert');assert.equal(verifyOnDisk(dir).ok,false);
});
test('a regular worktree Git pointer is excluded without being interpreted',()=>{
 const dir=sourceCopy('git-pointer');
 writeFileSync(join(dir,'.git'),'gitdir: PRIVATE_SYNTHETIC_NOT_READ\n');
 assert.equal(verifyOnDisk(dir).ok,true);
});
test('redirected Git metadata is rejected without following its target',t=>{
 const dir=sourceCopy('linked-git-metadata'),target=join(temporary,'git-target');mkdirSync(target);
 try{symlinkSync(target,join(dir,'.git'),'junction');}catch(e){if(e.code==='EPERM')return t.skip('host link privilege absent; no bypass');throw e;}
 assert.equal(verifyOnDisk(dir).ok,false);
});
test('the declared export manifest verifies without loading the research engine',()=>{
 const result=verifyOnDisk(base);assert.equal(result.ok,true);assert.ok(result.files>40);
});
test('missing source never leaks a private absolute path through the verifier receipt',()=>{
 const missing=join(temporary,'PRIVATE_CANARY_PATH');mkdirSync(missing);
 const out=verifyManifestRaw('0'.repeat(64)+'  README.md\n',missing);
 assert.equal(out.ok,false);assert.ok(!JSON.stringify(out).includes(missing));
 assert.doesNotMatch(JSON.stringify(out),/PRIVATE_CANARY_PATH|ENOENT|lstat|realpath/);
});
test('a linked manifest CLI cannot silently report success without verifying',t=>{
 const root=join(temporary,'linked-root');mkdirSync(join(root,'scripts'),{recursive:true});
 const copy=join(root,'scripts','package-integrity.mjs');writeFileSync(copy,readFileSync(script));
 const link=join(root,'scripts','linked-integrity.mjs');
 try{symlinkSync(copy,link);}catch(e){if(e.code==='EPERM')return t.skip('host symlink privilege absent; no bypass');throw e;}
 for(const flags of [[],['--preserve-symlinks-main']]){
  const out=run([...flags,link,'verify']);assert.equal(out.status,2);
  assert.equal(JSON.parse(out.stdout).ok,false);assert.equal(out.stderr,'');
 }
});
test('unsupported manifest operation has static diagnostics and a failing exit',()=>{
 const out=run([script,'PRIVATE_CANARY_OPERATION']);
 assert.equal(out.status,2);assert.equal(out.stdout,'');
 assert.equal(out.stderr.trim(),'HOLD: source manifest operation failed');
});
test('importing the manifest verifier from stdin performs no CLI operation',()=>{
 const out=run(['--input-type=module','-'],`const m=await import(${JSON.stringify(pathToFileURL(script).href)});console.log(typeof m.verifyOnDisk);`);
 assert.equal(out.status,0);assert.equal(out.stdout,'function\n');assert.equal(out.stderr,'');
});
test('an oversized manifest holds before whole-file reading',()=>{
 const dir=join(temporary,'oversized-manifest');mkdirSync(dir);
 const file=join(dir,'SHA256SUMS.txt');writeFileSync(file,Buffer.alloc(128001,32));
 const original=fs.readFileSync;let wholeFileReads=0;
 fs.readFileSync=function(path,...args){if(path===file)wholeFileReads++;return original.call(this,path,...args);};
 syncBuiltinESMExports();
 try{assert.equal(verifyOnDisk(dir).ok,false);assert.equal(wholeFileReads,0);}
 finally{fs.readFileSync=original;syncBuiltinESMExports();}
});
