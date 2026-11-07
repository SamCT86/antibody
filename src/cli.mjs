#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeCase, runTrial, writeEvidence, verifyTrialResult, UnsafeCaseError } from './engine.mjs';
import {executeBoundedExperiment,saveExperiment} from './experiment.mjs';
import {makeQueueCase,runQueueTrial} from './queue.mjs';
import {makeTenantCase,runTenantTrial} from './tenant.mjs';
import {proveQueue,saveQueueProof} from './queue-proof.mjs';
import {auditSavedEvidence} from './evidence-audit.mjs';
import {proveTenant,saveTenantProof} from './tenant-proof.mjs';
const repo=join(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
function help(){
  console.log('ANTIBODY LAB — G3 ISOLATED SYNTHETIC CANDIDATE');
  console.log('Usage: node src/cli.mjs [demo|baseline|check|prove|queue|queue-proof|tenant|tenant-proof|audit]');
  console.log('No target URL, external network or payment integration accepted.');
}
function run() {
  if(args.length!==1 || !['demo','check','baseline','prove','queue','queue-proof','tenant','tenant-proof','audit'].includes(args[0])) {help();process.exitCode=2;return;}
  if(args[0]==='audit') {
    const receipt=auditSavedEvidence();
    console.log(JSON.stringify(receipt,null,2));
    if(receipt.overall!=='PASS_LOCAL_SYNTHETIC')process.exitCode=3;
    return;
  }
  if(args[0]==='queue-proof') {
    const evidence=proveQueue();
    const artifact=saveQueueProof(evidence);
    console.log(JSON.stringify({result:evidence.result,scope:evidence.scope,checks:evidence.checks,counts:evidence.counts,regression:evidence.regression,evidence:artifact,limits:evidence.limits},null,2));
    if(evidence.result!=='REPRODUCED_SYNTHETIC_ONLY')process.exitCode=3;
    return;
  }
  if(args[0]==='tenant-proof') {
    const evidence=proveTenant();
    const artifact=saveTenantProof(evidence);
    console.log(JSON.stringify({result:evidence.result,scope:evidence.scope,counts:evidence.counts,controls:evidence.controls,regression:evidence.regression,evidence:artifact,limits:evidence.limits},null,2));
    if(evidence.result!=='REPRODUCED_SYNTHETIC_ONLY')process.exitCode=3;
    return;
  }
  if(args[0]==='tenant') {
    const bad=runTenantTrial(makeTenantCase({build:'bad'}));
    const fixed=runTenantTrial(makeTenantCase({build:'fixed'}));
    if(!bad.oracleCoherent||!fixed.oracleCoherent||!bad.crossTenantSentinelExposed||fixed.crossTenantSentinelExposed) throw new Error('tenant fixture contradiction');
    console.log(JSON.stringify({scope:'local synthetic tenant property only',bad:{leak:bad.crossTenantSentinelExposed,status:bad.status},fixed:{leak:fixed.crossTenantSentinelExposed,status:fixed.status},limits:fixed.limits},null,2));
    return;
  }
  if(args[0]==='queue') {
    const bad=runQueueTrial(makeQueueCase({build:'bad'}));
    const fixed=runQueueTrial(makeQueueCase({build:'fixed'}));
    if(!bad.oracleCoherent||!fixed.oracleCoherent||bad.committedReservations!==2||fixed.committedReservations!==1) throw new Error('queue fixture contradiction');
    console.log(JSON.stringify({scope:'synthetic local queue fixture, no real broker',bad:{deliveries:bad.deliveries,reservations:bad.committedReservations,stockAvailable:bad.stockAvailable},fixed:{deliveries:fixed.deliveries,reservations:fixed.committedReservations,stockAvailable:fixed.stockAvailable},limits:fixed.limits},null,2));
    return;
  }
  if(args[0]==='prove') {
    const experiment=executeBoundedExperiment();
    const saved=saveExperiment(experiment);
    console.log(JSON.stringify({status:experiment.promotion,checks:experiment.evidence,repeatCounts:experiment.testedRepeatCount,badCounts:experiment.observations.bad.map(x=>x.independentLedgerCount),fixedCounts:experiment.observations.fixed.map(x=>x.independentLedgerCount),files:saved},null,2));
    if(experiment.promotion!=='REPRODUCED_SYNTHETIC_ONLY')process.exitCode=3;
    return;
  }
  if(args[0]==='baseline') {
    const t=runTrial(makeCase({build:'bad',fault:'none'}));
    if(!verifyTrialResult(t)||t.independentLedgerCount!==1) throw Error('invalid baseline');
    console.log(JSON.stringify({baseline:t.status,charges:t.independentLedgerCount,evidenceVerified:true},null,2));
    return;
  }
  const cases=[
    makeCase({build:'bad',fault:'none'}),
    makeCase({build:'bad',fault:'drop_ack_after_commit'}),
    makeCase({build:'fixed',fault:'drop_ack_after_commit'}),
    makeCase({build:'bad',fault:'fail_before_commit'}),
  ];
  const results=cases.map(runTrial);
  if(results.some(x=>!verifyTrialResult(x))) throw Error('untrusted evidence');
  const [baseline,broken,fixed,precommit]=results;
  if(baseline.independentLedgerCount!==1 || broken.independentLedgerCount!==2 || fixed.independentLedgerCount!==1 || precommit.independentLedgerCount!==1) throw Error('unexpected synthetic state');
  const bundle=writeEvidence(results,join(repo,'artifacts'));
  console.log(JSON.stringify({kind:'E1_LOCAL_SYNTHETIC', baseline:baseline.independentLedgerCount, afterCommitBad:broken.independentLedgerCount,afterCommitFixed:fixed.independentLedgerCount, precommitControl:precommit.independentLedgerCount, brokenStatus:broken.status, fixedStatus:fixed.status, proofScope:'local deterministic synthetic fixture only', evidence:bundle},null,2));
}
try{run();}catch(e){console.error('HOLD:',e instanceof UnsafeCaseError?e.message:e.stack);process.exitCode=1;}
