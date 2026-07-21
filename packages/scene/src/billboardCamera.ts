import {
  copyMatrix4,
  createMatrix4,
  createQuaternion,
  createVector3,
  decomposeMatrix4,
  inverseMatrix4,
  multiplyMatrix4,
} from '@flighthq/geometry';
import { getNodeParent, getNodeWorldMatrix4, setNodeLocalMatrix4 } from '@flighthq/node';
import type { Billboard, BillboardMode, Camera3D, Matrix4, SceneNode } from '@flighthq/types';

import { isBillboard } from './billboard';
import { getSceneNodeRuntime } from './sceneNode';

// Orients a single Billboard to face `camera`, rewriting its localMatrix so that after the scene's
// world transforms resolve, the billboard's world axes face the camera per its `mode`. The
// billboard's world position and world scale are preserved (read from its current world matrix); only
// the rotation is replaced. The result is backend-agnostic: the billboard then draws through the same
// per-material mesh renderers as any Mesh, on every backend, with no billboard-specific draw path.
//
// Call once per frame per billboard after the camera's view matrix is set and before drawing. For a
// whole subtree, orientSceneBillboardsToCamera walks and orients every Billboard in one pass, deriving
// the camera basis a single time.
export function orientBillboardToCamera(billboard: Billboard, camera: Readonly<Camera3D>): void {
  setBillboardCameraBasis(camera);
  applyBillboardFacing(billboard);
}

// Orients every Billboard in the subtree rooted at `scene` to face `camera` in one pass. Non-billboard
// nodes are skipped (but still traversed, so billboards nested under group/mesh nodes are found). The
// camera basis is derived once and reused across every billboard. Parents are oriented before their
// descendants (top-down), so a billboard nested under another billboard sees its parent's updated
// transform.
export function orientSceneBillboardsToCamera(scene: Readonly<SceneNode>, camera: Readonly<Camera3D>): void {
  setBillboardCameraBasis(camera);
  orientBillboardSubtree(scene);
}

// Rewrites `billboard.localMatrix` from the module-scratch camera basis (set by setBillboardCameraBasis)
// so the billboard's world transform faces the camera. Reads the billboard's current world matrix for
// its world position and scale, builds the facing world matrix, then converts it back through the
// parent's inverse world transform into a local matrix (identity parent when the billboard is a root).
function applyBillboardFacing(billboard: Billboard): void {
  const world = getNodeWorldMatrix4(billboard) as Readonly<Matrix4>;
  decomposeMatrix4(_position, _rotationScratch, _scale, world);
  writeBillboardFacingMatrix(_facingWorld, billboard.mode);

  const parent = getNodeParent(billboard as SceneNode) as SceneNode | null;
  if (parent === null) {
    copyMatrix4(_localScratch, _facingWorld);
  } else {
    const parentWorld = getNodeWorldMatrix4(parent) as Readonly<Matrix4>;
    if (inverseMatrix4(_inverseParentWorld, parentWorld)) {
      multiplyMatrix4(_localScratch, _inverseParentWorld, _facingWorld);
    } else {
      // Degenerate (non-invertible) parent world: fall back to treating the facing matrix as local.
      copyMatrix4(_localScratch, _facingWorld);
    }
  }

  // A billboard orients by a computed matrix, not TRS, so author it directly (leaves the node detached).
  setNodeLocalMatrix4(billboard, _localScratch);
}

function orientBillboardSubtree(node: Readonly<SceneNode>): void {
  if (isBillboard(node)) {
    applyBillboardFacing(node);
  }
  const children = getSceneNodeRuntime(node).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      orientBillboardSubtree(children[i] as SceneNode);
    }
  }
}

// Derives the camera's world-space eye position and orthonormal right/up/back basis from its view
// matrix (view is world->view; its inverse is the camera's world transform) into module scratch. The
// basis vectors are normalized so a camera with a scaled view still yields a rotation-only billboard
// basis. `_back` is the camera's +Z world axis (toward the viewer), which is the facing normal a
// screen-aligned billboard adopts.
function setBillboardCameraBasis(camera: Readonly<Camera3D>): void {
  inverseMatrix4(_cameraWorld, camera.view);
  const m = _cameraWorld.m;
  _cameraEyeX = m[12];
  _cameraEyeY = m[13];
  _cameraEyeZ = m[14];
  _cameraRightX = m[0];
  _cameraRightY = m[1];
  _cameraRightZ = m[2];
  _cameraUpX = m[4];
  _cameraUpY = m[5];
  _cameraUpZ = m[6];
  _cameraBackX = m[8];
  _cameraBackY = m[9];
  _cameraBackZ = m[10];

  const rl = Math.hypot(_cameraRightX, _cameraRightY, _cameraRightZ) || 1;
  _cameraRightX /= rl;
  _cameraRightY /= rl;
  _cameraRightZ /= rl;
  const ul = Math.hypot(_cameraUpX, _cameraUpY, _cameraUpZ) || 1;
  _cameraUpX /= ul;
  _cameraUpY /= ul;
  _cameraUpZ /= ul;
  const bl = Math.hypot(_cameraBackX, _cameraBackY, _cameraBackZ) || 1;
  _cameraBackX /= bl;
  _cameraBackY /= bl;
  _cameraBackZ /= bl;
}

// Writes a camera-facing world matrix into `out` from the module-scratch camera basis, the billboard's
// world position (`_position`) and scale (`_scale`), and its facing `mode`. Local +X maps to the
// billboard's right axis, +Y to its up axis, and +Z to its facing normal (toward the camera):
//   - 'full'         spherical: normal points at the camera eye, up derived from the camera's up.
//   - 'axisY'        cylindrical: yaws about world +Y to face the camera horizontally, staying upright.
//   - 'screenAligned' planar: adopts the camera's right/up/back basis, so every billboard is coplanar
//                     with the view plane regardless of position.
function writeBillboardFacingMatrix(out: Matrix4, mode: BillboardMode): void {
  const px = _position.x;
  const py = _position.y;
  const pz = _position.z;
  const sx = _scale.x;
  const sy = _scale.y;
  const sz = _scale.z;

  let rx: number;
  let ry: number;
  let rz: number;
  let ux: number;
  let uy: number;
  let uz: number;
  let nx: number;
  let ny: number;
  let nz: number;

  if (mode === 'screenAligned') {
    rx = _cameraRightX;
    ry = _cameraRightY;
    rz = _cameraRightZ;
    ux = _cameraUpX;
    uy = _cameraUpY;
    uz = _cameraUpZ;
    nx = _cameraBackX;
    ny = _cameraBackY;
    nz = _cameraBackZ;
  } else if (mode === 'axisY') {
    // Face the camera horizontally: normal is the eye direction projected onto the world XZ plane,
    // up is locked to world +Y so the billboard never tilts.
    let dx = _cameraEyeX - px;
    let dz = _cameraEyeZ - pz;
    let dl = Math.hypot(dx, dz);
    if (dl < FACING_EPSILON) {
      // Camera3D is directly above/below: fall back to the camera back-axis projected onto XZ.
      dx = _cameraBackX;
      dz = _cameraBackZ;
      dl = Math.hypot(dx, dz);
      if (dl < FACING_EPSILON) {
        dx = 0;
        dz = 1;
        dl = 1;
      }
    }
    nx = dx / dl;
    ny = 0;
    nz = dz / dl;
    // right = up x normal = (0,1,0) x (nx,0,nz) = (nz, 0, -nx).
    rx = nz;
    ry = 0;
    rz = -nx;
    ux = 0;
    uy = 1;
    uz = 0;
  } else {
    // 'full' spherical: normal points from the billboard toward the camera eye.
    let dnx = _cameraEyeX - px;
    let dny = _cameraEyeY - py;
    let dnz = _cameraEyeZ - pz;
    let dnl = Math.hypot(dnx, dny, dnz);
    if (dnl < FACING_EPSILON) {
      dnx = _cameraBackX;
      dny = _cameraBackY;
      dnz = _cameraBackZ;
      dnl = Math.hypot(dnx, dny, dnz) || 1;
    }
    nx = dnx / dnl;
    ny = dny / dnl;
    nz = dnz / dnl;
    // right = normalize(cameraUp x normal).
    rx = _cameraUpY * nz - _cameraUpZ * ny;
    ry = _cameraUpZ * nx - _cameraUpX * nz;
    rz = _cameraUpX * ny - _cameraUpY * nx;
    let rl = Math.hypot(rx, ry, rz);
    if (rl < FACING_EPSILON) {
      // cameraUp parallel to normal: derive right from the camera right axis, orthogonalized to normal.
      const d = _cameraRightX * nx + _cameraRightY * ny + _cameraRightZ * nz;
      rx = _cameraRightX - d * nx;
      ry = _cameraRightY - d * ny;
      rz = _cameraRightZ - d * nz;
      rl = Math.hypot(rx, ry, rz);
      if (rl < FACING_EPSILON) {
        rx = 1;
        ry = 0;
        rz = 0;
        rl = 1;
      }
    }
    rx /= rl;
    ry /= rl;
    rz /= rl;
    // up = normal x right (already orthonormal).
    ux = ny * rz - nz * ry;
    uy = nz * rx - nx * rz;
    uz = nx * ry - ny * rx;
  }

  const m = out.m;
  m[0] = rx * sx;
  m[1] = ry * sx;
  m[2] = rz * sx;
  m[3] = 0;
  m[4] = ux * sy;
  m[5] = uy * sy;
  m[6] = uz * sy;
  m[7] = 0;
  m[8] = nx * sz;
  m[9] = ny * sz;
  m[10] = nz * sz;
  m[11] = 0;
  m[12] = px;
  m[13] = py;
  m[14] = pz;
  m[15] = 1;
}

const FACING_EPSILON = 1e-6;

const _cameraWorld = createMatrix4();
const _inverseParentWorld = createMatrix4();
const _facingWorld = createMatrix4();
const _localScratch = createMatrix4();
const _position = createVector3();
const _scale = createVector3();
const _rotationScratch = createQuaternion(0, 0, 0, 1);

let _cameraEyeX = 0;
let _cameraEyeY = 0;
let _cameraEyeZ = 0;
let _cameraRightX = 1;
let _cameraRightY = 0;
let _cameraRightZ = 0;
let _cameraUpX = 0;
let _cameraUpY = 1;
let _cameraUpZ = 0;
let _cameraBackX = 0;
let _cameraBackY = 0;
let _cameraBackZ = 1;
