/**
 * Read-only semantic audit of three fixed local evidence files.
 * This does not grant trust in a hostile source and does not inspect arbitrary paths.
 */
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateExperiment} from './experiment.mjs';
import {verifyExportedRegression} from './regression.mjs';
import {verifyQueueEvidence} from './queue-proof.mjs';
import {verifyTenantEvidence} from './tenant-proof.mjs';
import {UnsafeCaseError} from './engine.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const artifacts=join(root,'artifacts');
const files=Object.freeze({checkout:'checkout-e1-experiment.json',queue:'queue-g3-experiment.json',tenant:'tenant-g3-experiment.json'});
function readBounded(name){
 const filename=files[name];if(!filename)throw new UnsafeCaseError('unsupported evidence type');
 const path=join(artifacts,filename);
 if(lstatSync(path).isSymbolicLink()||lstatSync(artifacts).isSymbolicLink()||realpathSync(artifacts)!==artifacts)throw new UnsafeCaseError('redirected evidence path');
 const raw=readFileSync(path,'utf8');if(raw.length>2*1024*1024)throw new UnsafeCaseError('evidence file size exceeds bounded limit');
 return JSON.parse(raw);
}
export function auditSavedEvidence(){
 const checkout=readBounded('checkout');
 const queue=readBounded('queue');
 const tenant=readBounded('tenant');
 const reg=verifyExportedRegression();
 const checkoutValid=validateExperiment(checkout)&&reg.badFailsSpecifically&&reg.fixedPasses&&
  checkout.exportedRegression?.sha256===reg.generated.sha256;
 const queueValid=verifyQueueEvidence(queue);
 const tenantValid=verifyTenantEvidence(tenant);
 return {
  schema:'antibody.audit.saved.v1',scope:'fixed local synthetic evidence only',
  checkout:{valid:checkoutValid,recorded:checkout.promotion},
  queue:{valid:queueValid,recorded:queue.result},
  tenant:{valid:tenantValid,recorded:tenant.result},
  overall:checkoutValid&&queueValid&&tenantValid?'PASS_LOCAL_SYNTHETIC':'HOLD_EVIDENCE_INVALID',
  limits:['not hosted or real payment / broker / tenant testing','this CLI audit alone does not authenticate host/device provenance; consult independent provider receipts','checks semantic coherence, not hostile-producer authenticity'],
 };
}
