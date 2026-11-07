/** Static, bounded G3 proof of a synthetic tenant property; no real API scanning. */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdirSync,readFileSync,writeFileSync,lstatSync,realpathSync} from 'node:fs';
import {runTenantTrial,makeTenantCase} from './tenant.mjs';
import {UnsafeCaseError} from './engine.mjs';
import {writeArtifactOnce} from './artifact-safe.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const output=join(root,'artifacts');
const sha=(s)=>createHash('sha256').update(s).digest('hex');
const safeOut=()=>{
  mkdirSync(output,{recursive:true});
  if(lstatSync(output).isSymbolicLink()||realpathSync(output)!==output)throw new UnsafeCaseError('redirected artifact output');
};
const template=`/** Synthetic fixed-template tenant property regression; not a remote security scanner. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeTenantCase,runTenantTrial} from '../src/tenant.mjs';
const build=process.env.ANTIBODY_TENANT_TEST_BUILD;
if(!['bad','fixed'].includes(build))throw new Error('ANTIBODY_TENANT_TEST_BUILD must be bad or fixed');
test('tenant B cannot read the seeded tenant A sentinel',()=>{
 const t=runTenantTrial(makeTenantCase({build,action:'cross_tenant_lookup'}));
 assert.equal(t.oracleCoherent,true,'read-only state oracle must be coherent');
 assert.equal(t.crossTenantSentinelExposed,false,'invariant broken: tenant B received synthetic A sentinel');
});
`;
export function verifyTenantRegression(){
  safeOut();
  const p=join(output,'tenant-read.generated.test.mjs');
  try{writeFileSync(p,template,{flag:'wx',mode:0o600});}
  catch(e){if(e.code!=='EEXIST')throw e;if(readFileSync(p,'utf8')!==template)throw new UnsafeCaseError('existing tenant regression differs');}
  const run=(build)=>spawnSync(process.execPath,['--test',p],{
    cwd:root,encoding:'utf8',maxBuffer:1024*1024,timeout:5000,
    env:{PATH:process.env.PATH||'',SystemRoot:process.env.SystemRoot||'',TEMP:process.env.TEMP||'',TMP:process.env.TMP||'',TMPDIR:process.env.TMPDIR||'',ANTIBODY_TENANT_TEST_BUILD:build}
  });
  const bad=run('bad'),fixed=run('fixed');
  const specific=(bad.stdout||'').includes('invariant broken: tenant B received synthetic A sentinel')||(bad.stderr||'').includes('invariant broken: tenant B received synthetic A sentinel');
  return {path:p,sha256:sha(readFileSync(p)),badExitCode:bad.status,fixedExitCode:fixed.status,badFailsSpecifically:bad.status===1&&specific,fixedPasses:fixed.status===0};
}
export function proveTenant(){
 const negative=Array.from({length:3},()=>runTenantTrial(makeTenantCase({build:'bad'})));
 const fixed=Array.from({length:3},()=>runTenantTrial(makeTenantCase({build:'fixed'})));
 const own=runTenantTrial(makeTenantCase({build:'fixed',action:'own_tenant_lookup'}));
 const absent=runTenantTrial(makeTenantCase({build:'fixed',action:'missing_object'}));
 const regression=verifyTenantRegression();
 const coherent=[...negative,...fixed,own,absent].every(x=>x.oracleCoherent);
 const badFails=negative.every(x=>x.crossTenantSentinelExposed&&x.status==='VIOLATION_OBSERVED');
 const fixedPasses=fixed.every(x=>!x.crossTenantSentinelExposed&&x.observedResponse===null);
 const controls=own.observedResponse?.body==='PUBLIC-SYNTHETIC-B-042'&&absent.observedResponse===null;
 const promoted=coherent&&badFails&&fixedPasses&&controls&&regression.badFailsSpecifically&&regression.fixedPasses;
 const evidence={schema:'antibody.tenant.experiment.g3.v1',scope:'local synthetic SQLite fixture only',invariant:'tenant B does not receive seeded tenant A sentinel',
  result:promoted?'REPRODUCED_SYNTHETIC_ONLY':'INCONCLUSIVE',counts:{badObserved:negative.length,fixedDenied:fixed.length},observations:{bad:negative,fixed,own,absent},
  controls:{ownTenantAllowed:own.observedResponse!==null,missingObjectDenied:absent.observedResponse===null},
  regression:{sha256:regression.sha256,badExitCode:regression.badExitCode,fixedExitCode:regression.fixedExitCode,badFailsSpecifically:regression.badFailsSpecifically,fixedPasses:regression.fixedPasses},
  limits:['one synthetic deterministic case and seed','not a BOLA scanner','no real access policy or authentication verified','no external developer validation']};
 return Object.freeze(evidence);
}
export function saveTenantProof(proof){
 if(!verifyTenantEvidence(proof))throw new UnsafeCaseError('tenant experiment is not promotable');
 safeOut();const path=join(output,'tenant-g3-experiment.json');const raw=JSON.stringify(proof,null,2)+'\n';
 writeArtifactOnce('tenant-g3-experiment.json',raw);
 return {path,sha256:sha(raw)};
}

/** Re-check persisted synthetic observations. Does not establish hostile-origin authenticity. */
export function verifyTenantEvidence(e) {
 if(e?.schema!=='antibody.tenant.experiment.g3.v1'||e.scope!=='local synthetic SQLite fixture only'||e.result!=='REPRODUCED_SYNTHETIC_ONLY')return false;
 const o=e.observations;
 if(!o||!Array.isArray(o.bad)||!Array.isArray(o.fixed)||o.bad.length!==3||o.fixed.length!==3)return false;
 const matches=(x,build,action,status,leak,owner,response)=>
  x?.schema==='antibody.tenant.synthetic.g3.v1'&&x.case?.case==='tenant-read-local'&&x.case?.build===build&&x.case?.action===action&&x.case?.network==='off'&&x.seededCorrectly===true&&x.oracleCoherent===true&&x.status===status&&x.crossTenantSentinelExposed===leak&&x.independentOwner===owner&&(response==='none'?x.observedResponse===null:x.observedResponse?.body===response);
 if(!o.bad.every(x=>matches(x,'bad','cross_tenant_lookup','VIOLATION_OBSERVED',true,'tenant-demo-a','PRIVATE-SYNTHETIC-A-042')))return false;
 if(!o.fixed.every(x=>matches(x,'fixed','cross_tenant_lookup','NOT_REPRODUCED',false,'tenant-demo-a','none')))return false;
 if(!matches(o.own,'fixed','own_tenant_lookup','NOT_REPRODUCED',false,'tenant-demo-b','PUBLIC-SYNTHETIC-B-042'))return false;
 if(!matches(o.absent,'fixed','missing_object','NOT_REPRODUCED',false,null,'none'))return false;
 if(e.counts?.badObserved!==3||e.counts?.fixedDenied!==3||e.controls?.ownTenantAllowed!==true||e.controls?.missingObjectDenied!==true)return false;
 const recorded=e.regression,actual=verifyTenantRegression();
 return recorded?.sha256===actual.sha256&&recorded.badExitCode===1&&recorded.fixedExitCode===0&&recorded.badFailsSpecifically===true&&recorded.fixedPasses===true&&actual.badFailsSpecifically&&actual.fixedPasses;
}
