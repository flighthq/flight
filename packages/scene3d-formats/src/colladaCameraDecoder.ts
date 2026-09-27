import { createOrthographicProjection, createPerspectiveProjection } from '@flighthq/camera/contract';
import { createTransform3D, decomposeMatrix4ToTransform3D } from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { DEG_TO_RAD } from '@flighthq/math/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';
import type {
  ColladaCameraDefinition,
  ColladaDeferredCameraBinding,
  ColladaElementDecoder,
  ImportDiagnostic,
  Scene3DDocument,
  Scene3DDocumentCamera,
  XmlElement,
} from '@flighthq/types/contract';

import { buildColladaNodeWorldMatrices } from './colladaSceneShared.ts';
import { colladaChild, colladaChildren, colladaDescendants, colladaIdOf, colladaText } from './colladaXml.ts';

function decodeColladaCameraDefinitions(
  root: XmlElement,
  diagnostics: ImportDiagnostic[],
): Map<string, ColladaCameraDefinition | null> {
  const definitions = new Map<string, ColladaCameraDefinition | null>();
  for (const library of colladaDescendants(root, 'library_cameras')) {
    for (const camera of colladaChildren(library, 'camera')) {
      const id = colladaIdOf(camera);
      if (id === null) continue;
      const technique = colladaChild(colladaChild(camera, 'optics'), 'technique_common');
      const perspective = colladaChild(technique, 'perspective');
      const orthographic = colladaChild(technique, 'orthographic');
      const name = camera.attributes.name;

      if (perspective !== undefined) {
        const missing: string[] = [];
        const fovDegrees = colladaCameraNumber(perspective, 'yfov', COLLADA_CAMERA_DEFAULT_FOV_DEGREES, missing);
        const aspect = colladaCameraNumber(perspective, 'aspect_ratio', COLLADA_CAMERA_DEFAULT_ASPECT, undefined);
        const near = colladaCameraNumber(perspective, 'znear', COLLADA_CAMERA_DEFAULT_NEAR, missing);
        const far = colladaCameraNumber(perspective, 'zfar', COLLADA_CAMERA_DEFAULT_FAR, missing);
        if (
          !Number.isFinite(fovDegrees) ||
          !(fovDegrees > 0) ||
          fovDegrees >= 180 ||
          !Number.isFinite(aspect) ||
          !(aspect > 0) ||
          !Number.isFinite(near) ||
          !(near > 0) ||
          !Number.isFinite(far) ||
          !(far > near)
        ) {
          reportImportDiagnostic(
            diagnostics,
            ImportDiagnosticSeverity.Drop,
            'collada.camera-invalid-perspective',
            'parseCollada',
            { camera: id },
          );
          definitions.set(id, null);
          continue;
        }
        reportIncompleteColladaCamera(diagnostics, id, 'perspective', missing);
        definitions.set(id, {
          aspect,
          far,
          fovY: fovDegrees * DEG_TO_RAD,
          kind: 'perspective',
          ...(name !== undefined && name.length > 0 ? { name } : {}),
          near,
        });
        continue;
      }

      if (orthographic !== undefined) {
        const missing: string[] = [];
        const halfWidth = colladaCameraNumber(orthographic, 'xmag', COLLADA_CAMERA_DEFAULT_ORTHO_HALF_EXTENT, missing);
        const halfHeight = colladaCameraNumber(orthographic, 'ymag', COLLADA_CAMERA_DEFAULT_ORTHO_HALF_EXTENT, missing);
        const near = colladaCameraNumber(orthographic, 'znear', COLLADA_CAMERA_DEFAULT_NEAR, missing);
        const far = colladaCameraNumber(orthographic, 'zfar', COLLADA_CAMERA_DEFAULT_FAR, missing);
        if (
          !Number.isFinite(halfWidth) ||
          !(halfWidth > 0) ||
          !Number.isFinite(halfHeight) ||
          !(halfHeight > 0) ||
          !Number.isFinite(near) ||
          !(near >= 0) ||
          !Number.isFinite(far) ||
          !(far > near)
        ) {
          reportImportDiagnostic(
            diagnostics,
            ImportDiagnosticSeverity.Drop,
            'collada.camera-invalid-orthographic',
            'parseCollada',
            { camera: id },
          );
          definitions.set(id, null);
          continue;
        }
        reportIncompleteColladaCamera(diagnostics, id, 'orthographic', missing);
        definitions.set(id, {
          far,
          halfHeight,
          halfWidth,
          kind: 'orthographic',
          ...(name !== undefined && name.length > 0 ? { name } : {}),
          near,
        });
        continue;
      }

      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'collada.camera-missing-descriptor',
        'parseCollada',
        { camera: id },
      );
      definitions.set(id, null);
    }
  }
  return definitions;
}

function colladaCameraNumber(
  descriptor: XmlElement,
  field: string,
  fallback: number,
  missing: string[] | undefined,
): number {
  const source = colladaText(descriptor, field);
  if (source === null) {
    missing?.push(field);
    return fallback;
  }
  return Number(source);
}

function reportIncompleteColladaCamera(
  diagnostics: ImportDiagnostic[],
  camera: string,
  projection: 'orthographic' | 'perspective',
  missing: readonly string[],
): void {
  if (missing.length === 0) return;
  reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Recover, 'collada.camera-incomplete', 'parseCollada', {
    camera,
    fields: missing.join(','),
    projection,
  });
}

// COLLADA requires the projection shape and clip distances, but damaged/exporter-minimal files often
// omit one. Recovery uses a neutral Flight camera: square 60° perspective (or unit orthographic
// half-extents) across a 0.1..1000 span.
// An omitted perspective aspect_ratio is valid and stays the SDK-wide authored fallback of 1.
const COLLADA_CAMERA_DEFAULT_ASPECT = 1;

const COLLADA_CAMERA_DEFAULT_FAR = 1000;

const COLLADA_CAMERA_DEFAULT_FOV_DEGREES = 60;

const COLLADA_CAMERA_DEFAULT_NEAR = 0.1;

const COLLADA_CAMERA_DEFAULT_ORTHO_HALF_EXTENT = 1;

function resolveColladaCameras(
  document: Scene3DDocument,
  deferred: readonly ColladaDeferredCameraBinding[],
  definitions: ReadonlyMap<string, ColladaCameraDefinition | null>,
  rootNodeIndices: readonly number[],
  diagnostics: ImportDiagnostic[],
): void {
  const worldMatrices = buildColladaNodeWorldMatrices(document.nodes, rootNodeIndices);
  for (const binding of deferred) {
    const definition = definitions.get(binding.cameraId);
    if (definition === undefined) {
      reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'collada.missing-reference', 'parseCollada', {
        element: 'instance_camera',
        url: `#${binding.cameraId}`,
      });
      continue;
    }
    if (definition === null) continue;
    const worldMatrix = worldMatrices[binding.nodeIndex];
    if (worldMatrix === undefined) continue;
    const transform = createTransform3D();
    decomposeMatrix4ToTransform3D(transform, worldMatrix);
    let camera: Scene3DDocumentCamera;
    if (definition.kind === 'perspective') {
      camera = {
        far: definition.far,
        ...(definition.name !== undefined ? { name: definition.name } : {}),
        near: definition.near,
        node: binding.nodeIndex,
        projection: createPerspectiveProjection({ aspect: definition.aspect, fovY: definition.fovY }),
        transform,
      };
    } else {
      camera = {
        far: definition.far,
        ...(definition.name !== undefined ? { name: definition.name } : {}),
        near: definition.near,
        node: binding.nodeIndex,
        projection: createOrthographicProjection({
          halfHeight: definition.halfHeight,
          halfWidth: definition.halfWidth,
        }),
        transform,
      };
    }
    document.cameras.push(camera);
  }
}

export const colladaCameraDecoder: ColladaElementDecoder = {
  // Binding a camera needs the node that instantiated it, so this half waits for the walk. It runs first among the
  // build phases because that is the order the single function ran: nothing else reads what it writes.
  build(context) {
    resolveColladaCameras(
      context.parse.document,
      context.deferredCameras,
      context.parse.cameraDefinitions,
      context.rootNodeIndices,
      context.parse.diagnostics,
    );
  },
  buildPhase: 10,
  decode(context) {
    for (const [id, definition] of decodeColladaCameraDefinitions(context.root, context.diagnostics)) {
      context.cameraDefinitions.set(id, definition);
    }
  },
  elements: ['camera'],
  features: ['Camera', 'Camera.Orthographic', 'Camera.Perspective'],
};
