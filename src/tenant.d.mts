/** Typed API for the strict local synthetic tenant scenario; NOT a live security scanner. */
export type TenantBuild='bad'|'fixed';
export type TenantAction='cross_tenant_lookup'|'own_tenant_lookup'|'missing_object';
export interface TenantCase {
 readonly version:1;
 readonly case:'tenant-read-local';
 readonly build:TenantBuild;
 readonly action:TenantAction;
 readonly network:'off';
}
export interface TenantObservation {
 readonly schema:'antibody.tenant.synthetic.g3.v1';
 readonly case:TenantCase;
 readonly observedResponse:null|Readonly<{id:number;body:string}>;
 readonly independentOwner:string|null;
 readonly seededCorrectly:boolean;
 readonly crossTenantSentinelExposed:boolean;
 readonly oracleCoherent:boolean;
 readonly status:'VIOLATION_OBSERVED'|'NOT_REPRODUCED'|'INCONCLUSIVE';
 readonly limits:readonly string[];
}
export const TENANT_INVARIANT:string;
export function makeTenantCase(input?:Partial<TenantCase>):TenantCase;
export function runTenantTrial(input?:TenantCase):TenantObservation;
