/** Local-only adversarial smoke: mutate evidence in a throwaway clone and demand HOLD. */
import {mkdtempSync,cpSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const scratch=mkdtempSync(join(tmpdir(),'antibody-evidence-mutants-'));
const target=join(scratch,'copy');
cpSync(root,target,{recursive:true});
const evidence=(f)=>join(target,'artifacts',f);
function run(){
 const x=spawnSync(process.execPath,['src/cli.mjs','audit'],{cwd:target,encoding:'utf8',timeout:7000,maxBuffer:1024*1024,
   env:{PATH:process.env.PATH||'',SystemRoot:process.env.SystemRoot||'',TEMP:process.env.TEMP||'',TMP:process.env.TMP||'',TMPDIR:process.env.TMPDIR||''}});
 return {status:x.status,passed:(x.stdout||'').includes('PASS_LOCAL_SYNTHETIC'),held:(x.stdout||'').includes('HOLD_EVIDENCE_INVALID'),error:x.error?.message||null};
}
const cases=[
 {id:'A01_TENANT_OBSERVED_SENTINEL_FALSIFIED',file:'tenant-g3-experiment.json',mutate:o=>{o.observations.bad[0].observedResponse.body='FAKE';}},
 {id:'A02_QUEUE_EVENT_FORGED',file:'queue-g3-experiment.json',mutate:o=>{o.observations.bad[0].events.find(x=>x.kind==='QUEUE_ACK_DROPPED').kind='ACK_CONFIRMED';}},
 {id:'A03_CHECKOUT_STATE_TAMPERED',file:'checkout-e1-experiment.json',mutate:o=>{o.observations.bad[0].independentLedgerCount=1;}},
 {id:'A04_TENANT_HUMAN_SUMMARY_SPOOFED',file:'tenant-g3-experiment.json',mutate:o=>{o.controls.ownTenantAllowed=false;}}
];
try {
 const initial=run();
 if(!initial.passed||initial.status!==0)throw Error('clean baseline audit must PASS');
 const results=[];
 for(const c of cases){
  const f=evidence(c.file),prior=readFileSync(f,'utf8');
  const x=JSON.parse(prior);c.mutate(x);writeFileSync(f,JSON.stringify(x,null,2)+'\n');
  const outcome=run();results.push({id:c.id,detected:outcome.status!==0&&outcome.held&& !outcome.passed,exitCode:outcome.status});
  writeFileSync(f,prior);
 }
 const report={scope:'disposable locally copied evidence only',baselinePass:initial.passed&&initial.status===0,
  negativeProbes:results,detected:results.filter(x=>x.detected).length,total:results.length,
  caveat:'simulated evidence tampering; not origin authentication or production threat-model completion'};
 console.log(JSON.stringify(report,null,2));
 if(report.detected!==report.total)process.exitCode=1;
} finally {rmSync(scratch,{recursive:true,force:true});}
