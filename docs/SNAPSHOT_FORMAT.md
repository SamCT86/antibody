# Frozen snapshot input

Pass an approved local artifact directory to `node src/audit-recorded-evidence.mjs DIRECTORY`. Exactly these files and SHA-256 values are accepted:

| Filename | SHA-256 |
|---|---|
| checkout-e1-experiment.json | bdec59d7b201519e49c280eba96b234e91213f3f81c9624e52cc9aac6f0e02dc |
| checkout-retry.generated.test.mjs | aecfd7eef9dca334d5e05f42fd7ef5d73428f95b3e12f44c15c27f2d1f0ba5d7 |
| queue-g3-experiment.json | 7290a146922a0dd5bb183e7f5b5d0d9e228a2652c5331922b1727ca70c231aa3 |
| queue-lost-ack.generated.test.mjs | d1720823ba8617ef2fb5ebaf5d7038127b492d4d86be0939e44fbe3353618418 |
| tenant-g3-experiment.json | 42aeed2f302b5294f4ea227bb51aa59d2bac8df1533ffe0ed9a0044ee932edf8 |
| tenant-read.generated.test.mjs | 866d0e5691f36c8f824711484141248723ff5f25ae87cca62679a2cde714a362 |

JSON is bounded at 2 MiB per file, regression text at 64 KiB. Invalid UTF-8, missing/oversized/nonregular files and tested redirects hold the result. No text is normalized to force a match.

Bundled regression fixture files have an extra `.txt` suffix to exclude them from ordinary test discovery. The targeted test copies them into temporary directories under the exact names and reads them as text. Do not remove the suffix in the repository or execute the recorded files.

Exit 0 with MATCHES_REVIEWED_SYNTHETIC_SNAPSHOTS means all three pairs match. Exit 2 means usage or review/input hold. A changed valid experiment also holds: this is not a general semantic validator or reproduction engine.
