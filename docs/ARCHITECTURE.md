# Architecture and trust boundaries

## Advertised path: frozen snapshot checking

`audit-recorded-evidence.mjs` reads six fixed local filenames through `read-evidence-text.mjs`. The reader validates directory/file types, rejects the checked redirects and bounds raw bytes. `snapshot-review.mjs` compares primitive UTF-8 text with three frozen evidence/regression digest pairs.

This path imports only those reader modules and Node built-ins. It does not import the research engine, open SQLite, start subprocesses, execute recorded regression text or use a network client. Its receipt leaves runtime reproduction, regression execution, source authentication, external-case verification and broader benchmark admission false.

The isolated tests create disposable synthetic files and short first-party Node subprocesses to verify CLI behaviour. This is distinct from executing recorded regression text or an experiment.

## Research paths

Checkout models a committed fictitious charge followed by a dropped acknowledgement and retry. Queue models duplicate delivery after a committed fictitious reservation loses acknowledgement. Tenant models a broken versus corrected local lookup with a cross-tenant sentinel.

These fixtures use temporary SQLite storage. A second read-only connection observes stored state independently of the application response, but inside the same local trust domain. Neither that observer nor JSON/hashes authenticate a hostile environment.

Research proof/audit modules may execute fixed first-party regression subprocesses and save artifacts. Their presence is not execution approval or a successful test of this export. The complete current suite has not cleared its earlier host execution review.

## Limits

No hardened OS sandbox, denied-egress boundary, live payment/queue/auth integration, customer scan, authenticated evidence signing or comparative detection advantage is established. Source availability supports review; it is not production assurance.
