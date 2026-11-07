import test from 'node:test';
import assert from 'node:assert/strict';
import {proveQueue,saveQueueProof,verifyQueueRegression} from '../src/queue-proof.mjs';
import {UnsafeCaseError} from '../src/engine.mjs';
test('queue generated invariant regression fails specifically bad and passes fixed',()=>{
 const x=verifyQueueRegression();assert.equal(x.badExitCode,1);assert.equal(x.fixedExitCode,0);
 assert.equal(x.badFailsSpecifically,true);assert.equal(x.fixedPasses,true);
});
test('queue proof uses baseline and 3 independent local reruns per build',()=>{
 const x=proveQueue();assert.equal(x.result,'REPRODUCED_SYNTHETIC_ONLY');
 assert.equal(x.checks.baselineValid,true);assert.equal(x.checks.badSpecific,true);assert.equal(x.checks.fixedSpecific,true);
 assert.deepEqual(x.counts,{badObserved:3,fixedDenied:3});
});
test('queue evidence saves and readbacks finite real JSON',()=>{
 assert.match(saveQueueProof(proveQueue()).sha256,/^[a-f0-9]{64}$/);
});
test('cannot promote queue evidence missing real checks',()=>{
 assert.throws(()=>saveQueueProof({schema:'antibody.queue.experiment.g3.v1',result:'INCONCLUSIVE',checks:{}}),UnsafeCaseError);
});
test('queue evidence rejects forged sequence/count despite green summary flags',async()=>{
 const {verifyQueueEvidence}=await import('../src/queue-proof.mjs');
 const e=structuredClone(proveQueue());assert.equal(verifyQueueEvidence(e),true);
 e.observations.bad[0].events.find(x=>x.kind==='QUEUE_ACK_DROPPED').kind='ACK_CONFIRMED';
 assert.equal(verifyQueueEvidence(e),false);
 assert.throws(()=>saveQueueProof(e),UnsafeCaseError);
});
