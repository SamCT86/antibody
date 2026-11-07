#!/usr/bin/env node
/** Integrity of fixed synthetic snapshots only. Does not import any experiment producer. */
import {fileURLToPath} from 'node:url';
import {realpathSync} from 'node:fs';
import {reviewEvidenceSnapshot} from './snapshot-review.mjs';
import {readFixedEvidenceText} from './read-evidence-text.mjs';

const LIMITS = Object.freeze({
  runtimeReproduced:false,regressionExecuted:false,sourceAuthenticated:false,
  externalCaseVerified:false,g4Passed:false,
});

export function auditRecordedEvidence(directory) {
  const results={};
  for(const kind of ['checkout','queue','tenant']) {
    try {
      const raw=readFixedEvidenceText(directory,kind+'Evidence');
      const regression=readFixedEvidenceText(directory,kind+'Regression');
      results[kind]=reviewEvidenceSnapshot(kind,raw,regression);
    } catch {
      // File errors and JSON contents must never be reflected in diagnostic output.
      results[kind]={status:'HOLD_INPUT_UNAVAILABLE',...LIMITS};
    }
  }
  const allMatch=Object.values(results).every(x=>x.status==='MATCHES_REVIEWED_SYNTHETIC_SNAPSHOT');
  return {
    schema:'antibody.recorded-snapshot-audit.e1.v1',
    scope:'integrity of three frozen first-party synthetic snapshots only',
    status:allMatch?'MATCHES_REVIEWED_SYNTHETIC_SNAPSHOTS':'HOLD_REVIEW_REQUIRED',
    results,...LIMITS,
    limits:[
      'A matching file is not a fresh experiment or regression execution.',
      'Digests are integrity references, not authenticated author or host identity.',
      'Changed source or new valid experiments require separate review; never normalize to force a match.',
      'This is not a sandbox, real-application scan, developer acceptance or G4 result.',
    ],
  };
}

function invokedDirectly() {
  if(typeof import.meta.main==='boolean')return import.meta.main;
  // Older supported Node versions lack import.meta.main. Imports from stdin,
  // eval or callers with synthetic argv paths must not produce filesystem errors.
  try {
    return Boolean(process.argv[1])&&
      realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url));
  } catch {return false;}
}

if(invokedDirectly()) {
  if(process.argv.length!==3||process.argv[2].length===0||process.argv[2].startsWith('-')) {
    console.error('Usage: node src/audit-recorded-evidence.mjs <approved-local-artifacts-directory>');
    process.exitCode=2;
  } else {
    const result=auditRecordedEvidence(process.argv[2]);
    console.log(JSON.stringify(result,null,2));
    if(result.status!=='MATCHES_REVIEWED_SYNTHETIC_SNAPSHOTS')process.exitCode=2;
  }
}
