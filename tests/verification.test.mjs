import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runTrial,makeCase,verifyTrialResult} from '../src/engine.mjs';
const seal=(x)=>{const {evidenceSha256,...r}=x; x.evidenceSha256=createHash('sha256').update(JSON.stringify(r)).digest('hex');return x;};
const copy=(x)=>JSON.parse(JSON.stringify(x));
const base=()=>runTrial(makeCase({build:'bad',fault:'drop_ack_after_commit'}));
for(const [name,mutate] of [
 ['alter observed charge count',x=>{x.independentLedgerCount=1;}],
 ['remove commit event',x=>{x.eventJournal=x.eventJournal.filter(e=>e.kind!=='DURABLE_COMMIT');}],
 ['swap event sequence',x=>{const e=x.eventJournal;[e[0].seq,e[1].seq]=[e[1].seq,e[0].seq];}],
 ['spoof clean status',x=>{x.status='NOT_REPRODUCED';}],
 ['alter invariant',x=>{x.invariant.expected='n <= 2';}],
 ['alter fixture identity',x=>{x.fixture='other';}],
 ['foreign intent in charge record',x=>{x.independentCharges[0].intent_id='foreign';}],
 ['claim fixed build when bad ran',x=>{x.build='fixed';}],
 ['disable fault in case spec',x=>{x.config.fault='none';}],
 ['alter synthetic charge amount',x=>{x.independentCharges[0].synthetic_amount_cents=500;}],
 ['remove trial evidence receipt',x=>{delete x.config;}],
])test(`adversarial: recomputed SHA cannot certify ${name}`,()=>{
 const x=copy(base());mutate(x);seal(x);assert.equal(verifyTrialResult(x),false);
});
test('adversarial: pure digest mismatch is rejected even when all semantic fields are coherent',()=>{
 const x=base();x.evidenceSha256='0'.repeat(64);assert.equal(verifyTrialResult(x),false);
});
