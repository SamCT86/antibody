/** Type declarations for the bounded ANTIBODY LAB E1 synthetic contract. */
export type BuildVariant = 'bad' | 'fixed';
export type CheckoutFault = 'none' | 'drop_ack_after_commit' | 'fail_before_commit' | 'unrelated_error';
export type TrialStatus = 'VIOLATION_OBSERVED' | 'NOT_REPRODUCED' | 'INCONCLUSIVE';
export interface CheckoutCase {
  readonly version: 1;
  readonly case: 'checkout-retry';
  readonly intentId: 'intent-demo-042';
  readonly build: BuildVariant;
  readonly fault: CheckoutFault;
  readonly maxAttempts: 1 | 2 | 3;
  readonly seed: 2042;
  readonly network: 'off';
}
export interface LedgerCharge {
  readonly id: number;
  readonly intent_id: 'intent-demo-042';
  readonly operation_id: string;
  readonly synthetic_amount_cents: 100;
}
export interface JournalEntry {
  readonly seq: number;
  readonly kind: string;
  readonly operation_id: string;
  readonly detail: string;
}
export interface TrialObservation {
  readonly schema: 'antibody.e1.observation.v1';
  readonly fixture: string;
  readonly build: BuildVariant;
  readonly case: 'checkout-retry';
  readonly intentId: 'intent-demo-042';
  readonly invariant: Readonly<{id:string;rule:string;expected:'n <= 1'}>;
  readonly fault: CheckoutFault;
  readonly faultFired: boolean;
  readonly orderingVerified: boolean|null;
  readonly attempts: number;
  readonly retries: number;
  readonly independentLedgerCount: number;
  readonly independentCharges: readonly LedgerCharge[];
  readonly eventJournal: readonly JournalEntry[];
  readonly status: TrialStatus;
  readonly reason: string|null;
  readonly scope: string;
  readonly limits: readonly string[];
  readonly config: CheckoutCase;
  readonly evidenceSha256: string;
}
export class UnsafeCaseError extends Error {}
export class DroppedAcknowledgement extends Error {}
export class PreCommitTimeout extends Error {}
export const FIXTURE_VERSION: string;
export const INVARIANT: Readonly<{id:string;rule:string;expected:string}>;
export function validateCase(input: unknown): CheckoutCase;
export function makeCase(input?:{build?:BuildVariant;fault?:CheckoutFault;maxAttempts?:1|2|3}):CheckoutCase;
export function runTrial(input?:CheckoutCase):TrialObservation;
export function inspectLedger(file:string,intent?:'intent-demo-042'): {count:number;charges:LedgerCharge[];events:JournalEntry[]};
export function verifyTrialResult(x:unknown):x is TrialObservation;
export function writeEvidence(results:readonly TrialObservation[],outDir:string): {path:string;sha256:string};
