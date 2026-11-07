import test from 'node:test';
import assert from 'node:assert/strict';
import {executeBoundedExperiment,saveExperiment} from '../src/experiment.mjs';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
test('three independent fresh-DB repetitions promote only bounded synthetic evidence',()=>{
 const x=executeBoundedExperiment();
 assert.equal(x.promotion,'REPRODUCED_SYNTHETIC_ONLY');
 assert.deepEqual(x.observations.bad.map(y=>y.independentLedgerCount),[2,2,2]);
 assert.deepEqual(x.observations.fixed.map(y=>y.independentLedgerCount),[1,1,1]);
 assert.equal(x.evidence.observationsTrusted,true);
 assert.equal(x.exportedRegression.badFailsSpecifically,true);
 assert.equal(x.exportedRegression.fixedPasses,true);
 const saved=saveExperiment(x);
 assert.equal(createHash('sha256').update(readFileSync(saved.json)).digest('hex'),saved.jsonSha256);
 assert.match(readFileSync(saved.html,'utf8'),/REPRODUCED_SYNTHETIC_ONLY/);
 assert.match(readFileSync(saved.html,'utf8'),/No real payment gateway/);
});
