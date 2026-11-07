import test from 'node:test';
import assert from 'node:assert/strict';
import {runTrial,makeCase,validateCase,verifyTrialResult,writeEvidence,UnsafeCaseError} from '../src/engine.mjs';
const copy=(o)=>({...o});
for(const [name,alter] of [
 ['reject external host injection',x=>{x.host='https://example.com';}],
 ['reject unknown case',x=>{x.case='../other';}],
 ['reject foreign payment intent',x=>{x.intentId='real-user';}],
 ['reject external network',x=>{x.network='on';}],
 ['reject invalid fault type',x=>{x.fault='remote-tcp-inject';}],
 ['reject arbitrary JS expression',x=>{x.expression='process.exit(1)';}],
 ['reject attempts unlimited',x=>{x.maxAttempts=100000;}],
 ['reject foreign seed',x=>{x.seed=3003;}],
 ])test(name,()=>{const x=copy(makeCase());alter(x);assert.throws(()=>validateCase(x),UnsafeCaseError)});
test('no false promotion if evidence ledger count is tampered',()=>{
 const x=runTrial(makeCase()); x.independentLedgerCount=1; assert.equal(verifyTrialResult(x),false);
});
test('no false promotion if commit event is deleted, even with recomputed hash',()=>{
 const x=runTrial(makeCase());x.eventJournal=x.eventJournal.filter(e=>e.kind!=='DURABLE_COMMIT');
 assert.equal(verifyTrialResult(x),false);
});
test('reject arbitrary artifact output outside dedicated artifacts directory',()=>{
 const x=runTrial(makeCase());assert.throws(()=>writeEvidence([x],'/tmp/elsewhere'),UnsafeCaseError);
});
test('invalid or missing case definitions reject fail-closed',()=>{
 for(const x of [null,[],{},Object.create(null)])assert.throws(()=>validateCase(x),UnsafeCaseError);
});
