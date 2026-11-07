import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyExportedRegression,exportRegression} from '../src/regression.mjs';
import {readFileSync} from 'node:fs';
test('exact generated regression fails bad specifically, passes fixed with identical fault',()=>{
 const p=verifyExportedRegression();
 assert.equal(p.error,null);
 assert.equal(p.badFailsSpecifically,true,`bad build MUST fail for business reason: ${p.badStdout}`);
 assert.equal(p.fixedPasses,true,`fixed build MUST pass: ${p.fixedStdout}`);
 assert.match(readFileSync(p.generated.path,'utf8'),/independentLedgerCount,1/);
});
test('re-export is idempotent; no silent replacement of prior differing artifact',()=>{
 const a=exportRegression();const b=exportRegression();assert.deepEqual(a,b);
});
