import {makeQueueCase,runQueueTrial,type QueueCase,type QueueObservation} from '../../src/queue.mjs';
import {makeTenantCase,runTenantTrial,type TenantCase,type TenantObservation} from '../../src/tenant.mjs';
const queue:QueueCase=makeQueueCase({build:'bad',fault:'drop_ack_after_commit'});
const q:QueueObservation=runQueueTrial(queue);
const qc:number=q.committedReservations;
const tenant:TenantCase=makeTenantCase({build:'fixed',action:'cross_tenant_lookup'});
const t:TenantObservation=runTenantTrial(tenant);
const leak:boolean=t.crossTenantSentinelExposed;
// @ts-expect-error no remote hosts on synthetic queue case
makeQueueCase({host:'https://example.com'});
// @ts-expect-error cannot select real queue adapter
makeQueueCase({network:'on'});
// @ts-expect-error cannot set arbitrary target for tenant
makeTenantCase({url:'https://example.com'});
// @ts-expect-error cannot name real tenant id
makeTenantCase({tenantId:'real-id'});
void qc;void leak;
