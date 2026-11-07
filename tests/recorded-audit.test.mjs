import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,readdirSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {auditRecordedEvidence} from '../src/audit-recorded-evidence.mjs';
import {readFixedEvidenceText} from '../src/read-evidence-text.mjs';

const source=new URL('./fixtures/readonly-audit/',import.meta.url);
const root=mkdtempSync(join(tmpdir(),'antibody-recorded-audit-'));
const cli=fileURLToPath(new URL('../src/audit-recorded-evidence.mjs',import.meta.url));
let n=0;
function fixture() {
  const dir=join(root,'case-'+n++);mkdirSync(dir);
  for(const file of readdirSync(source))writeFileSync(join(dir,file.replace(/\.txt$/,'')),readFileSync(new URL(file,source)));
  return dir;
}
function snapshot(dir) {
  return Object.fromEntries(readdirSync(dir).map(name=>[name,createHash('sha256').update(readFileSync(join(dir,name))).digest('hex')]));
}
function run(dir,...extra){return spawnSync(process.execPath,[cli,dir,...extra],{encoding:'utf8',timeout:3000,maxBuffer:65536});}
test.after(()=>rmSync(root,{recursive:true,force:true}));

test('actual standalone entrypoint reads genuine artifacts without changing their bytes',()=>{
 const dir=fixture(),before=snapshot(dir),out=run(dir);
 assert.equal(out.status,0);assert.equal(out.stderr,'');
 const receipt=JSON.parse(out.stdout);
 assert.equal(receipt.status,'MATCHES_REVIEWED_SYNTHETIC_SNAPSHOTS');
 for(const key of ['runtimeReproduced','regressionExecuted','sourceAuthenticated','externalCaseVerified','g4Passed'])assert.equal(receipt[key],false);
 assert.deepEqual(snapshot(dir),before);
});
test('CLI never executes a regression source file even if its contents are executable',()=>{
 const dir=fixture(),marker=join(root,'should-never-exist');
 writeFileSync(join(dir,'queue-lost-ack.generated.test.mjs'),
   `import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(marker)},'UNEXPECTED_EXECUTION');throw new Error('MUST_NOT_RUN');`);
 const out=run(dir);
 assert.equal(out.status,2);assert.equal(out.stderr,'');
 const receipt=JSON.parse(out.stdout);
 assert.equal(receipt.results.queue.status,'HOLD_SNAPSHOT_CHANGED');
 assert.ok(!readdirSync(root).includes('should-never-exist'));
 assert.doesNotMatch(out.stdout,/MUST_NOT_RUN|UNEXPECTED_EXECUTION/);
});
test('duplicate raw keys and malformed sensitive text produce only hashes/status',()=>{
 for(const text of ['{"secret":sk-SYNTHETICONLY0123456789}',
   readFileSync(new URL('checkout-e1-experiment.json',source),'utf8').replace('{','{"scope":"PRIVATE_SYNTHETIC_ONLY_HIDDEN",')]) {
  const dir=fixture();writeFileSync(join(dir,'checkout-e1-experiment.json'),text);
  const out=run(dir);assert.equal(out.status,2);
  assert.equal(JSON.parse(out.stdout).results.checkout.status,'HOLD_SNAPSHOT_CHANGED');
  assert.doesNotMatch(out.stdout+out.stderr,/SYNTHETICONLY|HIDDEN|secret|SyntaxError/);
 }
});
test('missing file, oversized file and directory inputs fail closed without raw paths',()=>{
 for(const mode of ['missing','oversized','directory']) {
  const dir=fixture(),path=join(dir,'checkout-e1-experiment.json');rmSync(path);
  if(mode==='oversized')writeFileSync(path,Buffer.alloc(2*1024*1024+1,32));
  if(mode==='directory')mkdirSync(path);
  const out=run(dir);assert.equal(out.status,2);assert.equal(out.stderr,'');
  assert.equal(JSON.parse(out.stdout).results.checkout.status,'HOLD_INPUT_UNAVAILABLE');
  assert.ok(!out.stdout.includes(dir));
 }
});
test('invalid UTF-8 is rejected before text can be silently normalized',()=>{
 const dir=fixture();writeFileSync(join(dir,'checkout-e1-experiment.json'),Buffer.from([0xc0,0xaf]));
 assert.equal(auditRecordedEvidence(dir).results.checkout.status,'HOLD_INPUT_UNAVAILABLE');
});
test('reader rejects filename keys and never accepts caller-chosen traversal',()=>{
 const dir=fixture();
 for(const key of ['../checkout-e1-experiment.json','__proto__','constructor',null,{}]) {
  assert.throws(()=>readFixedEvidenceText(dir,key));
 }
});
test('final-component symlink is not an approved evidence file',t=>{
 const dir=fixture(),path=join(dir,'checkout-e1-experiment.json'),target=join(root,'original.json');
 writeFileSync(target,readFileSync(path));rmSync(path);
 try{symlinkSync(target,path);}catch(e){if(e.code==='EPERM')return t.skip('host symlink privilege absent; no bypass');throw e;}
 assert.equal(auditRecordedEvidence(dir).results.checkout.status,'HOLD_INPUT_UNAVAILABLE');
});
test('unsupported argument count and flags show only static usage',()=>{
 const dir=fixture();
 for(const args of [[],['--unknown'],[dir,'sk-SYNTHETICONLY0123456789']]) {
  const out=spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:3000,maxBuffer:65536});
  assert.equal(out.status,2);assert.equal(out.stdout,'');assert.match(out.stderr,/^Usage:/);
  assert.doesNotMatch(out.stderr,/SYNTHETICONLY/);
 }
});
test('a linked CLI entrypoint cannot silently exit successfully without auditing',t=>{
 const sourceCopy=join(root,'linked-source');mkdirSync(sourceCopy);
 for(const name of ['audit-recorded-evidence.mjs','snapshot-review.mjs','read-evidence-text.mjs'])
  writeFileSync(join(sourceCopy,name),readFileSync(new URL('../src/'+name,import.meta.url)));
 const link=join(sourceCopy,'audit-linked.mjs');
 try{symlinkSync(join(sourceCopy,'audit-recorded-evidence.mjs'),link);}catch(e){if(e.code==='EPERM')return t.skip('host symlink privilege absent; no bypass');throw e;}
 for(const flags of [[],['--preserve-symlinks-main']]){
  const missing=spawnSync(process.execPath,[...flags,link],{encoding:'utf8',timeout:3000,maxBuffer:65536});
  assert.equal(missing.status,2);assert.equal(missing.stdout,'');assert.match(missing.stderr,/^Usage:/);
  const dir=fixture();
  const valid=spawnSync(process.execPath,[...flags,link,dir],{encoding:'utf8',timeout:3000,maxBuffer:65536});
  assert.equal(valid.status,0);assert.equal(JSON.parse(valid.stdout).status,'MATCHES_REVIEWED_SYNTHETIC_SNAPSHOTS');
 }
});
test('controlled evidence replacement after path admission is rejected',()=>{
 const dir=fixture(),path=join(dir,'checkout-e1-experiment.json');
 const original=fs.openSync;let replaced=false;
 fs.openSync=function(candidate,...args){
  if(candidate===path&&!replaced){
   replaced=true;fs.renameSync(path,path+'.previous');fs.writeFileSync(path,fs.readFileSync(path+'.previous'));
  }
  return original(candidate,...args);
 };
 syncBuiltinESMExports();
 try{assert.throws(()=>readFixedEvidenceText(dir,'checkoutEvidence'),/LOCAL_EVIDENCE_READ_HOLD/);assert.ok(replaced);}
 finally{fs.openSync=original;syncBuiltinESMExports();}
});
test('controlled growth, truncation and same-length overwrite during read all hold',()=>{
 for(const mode of ['grow','truncate','overwrite']){
  const dir=fixture(),path=join(dir,'checkout-e1-experiment.json');
  const original=fs.readSync;let changed=false;
  fs.readSync=function(...args){
   const count=original(...args);
   if(!changed){
    changed=true;
    if(mode==='grow')fs.appendFileSync(path,' ');
    if(mode==='truncate')fs.truncateSync(path,1);
    if(mode==='overwrite'){
     const bytes=fs.readFileSync(path);bytes[0]=32;fs.writeFileSync(path,bytes);
     fs.utimesSync(path,0,1);
    }
   }
   return count;
  };
  syncBuiltinESMExports();
  try{assert.throws(()=>readFixedEvidenceText(dir,'checkoutEvidence'),/LOCAL_EVIDENCE_READ_HOLD/);assert.ok(changed);}
  finally{fs.readSync=original;syncBuiltinESMExports();}
 }
});
test('descriptors close on rejected text rather than accumulating leaked handles',()=>{
 const dir=fixture(),path=join(dir,'checkout-e1-experiment.json');
 fs.writeFileSync(path,Buffer.from([0xff]));
 const open=fs.openSync,close=fs.closeSync;let ownFd=null,closed=0;
 fs.openSync=function(candidate,...args){const fd=open(candidate,...args);if(candidate===path)ownFd=fd;return fd;};
 fs.closeSync=function(fd){if(fd===ownFd)closed++;return close(fd);};
 syncBuiltinESMExports();
 try{assert.throws(()=>readFixedEvidenceText(dir,'checkoutEvidence'));assert.notEqual(ownFd,null);assert.equal(closed,1);}
 finally{fs.openSync=open;fs.closeSync=close;syncBuiltinESMExports();}
});
test('importing from stdin or a caller with a missing argv path has no CLI effect',()=>{
 const moduleUrl=pathToFileURL(cli).href;
 for(const prelude of ['',`process.argv[1]=${JSON.stringify(join(root,'PRIVATE_SYNTHETIC_MISSING_ENTRY'))};`]){
  const input=prelude+`const {auditRecordedEvidence}=await import(${JSON.stringify(moduleUrl)});console.log(typeof auditRecordedEvidence);`;
  const out=spawnSync(process.execPath,['--input-type=module','-'],{input,encoding:'utf8',timeout:3000,maxBuffer:65536});
  assert.equal(out.status,0);assert.equal(out.stdout,'function\n');assert.equal(out.stderr,'');
 }
});
test('an empty directory cannot implicitly audit the current working directory',()=>{
 const dir=fixture();
 const out=spawnSync(process.execPath,[cli,''],{cwd:dir,encoding:'utf8',timeout:3000,maxBuffer:65536});
 assert.equal(out.status,2);assert.equal(out.stdout,'');assert.match(out.stderr,/^Usage:/);
 assert.throws(()=>readFixedEvidenceText('','checkoutEvidence'),/LOCAL_EVIDENCE_READ_HOLD/);
});
