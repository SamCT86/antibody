/** Typed API for the strict local synthetic lost-queue-ACK scenario. */
export type QueueBuild='bad'|'fixed';
export type QueueFault='none'|'drop_ack_after_commit';
export interface QueueCase {
 readonly version:1;
 readonly case:'queue-lost-ack';
 readonly build:QueueBuild;
 readonly fault:QueueFault;
 readonly maxAttempts:2;
 readonly commandId:'reserve-demo-042';
 readonly network:'off';
}
export interface QueueEvent{readonly seq:number;readonly kind:string;readonly attempt:string;}
export interface QueueObservation {
 readonly schema:'antibody.queue.synthetic.e1.v1';
 readonly case:QueueCase;
 readonly attempts:number;
 readonly deliveries:number;
 readonly committedReservations:number;
 readonly stockAvailable:number;
 readonly events:readonly QueueEvent[];
 readonly oracleCoherent:boolean;
 readonly faultOrder:boolean;
 readonly status:'VIOLATION_OBSERVED'|'NOT_REPRODUCED'|'INCONCLUSIVE';
 readonly limits:readonly string[];
}
export const QUEUE_INVARIANT:string;
export function makeQueueCase(input?:Partial<QueueCase>):QueueCase;
export function runQueueTrial(input?:QueueCase):QueueObservation;
