# Security

This experimental source is not a security product or a hardened execution environment. The read-only snapshot checker is deliberately separate from the synthetic experiment engine. Its reviewed result means byte consistency with frozen references, not author identity or application safety.

## Data boundaries

- Use the bundled synthetic examples or separately approved nonsensitive local evidence only.
- The checker accepts one directory and fixed filenames; it does not accept URLs, SQL, scripts or caller-selected reference hashes.
- It bounds each read and rejects the tested file-replacement, growth, truncation, invalid-encoding and file-link cases. These checks are not a complete defence against a hostile filesystem or host.
- Recorded regression files are read as text. They are never imported or executed by the checker.
- Legacy research commands can start Node subprocesses and write temporary SQLite/artifact files. They do not provide sandboxing for untrusted code.

## Source-manifest boundary

The source-root inventory is closed: undeclared root files/directories hold verification. Ordinary `.git` metadata is excluded explicitly; a redirected `.git` entry is rejected. Git configuration, hooks and repository history are not authenticated or reviewed by the source manifest. No Git hooks run in this check. A matching manifest is not protection against a compromised host or all concurrent filesystem races.

## Reporting a concern

Before a public security contact has been explicitly established, do not send private exploit details, secrets or customer data through a public issue. A public issue may describe a nonsensitive symptom and request a private reporting route. No response-time commitment, paid support, bounty programme or maintained security-release line is promised for this experimental snapshot.

No dedicated private reporting route is established in this candidate; GitHub private vulnerability reporting is not claimed to be enabled.
