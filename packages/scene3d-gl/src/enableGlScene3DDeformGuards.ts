import { logOnce } from '@flighthq/log';
import { getMeshGeometryMorphBindPose, hasMeshGeometrySkin } from '@flighthq/mesh';
import { getNodeRuntime } from '@flighthq/node';
import type { GlRenderState, Mesh, MeshRuntime, NodeAny } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { getGlScene3DRuntime } from './glScene3DRuntime';

// Returns whether the scene deform guard is installed on `state` (enableGlScene3DDeformGuards).
export function areGlScene3DDeformGuardsEnabled(state: GlRenderState): boolean {
  return getGlScene3DRuntime(state).deformGuard != null;
}

// Installs the shakeable scene deform guard on `state`: drawGlScene3D calls it once per visible mesh, and
// it warns when a morphed or GPU-skinned mesh reaches the draw without its deform pass having run —
// prepareScene3DMorph (@flighthq/scene3d) for a morph, prepareScene3DSkinning (@flighthq/skeleton3d) for a
// skin. Both are silent-black footguns: an unblended morph draws the bind-pose mesh, and an unposed
// skin draws with a zero joint palette that collapses the mesh to the origin. drawGlScene3D reaches this
// guard only through its nullable scene-runtime slot; not calling this — the production default — costs
// the draw nothing, since the messages and the @flighthq/log dependency live only in this
// separately-imported module. Idempotent.
export function enableGlScene3DDeformGuards(state: GlRenderState): void {
  getGlScene3DRuntime(state).deformGuard = warnGlScene3DMeshDrawnUndeformed;
}

// A morphed mesh whose base pose was never captured has never been blended: prepareScene3DMorph did not
// run, so the draw would upload the bind pose. A GPU-skinned mesh whose node runtime carries no posed
// bounds slot was never readied by prepareScene3DSkinning, so its joint palette is uncomputed (a zero
// palette collapses every skinned vertex to the origin). One warning per key, so a per-frame draw loop
// cannot spam. Keyed by neither mesh nor frame — the message names the fix, and once it is fixed it
// never fires again.
function warnGlScene3DMeshDrawnUndeformed(mesh: Mesh): void {
  if (mesh.morph != null && getMeshGeometryMorphBindPose(mesh.geometry) === null) {
    logOnce(
      'scene-gl:morph-drawn-without-prepare',
      LogLevel.Warn,
      {
        message:
          'drawGlScene3D: a morphed mesh reached the draw un-blended (it will draw the bind pose) — call prepareScene3DMorph(scene) before prepareScene3DRender.',
      },
      'scene-gl',
    );
  }

  if (mesh.skin != null && hasMeshGeometrySkin(mesh.geometry)) {
    const runtime = getNodeRuntime(mesh as NodeAny) as MeshRuntime;
    if (runtime.deformedLocalBounds == null) {
      logOnce(
        'scene-gl:skin-drawn-without-prepare',
        LogLevel.Warn,
        {
          message:
            'drawGlScene3D: a GPU-skinned mesh reached the draw un-posed (its joint palette is uncomputed, collapsing it to the origin) — call prepareScene3DSkinning(scene) before prepareScene3DRender.',
        },
        'scene-gl',
      );
    }
  }
}
