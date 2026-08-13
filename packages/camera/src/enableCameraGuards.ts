import { logOnce } from '@flighthq/log/contract';
import type { Camera2D, Camera3D } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setCamera3DViewGuard } from './camera';
import { explainCamera3DView } from './explainCamera3DView';
import { setCamera2DVisibleBoundsGuard } from './visibleBounds';

export function areCameraGuardsEnabled(): boolean {
  return cameraGuardsEnabled;
}

export function disableCameraGuards(): void {
  setCamera3DViewGuard(null);
  setCamera2DVisibleBoundsGuard(null);
  cameraGuardsEnabled = false;
}

// Installs opt-in diagnostics for camera inputs that leave a computation with no answer. The core
// modules stay message-free, so an application that omits this one sheds both the text and
// @flighthq/log.
export function enableCameraGuards(): void {
  setCamera3DViewGuard(warnOnNonOrthonormalCamera3DView);
  setCamera2DVisibleBoundsGuard(warnOnDegenerateCamera2DVisibleBounds);
  cameraGuardsEnabled = true;
}

// The unbounded rectangle is a deliberate fail-toward-drawing, not a silent success: nothing is culled,
// so the frame is correct but pays for every object. That is a performance cliff with no visible
// symptom, which is exactly the case a guard exists to name.
function warnOnDegenerateCamera2DVisibleBounds(camera: Readonly<Camera2D>): void {
  logOnce(`camera:degenerate-visible-bounds:${camera.zoom}`, LogLevel.Warn, {
    message:
      'getCamera2DVisibleBounds: the view matrix has no inverse, so the visible rectangle is unbounded and nothing is culled — a zoom of 0 is the usual cause; set a non-zero zoom.',
    zoom: camera.zoom,
  });
}

// Names the CAUSE, not any one consequence: several consumers rely on the orthonormality precondition
// and warning once per consumer would be noise. A caller that wants to connect this to a specific wrong
// answer has `explainCamera3DView` for the numbers.
function warnOnNonOrthonormalCamera3DView(camera: Readonly<Camera3D>): void {
  const explanation = explainCamera3DView(camera);
  if (explanation.isOrthonormal) return;
  logOnce('camera:non-orthonormal-view', LogLevel.Warn, {
    message:
      'setCamera3DViewMatrix4FromMatrix4: the view matrix is not orthonormal, which its consumers rely on — a scaled matrix is the usual cause. Reflections are fine; scale is not. Call explainCamera3DView(camera) for the measured deviations.',
    scaleDeviation: explanation.scaleDeviation,
    shearDeviation: explanation.shearDeviation,
  });
}

let cameraGuardsEnabled = false;
