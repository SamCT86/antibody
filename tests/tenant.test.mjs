import test from 'node:test';
import assert from 'node:assert/strict';
import {makeTenantCase,runTenantTrial} from '../src/tenant.mjs';
import {UnsafeCaseError} from '../src/engine.mjs';

test('synthetic tenant A sentinel is exposed on flawed cross-tenant read',()=>{
 const t=runTenantTrial(makeTenantCase({build:'bad'}));
 assert.equal(t.oracleCoherent,true);
 assert.equal(t.crossTenantSentinelExposed,true);
 assert.equal(t.independentOwner,'tenant-demo-a');
 assert.equal(t.status,'VIOLATION_OBSERVED');
});
test('fixed tenant filter denies tenant B access to A order',()=>{
 const t=runTenantTrial(makeTenantCase({build:'fixed'}));
 assert.equal(t.oracleCoherent,true);
 assert.equal(t.crossTenantSentinelExposed,false);
 assert.equal(t.observedResponse,null);
 assert.equal(t.status,'NOT_REPRODUCED');
});
test('positive control: tenant B can read its own seeded order',()=>{
 for(const build of ['bad','fixed']){
  const t=runTenantTrial(makeTenantCase({build,action:'own_tenant_lookup'}));
  assert.equal(t.oracleCoherent,true);
  assert.equal(t.observedResponse?.body,'PUBLIC-SYNTHETIC-B-042');
  assert.equal(t.crossTenantSentinelExposed,false);
 }
});
test('negative control: missing object never returns synthetic sentinel',()=>{
 for(const build of ['bad','fixed']){
  const t=runTenantTrial(makeTenantCase({build,action:'missing_object'}));
  assert.equal(t.oracleCoherent,true); assert.equal(t.observedResponse,null);
 }
});
test('tenant fixture rejects unknown target, external network, arbitrary identifiers and invalid build',()=>{
 for(const x of [{network:'on'},{url:'https://example.com'},{id:1001},{build:'prod'},{case:'real-account'},{action:'arbitrary_scan'},{tenantId:'tenant-a'},null,[]]){
  assert.throws(()=>makeTenantCase(x),UnsafeCaseError);
 }
});
