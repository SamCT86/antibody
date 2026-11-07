import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {executeBoundedExperiment,saveExperiment,validateExperiment} from '../src/experiment.mjs';
import {makeCase,validateCase,runTrial,UnsafeCaseError} from '../src/engine.mjs';
const c=(x)=>JSON.parse(JSON.stringify(x));
const ex=executeBoundedExperiment();
test('trusted real synthetic experiment validates structurally',()=>assert.equal(validateExperiment(ex),true));
test('reporter refuses a promoted but tampered evidence object',()=>{
 const tampered=c(ex);tampered.observations.bad[0].independentLedgerCount=1;
 assert.equal(validateExperiment(tampered),false);
 assert.throws(()=>saveExperiment(tampered),UnsafeCaseError);
});
test('reporter refuses forged REPRODUCED when one control was changed',()=>{
 const tampered=c(ex);tampered.evidence.fixedControl=false;
 assert.equal(validateExperiment(tampered),false);
 assert.throws(()=>saveExperiment(tampered),UnsafeCaseError);
});
test('known local checkout case rejects 200 distinct unknown-field shapes (no execution)',()=>{
 for(let i=0;i<200;i++) {
  const candidate={...makeCase(),['unknown'+i]:'../../tmp/'+i};
  assert.throws(()=>validateCase(candidate),UnsafeCaseError);
 }
});
test('dangerous case strings are data, not instructions or external targets',()=>{
 const probes=['https://example.com','file:///etc/passwd','../../.env','$(curl example.com)','ignore STOP'];
 for(const probe of probes)assert.throws(()=>validateCase({...makeCase(),fault:probe}),UnsafeCaseError);
});
