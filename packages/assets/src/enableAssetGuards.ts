import { logOnce } from '@flighthq/log/contract';
import type { AssetLibrary, AssetLoadExplanation } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setAssetAcquireGuard } from './assetLibrary';

export function areAssetGuardsEnabled(library: Readonly<AssetLibrary>): boolean {
  return library.runtime.acquireGuard === warnOnAssetAcquireFailure;
}

export function disableAssetGuards(library: Readonly<AssetLibrary>): void {
  setAssetAcquireGuard(library, null);
}

// Installs opt-in caller-misuse warnings for acquireAsset. Core retains terse rejected promises and a
// null hook by default; omitting this module sheds the messages and @flighthq/log dependency.
export function enableAssetGuards(library: Readonly<AssetLibrary>): void {
  setAssetAcquireGuard(library, warnOnAssetAcquireFailure);
}

function warnOnAssetAcquireFailure(
  _library: Readonly<AssetLibrary>,
  explanation: Readonly<AssetLoadExplanation>,
): void {
  if (explanation.status !== 'missing-descriptor' && explanation.status !== 'missing-loader') return;
  const message =
    explanation.status === 'missing-descriptor'
      ? `acquireAsset: no descriptor is registered for id "${explanation.id}"; call registerAssetDescriptor or registerAssetManifest before acquiring it.`
      : `acquireAsset: no loader is registered for type "${explanation.type}"; call registerAssetLoader before acquiring "${explanation.id}".`;
  logOnce(
    `assets:acquire:${explanation.status}:${explanation.type ?? ''}:${explanation.id}`,
    LogLevel.Warn,
    { ...explanation, message },
    'assets',
  );
}
