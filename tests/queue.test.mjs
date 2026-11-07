import test from 'node:test';
import assert from 'node:assert/strict';
import {runQueueTrial,makeQueueCase} from '../src/queue.mjs';
import {UnsafeCaseError} from '../src/engine.mjs';
test('bad queue consumer repeats durable reservation and stock decrement after ACK loss',()=>{
 const r=runQueueTrial(makeQueueCase({build:'bad'}));
 assert.equal(r.deliveries,2);assert.equal(r.committedReservations,2);assert.equal(r.stockAvailable,8);
 assert.equal(r.faultOrder,true);assert.equal(r.oracleCoherent,true);assert.equal(r.status,'VIOLATION_OBSERVED');
});
test('fixed consumer sees duplicate delivery but commits one business side effect',()=>{
 const r=runQueueTrial(makeQueueCase({build:'fixed'}));
 assert.equal(r.deliveries,2);assert.equal(r.committedReservations,1);assert.equal(r.stockAvailable,9);
 assert.equal(r.events.filter(e=>e.kind==='IDEMPOTENT_DUPLICATE_SKIPPED').length,1);
 assert.equal(r.oracleCoherent,true);assert.equal(r.status,'NOT_REPRODUCED');
});
test('without simulated lost acknowledgement, bad consumer commits only one reservation',()=>{
 const r=runQueueTrial(makeQueueCase({build:'bad',fault:'none'}));
 assert.equal(r.deliveries,1);assert.equal(r.committedReservations,1);assert.equal(r.stockAvailable,9);
});
test('no unregistered target, external broker or unbounded queue retry',()=>{
 assert.throws(()=>makeQueueCase({fault:'real-kafka'}),UnsafeCaseError);
 assert.throws(()=>makeQueueCase({maxAttempts:500}),UnsafeCaseError);
 assert.throws(()=>runQueueTrial({...makeQueueCase(),broker:'external'}),UnsafeCaseError);
});
