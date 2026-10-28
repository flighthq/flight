import type { LogState } from '@flighthq/log/contract';
import { logOnce } from '@flighthq/log/contract';
import type { Scene2DResourceFailureNotice } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setScene2DResourceFailureGuard } from './scene2DResourceDiagnostics.ts';

export function areScene2DResourceFailureGuardsEnabled(): boolean {
  return _enabled;
}

export function disableScene2DResourceFailureGuards(): void {
  setScene2DResourceFailureGuard(null);
  _enabled = false;
}

// Installs opt-in warnings for expected document/resource sentinels. Importers and loaders keep their
// existing null/unresolved outcomes; omitting this module sheds the messages and log dependency. Each
// warning goes to the caller-owned `logState`, stamped with `clock()` at the moment it is reported.
export function enableScene2DResourceFailureGuards(logState: LogState, clock: () => number): void {
  setScene2DResourceFailureGuard((notice) => warnOnScene2DResourceFailure(logState, clock(), notice));
  _enabled = true;
}

function warnOnScene2DResourceFailure(
  logState: LogState,
  nowMs: number,
  notice: Readonly<Scene2DResourceFailureNotice>,
): void {
  let message: string;
  if (notice.reason === 'audio-resources-unresolved') {
    message =
      'Scene2D audio resource loading left selected references unresolved — inspect result.unresolved and call explainAudioResourceReferenceResolution for each failure';
  } else if (notice.reason === 'document-fetch-failed') {
    message = 'Scene2D document acquisition returned null — verify the URL and the caller-supplied fetch seam';
  } else if (notice.reason === 'document-import-failed') {
    message = 'A matching Scene2D document importer rejected the acquired bytes — verify the payload and MIME hint';
  } else if (notice.reason === 'document-importer-missing') {
    message = 'No registered Scene2D document importer matched the bytes — register the required format importer';
  } else if (notice.reason === 'image-resources-unresolved') {
    message =
      'Scene2D image resource loading left selected references unresolved — inspect result.unresolved and call explainImageResourceReferenceResolution for each failure';
  } else {
    message =
      'Scene2D slot resolution left required slots unresolved — inspect result.unresolved and supply content for each required reference';
  }
  logOnce(
    logState,
    nowMs,
    `scene2d-resources:${notice.reason}`,
    LogLevel.Warn,
    { message, ...notice },
    'scene2d-resources',
  );
}

let _enabled = false;
