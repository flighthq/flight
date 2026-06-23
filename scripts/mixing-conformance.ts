/**
 * Mixing conformance gate.
 *
 * A `-rs` package is a wasm "mixing" drop-in for the TS package it mirrors (see the Mixing section
 * of tools/agents/docs/rust/index.md): `@flighthq/surface-rs` must be substitutable for
 * `@flighthq/surface` at the package seam, so it must export the SAME public API — same function
 * names and same signatures. The two are kept in lockstep by hand; this gate enforces it so drift
 * cannot pass silently (the cross-package name-collision check only sees shared names, not drifted
 * signatures).
 *
 * Rules per `-rs` package, against its base:
 *   - every base function must be present with an identical (normalized) signature → else FAIL.
 *   - extra functions in the `-rs` package (e.g. a wasm `init*` helper) are allowed → WARN only.
 *
 * Usage: `npm run mixing:conformance` (human) / `npm run mixing:conformance:json` (machine).
 * Exit code is 1 if any `-rs` package has a missing or drifted base function.
 */
import { execSync } from 'node:child_process';

interface ApiFunction {
  name: string;
  signatures: string[];
}
interface ApiPackage {
  name: string;
  functions: ApiFunction[];
}

const asJson = process.argv.includes('--json');

const raw = execSync('tsx ./scripts/api.ts --json', { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const packages: readonly ApiPackage[] = JSON.parse(raw).packages;
const byName = new Map(packages.map((p) => [p.name, p]));

const normalizeSignatures = (fn: ApiFunction): string =>
  fn.signatures
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .sort()
    .join(' | ');

interface RsReport {
  rsPackage: string;
  basePackage: string;
  baseMissingFromBase?: boolean;
  missing: string[]; // base functions absent in the -rs package
  drifted: { name: string; base: string; rs: string }[]; // present but signature differs
  extra: string[]; // functions in -rs not in base (allowed; warned)
}

const reports: RsReport[] = [];

for (const rs of packages) {
  if (!rs.name.endsWith('-rs')) continue;
  const basePackageName = rs.name.replace(/-rs$/, '');
  const base = byName.get(basePackageName);
  const report: RsReport = {
    rsPackage: rs.name,
    basePackage: basePackageName,
    missing: [],
    drifted: [],
    extra: [],
  };
  if (!base) {
    report.baseMissingFromBase = true;
    reports.push(report);
    continue;
  }
  const baseFns = new Map(base.functions.map((f) => [f.name, f]));
  const rsFns = new Map(rs.functions.map((f) => [f.name, f]));
  for (const [name, bf] of baseFns) {
    const rf = rsFns.get(name);
    if (!rf) {
      report.missing.push(name);
    } else if (normalizeSignatures(bf) !== normalizeSignatures(rf)) {
      report.drifted.push({ name, base: normalizeSignatures(bf), rs: normalizeSignatures(rf) });
    }
  }
  for (const name of rsFns.keys()) if (!baseFns.has(name)) report.extra.push(name);
  reports.push(report);
}

const failed = reports.filter((r) => r.baseMissingFromBase || r.missing.length > 0 || r.drifted.length > 0);

if (asJson) {
  console.log(JSON.stringify({ reports, ok: failed.length === 0 }, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

if (reports.length === 0) {
  console.log('No `-rs` mixing packages found.');
  process.exit(0);
}

for (const r of reports) {
  if (r.baseMissingFromBase) {
    console.log(`✗ ${r.rsPackage}: base package ${r.basePackage} not found in the API surface.`);
    continue;
  }
  const clean = r.missing.length === 0 && r.drifted.length === 0;
  console.log(`${clean ? '✓' : '✗'} ${r.rsPackage} vs ${r.basePackage}`);
  for (const name of r.missing) console.log(`    MISSING: ${name} (in ${r.basePackage}, absent in ${r.rsPackage})`);
  for (const d of r.drifted) {
    console.log(`    DRIFT:   ${d.name}`);
    console.log(`             base: ${d.base}`);
    console.log(`             -rs:  ${d.rs}`);
  }
  for (const name of r.extra) console.log(`    note: extra in ${r.rsPackage} (allowed): ${name}`);
}

if (failed.length > 0) {
  console.log(`\n✗ mixing conformance failed for ${failed.length} package(s).`);
  process.exit(1);
}
console.log(`\n✓ ${reports.length} mixing package(s) conform to their base API.`);
