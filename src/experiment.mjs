/** Repeatable synthetic proof loop. Not a generalized testing platform. */
import {makeCase,runTrial,verifyTrialResult,UnsafeCaseError} from './engine.mjs';
import {verifyExportedRegression} from './regression.mjs';
import {writeArtifactOnce} from './artifact-safe.mjs';
import {createHash} from 'node:crypto';
import {writeFileSync,readFileSync,mkdirSync,realpathSync,lstatSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
const root=resolve(join(dirname(fileURLToPath(import.meta.url)),'..'));
const sha=(data)=>createHash('sha256').update(data).digest('hex');
const exportRoot=join(root,'artifacts');

const escapeHtml=(x)=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function executeBoundedExperiment() {
  const baseline=runTrial(makeCase({build:'bad',fault:'none'}));
  const control=runTrial(makeCase({build:'bad',fault:'fail_before_commit'}));
  const bad=Array.from({length:3},()=>runTrial(makeCase({build:'bad',fault:'drop_ack_after_commit'})));
  const fixed=Array.from({length:3},()=>runTrial(makeCase({build:'fixed',fault:'drop_ack_after_commit'})));
  const group=[baseline,control,...bad,...fixed];
  const observationsTrusted=group.every(verifyTrialResult);
  const baselineValid=observationsTrusted&&baseline.independentLedgerCount===1&&control.independentLedgerCount===1;
  const badSpecific=bad.every(x=>x.status==='VIOLATION_OBSERVED'&&x.orderingVerified===true&&x.independentLedgerCount===2);
  const fixedControl=fixed.every(x=>x.status==='NOT_REPRODUCED'&&x.orderingVerified===true&&x.independentLedgerCount===1);
  const regression=verifyExportedRegression();
  const regressionValid=regression.badFailsSpecifically&&regression.fixedPasses;
  const promoted=baselineValid&&badSpecific&&fixedControl&&regressionValid;
  return {
    schema:'antibody.e1.experiment.v1',
    scope:'single synthetic checkout fixture with fixed seed and disposable SQLite; no public target',
    humanInvariant:'at most one charge row per synthetic intent',
    promotion:promoted?'REPRODUCED_SYNTHETIC_ONLY':'INCONCLUSIVE',
    testedRepeatCount:{bad:bad.length,fixed:fixed.length},
    evidence:{baselineValid,badSpecific,fixedControl,regressionValid,observationsTrusted},
    observations:{baseline,precommit:control,bad,fixed},
    exportedRegression:{sha256:regression.generated.sha256,badExitCode:regression.badExitCode,fixedExitCode:regression.fixedExitCode,badFailsSpecifically:regression.badFailsSpecifically,fixedPasses:regression.fixedPasses},
    limits:['No real customer app','One fixture and one frozen seed','Runtime matrix unknown','No Vitest/TS integration yet','Independent observer is a separate SQLite read-only connection, not a separate trust domain','No external adoption or CI'],
  };
}

export function validateExperiment(experiment) {
  if(!experiment||experiment.schema!=='antibody.e1.experiment.v1') return false;
  const o=experiment.observations;
  if(!o||!Array.isArray(o.bad)||!Array.isArray(o.fixed)||o.bad.length!==3||o.fixed.length!==3) return false;
  const group=[o.baseline,o.precommit,...o.bad,...o.fixed];
  if(!group.every(verifyTrialResult)) return false;
  const baseline=group[0].independentLedgerCount===1&&group[1].independentLedgerCount===1;
  const bad=o.bad.every(x=>x.status==='VIOLATION_OBSERVED'&&x.orderingVerified===true&&x.independentLedgerCount===2);
  const fixed=o.fixed.every(x=>x.status==='NOT_REPRODUCED'&&x.orderingVerified===true&&x.independentLedgerCount===1);
  const regression=experiment.exportedRegression;
  const verifiedRegression=regression?.badFailsSpecifically===true&&regression?.fixedPasses===true&&regression.badExitCode===1&&regression.fixedExitCode===0;
  const e=experiment.evidence;
  if(!e||e.baselineValid!==baseline||e.badSpecific!==bad||e.fixedControl!==fixed||e.observationsTrusted!==true||e.regressionValid!==verifiedRegression) return false;
  if(experiment.testedRepeatCount?.bad!==3||experiment.testedRepeatCount?.fixed!==3) return false;
  if(experiment.promotion!==(baseline&&bad&&fixed&&verifiedRegression?'REPRODUCED_SYNTHETIC_ONLY':'INCONCLUSIVE')) return false;
  return true;
}

export function saveExperiment(experiment) {
  if(!validateExperiment(experiment)) throw new UnsafeCaseError('experiment evidence invalid or promotion spoofed');
  mkdirSync(exportRoot,{recursive:true});
  if(lstatSync(exportRoot).isSymbolicLink() || realpathSync(exportRoot)!==exportRoot) throw new UnsafeCaseError('artifact directory is redirected');
  const raw=JSON.stringify(experiment,null,2)+'\n';
  const manifestPath=join(exportRoot,'checkout-e1-experiment.json');
  writeArtifactOnce('checkout-e1-experiment.json',raw);
  const actual=readFileSync(manifestPath,'utf8');
  if(actual!==raw) throw new Error('evidence post-write readback mismatch');
  const summarized={
    status:experiment.promotion,
    scope:experiment.scope,
    invariant:experiment.humanInvariant,
    testedRepeatCount:experiment.testedRepeatCount,
    evidence:experiment.evidence,
    expectedBad:experiment.observations.bad.map(x=>x.independentLedgerCount),
    expectedFixed:experiment.observations.fixed.map(x=>x.independentLedgerCount),
    limits:experiment.limits,
    jsonSha256:sha(raw),
  };
  const plain=escapeHtml(JSON.stringify(summarized,null,2));
  const html=`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ANTIBODY LAB E1 local evidence</title><style>body{background:#0b1120;color:#e6f5ee;font:16px/1.6 system-ui,Arial,sans-serif;margin:0;padding:2rem}main{max-width:880px;margin:auto}h1{font-size:clamp(1.5rem,4vw,2.7rem)}.tag{color:#d7f58a}pre{overflow:auto;background:#15233a;border:1px solid #34505a;padding:1rem;border-radius:12px;white-space:pre-wrap}a{color:#d7f58a}small{color:#b5c4cf}</style></head><body><main><p class="tag">LOCAL SYNTHETIC EVIDENCE · E1 CANDIDATE</p><h1>Your tests pass. Does the promise survive retry?</h1><p><strong>${escapeHtml(experiment.promotion)}</strong> in one controlled fixture only. No real payment gateway, app or user tested.</p><pre>${plain}</pre><small>Generated from a machine-read local evidence JSON. Verify sha256 against the original file. Hashing is integrity only, not identity/authentication.</small></main></body></html>\n`;
  const htmlPath=join(exportRoot,'checkout-e1-report.html');
  writeArtifactOnce('checkout-e1-report.html',html);
  if(readFileSync(htmlPath,'utf8')!==html) throw new Error('offline report post-write readback mismatch');
  return {json:manifestPath,jsonSha256:sha(raw),html:htmlPath,htmlSha256:sha(html)};
}
