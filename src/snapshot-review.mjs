/**
 * Isolated E1 alternative for reading three already-reviewed synthetic snapshots.
 * No producer import, experiment replay, subprocess, filesystem or network access.
 * A match is byte integrity ONLY; it is never a fresh reproduction or G4 result.
 * Reference digests were independently matched after reviewed transfer.
 */
import {createHash} from 'node:crypto';

export const MAX_UTF8_BYTES = 2 * 1024 * 1024;
const REFERENCES = Object.freeze({
  checkout: Object.freeze({
    evidence: 'bdec59d7b201519e49c280eba96b234e91213f3f81c9624e52cc9aac6f0e02dc',
    regression: 'aecfd7eef9dca334d5e05f42fd7ef5d73428f95b3e12f44c15c27f2d1f0ba5d7',
  }),
  queue: Object.freeze({
    evidence: '7290a146922a0dd5bb183e7f5b5d0d9e228a2652c5331922b1727ca70c231aa3',
    regression: 'd1720823ba8617ef2fb5ebaf5d7038127b492d4d86be0939e44fbe3353618418',
  }),
  tenant: Object.freeze({
    evidence: '42aeed2f302b5294f4ea227bb51aa59d2bac8df1533ffe0ed9a0044ee932edf8',
    regression: '866d0e5691f36c8f824711484141248723ff5f25ae87cca62679a2cde714a362',
  }),
});

function digestRaw(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_UTF8_BYTES ||
      Buffer.byteLength(raw, 'utf8') > MAX_UTF8_BYTES) return null;
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/** Inputs are primitive source text, not executable objects or caller-chosen hashes. */
export function reviewEvidenceSnapshot(kind, rawEvidence, rawRegression) {
  const limits = {
    runtimeReproduced: false,
    regressionExecuted: false,
    sourceAuthenticated: false,
    externalCaseVerified: false,
    g4Passed: false,
  };
  if (typeof kind !== 'string' || !Object.hasOwn(REFERENCES, kind)) {
    return Object.freeze({status: 'HOLD_UNSUPPORTED_SNAPSHOT', ...limits});
  }
  const evidenceSha256 = digestRaw(rawEvidence);
  const regressionSha256 = digestRaw(rawRegression);
  if (evidenceSha256 === null || regressionSha256 === null) {
    return Object.freeze({status: 'HOLD_INPUT_TYPE_OR_SIZE', ...limits});
  }
  const reference = REFERENCES[kind];
  const matches = evidenceSha256 === reference.evidence &&
    regressionSha256 === reference.regression;
  return Object.freeze({
    status: matches ? 'MATCHES_REVIEWED_SYNTHETIC_SNAPSHOT' : 'HOLD_SNAPSHOT_CHANGED',
    kind, evidenceSha256, regressionSha256, ...limits,
  });
}
