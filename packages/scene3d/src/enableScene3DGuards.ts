import { logOnce } from '@flighthq/log/contract';
import type { Camera3D } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setBillboardCameraBasisGuard } from './billboardCamera';

export function areScene3DGuardsEnabled(): boolean {
  return scene3DGuardsEnabled;
}

export function disableScene3DGuards(): void {
  setBillboardCameraBasisGuard(null);
  scene3DGuardsEnabled = false;
}

// Installs opt-in diagnostics for scene operations that decline rather than compute a result. The core
// modules stay message-free, so an application that omits this one sheds both the text and
// @flighthq/log.
export function enableScene3DGuards(): void {
  setBillboardCameraBasisGuard(warnOnDegenerateBillboardCameraBasis);
  scene3DGuardsEnabled = true;
}

// Declining leaves the previous basis in place, so the billboards simply stop tracking the camera —
// they do not disappear and nothing throws. That is the whole reason this needs a report: the symptom
// is orientation quietly going stale, which reads as an animation bug rather than a camera one.
function warnOnDegenerateBillboardCameraBasis(camera: Readonly<Camera3D>): void {
  logOnce('scene3d:degenerate-billboard-camera-basis', LogLevel.Warn, () => ({
    message:
      'orientBillboardToCamera: the camera view matrix has no inverse, so the camera basis could not be derived and the billboards were left as they were. A view set from setCamera3DViewMatrix4FromMatrix4 is the usual cause — that setter copies an arbitrary matrix without validating it, while setCamera3DViewMatrix4FromLookAt cannot produce a singular view.',
    view: Array.from(camera.view.m),
  }));
}

let scene3DGuardsEnabled = false;
