import test from 'node:test';
import assert from 'node:assert/strict';
import { runTrial,makeCase,verifyTrialResult,INVARIANT } from '../src/engine.mjs';

test('baseline: one committed synthetic charge, no fault',()=>{
 const x=runTrial(makeCase({build:'bad',fault:'none'}));
 assert.equal(x.independentLedgerCount,1);assert.equal(x.status,'NOT_REPRODUCED');assert.ok(verifyTrialResult(x));
 assert.equal(x.eventJournal.some(e=>e.kind==='ACK_DROPPED'),false);
});
test('the specific bad after-commit ACK loss leads to two rows, directly observed',()=>{
 const x=runTrial(makeCase({build:'bad',fault:'drop_ack_after_commit'}));
 assert.equal(x.status,'VIOLATION_OBSERVED');assert.equal(x.independentLedgerCount,2);assert.equal(x.retries,1);
 assert.equal(x.orderingVerified,true);assert.ok(verifyTrialResult(x));
 assert.equal(new Set(x.independentCharges.map(c=>c.intent_id)).size,1);
});
test('same fault on the fixed build preserves exact one-capture invariant',()=>{
 const x=runTrial(makeCase({build:'fixed',fault:'drop_ack_after_commit'}));
 assert.equal(x.status,'NOT_REPRODUCED');assert.equal(x.independentLedgerCount,1);
 assert.equal(x.eventJournal.some(e=>e.kind==='DURABLE_DEDUPLICATION'),true);
 assert.equal(x.orderingVerified,true); assert.ok(verifyTrialResult(x));
});
test('a failure before the first write is not a double capture',()=>{
 const x=runTrial(makeCase({build:'bad',fault:'fail_before_commit'}));
 assert.equal(x.independentLedgerCount,1);assert.equal(x.status,'NOT_REPRODUCED');assert.ok(verifyTrialResult(x));
 assert.equal(x.eventJournal.some(e=>e.kind==='PRE_COMMIT_FAULT'),true);
});
test('unrelated exception is not mislabeled as an invariant violation',()=>{
 const x=runTrial(makeCase({build:'bad',fault:'unrelated_error'}));
 assert.equal(x.independentLedgerCount,0);assert.equal(x.status,'INCONCLUSIVE');assert.ok(verifyTrialResult(x));
});
test('direct readback matches durable commit events on every modeled path',()=>{
 for(const build of ['bad','fixed'])for(const fault of ['none','drop_ack_after_commit','fail_before_commit']){
  const x=runTrial(makeCase({build,fault}));
  assert.ok(verifyTrialResult(x));
  assert.equal(x.independentLedgerCount,x.eventJournal.filter(e=>e.kind==='DURABLE_COMMIT').length);
 }
});
