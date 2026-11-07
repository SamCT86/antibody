/**
 * Isolated synthetic cross-tenant read property (G3 candidate).
 * No authentication system, server, browser, HTTP request or external target.
 * This tests a deliberately flawed local data-access method only.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UnsafeCaseError } from './engine.mjs';

export const TENANT_INVARIANT = 'TENANT_B_MUST_NOT_RECEIVE_TENANT_A_SENTINEL';
const seed = Object.freeze({tenantA: 'tenant-demo-a', tenantB: 'tenant-demo-b', sharedLookupId: 1001, ownRecordId: 2002, sentinel: 'PRIVATE-SYNTHETIC-A-042'});
export function makeTenantCase(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new UnsafeCaseError('invalid tenant case');
  const allowed = new Set(['version', 'case', 'build', 'action', 'network']);
  if (Object.keys(input).some(k => !allowed.has(k))) throw new UnsafeCaseError('unregistered tenant field or target');
  const {build = 'bad', action = 'cross_tenant_lookup', version = 1, network = 'off'} = input;
  if (version !== 1 || !['bad', 'fixed'].includes(build) || !['cross_tenant_lookup', 'own_tenant_lookup', 'missing_object'].includes(action) || network !== 'off') {
    throw new UnsafeCaseError('unsupported tenant operation or external network');
  }
  if (input.case !== undefined && input.case !== 'tenant-read-local') throw new UnsafeCaseError('unregistered case');
  return Object.freeze({version, case: 'tenant-read-local', build, action, network});
}

export function runTenantTrial(input = makeTenantCase()) {
  const c = makeTenantCase(input);
  const dir = mkdtempSync(join(tmpdir(), 'antibody-tenant-g3-'));
  const file = join(dir, 'tenant.sqlite');
  const db = new DatabaseSync(file);
  try {
    db.exec('CREATE TABLE orders(id INTEGER PRIMARY KEY, tenant_id TEXT NOT NULL, body TEXT NOT NULL);');
    db.prepare('INSERT INTO orders(id,tenant_id,body) VALUES(?,?,?)').run(seed.sharedLookupId, seed.tenantA, seed.sentinel);
    db.prepare('INSERT INTO orders(id,tenant_id,body) VALUES(?,?,?)').run(seed.ownRecordId, seed.tenantB, 'PUBLIC-SYNTHETIC-B-042');
    // The subject under test. Bad variant intentionally ignores owner tenant.
    const id = c.action === 'cross_tenant_lookup' ? seed.sharedLookupId : c.action === 'own_tenant_lookup' ? seed.ownRecordId : 9999;
    const seen = c.build === 'bad'
      ? db.prepare('SELECT id,body FROM orders WHERE id=?').get(id)
      : db.prepare('SELECT id,body FROM orders WHERE id=? AND tenant_id=?').get(id, seed.tenantB);
    const response = seen ? {id: seen.id, body: seen.body} : null;
    db.close();
    // Independent read-only inspection of the seeded database and returned payload.
    const observer = new DatabaseSync(file, {readOnly:true});
    try {
      const owner = observer.prepare('SELECT tenant_id FROM orders WHERE id=?').get(id)?.tenant_id || null;
      const sentinelFromDb = observer.prepare('SELECT body FROM orders WHERE id=? AND tenant_id=?').get(seed.sharedLookupId, seed.tenantA)?.body;
      const seededCorrectly = sentinelFromDb === seed.sentinel && observer.prepare('SELECT COUNT(*) AS n FROM orders').get().n === 2;
      const leak = !!response && owner !== seed.tenantB && response.body === sentinelFromDb;
      const responseCorrect = c.action==='own_tenant_lookup'
        ? !!response && owner === seed.tenantB && response.body === 'PUBLIC-SYNTHETIC-B-042'
        : c.action==='missing_object' ? response===null : (c.build === 'bad' ? leak : response===null);
      const oracleCoherent = seededCorrectly && responseCorrect;
      return {
        schema:'antibody.tenant.synthetic.g3.v1',
        case:c,
        observedResponse:response,
        independentOwner:owner,
        seededCorrectly,
        crossTenantSentinelExposed:leak,
        oracleCoherent,
        status:!oracleCoherent?'INCONCLUSIVE':leak?'VIOLATION_OBSERVED':'NOT_REPRODUCED',
        limits:['local SQLite only','fictitious tenants and orders','not an authentication or remote BOLA scanner','not a security guarantee for a real application']
      };
    } finally {observer.close();}
  } finally {try{db.close();}catch{}rmSync(dir,{recursive:true,force:true});}
}
