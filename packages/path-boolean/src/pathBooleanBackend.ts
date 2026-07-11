import type { PathBooleanBackend } from '@flighthq/types';

import { createMartinezPathBooleanBackend } from './martinezKernel';

// Builds a fresh instance of the default boolean kernel — the from-scratch Martinez–Rueda–Feito
// sweep-line. Callers that want the built-in behavior without touching the shared module-level backend
// (for example to run it alongside a swapped-in native kernel) construct one here.
export function createDefaultPathBooleanBackend(): PathBooleanBackend {
  return createMartinezPathBooleanBackend();
}

// Returns the active boolean kernel, lazily installing the default Martinez kernel on first use. There
// is always a backend; the operation functions dispatch through this.
export function getPathBooleanBackend(): PathBooleanBackend {
  if (_backend === null) _backend = createDefaultPathBooleanBackend();
  return _backend;
}

// Installs a boolean kernel for all subsequent operations, or clears back to the lazy default when
// passed null. A heavier or faster kernel (a faithful Clipper port, a wasm drop-in) swaps in here
// without changing the operation API.
export function setPathBooleanBackend(backend: PathBooleanBackend | null): void {
  _backend = backend;
}

// The active kernel, or null until the first getPathBooleanBackend call installs the default. Held at
// module scope but never populated at import time, so importing this package has no side effects.
let _backend: PathBooleanBackend | null = null;
