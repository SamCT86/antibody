# Changes

## 0.1.0-experimental.2 - private review candidate

- Fixed source-manifest enumeration accepting undeclared files or directories at the source root.
- Reject redirected Git metadata; regular Git metadata remains explicitly outside the source manifest.
- Added four root-coverage regression cases which failed before the correction and a positive worktree-metadata case. Disposable fixtures exclude only source-root Git metadata, so the checks also work in a normal checkout.
- No experiment engine behavior changed, no full-engine rerun, and no publication or licence grant is implied.

## 0.1.0-experimental.1 - publication candidate

- Prepared clean first-party research source with public documentation and proposed MIT licence.
- Added a separately reviewed data-only checker for three frozen synthetic evidence/regression pairs.
- Made explicitly named isolated checks the default test path; historical SQLite/research execution remains separate and not freshly certified.
- Preserved checkout, queue and tenant source for inspection without private operational documents or private Git history.
- No public release, npm publication, production support, external scan, customer acceptance or paid outcome is established by this candidate.
