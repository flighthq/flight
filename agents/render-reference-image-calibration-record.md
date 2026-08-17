# Render ReferenceImage Calibration Record

**Status: the measurement is taken and §10 is ruled. Every field below is now read from the captures'
own provenance. The two host ids and the environment id were written here as predictions while they were
still inferred, and reading the bytes CONFIRMED all three exactly — the contingency they carried is
discharged.**

This file exists so nobody has to run the workflow again to know what it found. `reference-image-calibrate` is a
`workflow_dispatch` experiment: it gates nothing, dispatches nowhere, and its whole output is a report
that lives in a run's logs and its artifacts, both of which expire. A measurement whose only record
expires is one that has to be re-taken to be relied on, and re-taking this one is explicitly ruled out.

The record has one rule, and it is the reason for the `source` column: **every field says how it is
known.** A number that was measured and a number that was inferred from the workflow's structure are
both useful and are not the same claim, and a record that presents them in one voice is worse than one
that has fewer fields.

## The run

| field | value | source |
| --- | --- | --- |
| workflow | [`.github/workflows/reference-image-calibrate.yml`](../.github/workflows/reference-image-calibrate.yml) | in tree |
| run | `flighthq/flight` Actions run `32050363125`, `run_attempt` 1, `workflow_dispatch` | **read** from the public Actions API |
| head sha | `e999f6c5b` — the commit the captures were taken at | **read** from the public Actions API |
| artifacts | `calibration-host-1` (`9294568582`), `calibration-host-2` (`9294552873`), delivered as files | **measured** — both extracted and read |
| subject | `functional` — one root per matrix leg, `functional/<entry>/<renderer>/status.json` | **measured** — 493 status files in each root |

★ THERE WERE THREE CAPTURE LEGS, NOT TWO, AND THE THIRD REPORTS SUCCESS HAVING DONE NOTHING. The matrix
is `host: [1, 2, 3]` and every step is conditioned on `matrix.host <= hosts`, which defaulted to 2 — so
leg 3 skipped all of its steps and the job still reports `success`. Harmless here, and a live trap for
anyone who reads job status as evidence that a leg captured something. Read the artifacts, not the
green check.

★ THE HEAD SHA IS RECORDED BECAUSE IT BOUNDS STALENESS. Captures describe the tree they ran on, so a
census reading these roots from a later checkout can legitimately report cells as stale. Measured on
2026-08-17 at `f92daaf27`: `stale 0 of 493 compared` — the scenes had not moved, so the caveat turned
out to be moot for this pair rather than merely expected.

## What it measured

| field | value | source |
| --- | --- | --- |
| cells seen | 493 | **measured** — comparer run over both roots, 2026-08-17 |
| agreed | 493 | **measured** |
| disagreed | 0 | **measured** |
| incomplete | 0 | **measured** |

`493 = 493 + 0 + 0`, which is the accounting identity `formatCalibrationReport` asserts on itself. That
identity is the reason this reads 493 and not the 491 an earlier run of the same corpus reported:
existence is now read from directory presence rather than from status content, so a cell that failed in
every run reports as `incomplete` instead of vanishing from the totals.

## The two identities — predicted, then read

The comparison is only meaningful if the two roots came from **different machines** (that is what makes
them independent) in the **same declared environment** (that is what makes them comparable). Those are
opposite invariants on two different fields, and they are what the workflow stamps into every status:

| field | value | source | predicted? |
| --- | --- | --- | --- |
| host, leg 1 | `32050363125-1-leg-1` | **measured** from `provenance.hostInstanceId` | predicted, confirmed |
| host, leg 2 | `32050363125-1-leg-2` | **measured** from `provenance.hostInstanceId` | predicted, confirmed |
| environment | `sha256-bd06ebbc664c15c1085ac833ddf941483fabb15f36d127b9a47cf4db02eb65d7`, identical in both roots | **measured** from `provenance.environmentId` | predicted as "one shared id", confirmed |
| relationship | `independent-hosts` + `matching-environment` | **derived** from the two fields above |  |

Both roots carry 493 status files. The derivation is the pair of opposite invariants: `hostInstanceId`
must DIFFER (the runs are independent) and `environmentId` must MATCH (the runs are comparable).

★ THE PREDICTION IS LEFT STANDING RATHER THAN TIDIED AWAY. While these were inferred from
`FLIGHT_CAPTURE_HOST_ID: ${{ github.run_id }}-${{ github.run_attempt }}-leg-${{ matrix.host }}`, this
record wrote the expected values down so that reading the bytes could refute it. It did not — the values
match exactly. Deleting the prediction now would erase the only evidence that this record was falsifiable
before it was confirmed, which is the property that made it worth trusting.

## §10 is ruled, and the precondition it rested on is now discharged

[render oracle repository](render-reference-image-repository.md) §10 presented two options and said the schema
waited on the ruling. It is decided by this measurement:

- **One canonical environment is viable.** The reference set is **one column per backend**.
- **Per-environment reference sets must not be built.** The combinatorial keyed-by-GPU/driver option is
  closed, not deferred.

**What this rests on, and why it is now settled.** Agreement is only evidence for a canonical
environment if the two roots came from DIFFERENT machines. That was the one unread field, so this section
carried a live precondition: had the bytes shown one host or none, the run would have measured
within-host determinism and §10 would have REOPENED rather than been amended.

The bytes were read on 2026-08-17: `independent-hosts` under a `matching-environment`. The precondition
is discharged and the ruling stands on measurement, not on inference from the workflow file.

The one bar that has NOT moved is below: stable is not correct.

## The cells are named, in `scripts/reference-image-calibration.json`

The counts above are a summary; the record of record is the generated
[`scripts/reference-image-calibration.json`](../scripts/reference-image-calibration.json), which lists all 493 agreed cells
BY NAME alongside the identities they were measured under. Regenerate it with
`npm run reference-image:calibrate -- <rootA> <rootB> --record scripts/reference-image-calibration.json`.

★ NOTHING MAY JOIN THIS TO THE COVERAGE MANIFEST BY COUNT. "493 agreed" and "493 live cells" are equal
numbers, and equality of counts is not identity of sets — a corpus can gain and lose cells and still
total 493, and a count-based join would grant a cell determinism it was never measured for. Verified by
NAME on 2026-08-17 at `f92daaf27`: the two sets are identical, 0 cells on either side only. That check
was possible only because the list exists; it does not retroactively license the count argument.

★ ONE COMPARISON PER CELL, NOT REPEATED SAMPLING. Each cell was captured once per host and the two
hashes matched. That is strong evidence — genuine nondeterminism would have to correlate perfectly
across two machines to hide — but it is a single sample per cell, and it must be described that way.

## What zero disagreement does not establish

**Stable is not correct.** Byte-identical output across hosts says the pixels REPRODUCE. Nothing here
looked at whether they are the RIGHT pixels, and a wrong pixel reproduces perfectly. Commissioning a
cell still requires that it has been independently verified as rendering correctly — this record is a
precondition being met, never a substitute for that verification.

Zero disagreement is also the EXPECTED result rather than a suspicious one: both legs run the same
container image and the same software rendering stack. It is not evidence of a fault in the comparison.

## Re-deriving this, and what would reopen it

Nothing here needs re-running; this section is how a reader checks the record rather than trusting it.
Given the two artifact roots, the comparer derives both relationships from `provenance.hostInstanceId`
and `provenance.environmentId` in the statuses it already opens:

```
npm run reference-image:calibrate -- runs/calibration-host-1 runs/calibration-host-2
```

Each root is the directory that CONTAINS `functional/` — an extracted `calibration-host-<n>` artifact,
not the `functional/` inside it (which compares nothing and says so) and not their shared parent (which
is one root given twice, and is refused).

Its `identity, as recorded by the captures themselves:` block prints one line per root and then names
the relationship. Anything other than `independent-hosts` + `matching-environment` from these two roots
would contradict this record — in which case the contradiction is the finding, to be written here rather
than edited away, and §10 reopens rather than being restated in softer words.
