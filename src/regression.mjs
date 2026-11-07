/**
 * Export a bounded, static candidate test from the known synthetic fixture.
 * NOT arbitrary test generation; all interpolated content is constant.
 */
import { mkdirSync, writeFileSync, readFileSync, realpathSync, lstatSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { UnsafeCaseError } from './engine.mjs';

const projectRoot=resolve(join(dirname(fileURLToPath(import.meta.url)),'..'));
const generatedName='checkout-retry.generated.test.mjs';
const testText=`/** E1 FIXTURE TEST — Generated from static template. Synthetic only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runTrial, makeCase } from '../src/engine.mjs';
const build=process.env.ANTIBODY_TEST_BUILD;
if(!['bad','fixed'].includes(build)) throw new Error('ANTIBODY_TEST_BUILD must be bad or fixed');
test('one synthetic payment intent creates at most one durable charge under post-commit ACK loss',()=>{
  const observation=runTrial(makeCase({build,fault:'drop_ack_after_commit',maxAttempts:2}));
  assert.equal(observation.faultFired,true,'post-commit fault should be triggered');
  assert.equal(observation.orderingVerified,true,'commit must precede acknowledgement loss and retry');
  assert.equal(observation.independentLedgerCount,1,'invariant broken: same intent generated duplicate durable captures');
});
`;
const digest=(s)=>createHash('sha256').update(s).digest('hex');
export function exportRegression() {
  const dest=join(projectRoot,'artifacts',generatedName);
  if(!dest.startsWith(projectRoot+sep)) throw new UnsafeCaseError('artifact destination out of project');
  mkdirSync(join(projectRoot,'artifacts'),{recursive:true});
  const outdir=join(projectRoot,'artifacts');
  if(lstatSync(outdir).isSymbolicLink() || realpathSync(outdir)!==outdir) throw new UnsafeCaseError('artifact directory is redirected');
  // Exclusive creation avoids replacing another analyst's different artifact.
  try { writeFileSync(dest,testText,{flag:'wx',mode:0o600}); }
  catch(e) {
    if(e.code!=='EEXIST') throw e;
    if(readFileSync(dest,'utf8')!==testText) throw new UnsafeCaseError('existing regression differs: explicit revision required');
  }
  return {path:dest,sha256:digest(readFileSync(dest))};
}

/**
 * Expected-negative test: run the exact same generated assertion on bad then fixed.
 * Never call a failed bad build a failed engineering gate; we REQUIRE it to fail.
 */
export function verifyExportedRegression() {
  const artifact=exportRegression();
  const command=process.execPath;
  const args=['--test',artifact.path];
  const run=(build)=>spawnSync(command,args,{
    cwd:projectRoot,
    env:{PATH:process.env.PATH||'',SystemRoot:process.env.SystemRoot||'',TEMP:process.env.TEMP||'',TMP:process.env.TMP||'',TMPDIR:process.env.TMPDIR||'',ANTIBODY_TEST_BUILD:build},
    timeout:5000,maxBuffer:1024*1024,encoding:'utf8',
  });
  const bad=run('bad'), fixed=run('fixed');
  const specific=(bad.stdout||'').includes('invariant broken: same intent generated duplicate durable captures') || (bad.stderr||'').includes('invariant broken: same intent generated duplicate durable captures');
  return {
    generated:artifact,
    badExitCode:bad.status,
    fixedExitCode:fixed.status,
    badFailsSpecifically:bad.status===1&&specific,
    fixedPasses:fixed.status===0,
    badStdout:bad.stdout?.slice(-2500),
    fixedStdout:fixed.stdout?.slice(-1200),
    error:bad.error?.message||fixed.error?.message||null,
  };
}
