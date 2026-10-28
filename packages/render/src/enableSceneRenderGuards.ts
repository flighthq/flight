import { logOnce } from '@flighthq/log/contract';
import type { LogState } from '@flighthq/log/contract';
import type { Mesh } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setSkinnedMeshBoundsGuard } from './sceneRender.ts';

/** Uninstalls the guards installed by `enableSceneRenderGuards`. */
export function disableSceneRenderGuards(): void {
  setSkinnedMeshBoundsGuard(null);
}

/**
 * Installs the caller-facing scene-render guards (opt-in, dev-only). It warns once — through
 * `@flighthq/log` — when a skinned mesh reaches frustum culling with no posed bounds, meaning the
 * deform pass `prepareScene3DRender` documents as a precondition never ran.
 *
 * That is worth a message because the failure is invisible at the point of the mistake. A GPU-skinned
 * mesh deforms in the shader, so its geometry bounds stay bind pose; without the deform pass, culling
 * tests a swung limb against the box the character occupied in bind pose and removes it from the frame.
 * The symptom is a limb or a whole character flickering out at certain angles, which reads as a
 * culling bug or a camera bug — anything except a missing call in the frame loop.
 *
 * `prepareScene3DRender` cannot simply run the deform pass itself: that would make `@flighthq/render`
 * depend on `@flighthq/skeleton3d` and bundle skinning into every rigid and 2D consumer. So the
 * precondition is real and the guard is how it becomes discoverable.
 *
 * Not importing this module costs production nothing: the message and the `@flighthq/log` dependency
 * live only here. Warnings go to the caller-owned `logState`; null installs the guard silently.
 */
export function enableSceneRenderGuards(logState: LogState | null): void {
  setSkinnedMeshBoundsGuard((mesh) => warnOnUnposedSkinnedMesh(logState, mesh));
}

function warnOnUnposedSkinnedMesh(logState: LogState | null, _mesh: Readonly<Mesh>): void {
  if (logState === null) return;
  // The render guards take no clock, so the warning is stamped at time zero.
  logOnce(
    logState,
    0,
    'render:skinned-mesh-without-deformed-bounds',
    LogLevel.Warn,
    {
      message:
        'prepareScene3DRender: a skinned mesh has no posed bounds, so culling is testing it against its ' +
        'BIND POSE box and a deformed limb can be wrongly culled. Call prepareScene3DSkinning ' +
        '(@flighthq/skeleton3d) before prepareScene3DRender each frame.',
    },
    'render',
  );
}
