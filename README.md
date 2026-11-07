# ANTIBODY Lab

**Experimental research source.** ANTIBODY Lab explores how to explain failures where an operation commits but its acknowledgement is lost. The repository contains intentionally broken and corrected synthetic checkout, queue and tenant fixtures, plus a separate read-only checker for frozen evidence files.

This is an early research project. It has not demonstrated better defect detection than a strong ordinary Node test. It is not an application scanner, production payment integration or security sandbox.

## Start with the isolated checks

Use an approved Node 24 runtime. The isolated checker was tested with Node 24.18.0 on Windows and Node 24.22.1 on Linux. No npm installation, cloud account, API key or paid service is needed.

```sh
node --test tests/recorded-audit.test.mjs
```

`npm test` names three isolated test files explicitly: 14 snapshot-reader checks and 23 source-manifest checks. It does not execute the historical checkout, queue or tenant experiments. The earlier reader-only Windows result was 12 passed and 2 file-link checks skipped; a fresh result for this complete export is reported separately. See [review status](docs/REVIEW_STATUS.md) for scope and remaining gaps.

The tests create temporary synthetic files, exercise the real reader and CLI, and clean up their own temporary directory. The reader does not import experiment producers, execute recorded regression text, create a database or make network requests.

## Keep the source tree clean

Source verification rejects extra root files/directories, including `node_modules`, editor metadata and generated artifacts. No `npm install` is needed. Keep outputs outside this source directory; do not delete unrelated files to force a passing result. Ordinary Git metadata is explicitly excluded, so a normal Git checkout is supported without authenticating its history or hooks.

## Check an existing frozen evidence directory

```sh
node src/audit-recorded-evidence.mjs /path/to/approved-local-evidence
```

The checker reads exactly six fixed filenames: three JSON evidence files and three recorded regression source files. A successful result means their bytes match the reviewed synthetic snapshots. It does not reproduce an experiment or authenticate its author. New or modified valid results also require separate review.

Bundled fixtures live in `tests/fixtures/readonly-audit/`; recorded regression source is deliberately stored with a `.txt` suffix there and is treated as data by the tests. This fixture directory is not itself a ready-to-audit artifact directory. See [snapshot format](docs/SNAPSHOT_FORMAT.md) for exact filenames and digests.

## Research source and execution limits

The older synthetic engine and its tests remain available for source review. Commands beginning with `research:` can execute SQLite experiments, generate files and start fixed first-party regression subprocesses. They are not the read-only checker.

**The complete current engine suite was not rerun because an earlier execution safety review remains unresolved.** Its historical passing results do not certify this export. Do not use this repository to execute third-party code, connect live systems or process customer data. No OS isolation or denied-egress sandbox is provided.

See [architecture and boundaries](docs/ARCHITECTURE.md) and [security reporting](SECURITY.md).

## Contributing

Small reproducible corrections, clearer explanations and fair ordinary-Node comparisons are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing code or fixtures. Real participant answers, customer traces and credentials do not belong in this repository.

## License

MIT. See [LICENSE](LICENSE).
