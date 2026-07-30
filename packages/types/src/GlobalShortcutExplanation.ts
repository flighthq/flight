import type { Accelerator } from './Accelerator';
import type { AcceleratorParseError } from './AcceleratorParseError';

// Plain-data answer to "why did registerGlobalShortcut return false?", the pull half of the
// diagnostics convention. Recomputed on demand by explainGlobalShortcutRegistration from the same
// seams the register path reads — the parser and the active backend — and holding no reference to
// either, so an agent or test can assert on the cause without a human-readable string. Format for
// humans in a separate format* companion, never here.
export interface GlobalShortcutExplanation {
  // The raw input string as the caller spelled it, echoed back so a report reads without the caller
  // threading it alongside.
  readonly accelerator: string;
  // The canonical form the register path would have used, or null when `accelerator` did not parse.
  readonly normalized: Accelerator | null;
  // Why the parse failed, or null when it succeeded. Carries the offending token.
  readonly parseError: AcceleratorParseError | null;
  // A native backend is installed (setShortcutBackend). False means the default web backend is
  // active, whose whole registry is a sentinel — no chord can ever register in a browser.
  readonly hasNativeBackend: boolean;
  // The chord is already in the backend's registry. Always false without a native backend, since the
  // web registry is permanently empty.
  readonly registered: boolean;
  readonly reason: GlobalShortcutBlockReason;
}

// Root-cause prioritized rather than following the register path's literal check order. `unparseable`
// outranks the rest because it is a static input error that keeps the chord dead on every host;
// `no-native-backend` outranks `already-registered` because nothing about the registry matters until
// a host can hold one.
export type GlobalShortcutBlockReason = 'already-registered' | 'no-native-backend' | 'ok' | 'unparseable';
