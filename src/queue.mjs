/**
 * ANTIBODY LAB — optional second isolated synthetic fixture: lost queue ACK.
 * NO real queue or network service. Tests duplicate side effect, not duplicate delivery.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UnsafeCaseError } from './engine.mjs';

export const QUEUE_INVARIANT='ONE_RESERVATION_PER_COMMAND_AND_ONE_STOCK_DECREMENT';
export function makeQueueCase(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new UnsafeCaseError('invalid queue case');
  const allowed=new Set(['version','case','build','fault','maxAttempts','commandId','network']);
  if(Object.keys(input).some(k=>!allowed.has(k))) throw new UnsafeCaseError('unknown queue field/target');
  const {build='bad',fault='drop_ack_after_commit',maxAttempts=2}=input;
  if(!['bad','fixed'].includes(build))throw new UnsafeCaseError('unknown queue build');
  if(!['none','drop_ack_after_commit'].includes(fault))throw new UnsafeCaseError('unknown queue fault');
  if(maxAttempts!==2)throw new UnsafeCaseError('queue E1 requires bounded two-attempt schedule');
  if(input.version!==undefined&&input.version!==1)throw new UnsafeCaseError('unknown queue version');
  if(input.case!==undefined&&input.case!=='queue-lost-ack')throw new UnsafeCaseError('unregistered case');
  if(input.commandId!==undefined&&input.commandId!=='reserve-demo-042')throw new UnsafeCaseError('foreign command');
  if(input.network!==undefined&&input.network!=='off')throw new UnsafeCaseError('external queue network forbidden');
  return Object.freeze({version:1,case:'queue-lost-ack',build,fault,maxAttempts,commandId:'reserve-demo-042',network:'off'});
}

function event(db,kind,attempt) {
  const s=db.prepare('SELECT COALESCE(MAX(seq),0)+1 AS n FROM journal').get().n;
  db.prepare('INSERT INTO journal(seq,kind,attempt) VALUES(?,?,?)').run(s,kind,attempt);
}
function reserve(db,c,attempt) {
  db.exec('BEGIN IMMEDIATE;');
  try {
    event(db,'DELIVERY_RECEIVED',attempt);
    if(c.build==='fixed'&&db.prepare('SELECT 1 AS yes FROM reservations WHERE command_id=?').get(c.commandId)) {
      event(db,'IDEMPOTENT_DUPLICATE_SKIPPED',attempt); db.exec('COMMIT;');return false;
    }
    db.prepare('INSERT INTO reservations(command_id,attempt) VALUES(?,?)').run(c.commandId,attempt);
    db.exec('UPDATE inventory SET available=available-1 WHERE id=1 AND available>0');
    event(db,'RESERVATION_DURABLY_COMMITTED',attempt);
    db.exec('COMMIT;');return true;
  } catch(e) { db.exec('ROLLBACK;');throw e; }
}
export function runQueueTrial(caseInput=makeQueueCase()) {
  const c=makeQueueCase(caseInput);
  const dir=mkdtempSync(join(tmpdir(),'antibody-queue-e1-'));
  const file=join(dir,'queue.sqlite');
  const db=new DatabaseSync(file);
  try {
    db.exec('CREATE TABLE inventory(id INTEGER PRIMARY KEY, available INTEGER NOT NULL);INSERT INTO inventory(id,available) VALUES(1,10);');
    db.exec('CREATE TABLE reservations(id INTEGER PRIMARY KEY AUTOINCREMENT,command_id TEXT NOT NULL,attempt TEXT NOT NULL);');
    db.exec('CREATE TABLE journal(seq INTEGER PRIMARY KEY,kind TEXT NOT NULL,attempt TEXT NOT NULL);');
    let attempts=0;
    for(let i=1;i<=c.maxAttempts;i++) {
      attempts++;const operation=`delivery-${i}`;
      const committed=reserve(db,c,operation);
      if(c.fault==='drop_ack_after_commit'&&i===1&&committed) {
        event(db,'QUEUE_ACK_DROPPED',operation);
        continue;
      }
      event(db,'ACK_CONFIRMED',operation);
      break;
    }
    db.close();
    const observer=new DatabaseSync(file,{readOnly:true});
    try {
      const count=observer.prepare('SELECT COUNT(*) AS n FROM reservations WHERE command_id=?').get(c.commandId).n;
      const stock=observer.prepare('SELECT available FROM inventory WHERE id=1').get().available;
      const events=observer.prepare('SELECT seq,kind,attempt FROM journal ORDER BY seq').all();
      const deliveries=events.filter(e=>e.kind==='DELIVERY_RECEIVED').length;
      const commits=events.filter(e=>e.kind==='RESERVATION_DURABLY_COMMITTED').length;
      const dropped=events.findIndex(e=>e.kind==='QUEUE_ACK_DROPPED');
      const firstCommit=events.findIndex(e=>e.kind==='RESERVATION_DURABLY_COMMITTED');
      const faultOrder=c.fault==='drop_ack_after_commit'?firstCommit>=0&&dropped>firstCommit:true;
      const coherent=count===commits&&stock===10-count&&faultOrder&&deliveries===attempts;
      return {schema:'antibody.queue.synthetic.e1.v1',case:c,attempts,deliveries,committedReservations:count,stockAvailable:stock,events,oracleCoherent:coherent, faultOrder,
        status:!coherent?'INCONCLUSIVE':count>1?'VIOLATION_OBSERVED':'NOT_REPRODUCED',
        limits:['single local synthetic queue fixture','no real queue broker','no real inventory or customer data']};
    }finally{observer.close();}
  }finally{try{db.close();}catch{}rmSync(dir,{recursive:true,force:true});}
}
