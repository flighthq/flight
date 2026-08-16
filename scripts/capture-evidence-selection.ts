import type { CaptureBaselineEvidenceKind } from '../packages/tool-capture/src/captureBaselineCoverageManifest.js';

export interface CaptureEvidenceTargetSelection {
  covered: Record<string, CaptureBaselineEvidenceKind[]>;
  determined: string[];
}

export function readRepeatedCliOption(argv: readonly string[], name: string): string[] {
  const values: string[] = [];
  const flag = `--${name}`;
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i]!;
    if (argument === flag) {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw new Error(`${flag} requires a value`);
      values.push(value);
    } else if (argument.startsWith(`${flag}=`)) {
      const value = argument.slice(flag.length + 1);
      if (value === '') throw new Error(`${flag} requires a value`);
      values.push(value);
    }
  }
  return values;
}

// Selects only the identities the caller named. In particular, a scene name that prefixes a sibling
// cannot absorb that sibling's evidence profile during an acceptance write.
export function selectCaptureEvidenceTargets(
  targets: readonly string[],
  observed: Readonly<Record<string, Readonly<Record<string, readonly CaptureBaselineEvidenceKind[]>>>>,
  pinned: Readonly<Record<string, Readonly<Record<string, readonly CaptureBaselineEvidenceKind[]>>>>,
): Record<string, CaptureEvidenceTargetSelection> {
  const selected: Record<string, CaptureEvidenceTargetSelection> = {};
  for (const target of [...new Set(targets)]) {
    const slash = target.indexOf('/');
    const subject = slash === -1 ? '' : target.slice(0, slash);
    const identity = slash === -1 ? '' : target.slice(slash + 1);
    if (subject === '' || identity === '' || !(subject in observed)) {
      throw new Error(`Unknown capture evidence target: ${target}`);
    }
    const observedKinds = observed[subject]?.[identity];
    const pinnedKinds = pinned[subject]?.[identity];
    if (observedKinds === undefined && pinnedKinds === undefined) {
      throw new Error(`Unknown capture evidence target: ${target}`);
    }
    const selection = (selected[subject] ??= { covered: {}, determined: [] });
    selection.determined.push(identity);
    if (observedKinds !== undefined) selection.covered[identity] = [...observedKinds];
  }
  return selected;
}
