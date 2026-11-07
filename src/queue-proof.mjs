/** Bounded G3 queue business-invariant evidence. Synthetic local fixture only. */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {lstatSync,realpathSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {makeQueueCase,runQueueTrial} from './queue.mjs';
import {UnsafeCaseError} from './engine.mjs';
import {writeArtifactOnce} from './artifact-safe.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const out=join(root,'artifacts');
const sha=(x)=>createHash('sha256').update(x).digest('hex');
function safeOut(){mkdirSync(out,{recursive:true});if(lstatSync(out).isSymbolicLink()||realpathSync(out)!==out)throw new UnsafeCaseError('redirected artifact output');}
const template=`/** Synthetic queue-only generated regression; not a real broker test. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeQueueCase,runQueueTrial} from '../src/queue.mjs';
const build=process.env.ANTIBODY_QUEUE_TEST_BUILD;
if(!['bad','fixed'].includes(build))throw new Error('ANTIBODY_QUEUE_TEST_BUILD must be bad or fixed');
test('a duplicate synthetic queue delivery cannot double-apply reservation',()=>{
 const t=runQueueTrial(makeQueueCase({build}));
 assert.equal(t.oracleCoherent,true,'queue observer must agree with durable side effects');
 assert.equal(t.committedReservations,1,'business invariant broken: duplicated durable inventory reservation');
 assert.equal(t.stockAvailable,9,'one reservation must decrement stock exactly once');
});
`;
export function verifyQueueRegression(){
 safeOut(); const path=join(out,'queue-lost-ack.generated.test.mjs');
 try{writeFileSync(path,template,{flag:'wx',mode:0o600});}
 catch(e){if(e.code!=='EEXIST')throw e;if(readFileSync(path,'utf8')!==template)throw new UnsafeCaseError('existing queue regression differs');}
 const run=build=>spawnSync(process.execPath,['--test',path],{cwd:root,encoding:'utf8',timeout:5000,maxBuffer:1024*1024,
  env:{PATH:process.env.PATH||'',SystemRoot:process.env.SystemRoot||'',TEMP:process.env.TEMP||'',TMP:process.env.TMP||'',TMPDIR:process.env.TMPDIR||'',ANTIBODY_QUEUE_TEST_BUILD:build}});
 const bad=run('bad'),fixed=run('fixed');
 const specific=(bad.stdout||'').includes('business invariant broken: duplicated durable inventory reservation')||(bad.stderr||'').includes('business invariant broken: duplicated durable inventory reservation');
 return {path,sha256:sha(readFileSync(path)),badExitCode:bad.status,fixedExitCode:fixed.status,badFailsSpecifically:bad.status===1&&specific,fixedPasses:fixed.status===0};
}
export function proveQueue(){
 const baseline=runQueueTrial(makeQueueCase({build:'bad',fault:'none'}));
 const bad=Array.from({length:3},()=>runQueueTrial(makeQueueCase({build:'bad'})));
 const fixed=Array.from({length:3},()=>runQueueTrial(makeQueueCase({build:'fixed'})));
 const reg=verifyQueueRegression();
 const baselineValid=baseline.oracleCoherent&&baseline.committedReservations===1&&baseline.stockAvailable===9;
 const badSpecific=bad.every(x=>x.oracleCoherent&&x.faultOrder&&x.deliveries===2&&x.committedReservations===2&&x.stockAvailable===8);
 const fixedSpecific=fixed.every(x=>x.oracleCoherent&&x.faultOrder&&x.deliveries===2&&x.committedReservations===1&&x.stockAvailable===9);
 const valid=baselineValid&&badSpecific&&fixedSpecific&&reg.badFailsSpecifically&&reg.fixedPasses;
 return {schema:'antibody.queue.experiment.g3.v1',scope:'isolated local synthetic queue and inventory only',invariant:'one reservation/stock decrement per command',result:valid?'REPRODUCED_SYNTHETIC_ONLY':'INCONCLUSIVE',
  checks:{baselineValid,badSpecific,fixedSpecific},counts:{badObserved:bad.length,fixedDenied:fixed.length},observations:{baseline,bad,fixed},regression:{sha256:reg.sha256,badExitCode:reg.badExitCode,fixedExitCode:reg.fixedExitCode,badFailsSpecifically:reg.badFailsSpecifically,fixedPasses:reg.fixedPasses},limits:['no real queue broker','one seed, synthetic inventory only','not proven with worker crashes or concurrent deliveries']};
}
export function saveQueueProof(p){
 if(!verifyQueueEvidence(p))throw new UnsafeCaseError('queue proof unverified');
 safeOut(); const path=join(out,'queue-g3-experiment.json');const s=JSON.stringify(p,null,2)+'\n';writeArtifactOnce('queue-g3-experiment.json',s);return {path,sha256:sha(s)};
}

/** Bounded semantic audit of persisted local queue proof. Not authenticated against hostile fixture producer. */
export function verifyQueueEvidence(e) {
 if(e?.schema!=='antibody.queue.experiment.g3.v1'||e.scope!=='isolated local synthetic queue and inventory only'||e.result!=='REPRODUCED_SYNTHETIC_ONLY')return false;
 const o=e.observations;
 if(!o||!Array.isArray(o.bad)||!Array.isArray(o.fixed)||o.bad.length!==3||o.fixed.length!==3)return false;
 const matches=(x,build,fault,count,stock,delivery,status)=>{
  if(x?.schema!=='antibody.queue.synthetic.e1.v1'||x.case?.build!==build||x.case?.fault!==fault||x.case?.network!=='off'||x.case?.case!=='queue-lost-ack'||x.committedReservations!==count||x.stockAvailable!==stock||x.deliveries!==delivery||x.attempts!==delivery||x.oracleCoherent!==true||x.status!==status||!Array.isArray(x.events))return false;
  const events=x.events.map(y=>y.kind);
  // The exact frozen two-attempt fixture is causally ordered; counts alone are insufficient.
  const expected=fault==='none'
   ? [['DELIVERY_RECEIVED','delivery-1'],['RESERVATION_DURABLY_COMMITTED','delivery-1'],['ACK_CONFIRMED','delivery-1']]
   : build==='bad'
   ? [['DELIVERY_RECEIVED','delivery-1'],['RESERVATION_DURABLY_COMMITTED','delivery-1'],['QUEUE_ACK_DROPPED','delivery-1'],['DELIVERY_RECEIVED','delivery-2'],['RESERVATION_DURABLY_COMMITTED','delivery-2'],['ACK_CONFIRMED','delivery-2']]
   : [['DELIVERY_RECEIVED','delivery-1'],['RESERVATION_DURABLY_COMMITTED','delivery-1'],['QUEUE_ACK_DROPPED','delivery-1'],['DELIVERY_RECEIVED','delivery-2'],['IDEMPOTENT_DUPLICATE_SKIPPED','delivery-2'],['ACK_CONFIRMED','delivery-2']];
  if(x.events.length!==expected.length||!x.events.every((e,i)=>
   e?.seq===i+1&&e.kind===expected[i][0]&&e.attempt===expected[i][1]&&
   Object.keys(e).sort().join(',')==='attempt,kind,seq'))return false;
  const commits=events.filter(y=>y==='RESERVATION_DURABLY_COMMITTED').length;
  const received=events.filter(y=>y==='DELIVERY_RECEIVED').length;
  if(commits!==count||received!==delivery)return false;
  if(fault==='drop_ack_after_commit'){
   const commit=events.indexOf('RESERVATION_DURABLY_COMMITTED'),drop=events.indexOf('QUEUE_ACK_DROPPED');
   if(drop<=commit||x.faultOrder!==true)return false;
   if(build==='fixed'&&!events.includes('IDEMPOTENT_DUPLICATE_SKIPPED'))return false;
  }else if(events.includes('QUEUE_ACK_DROPPED'))return false;
  return true;
 };
 if(!matches(o.baseline,'bad','none',1,9,1,'NOT_REPRODUCED'))return false;
 if(!o.bad.every(x=>matches(x,'bad','drop_ack_after_commit',2,8,2,'VIOLATION_OBSERVED')))return false;
 if(!o.fixed.every(x=>matches(x,'fixed','drop_ack_after_commit',1,9,2,'NOT_REPRODUCED')))return false;
 if(e.counts?.badObserved!==3||e.counts?.fixedDenied!==3||e.checks?.baselineValid!==true||e.checks?.badSpecific!==true||e.checks?.fixedSpecific!==true)return false;
 const recorded=e.regression,actual=verifyQueueRegression();
 return recorded?.sha256===actual.sha256&&recorded.badExitCode===1&&recorded.fixedExitCode===0&&recorded.badFailsSpecifically===true&&recorded.fixedPasses===true&&actual.badFailsSpecifically&&actual.fixedPasses;
}
