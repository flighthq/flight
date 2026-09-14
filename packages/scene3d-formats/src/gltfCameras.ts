import { createOrthographicProjection, createPerspectiveProjection } from '@flighthq/camera/contract';
import type { GltfCoreFeatureContext, GltfCoreFeatureHandler, Scene3DDocumentCamera } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

// Imports the optional top-level `cameras` section after the bedrock node hierarchy exists.
export const GltfCamerasCoreFeatureHandler: GltfCoreFeatureHandler = {
  apply(context) {
    context.document.cameras.push(...buildGltfCameras(context));
  },
  kind: 'cameras',
};

// Builds one placed document camera per glTF node that references a camera definition. Clip distances
// remain explicit document facts; an omitted perspective zfar is retained as the glTF infinite-far model.
// The projection's stored aspect is only the authored fallback—the draw-time viewport remains authoritative.
function buildGltfCameras(context: Readonly<GltfCoreFeatureContext>): Scene3DDocumentCamera[] {
  const cameras: Scene3DDocumentCamera[] = [];
  const definitions = context.source.cameras ?? [];
  const nodes = context.source.nodes ?? [];
  for (let node = 0; node < nodes.length; node++) {
    const cameraIndex = nodes[node].camera;
    if (cameraIndex === undefined) continue;
    const definition = definitions[cameraIndex];
    if (definition === undefined) {
      context.reportDiagnostic(ImportDiagnosticSeverity.Drop, 'gltf.camera-missing', {
        firstCamera: cameraIndex,
        firstNode: node,
      });
      continue;
    }
    if (definition.type === 'perspective' && definition.perspective !== undefined) {
      const perspective = definition.perspective;
      if (
        !(perspective.yfov > 0) ||
        perspective.yfov >= Math.PI ||
        !(perspective.znear > 0) ||
        (perspective.zfar !== undefined && !(perspective.zfar > perspective.znear)) ||
        (perspective.aspectRatio !== undefined && !(perspective.aspectRatio > 0))
      ) {
        context.reportDiagnostic(ImportDiagnosticSeverity.Drop, 'gltf.camera-invalid-perspective', {
          firstCamera: cameraIndex,
        });
        continue;
      }
      cameras.push({
        far: perspective.zfar ?? Number.POSITIVE_INFINITY,
        name: definition.name,
        near: perspective.znear,
        node: context.nodeIndices[node],
        projection: createPerspectiveProjection({ aspect: perspective.aspectRatio ?? 1, fovY: perspective.yfov }),
        transform: context.buildNodeTransform(node),
      });
      continue;
    }
    if (definition.type === 'orthographic' && definition.orthographic !== undefined) {
      const orthographic = definition.orthographic;
      if (
        !(orthographic.xmag > 0) ||
        !(orthographic.ymag > 0) ||
        !(orthographic.znear >= 0) ||
        !(orthographic.zfar > orthographic.znear)
      ) {
        context.reportDiagnostic(ImportDiagnosticSeverity.Drop, 'gltf.camera-invalid-orthographic', {
          firstCamera: cameraIndex,
        });
        continue;
      }
      cameras.push({
        far: orthographic.zfar,
        name: definition.name,
        near: orthographic.znear,
        node: context.nodeIndices[node],
        projection: createOrthographicProjection({ halfHeight: orthographic.ymag, halfWidth: orthographic.xmag }),
        transform: context.buildNodeTransform(node),
      });
      continue;
    }
    context.reportDiagnostic(ImportDiagnosticSeverity.Drop, 'gltf.camera-missing-descriptor', {
      firstCamera: cameraIndex,
      firstType: definition.type,
    });
  }
  return cameras;
}
