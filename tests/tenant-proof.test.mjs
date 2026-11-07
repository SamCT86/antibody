import test from 'node:test';
import assert from 'node:assert/strict';
import {proveTenant,saveTenantProof,verifyTenantRegression} from '../src/tenant-proof.mjs';
import {UnsafeCaseError} from '../src/engine.mjs';
test('generated tenant regression fails bad, passes fixed for exact invariant',()=>{
 const r=verifyTenantRegression();assert.equal(r.badExitCode,1);assert.equal(r.fixedExitCode,0);
 assert.equal(r.badFailsSpecifically,true);assert.equal(r.fixedPasses,true);
});
test('tenant proof validates 3 faulty, 3 fixed and two controls',()=>{
 const p=proveTenant();assert.equal(p.result,'REPRODUCED_SYNTHETIC_ONLY');
 assert.deepEqual(p.counts,{badObserved:3,fixedDenied:3});
 assert.deepEqual(p.controls,{ownTenantAllowed:true,missingObjectDenied:true});
});
test('tenant proof saves exact portable JSON with readback',()=>{
 const saved=saveTenantProof(proveTenant());assert.match(saved.sha256,/^[a-f0-9]{64}$/);
});
test('cannot promote incorrect tenant experiment state',()=>{
 assert.throws(()=>saveTenantProof({schema:'antibody.tenant.experiment.g3.v1',result:'INCONCLUSIVE'}),UnsafeCaseError);
});
test('tenant evidence rejects forged facts even with plausible proof metadata',async()=>{
 const {verifyTenantEvidence}=await import('../src/tenant-proof.mjs');
 const e=structuredClone(proveTenant());assert.equal(verifyTenantEvidence(e),true);
 e.observations.bad[1].observedResponse.body='PUBLIC-SYNTHETIC-B-042';
 assert.equal(verifyTenantEvidence(e),false);
 assert.throws(()=>saveTenantProof(e),UnsafeCaseError);
});
