import {
  composeMatrix4FromTransform3D,
  createMatrix4,
  createTransform3D,
  decomposeMatrix4ToTransform3D,
  multiplyMatrix4,
  setMatrix4,
} from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  ColladaBuildContext,
  ColladaDeferredCameraBinding,
  ColladaDeferredControllerBinding,
  ColladaDeferredLightBinding,
  ColladaElementDecoder,
  ColladaImportOptions,
  ColladaParseContext,
  ColladaParseResult,
  ColladaUpAxis,
  ImportDiagnostic,
  Matrix4Like,
  Scene3DDocument,
  Scene3DDocumentNode,
  Scene3DDocumentScene,
  Transform3D,
  XmlElement,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, Node3DKind } from '@flighthq/types/contract';
import { parseXmlDocument } from '@flighthq/xml/contract';

import { applyColladaBindMaterial, parseColladaBindMaterial } from './colladaSceneShared.ts';
import {
  colladaChild,
  colladaChildren,
  colladaLocalName,
  parseColladaFloats,
  colladaText,
  walkColladaElement,
} from './colladaXml.ts';
const Y_UP_ROOT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const Z_UP_ROOT = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1] as const;
const X_UP_ROOT = [0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1] as const;
function emptyDocument(): Scene3DDocument {
  return {
    animations: [],
    cameras: [],
    lights: [],
    materials: [],
    meshes: [],
    metadata: null,
    nodes: [],
    resources: [],
    scenes: [],
    skins: [],
  };
}

/** Parses COLLADA metadata, coordinate conventions, materials, geometry, and scene hierarchy into a format-neutral document. */
/**
 * The COLLADA parse, over a decoder family it is GIVEN rather than one it resolves.
 *
 * ★ THIS MODULE MUST NOT KNOW THE DEFAULT FAMILY. `parseCollada` in `colladaDocument.ts` owns that edge, which is
 * what keeps this module free of the six feature modules and of the packages behind them — animation, lighting,
 * camera and mesh are reached only from the decoders that need them. A `?? colladaAllElementDecoders` here would
 * name every decoder from the orchestrator, and a caller asking for geometry alone would link all six anyway,
 * which is the whole property the family exists to provide.
 *
 * Everything else about the parse is unchanged: the document shell, the up-axis reading and its diagnostic, the
 * dangling-reference sweep, the decode pass in the caller's order, and then the scene walk.
 */
export function parseColladaWithDecoders(
  xml: string,
  decoders: readonly ColladaElementDecoder[],
  options?: Readonly<ColladaImportOptions>,
): ColladaParseResult {
  const diagnostics: ImportDiagnostic[] = [];
  const document = emptyDocument();
  const root = parseXmlDocument(xml);
  if (root === null || !(root.name === 'COLLADA' || root.name.endsWith(':COLLADA'))) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'collada.invalid-document', 'parseCollada');
    return { document, diagnostics, upAxis: 'Y_UP', rootTransform: Y_UP_ROOT };
  }
  const asset = colladaChild(root, 'asset');
  const axis = colladaText(asset, 'up_axis');
  const upAxis: ColladaUpAxis = axis === 'Z_UP' || axis === 'X_UP' ? axis : 'Y_UP';
  const rootTransform = upAxis === 'Z_UP' ? Z_UP_ROOT : upAxis === 'X_UP' ? X_UP_ROOT : Y_UP_ROOT;
  document.metadata = {
    copyright: colladaText(asset, 'copyright'),
    generator: colladaText(colladaChild(asset, 'contributor'), 'authoring_tool'),
    version: root.attributes.version ?? null,
  };
  if (upAxis !== 'Y_UP')
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'collada.coordinate-conversion',
      'parseCollada',
      { from: upAxis, to: 'Y_UP' },
    );
  walkColladaElement(root, (element) => {
    const ln = colladaLocalName(element);
    if (
      ln.startsWith('instance_') &&
      ln !== 'instance_visual_scene' &&
      ln !== 'instance_node' &&
      ln !== 'instance_material' &&
      !element.attributes.url
    )
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.missing-reference',
        'parseCollada',
        { element: element.name },
      );
  });
  const context: ColladaParseContext = {
    animationChannels: [],
    baseUrl: options?.baseUrl ?? null,
    cameraDefinitions: new Map(),
    diagnostics,
    document,
    geometryIdToMeshIndex: new Map(),
    geometryPositions: new Map(),
    geometryPrimitiveSymbols: new Map(),
    lightDefinitions: new Map(),
    materialIndices: new Map(),
    morphs: new Map(),
    root,
    skins: new Map(),
  };
  for (const decoder of decoders) decoder.decode(context);
  const nodeLibrary = buildColladaIdMap(colladaChild(root, 'library_nodes'), 'node');
  const visualSceneLibrary = buildColladaIdMap(colladaChild(root, 'library_visual_scenes'), 'visual_scene');
  buildColladaSceneHierarchy(context, root, visualSceneLibrary, nodeLibrary, rootTransform, decoders);

  return { document, diagnostics, upAxis, rootTransform };
}

function buildColladaIdMap(library: XmlElement | undefined, elementName: string): Map<string, XmlElement> {
  const map = new Map<string, XmlElement>();
  if (library === undefined) return map;
  for (const element of colladaChildren(library, elementName)) {
    const id = element.attributes.id;
    if (id !== undefined) map.set(id, element);
  }
  return map;
}

function buildColladaSceneHierarchy(
  parse: Readonly<ColladaParseContext>,
  root: XmlElement,
  visualSceneLibrary: Map<string, XmlElement>,
  nodeLibrary: Map<string, XmlElement>,
  rootTransform: readonly number[],
  decoders: readonly ColladaElementDecoder[],
): void {
  const { diagnostics, document } = parse;
  const sceneElement = colladaChild(root, 'scene');
  if (sceneElement === undefined) return;
  const instanceVisualScene = colladaChild(sceneElement, 'instance_visual_scene');
  if (instanceVisualScene === undefined) return;
  const url = instanceVisualScene.attributes.url;
  if (url === undefined || !url.startsWith('#')) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Recover, 'collada.missing-reference', 'parseCollada', {
      element: 'instance_visual_scene',
      url: url ?? '(missing)',
    });
    return;
  }
  const visualScene = visualSceneLibrary.get(url.slice(1));
  if (visualScene === undefined) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Recover, 'collada.missing-reference', 'parseCollada', {
      element: 'instance_visual_scene',
      url,
    });
    return;
  }

  const rootMatrix = createMatrix4();
  rootMatrix.m.set(rootTransform);
  const isIdentityRoot =
    rootTransform[0] === 1 &&
    rootTransform[5] === 1 &&
    rootTransform[10] === 1 &&
    rootTransform[15] === 1 &&
    rootTransform[1] === 0 &&
    rootTransform[2] === 0 &&
    rootTransform[3] === 0 &&
    rootTransform[4] === 0 &&
    rootTransform[6] === 0 &&
    rootTransform[7] === 0 &&
    rootTransform[8] === 0 &&
    rootTransform[9] === 0 &&
    rootTransform[11] === 0 &&
    rootTransform[12] === 0 &&
    rootTransform[13] === 0 &&
    rootTransform[14] === 0;

  const { geometryIdToMeshIndex, geometryPrimitiveSymbols, materialIndices } = parse;
  const nodeIdMap = new Map<string, number>();
  const deferredCameras: ColladaDeferredCameraBinding[] = [];
  const deferredControllers: ColladaDeferredControllerBinding[] = [];
  const deferredLights: ColladaDeferredLightBinding[] = [];
  const instanceStack = new Set<string>();
  const rootNodeIndices: number[] = [];
  for (const nodeElement of colladaChildren(visualScene, 'node')) {
    rootNodeIndices.push(
      buildColladaNode(
        document,
        nodeElement,
        nodeLibrary,
        instanceStack,
        geometryIdToMeshIndex,
        geometryPrimitiveSymbols,
        materialIndices,
        nodeIdMap,
        deferredCameras,
        deferredControllers,
        deferredLights,
        diagnostics,
      ),
    );
  }

  if (!isIdentityRoot) {
    for (const nodeIndex of rootNodeIndices) {
      applyColladaRootTransform(document.nodes[nodeIndex], rootMatrix);
    }
  }

  // ★ THE BUILD HALF IS DISPATCHED, NOT NAMED. This function used to call `resolveColladaCameras`,
  // `resolveColladaLights`, `resolveColladaSkins` and `resolveColladaAnimations` in sequence, which meant the
  // orchestrator imported four feature modules and every caller linked all four whatever family they asked for.
  // Each decoder now carries its own build step, and the sort by `buildPhase` reproduces that exact sequence — so
  // a caller's array order still cannot change the parse, and an omitted decoder omits its build with it.
  const buildContext: ColladaBuildContext = {
    deferredCameras,
    deferredControllers,
    deferredLights,
    nodeIdMap,
    parse,
    rootNodeIndices,
  };
  for (const decoder of orderColladaBuildPhases(decoders)) decoder.build?.(buildContext);

  const scene: Scene3DDocumentScene = {
    name: visualScene.attributes.name,
    rootNodes: rootNodeIndices,
  };
  document.scenes.push(scene);
}

function applyColladaRootTransform(node: Scene3DDocumentNode, rootMatrix: Matrix4Like): void {
  const local = createMatrix4();
  const composed = createMatrix4();
  composeMatrix4FromTransform3D(local, node.transform);
  multiplyMatrix4(composed, rootMatrix, local);
  decomposeMatrix4ToTransform3D(node.transform, composed);
}

function buildColladaNode(
  document: Scene3DDocument,
  nodeElement: XmlElement,
  nodeLibrary: Map<string, XmlElement>,
  instanceStack: Set<string>,
  geometryIdToMeshIndex: ReadonlyMap<string, number>,
  geometryPrimitiveSymbols: ReadonlyMap<string, string[]>,
  materialIndices: ReadonlyMap<string, number>,
  nodeIdMap: Map<string, number>,
  deferredCameras: ColladaDeferredCameraBinding[],
  deferredControllers: ColladaDeferredControllerBinding[],
  deferredLights: ColladaDeferredLightBinding[],
  diagnostics: ImportDiagnostic[],
): number {
  const nodeIndex = document.nodes.length;
  const transform = composeColladaTransformElements(nodeElement);
  const node: Scene3DDocumentNode = {
    children: [],
    kind: Node3DKind,
    name: nodeElement.attributes.name ?? nodeElement.attributes.id,
    transform,
  };
  document.nodes.push(node);

  const nodeId = nodeElement.attributes.id;
  const nodeSid = nodeElement.attributes.sid;
  if (nodeId !== undefined) {
    instanceStack.add(nodeId);
    nodeIdMap.set(nodeId, nodeIndex);
  }
  if (nodeSid !== undefined) nodeIdMap.set(nodeSid, nodeIndex);

  for (const childElement of nodeElement.children) {
    const name = colladaLocalName(childElement);
    if (name === 'node') {
      node.children.push(
        buildColladaNode(
          document,
          childElement,
          nodeLibrary,
          instanceStack,
          geometryIdToMeshIndex,
          geometryPrimitiveSymbols,
          materialIndices,
          nodeIdMap,
          deferredCameras,
          deferredControllers,
          deferredLights,
          diagnostics,
        ),
      );
    } else if (name === 'instance_node') {
      const url = childElement.attributes.url;
      if (url === undefined || !url.startsWith('#')) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Recover,
          'collada.missing-reference',
          'parseCollada',
          { element: 'instance_node', url: url ?? '(missing)' },
        );
        continue;
      }
      const refId = url.slice(1);
      if (instanceStack.has(refId)) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Recover,
          'collada.instance-cycle',
          'parseCollada',
          { node: refId },
        );
        continue;
      }
      const referenced = nodeLibrary.get(refId);
      if (referenced === undefined) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Recover,
          'collada.missing-reference',
          'parseCollada',
          { element: 'instance_node', url },
        );
        continue;
      }
      node.children.push(
        buildColladaNode(
          document,
          referenced,
          nodeLibrary,
          instanceStack,
          geometryIdToMeshIndex,
          geometryPrimitiveSymbols,
          materialIndices,
          nodeIdMap,
          deferredCameras,
          deferredControllers,
          deferredLights,
          diagnostics,
        ),
      );
    } else if (name === 'instance_camera') {
      const url = childElement.attributes.url;
      if (url?.startsWith('#')) {
        deferredCameras.push({ cameraId: url.slice(1), nodeIndex });
      } else if (url !== undefined) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Recover,
          'collada.missing-reference',
          'parseCollada',
          { element: 'instance_camera', url },
        );
      }
    } else if (name === 'instance_geometry') {
      const url = childElement.attributes.url;
      if (url?.startsWith('#')) {
        const geoId = url.slice(1);
        const meshIndex = geometryIdToMeshIndex.get(geoId);
        if (meshIndex !== undefined) {
          node.mesh = applyColladaBindMaterial(
            document,
            meshIndex,
            childElement,
            geometryPrimitiveSymbols.get(geoId),
            materialIndices,
          );
        }
      }
    } else if (name === 'instance_controller') {
      const url = childElement.attributes.url;
      if (url?.startsWith('#')) {
        const skeletonEl = colladaChild(childElement, 'skeleton');
        const skeletonRoot = skeletonEl?.text.trim().replace(/^#/, '') ?? null;
        const materialOverrides = parseColladaBindMaterial(childElement, materialIndices);
        deferredControllers.push({
          controllerId: url.slice(1),
          materialOverrides,
          nodeIndex,
          skeletonRoot,
        });
      }
    } else if (name === 'instance_light') {
      const url = childElement.attributes.url;
      // The generic instance validation above diagnoses an absent URL exactly once. Preserve every
      // present URL here so resolution can distinguish malformed/external and unresolved local targets.
      if (url !== undefined) deferredLights.push({ nodeIndex, url });
    }
  }

  if (nodeId !== undefined) instanceStack.delete(nodeId);
  return nodeIndex;
}

function composeColladaTransformElements(nodeElement: XmlElement): Transform3D {
  const transform = createTransform3D();
  const transformElements = nodeElement.children.filter((c) => {
    const n = colladaLocalName(c);
    return n === 'matrix' || n === 'translate' || n === 'rotate' || n === 'scale' || n === 'lookat';
  });
  if (transformElements.length === 0) return transform;

  const composed = createMatrix4();
  setMatrix4(composed, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

  for (const element of transformElements) {
    const name = colladaLocalName(element);
    const values = parseColladaFloats(element.text);
    if (name === 'matrix' && values.length >= 16) {
      applyColladaMatrix(composed, values);
    } else if (name === 'translate' && values.length >= 3) {
      applyColladaTranslate(composed, values);
    } else if (name === 'rotate' && values.length >= 4) {
      applyColladaRotate(composed, values);
    } else if (name === 'scale' && values.length >= 3) {
      applyColladaScale(composed, values);
    } else if (name === 'lookat' && values.length >= 9) {
      applyColladaLookat(composed, values);
    }
  }

  decomposeMatrix4ToTransform3D(transform, composed);
  return transform;
}

function applyColladaMatrix(composed: Matrix4Like, values: number[]): void {
  // COLLADA matrices are row-major; Flight/OpenGL is column-major — transpose on load.
  setMatrix4(
    __scratch,
    values[0],
    values[4],
    values[8],
    values[12],
    values[1],
    values[5],
    values[9],
    values[13],
    values[2],
    values[6],
    values[10],
    values[14],
    values[3],
    values[7],
    values[11],
    values[15],
  );
  multiplyMatrix4(composed, composed, __scratch);
}

function applyColladaTranslate(composed: Matrix4Like, values: number[]): void {
  setMatrix4(__scratch, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, values[0], values[1], values[2], 1);
  multiplyMatrix4(composed, composed, __scratch);
}

function applyColladaRotate(composed: Matrix4Like, values: number[]): void {
  const ax = values[0];
  const ay = values[1];
  const az = values[2];
  const angleDeg = values[3];
  const angleRad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const t = 1 - c;
  const len = Math.sqrt(ax * ax + ay * ay + az * az);
  if (len < 1e-10) return;
  const nx = ax / len;
  const ny = ay / len;
  const nz = az / len;
  setMatrix4(
    __scratch,
    t * nx * nx + c,
    t * nx * ny + s * nz,
    t * nx * nz - s * ny,
    0,
    t * nx * ny - s * nz,
    t * ny * ny + c,
    t * ny * nz + s * nx,
    0,
    t * nx * nz + s * ny,
    t * ny * nz - s * nx,
    t * nz * nz + c,
    0,
    0,
    0,
    0,
    1,
  );
  multiplyMatrix4(composed, composed, __scratch);
}

function applyColladaScale(composed: Matrix4Like, values: number[]): void {
  setMatrix4(__scratch, values[0], 0, 0, 0, 0, values[1], 0, 0, 0, 0, values[2], 0, 0, 0, 0, 1);
  multiplyMatrix4(composed, composed, __scratch);
}

function applyColladaLookat(composed: Matrix4Like, values: number[]): void {
  const ex = values[0],
    ey = values[1],
    ez = values[2];
  const tx = values[3],
    ty = values[4],
    tz = values[5];
  const ux = values[6],
    uy = values[7],
    uz = values[8];
  let fx = tx - ex,
    fy = ty - ey,
    fz = tz - ez;
  const fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
  if (fl < 1e-10) return;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  let sx = fy * uz - fz * uy,
    sy = fz * ux - fx * uz,
    sz = fx * uy - fy * ux;
  const sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
  if (sl < 1e-10) return;
  sx /= sl;
  sy /= sl;
  sz /= sl;
  const upx = sy * fz - sz * fy;
  const upy = sz * fx - sx * fz;
  const upz = sx * fy - sy * fx;
  // COLLADA lookat builds a camera-like placement matrix (not a view matrix).
  // Columns: side, recomputed-up, -forward, eye.
  setMatrix4(__scratch, sx, upx, -fx, 0, sy, upy, -fy, 0, sz, upz, -fz, 0, ex, ey, ez, 1);
  multiplyMatrix4(composed, composed, __scratch);
}

const __scratch = createMatrix4();

// Sorts a family by its declared build phase, leaving a decoder with none to run last. A stable sort on a copy, so
// the caller's array is untouched and two decoders sharing a phase keep the order the caller gave them.
function orderColladaBuildPhases(
  decoders: readonly ColladaElementDecoder[],
): readonly Readonly<ColladaElementDecoder>[] {
  return [...decoders].sort(
    (a, b) => (a.buildPhase ?? Number.MAX_SAFE_INTEGER) - (b.buildPhase ?? Number.MAX_SAFE_INTEGER),
  );
}
