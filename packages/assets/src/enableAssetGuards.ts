import type { LogState } from '@flighthq/log/contract';
import { logOnce } from '@flighthq/log/contract';
import type { AssetAcquireGuard, AssetLibrary, AssetLoadExplanation } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setAssetAcquireGuard } from './assetLibrary.ts';

export function areAssetGuardsEnabled(library: Readonly<AssetLibrary>): boolean {
  const installed = _warningGuards.get(library);
  return installed !== undefined && library.runtime.acquireGuard === installed;
}

export function disableAssetGuards(library: Readonly<AssetLibrary>): void {
  setAssetAcquireGuard(library, null);
}

// Installs opt-in caller-misuse warnings for acquireAsset. Core retains terse rejected promises and a
// null hook by default; omitting this module sheds the messages and @flighthq/log dependency. Warnings go
// to the caller-owned `logState`, stamped with `clock()` read at the moment of misuse.
export function enableAssetGuards(library: Readonly<AssetLibrary>, logState: LogState, clock: () => number): void {
  const guard: AssetAcquireGuard = (_library, explanation) => warnOnAssetAcquireFailure(logState, clock, explanation);
  _warningGuards.set(library, guard);
  setAssetAcquireGuard(library, guard);
}

// The guard each library had installed by enableAssetGuards, so areAssetGuardsEnabled can tell it apart
// from a caller's own acquire hook. Keyed by the library, so it is collected with it.
const _warningGuards = new WeakMap<Readonly<AssetLibrary>, AssetAcquireGuard>();

function warnOnAssetAcquireFailure(
  logState: LogState,
  clock: () => number,
  explanation: Readonly<AssetLoadExplanation>,
): void {
  if (explanation.status !== 'missing-descriptor' && explanation.status !== 'missing-loader') return;
  const message =
    explanation.status === 'missing-descriptor'
      ? `acquireAsset: no descriptor is registered for id "${explanation.id}"; call registerAssetDescriptor or registerAssetManifest before acquiring it.`
      : `acquireAsset: no loader is registered for type "${explanation.type}"; call registerAssetLoader before acquiring "${explanation.id}".`;
  logOnce(
    logState,
    clock(),
    `assets:acquire:${explanation.status}:${explanation.type ?? ''}:${explanation.id}`,
    LogLevel.Warn,
    { ...explanation, message },
    'assets',
  );
}
