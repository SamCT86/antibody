/**
 * ANTIBODY LAB — E1 isolated checkout fixture.
 * This file intentionally does not import HTTP, cloud, shell or third-party packages.
 * Node 22+ built-in node:sqlite is experimental in 22; no production compatibility claim.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {writeArtifactOnce} from './artifact-safe.mjs';

const REQUIRED_INTENT = 'intent-demo-042';
const MAX_ATTEMPTS = 3;
const APPROVED_ARTIFACT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'artifacts');
export const FIXTURE_VERSION = 'checkout-retry-e1-20261103';
export const INVARIANT = Object.freeze({
  id: 'PAYMENT_INTENT_SINGLE_CAPTURE',
  rule: 'at most one committed synthetic charge per payment intent',
  expected: 'n <= 1',
});

export class UnsafeCaseError extends Error {
  constructor(message) { super(message); this.name = 'UnsafeCaseError'; }
}
export class DroppedAcknowledgement extends Error {
  constructor() { super('synthetic response lost after confirmed commit'); this.name='DroppedAcknowledgement'; }
}
export class PreCommitTimeout extends Error {
  constructor() { super('synthetic response lost BEFORE commit'); this.name='PreCommitTimeout'; }
}

/** Strict case contract: no arbitrary code, URL, process, file scope or custom SQL. */
export function validateCase(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new UnsafeCaseError('case must be an object');
  const keys = Object.keys(candidate);
  const allowed = new Set(['version','case','intentId','build','fault','maxAttempts','seed','network']);
  if (keys.some(k => !allowed.has(k))) throw new UnsafeCaseError('unknown case key');
  if (candidate.version !== 1 || candidate.case !== 'checkout-retry') throw new UnsafeCaseError('only registered synthetic checkout-retry case allowed');
  if (candidate.intentId !== REQUIRED_INTENT) throw new UnsafeCaseError('only bundled fictitious intent allowed');
  if (!['bad','fixed'].includes(candidate.build)) throw new UnsafeCaseError('unregistered build');
  if (!['none','drop_ack_after_commit','fail_before_commit','unrelated_error'].includes(candidate.fault)) throw new UnsafeCaseError('unregistered fault');
  if (!Number.isInteger(candidate.maxAttempts) || candidate.maxAttempts<1 || candidate.maxAttempts>MAX_ATTEMPTS) throw new UnsafeCaseError('maxAttempts must be 1..3');
  if (candidate.seed !== 2042) throw new UnsafeCaseError('only frozen seed 2042 accepted in E1');
  if (candidate.network !== 'off') throw new UnsafeCaseError('network must be off');
  return Object.freeze({...candidate});
}

export function makeCase({build='bad', fault='drop_ack_after_commit', maxAttempts=2}={}) {
  return validateCase({version:1,case:'checkout-retry',intentId:REQUIRED_INTENT,build,fault,maxAttempts,seed:2042,network:'off'});
}

function sha256(s) { return createHash('sha256').update(s).digest('hex'); }
function insertEvent(db, kind, operationId, detail = '') {
  const max=db.prepare('SELECT COALESCE(MAX(seq),0)+1 AS next_seq FROM journal').get().next_seq;
  db.prepare('INSERT INTO journal (seq,kind,operation_id,detail) VALUES (?,?,?,?)').run(max,kind,operationId,detail);
  return max;
}
function initDb(db) {
  db.exec('PRAGMA journal_mode=DELETE;');
  db.exec('CREATE TABLE charges (id INTEGER PRIMARY KEY AUTOINCREMENT, intent_id TEXT NOT NULL, operation_id TEXT NOT NULL, synthetic_amount_cents INTEGER NOT NULL CHECK(synthetic_amount_cents=100));');
  db.exec('CREATE TABLE journal (seq INTEGER PRIMARY KEY, kind TEXT NOT NULL, operation_id TEXT NOT NULL, detail TEXT NOT NULL);');
}
/** Read-only oracle uses a different SQLite connection and reads durable disk directly. */
export function inspectLedger(dbFile, intent=REQUIRED_INTENT) {
  if (intent !== REQUIRED_INTENT) throw new UnsafeCaseError('unknown oracle intent');
  const observer = new DatabaseSync(dbFile, {readOnly:true});
  try {
    const row=observer.prepare('SELECT COUNT(*) AS n FROM charges WHERE intent_id=?').get(intent);
    const charges=observer.prepare('SELECT id,intent_id,operation_id,synthetic_amount_cents FROM charges ORDER BY id').all();
    const events=observer.prepare('SELECT seq,kind,operation_id,detail FROM journal ORDER BY seq').all();
    return {count:row.n, charges, events};
  } finally { observer.close(); }
}

/**
 * Performs an isolated synthetic action. The deliberately flawed version double-writes
 * the same intent; fixed implements persistent dedupe by exact payment intent.
 */
function commitSyntheticCharge(db, spec, operationId) {
  db.exec('BEGIN IMMEDIATE;');
  try {
    insertEvent(db,'ATTEMPT_BEGIN',operationId,'synthetic checkout request');
    if (spec.build === 'fixed') {
      const exists=db.prepare('SELECT id FROM charges WHERE intent_id=?').get(spec.intentId);
      if (exists) {
        insertEvent(db,'DURABLE_DEDUPLICATION',operationId,'intent already committed');
        db.exec('COMMIT;');
        return {committed:false, deduplicated:true};
      }
    }
    db.prepare('INSERT INTO charges (intent_id,operation_id,synthetic_amount_cents) VALUES (?,?,?)').run(spec.intentId,operationId,100);
    insertEvent(db,'DURABLE_COMMIT',operationId,'charge persisted');
    db.exec('COMMIT;');
    return {committed:true,deduplicated:false};
  } catch(e) { db.exec('ROLLBACK;'); throw e; }
}

function assertAfterCommitOrdering(events) {
  const commit=events.findIndex(e=>e.kind==='DURABLE_COMMIT' && e.operation_id==='attempt-1');
  const drop=events.findIndex(e=>e.kind==='ACK_DROPPED' && e.operation_id==='attempt-1');
  const retry=events.findIndex(e=>e.kind==='ATTEMPT_BEGIN' && e.operation_id==='attempt-2');
  return commit>=0 && drop>commit && retry>drop;
}
function statusFor(spec, observation, retries, ordering) {
  // The business rule is 'at most one charge', so an unrelated error never counts as violation.
  if (spec.fault==='unrelated_error') return 'INCONCLUSIVE';
  if (spec.fault==='drop_ack_after_commit' && !ordering) return 'INCONCLUSIVE';
  if (observation.count>1 && spec.fault==='drop_ack_after_commit' && retries>0) return 'VIOLATION_OBSERVED';
  return 'NOT_REPRODUCED';
}

export function runTrial(input=makeCase()) {
  const spec = validateCase(input);
  const root = mkdtempSync(join(tmpdir(), 'antibody-lab-e1-'));
  const dbFile = join(root, 'synthetic-ledger.sqlite');
  const db = new DatabaseSync(dbFile);
  let attempts=0;
  let dropped=false;
  let retried=0;
  let faultFired=false;
  let setupError=null;
  try {
    initDb(db);
    for(let i=0;i<spec.maxAttempts;i++) {
      attempts++;
      const operationId=`attempt-${attempts}`;
      if(spec.fault==='unrelated_error') {
        insertEvent(db,'UNRELATED_EXCEPTION',operationId,'synthetic unrelated validation error');
        setupError='unrelated validation exception';
        break;
      }
      if(spec.fault==='fail_before_commit' && i===0) {
        insertEvent(db,'PRE_COMMIT_FAULT',operationId,'no durable write');
        faultFired=true;
        retried++;
        continue;
      }
      const result=commitSyntheticCharge(db,spec,operationId);
      // This point is strictly after the SQLite COMMIT completed.
      if(spec.fault==='drop_ack_after_commit' && !dropped && result.committed) {
        insertEvent(db,'ACK_DROPPED',operationId,'response intentionally discarded after commit');
        dropped=true; faultFired=true;
        if(i+1<spec.maxAttempts) { retried++; continue; }
        break;
      }
      insertEvent(db,'ACK_RECEIVED',operationId,result.deduplicated?'idempotent duplicate acknowledged':'synthetic confirmation');
      break;
    }
    db.close();
    const observation=inspectLedger(dbFile);
    const ordering=assertAfterCommitOrdering(observation.events);
    const status=statusFor(spec,observation,retried,ordering);
    const publicSpec=Object.freeze({...spec});
    const raw={
      schema:'antibody.e1.observation.v1',
      fixture:FIXTURE_VERSION,
      build:spec.build,
      case:spec.case,
      intentId:spec.intentId,
      invariant:INVARIANT,
      fault:spec.fault,
      faultFired,
      orderingVerified:spec.fault==='drop_ack_after_commit'?ordering:null,
      attempts,retries:retried,
      independentLedgerCount:observation.count,
      independentCharges:observation.charges,
      eventJournal:observation.events,
      status,
      reason:setupError,
      scope:'disposable synthetic SQLite fixture; no network calls or real payment side effects',
      limits:['one frozen seed','Node.js built-in SQLite experimental on Node 22','single local process; no external user validation'],
      config:publicSpec,
    };
    return {...raw, evidenceSha256:sha256(JSON.stringify(raw))};
  } finally {
    try{db.close();}catch{}
    rmSync(root,{recursive:true,force:true});
  }
}

/** Exact offline report artifacts with no user-controlled path or external template. */
export function writeEvidence(results, outputRoot) {
  if (!Array.isArray(results) || results.length===0 || results.length>4) throw new UnsafeCaseError('evidence must have 1..4 bounded trials');
  const approvedRoot=resolve(outputRoot);
  if (approvedRoot!==APPROVED_ARTIFACT_ROOT) throw new UnsafeCaseError('output must be inside this candidate artifacts directory');
  mkdirSync(approvedRoot,{recursive:true});
  if(lstatSync(approvedRoot).isSymbolicLink() || realpathSync(approvedRoot)!==approvedRoot) throw new UnsafeCaseError('artifact symlink/reparse redirect refused');
  const filename='checkout-e1-evidence.json';
  const out=join(approvedRoot,filename);
  const record={schema:'antibody.e1.bundle.v1',results,readme:'Synthetic local fixture only; VIOLATION_OBSERVED is not fully REPRODUCED (requires independent reruns).'};
  writeArtifactOnce(filename,JSON.stringify(record,null,2)+'\n');
  return {path:out,sha256:sha256(readFileSync(out))};
}

export function verifyTrialResult(trial) {
  if (!trial || typeof trial!=='object') return false;
  try {
    const {evidenceSha256,...rest}=trial;
    if(evidenceSha256!==sha256(JSON.stringify(rest))) return false;
    if(rest.schema!=='antibody.e1.observation.v1'||rest.fixture!==FIXTURE_VERSION) return false;
    const spec=validateCase(rest.config);
    if(rest.build!==spec.build || rest.fault!==spec.fault || rest.case!==spec.case || rest.intentId!==spec.intentId) return false;
    if(rest.invariant?.id!==INVARIANT.id||rest.invariant?.expected!==INVARIANT.expected) return false;
    if(!Number.isInteger(rest.independentLedgerCount) || rest.independentLedgerCount<0 || rest.independentLedgerCount>spec.maxAttempts) return false;
    if(!Array.isArray(rest.independentCharges)||!Array.isArray(rest.eventJournal)) return false;
    if(rest.independentCharges.length!==rest.independentLedgerCount) return false;
    if(!rest.independentCharges.every(c=>c.intent_id===REQUIRED_INTENT&&c.synthetic_amount_cents===100)) return false;
    const events=rest.eventJournal;
    if(!events.every((e,i)=>e.seq===i+1&&typeof e.kind==='string')) return false;
    const commits=events.filter(e=>e.kind==='DURABLE_COMMIT');
    if(commits.length!==rest.independentLedgerCount) return false;
    if(!Number.isInteger(rest.attempts)||rest.attempts<1||rest.attempts>spec.maxAttempts) return false;
    if(!Number.isInteger(rest.retries)||rest.retries<0||rest.retries>=spec.maxAttempts) return false;
    const ordering=assertAfterCommitOrdering(events);
    if(spec.fault==='drop_ack_after_commit' && rest.orderingVerified!==ordering) return false;
    if(spec.fault!=='drop_ack_after_commit'&&rest.orderingVerified!==null) return false;
    if(spec.fault==='drop_ack_after_commit'&&rest.faultFired!==events.some(e=>e.kind==='ACK_DROPPED')) return false;
    const recomputedStatus=statusFor(spec,{count:rest.independentLedgerCount},rest.retries,ordering);
    if(rest.status!==recomputedStatus) return false;
    if(rest.status==='VIOLATION_OBSERVED' && (!ordering || rest.independentLedgerCount<=1)) return false;
    // Invariant must outrank the fault label: forged NOT_REPRODUCED with >1 charge is contradictory.
    if(rest.status==='NOT_REPRODUCED' && rest.independentLedgerCount>1) return false;
    if(rest.independentLedgerCount>rest.attempts) return false;
    // A hash can be recomputed by the evidence producer; establish local semantic coherence.
    if(new Set(commits.map(e=>e.operation_id)).size!==commits.length) return false;
    if(new Set(rest.independentCharges.map(c=>c.id)).size!==rest.independentCharges.length) return false;
    const committedOps=commits.map(e=>e.operation_id).sort();
    const chargedOps=rest.independentCharges.map(c=>c.operation_id).sort();
    if(committedOps.some((op,i)=>op!==chargedOps[i])) return false;
    return true;
  } catch {return false;}
}
