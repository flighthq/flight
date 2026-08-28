import { execFileSync } from 'node:child_process';

// The provenance header every derived gate prints above its count.
//
// A count without its provenance cannot be compared with any other count, and the disagreements that
// follow get argued about as if they were about the code. Four fields settle it — the exact command, the
// tree it ran against, what was scanned, and how it was counted — and printing them beside the number
// costs four lines and removes the whole class of argument. See `agents/commands.md`, "Reporting a count".
//
// The header is deliberately NOT a substitute for each gate's own predicate: `scope` and `counting` are
// supplied by the gate in its own words, because a shared helper that invented them would describe four
// different populations identically. What is shared is the SHAPE — which fields exist and that all four
// are present — not the content.

export interface GateProvenance {
  // The canonical way to run this gate, with the implementing entrypoint, so a reader can reproduce it.
  readonly command: string;
  // How the number was arrived at: the predicate counted, and what a unit is.
  readonly counting: string;
  // What was scanned and what was deliberately left out.
  readonly scope: string;
}

export interface GateTreeState {
  // Full commit SHA the gate measured, or null when it could not be determined.
  readonly commit: string | null;
  // True when the working tree had uncommitted changes — a count from a dirty tree describes no commit.
  readonly dirty: boolean;
}

// The limit every STRUCTURAL gate shares, owned here so the gates state it identically rather than
// similarly. Both the operation seam and the lifecycle census read a declaration: one counts migration,
// the other counts hook presence. Neither runs the code they describe, so neither can say whether the
// tests around it are deep or whether the behavior was ever audited — and both numbers get read as if
// they could. Stating the limit in the output is cheaper than correcting the reading afterwards.
export const GATE_STRUCTURAL_LIMIT = 'measures neither test depth nor audited behavior';

export const GATE_PROVENANCE_FIELDS: readonly string[] = ['gate', 'tree', 'scope', 'counting'];

// Renders the four-field header. Pure: the tree state is passed in, so a test can fabricate clean and
// dirty without touching a repository.
export function formatGateProvenance(provenance: Readonly<GateProvenance>, tree: Readonly<GateTreeState>): string {
  const commit = tree.commit === null ? 'unknown-commit' : tree.commit;
  // ★ The dirty marker is part of the identity, not a footnote. A number measured on a dirty tree belongs
  // to no commit anyone else can check out, so reporting the SHA alone would name a tree that was never
  // the one measured.
  const state = tree.dirty ? 'dirty' : 'clean';
  return [
    `gate      ${provenance.command}`,
    `tree      ${commit} (${state})`,
    `scope     ${provenance.scope}`,
    `counting  ${provenance.counting}`,
  ].join('\n');
}

// Reads the commit and dirty flag from the repository. Impure by design and kept out of the formatter so
// the formatter stays testable; returns a null commit rather than throwing when git is unavailable, since
// a gate must still report its count outside a checkout.
export function readGateTreeState(cwd: string): GateTreeState {
  return { commit: readCommit(cwd), dirty: readDirty(cwd) };
}

function readCommit(cwd: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf-8' }).trim() || null;
  } catch {
    return null;
  }
}

function readDirty(cwd: string): boolean {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8' }).trim().length > 0;
  } catch {
    // Unknown is reported as dirty: claiming a clean tree we could not verify is the failure that makes a
    // count look reproducible when it is not.
    return true;
  }
}
