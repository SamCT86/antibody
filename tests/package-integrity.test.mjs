/** All negative cases operate on text in memory; no fixture/code/manifest modification. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildManifest,verifyManifestRaw,packageFiles} from '../scripts/package-integrity.mjs';

const fresh=()=>buildManifest();
const split=()=>fresh().trimEnd().split('\n');
const joinLines=x=>x.join('\n')+'\n';
test('complete local package enumerates deterministic ordered paths',()=>{
 const paths=packageFiles();
 assert.ok(paths.includes('src/engine.mjs'));assert.ok(paths.includes('src/queue-proof.mjs'));
 assert.ok(paths.includes('tests/evidence-integrity.test.mjs'));
 assert.ok(paths.includes('scripts/package-integrity.mjs'));
 assert.deepEqual(paths,[...paths].sort());
});
test('fresh independently recomputed manifest verifies against exact bytes',()=>{
 const result=verifyManifestRaw(fresh());assert.equal(result.ok,true,JSON.stringify(result));assert.ok(result.files>=39);
});
for(const [name,mutator] of [
 ['tampered digest',lines=>{lines[0]='0'.repeat(64)+lines[0].slice(64)}],
 ['missing entry',lines=>{lines.splice(1,1)}],
 ['duplicated entry',lines=>{lines.splice(1,0,lines[0])}],
 ['unsorted entries',lines=>{[lines[0],lines[1]]=[lines[1],lines[0]]}],
 ['path traversal',lines=>{lines[0]=lines[0].slice(0,66)+'../evil.mjs'}],
 ['absolute path',lines=>{lines[0]=lines[0].slice(0,66)+'/Windows/system.ini'}],
 ['unexpected file',lines=>{lines.push('0'.repeat(64)+'  src/phantom.mjs')}],
 ['uppercase noncanonical digest',lines=>{lines[0]=lines[0].toUpperCase()}],
]){
 test('manifest refuses '+name,()=>{
  const lines=split();mutator(lines);
  const res=verifyManifestRaw(joinLines(lines));
  assert.equal(res.ok,false,'unsafe manifest was accepted');
 });
}
test('manifest refuses missing final newline',()=>{assert.equal(verifyManifestRaw(fresh().trimEnd()).ok,false)});
test('manifest refuses extra blank line',()=>{assert.equal(verifyManifestRaw(fresh()+'\n').ok,false)});
