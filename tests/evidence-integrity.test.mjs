/** E1 regression proof for two original falsifiers; original release candidate is untouched. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeCase,runTrial,verifyTrialResult} from '../src/engine.mjs';
import {proveQueue,verifyQueueEvidence} from '../src/queue-proof.mjs';

const sha=(x)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function seal(x){const {evidenceSha256:_,...body}=x;x.evidenceSha256=sha(body);return x;}
function forgedCheckout(){
 const x=structuredClone(runTrial(makeCase({build:'bad',fault:'none'})));
 const c=x.independentCharges[0];
 x.independentCharges.push({...c,id:c.id+1,operation_id:'attempt-2'});
 x.independentLedgerCount=2;x.attempts=2;
 const event=x.eventJournal.find(e=>e.kind==='DURABLE_COMMIT');
 x.eventJournal.push({...event,seq:x.eventJournal.length+1,operation_id:'attempt-2'});
 return seal(x);
}
function reorderQueue(e){
 const x=structuredClone(e);const journal=x.observations.bad[0].events;
 const index=journal.findIndex(v=>v.kind==='QUEUE_ACK_DROPPED');
 const [drop]=journal.splice(index,1);
 const second=journal.findIndex(v=>v.kind==='DELIVERY_RECEIVED'&&v.attempt==='delivery-2');
 journal.splice(second+1,0,drop);
 journal.forEach((v,i)=>{v.seq=i+1});
 return x;
}

test('legitimate checkout observations preserved',()=>{
 const cases=[
 {build:'bad',fault:'none'},
 {build:'fixed',fault:'none'},
 {build:'bad',fault:'drop_ack_after_commit'},
 {build:'fixed',fault:'drop_ack_after_commit'},
 {build:'bad',fault:'fail_before_commit'},
 {build:'bad',fault:'unrelated_error'}
 ];
 for(const spec of cases)assert.equal(verifyTrialResult(runTrial(makeCase(spec))),true,JSON.stringify(spec));
});

test('REPRODUCED forbidden when a NOT_REPRODUCED label hides two charges',()=>{
 const x=forgedCheckout();
 assert.equal(x.independentLedgerCount,2);assert.equal(x.status,'NOT_REPRODUCED');
 assert.equal(verifyTrialResult(x),false);
});

test('bogus journal commit and repeated charge ID rejected despite recomputed SHA',()=>{
 const x=forgedCheckout();x.independentCharges[1].id=x.independentCharges[0].id;seal(x);
 assert.equal(verifyTrialResult(x),false);
});

test('unrelated forged commit operation ID is rejected',()=>{
 const x=structuredClone(runTrial(makeCase({build:'bad',fault:'none'})));
 x.eventJournal.find(e=>e.kind==='DURABLE_COMMIT').operation_id='foreign';seal(x);
 assert.equal(verifyTrialResult(x),false);
});

test('100 recomputed-checksum false-clean variants all fail closed',()=>{
 const original=forgedCheckout();
 for(let i=0;i<100;i++){
  const x=structuredClone(original);x.independentCharges[1].id=i+2;seal(x);
  assert.equal(verifyTrialResult(x),false,'mutation '+i);
 }
});

test('clean fresh queue proof accepted',()=>{
 const p=proveQueue();assert.equal(p.result,'REPRODUCED_SYNTHETIC_ONLY');
 assert.equal(verifyQueueEvidence(p),true);
});

test('queue causal redelivery before trigger rejected',()=>{
 const p=proveQueue();assert.equal(verifyQueueEvidence(p),true);
 const bad=reorderQueue(p);
 assert.equal(verifyQueueEvidence(bad),false);
});

test('queue wrong attempt identity rejected',()=>{
 const p=proveQueue();p.observations.fixed[0].events.at(-1).attempt='delivery-1';
 assert.equal(verifyQueueEvidence(p),false);
});

test('queue duplicate ack event rejected',()=>{
 const p=proveQueue();p.observations.bad[2].events.push({...p.observations.bad[2].events.at(-1),seq:7});
 assert.equal(verifyQueueEvidence(p),false);
});

test('queue missing/out-of-order sequence rejected',()=>{
 const p=proveQueue();p.observations.bad[1].events[5].seq=8;
 assert.equal(verifyQueueEvidence(p),false);
});
