import {makeCase,runTrial,validateCase,type TrialObservation,type CheckoutCase} from '../../src/engine.mjs';
const spec: CheckoutCase = makeCase({build:'bad', fault:'drop_ack_after_commit', maxAttempts:2});
const result: TrialObservation = runTrial(spec);
const count: number = result.independentLedgerCount;
const status: 'VIOLATION_OBSERVED'|'NOT_REPRODUCED'|'INCONCLUSIVE' = result.status;
const fromUnknown: CheckoutCase = validateCase({});
// @ts-expect-error runtime rejects unsupported non-synthetic fault and TS should reject it too
makeCase({fault:'real-payment-network'});
// @ts-expect-error the type contract explicitly forbids arbitrary external URL target
makeCase({host:'https://example.com'});
void count;void status;void fromUnknown;
