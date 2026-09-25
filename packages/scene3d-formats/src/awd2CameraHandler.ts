import { createOrthographicProjection, createPerspectiveProjection } from '@flighthq/camera/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { DEG_TO_RAD } from '@flighthq/math/contract';
import type {
  Awd2BlockHandler,
  Awd2ParsedCamera,
  ImportDiagnostic,
  Projection,
  Scene3DDocument,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import {
  awdTransformToTransform3D,
  readAwdProperties,
  readAwdPropertyFloat32,
  readAwdString,
  readAwdTransform,
} from './awd2Reader.ts';
import {
  AWD2_BLOCK_CAMERA,
  AWD2_CAMERA_PROJECTION_ORTHOGRAPHIC,
  AWD2_CAMERA_PROJECTION_ORTHOGRAPHIC_OFFCENTER,
  AWD2_CAMERA_PROJECTION_PERSPECTIVE,
  AWD2_CAMERA_PROP_FOV,
  AWD2_CAMERA_PROP_ORTHO_BOTTOM,
  AWD2_CAMERA_PROP_ORTHO_LEFT,
  AWD2_CAMERA_PROP_ORTHO_RIGHT,
  AWD2_CAMERA_PROP_ORTHO_TOP,
} from './awd2Schema.ts';

// Cameras. Like lights, a camera fills the document's PLACEMENT TABLE rather than the node graph — it is
// not a scene member in Flight — so this handler builds after the node passes, when a camera parented to
// a container can resolve to that container's node index.

export const awd2CameraHandler: Awd2BlockHandler = {
  blockTypes: [AWD2_BLOCK_CAMERA],
  parse(state, block) {
    const camera = parseCameraBlock(
      block.view,
      block.source,
      block.dataStart,
      block.dataEnd,
      block.matrixWide,
      state.diagnostics,
    );
    if (camera !== null) state.cameras.set(block.blockId, camera);
  },
  build(state) {
    for (const camera of state.cameras.values()) {
      buildAwdDocumentCamera(camera, state.nodeIndexForBlock.get(camera.parentId), state.document, state.diagnostics);
    }
  },
};

// Parses a Camera block (type 42). Layout:
// Scene3DHeader(parentId → matrix → name) → activeFlag(uint8) → lensCount(int16) → projectionType(int16)
// → PropertyList → pivot PropertyList → UserAttrList. The header is the same envelope every placed AWD
// block uses, which is why it reads identically to parseLightBlock.
function parseCameraBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  matrixWide: boolean,
  diagnostics?: ImportDiagnostic[],
): Awd2ParsedCamera | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 4 > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.camera-truncated', 'parseCameraBlock', {
      field: 'parentId',
    });
    return null;
  }
  const parentId = dv.getUint32(offset, true);
  offset += 4;

  const floatSize = matrixWide ? 8 : 4;
  if (offset + 12 * floatSize > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.camera-truncated', 'parseCameraBlock', {
      field: 'transform',
    });
    return null;
  }
  const transformResult = readAwdTransform(view, offset, matrixWide);
  offset = transformResult.end;

  if (offset + 2 > end || offset + 2 + dv.getUint16(offset, true) > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.camera-truncated', 'parseCameraBlock', {
      field: 'name',
    });
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  // uint8 active-camera flag, then an int16 lens count the format writes but never uses.
  if (offset + 5 > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.camera-truncated', 'parseCameraBlock', {
      field: 'projectionType',
    });
    return null;
  }
  offset += 3;
  const projectionType = dv.getInt16(offset, true);
  offset += 2;

  const props = readAwdProperties(view, offset, end);

  return {
    bottom: readAwdPropertyFloat32(view, props.values, AWD2_CAMERA_PROP_ORTHO_BOTTOM) ?? AWD2_CAMERA_DEFAULT_BOTTOM,
    fov: readAwdPropertyFloat32(view, props.values, AWD2_CAMERA_PROP_FOV) ?? AWD2_CAMERA_DEFAULT_FOV_DEGREES,
    left: readAwdPropertyFloat32(view, props.values, AWD2_CAMERA_PROP_ORTHO_LEFT) ?? AWD2_CAMERA_DEFAULT_LEFT,
    name: nameResult.value,
    parentId,
    projectionType,
    right: readAwdPropertyFloat32(view, props.values, AWD2_CAMERA_PROP_ORTHO_RIGHT) ?? AWD2_CAMERA_DEFAULT_RIGHT,
    top: readAwdPropertyFloat32(view, props.values, AWD2_CAMERA_PROP_ORTHO_TOP) ?? AWD2_CAMERA_DEFAULT_TOP,
    transform: transformResult.transform,
  };
}

// Appends one parsed AWD camera to the document's camera placement table. The block matrix is the
// camera's placement, exactly as it is for a point light.
//
// AWD carries no near/far and no aspect on the camera block — both belong to the runtime viewport in
// Away3D, not to the asset — so the clip planes take that ecosystem's own projection defaults and the
// aspect is 1, the same shape every other importer lands on when the format states none.
function buildAwdDocumentCamera(
  camera: Readonly<Awd2ParsedCamera>,
  nodeIndex: number | undefined,
  document: Scene3DDocument,
  diagnostics?: ImportDiagnostic[],
): void {
  let projection: Projection;
  if (camera.projectionType === AWD2_CAMERA_PROJECTION_PERSPECTIVE) {
    // Away3D's fieldOfView drives the VERTICAL scale of the frustum, so it maps to fovY directly.
    projection = createPerspectiveProjection({ fovY: camera.fov * DEG_TO_RAD });
  } else if (camera.projectionType === AWD2_CAMERA_PROJECTION_ORTHOGRAPHIC) {
    projection = createOrthographicProjection({
      halfHeight: AWD2_CAMERA_DEFAULT_ORTHO_HALF_EXTENT,
      halfWidth: AWD2_CAMERA_DEFAULT_ORTHO_HALF_EXTENT,
    });
  } else if (camera.projectionType === AWD2_CAMERA_PROJECTION_ORTHOGRAPHIC_OFFCENTER) {
    projection = createOrthographicProjection({
      halfHeight: Math.abs(camera.top - camera.bottom) / 2,
      halfWidth: Math.abs(camera.right - camera.left) / 2,
    });
    // Flight's orthographic volume is centred on the view axis; AWD's off-center form can sit the volume
    // anywhere. The extents survive, the offset does not — an authored asymmetry the file really stated.
    if (camera.right + camera.left !== 0 || camera.top + camera.bottom !== 0) {
      reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Skip, 'awd2.camera-offcenter-dropped', 'parseAwd2', {
        name: camera.name,
      });
    }
  } else {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'awd2.camera-unsupported-projection',
      'parseAwd2',
      {
        name: camera.name,
        projectionType: camera.projectionType,
      },
    );
    return;
  }

  document.cameras.push({
    far: AWD2_CAMERA_DEFAULT_FAR,
    ...(camera.name.length > 0 ? { name: camera.name } : {}),
    near: AWD2_CAMERA_DEFAULT_NEAR,
    ...(nodeIndex !== undefined ? { node: nodeIndex } : {}),
    projection,
    transform: awdTransformToTransform3D(camera.transform),
  });
}

// AWD states no clip planes, aspect, or orthographic extent on the camera block — in Away3D they belong to
// the runtime viewport, not the asset — so these are that ecosystem's own projection defaults rather than
// invented values: a 60-degree vertical field of view, a 20..3000 clip span, and a unit-scale orthographic
// volume (half-extent 0.5). The off-center defaults are the bounds Away3D substitutes when 5003 omits them.
const AWD2_CAMERA_DEFAULT_BOTTOM = -300;

const AWD2_CAMERA_DEFAULT_FAR = 3000;

const AWD2_CAMERA_DEFAULT_FOV_DEGREES = 60;

const AWD2_CAMERA_DEFAULT_LEFT = -400;

const AWD2_CAMERA_DEFAULT_NEAR = 20;

const AWD2_CAMERA_DEFAULT_ORTHO_HALF_EXTENT = 0.5;

const AWD2_CAMERA_DEFAULT_RIGHT = 400;

const AWD2_CAMERA_DEFAULT_TOP = 300;
