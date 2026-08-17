# Render Oracle Calibration Record

**Status: the measurement is taken, and §10 is ruled CONTINGENTLY. Two fields are still inferred rather
than read, and the §10 ruling rests entirely on them — if reading the bytes refutes them, §10 reopens.
The section that upgrades them is at the bottom.**

This file exists so nobody has to run the workflow again to know what it found. `oracle-calibrate` is a
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
| workflow | [`.github/workflows/oracle-calibrate.yml`](../.github/workflows/oracle-calibrate.yml) | in tree |
| run | `flighthq/flight` Actions run `32050363125` | reported by the user, with artifact links |
| artifacts | `calibration-host-1` (`9294568582`), `calibration-host-2` (`9294552873`) | reported by the user |
| roots compared | `runs/calibration-host-1`, `runs/calibration-host-2` (the user's extraction paths) | reported by the user |
| subject | `functional` — one root per matrix leg, `functional/<entry>/<renderer>/status.json` | workflow structure |

## What it measured

| field | value | source |
| --- | --- | --- |
| cells seen | 493 | reported from the comparer's own output |
| agreed | 493 | reported from the comparer's own output |
| disagreed | 0 | reported from the comparer's own output |
| incomplete | 0 | reported from the comparer's own output |

`493 = 493 + 0 + 0`, which is the accounting identity `formatCalibrationReport` asserts on itself. That
identity is the reason this reads 493 and not the 491 an earlier run of the same corpus reported:
existence is now read from directory presence rather than from status content, so a cell that failed in
every run reports as `incomplete` instead of vanishing from the totals.

## The two identities, and why they are the weakest line here

The comparison is only meaningful if the two roots came from **different machines** (that is what makes
them independent) in the **same declared environment** (that is what makes them comparable). Those are
opposite invariants on two different fields, and they are what the workflow stamps into every status:

| field | value | source |
| --- | --- | --- |
| host, leg 1 | expected `32050363125-1-leg-1` | **inferred from workflow structure**, not read |
| host, leg 2 | expected `32050363125-1-leg-2` | **inferred from workflow structure**, not read |
| environment | one `sha256-…` id shared by both legs | **inferred from workflow structure**, not read |

The inference is `FLIGHT_CAPTURE_HOST_ID: ${{ github.run_id }}-${{ github.run_attempt }}-leg-${{
matrix.host }}` and a single `FLIGHT_CAPTURE_ENVIRONMENT_ID` computed per leg from the runner image and
tool versions — so distinct hosts and a matching environment follow from the workflow file, which was
read, rather than from the provenance bytes, which were not. The expected values above are written as a
**prediction**: reading the artifacts either confirms them or refutes this record, and a record that
cannot be refuted is not evidence.

Say it that way anywhere this is relayed. "Two independent hosts agreed" and "the workflow assigns each
leg a distinct host id, and the comparer was not given the bytes to check it" are different sentences.

## §10 is ruled, and the ruling is contingent on the two inferred host ids

[render oracle repository](render-oracle-repository.md) §10 presented two options and said the schema
waited on the ruling. It is decided by this measurement:

- **One canonical environment is viable.** The reference set is **one column per backend**.
- **Per-environment reference sets must not be built.** The combinatorial keyed-by-GPU/driver option is
  closed, not deferred.

**What this rests on, stated where the ruling is made rather than in the section above.** Agreement is
only evidence for a canonical environment if the two roots came from DIFFERENT machines, and that is
precisely the pair of fields this record has not read. So:

- If the legs are confirmed distinct hosts, the ruling stands as written and this paragraph goes away.
- **If reading the bytes refutes the predicted host ids — if the two roots turn out to carry the same
  host, or none — this measured WITHIN-HOST determinism and §10 IS NOT DECIDED. It REOPENS.** It does
  not get quietly amended into a weaker version of the same conclusion, and the one-column-per-backend
  schema does not survive on the strength of a run that never compared two machines.

The rule this file states about itself applies hardest here: every field says how it is known, and the
§10 answer is known no more strongly than the weakest field it stands on. Anyone building
one-column-per-backend on this should read that as a ruling with a live precondition, not a closed one.

## What zero disagreement does not establish

**Stable is not correct.** Byte-identical output across hosts says the pixels REPRODUCE. Nothing here
looked at whether they are the RIGHT pixels, and a wrong pixel reproduces perfectly. Commissioning a
cell still requires that it has been independently verified as rendering correctly — this record is a
precondition being met, never a substitute for that verification.

Zero disagreement is also the EXPECTED result rather than a suspicious one: both legs run the same
container image and the same software rendering stack. It is not evidence of a fault in the comparison.

## Upgrading the two inferred fields

Whoever holds the two roots can replace the inferred identity lines with measured ones in one read —
the comparer now derives both relationships from `provenance.hostInstanceId` and
`provenance.environmentId` in the statuses it already opens:

```
npx tsx ./scripts/oracle-calibrate.ts runs/calibration-host-1 runs/calibration-host-2
```

Its `identity, as recorded by the captures themselves:` block prints one line per root and then names
the relationship — `independent-hosts` / `one-host` / `host-identity-missing` /
`mixed-hosts-within-root`, and `matching-environment` / `environment-mismatch`. Copy those values into
the table above and change their `source` to `measured`.

If they contradict the predictions, the contradiction is the finding: say so here rather than editing
the prediction away, and reopen §10 per the section above rather than restating the ruling in softer
words. Anything other than `independent-hosts` + `matching-environment` reopens it.
