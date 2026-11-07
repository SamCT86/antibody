/**
 * E1 adversarial mutants. Each mutation runs ONLY in a disposable temp copy.
 * A mutant is killed only when tests detect its intended logic change,
 * not when a syntax/module/runner error occurs.
 */
import {mkdtempSync,mkdirSync,copyFileSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
import {wasNamedTestFailed} from './tap-failure-classifier.mjs';
const root=resolve(join(dirname(fileURLToPath(import.meta.url)),'..'));
const source=readFileSync(join(root,'src','engine.mjs'),'utf8');
const mutants=[
 {id:'M01_DEDUP_REMOVED',old:"if (spec.build === 'fixed') {",replace:"if (false) {",test:'same fault on the fixed build'},
 {id:'M02_POSTCOMMIT_DROP_REMOVED',old:"if(spec.fault==='drop_ack_after_commit' && !dropped && result.committed) {",replace:"if(false) {",test:'bad after-commit ACK loss'},
 {id:'M03_LEDGER_OBSERVER_SPOOFED',old:"const row=observer.prepare('SELECT COUNT(*) AS n FROM charges WHERE intent_id=?').get(intent);",replace:"const row={n:1};",test:'bad after-commit ACK loss'},
 {id:'M04_PROVENANCE_HASH_IGNORED',old:"if(evidenceSha256!==sha256(JSON.stringify(rest))) return false;",replace:"if(false) return false;",test:'pure digest mismatch is rejected even when all semantic fields are coherent'},
];
const ledger=[];
for(const m of mutants){
 if(source.split(m.old).length!==2)throw Error(`source anchor not unique for ${m.id}`);
 const dir=mkdtempSync(join(tmpdir(),'antibody-mutant-'));
 try {
  mkdirSync(join(dir,'src'),{recursive:true});mkdirSync(join(dir,'tests'),{recursive:true});
  writeFileSync(join(dir,'src','engine.mjs'),source.replace(m.old,m.replace));
  copyFileSync(join(root,'src','artifact-safe.mjs'),join(dir,'src','artifact-safe.mjs'));
  for(const t of ['engine.test.mjs','negative.test.mjs','verification.test.mjs'])copyFileSync(join(root,'tests',t),join(dir,'tests',t));
  const result=spawnSync(process.execPath,['--test','--test-reporter=tap','tests/engine.test.mjs','tests/negative.test.mjs','tests/verification.test.mjs'],{
   cwd:dir,env:{...process.env,NODE_NO_WARNINGS:'1'},encoding:'utf8',timeout:7000,maxBuffer:1000000,
  });
  const out=(result.stdout||'')+(result.stderr||'');
  const semanticFailure=wasNamedTestFailed(out,m.test);
  const detected=result.status===1&&semanticFailure&&!result.error;
  ledger.push({id:m.id,detected,exitCode:result.status,intendedAnchor:m.test,failedTestLines:out.split(/\r?\n/).filter(line=>/^\s*not ok\s+\d+\s+-/.test(line)).map(line=>line.trim()),timeoutOrSpawnError:result.error?.message||null});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
const pass=ledger.every(r=>r.detected);
console.log(JSON.stringify({kind:'E1_ISOLATED_MUTATION_PROBE',pass,mutants:ledger},null,2));
if(!pass)process.exitCode=1;
