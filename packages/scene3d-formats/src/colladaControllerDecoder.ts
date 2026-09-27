import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';
import type {
  ColladaDecodedMorph,
  ColladaDecodedSkin,
  ColladaDeferredControllerBinding,
  ColladaElementDecoder,
  ImportDiagnostic,
  MeshMorph,
  MorphTarget,
  Scene3DDocument,
  Scene3DDocumentSkin,
  XmlElement,
} from '@flighthq/types/contract';
import { parseXmlDocument } from '@flighthq/xml/contract';

import { applyColladaMaterialOverrides } from './colladaSceneShared.ts';
import { colladaChild, colladaDescendants, colladaIdOf, colladaNumbers } from './colladaXml.ts';

/** Internal Arc 5a seam; intentionally not re-exported from the package contract. */
export function decodeColladaControllers(xml: string, diagnostics: ImportDiagnostic[] = []): ColladaDecodedSkin[] {
  const root = parseXmlDocument(xml);
  if (!root) return [];
  return decodeColladaControllersFromRoot(root, diagnostics);
}

/** Internal morph-controller seam for later binding to MeshMorph/document nodes. */
export function decodeColladaMorphs(xml: string, diagnostics: ImportDiagnostic[] = []): ColladaDecodedMorph[] {
  const root = parseXmlDocument(xml);
  if (!root) return [];
  return decodeColladaMorphsFromRoot(root, diagnostics);
}

function decodeColladaMorphsFromRoot(root: XmlElement, diagnostics: ImportDiagnostic[]): ColladaDecodedMorph[] {
  const out: ColladaDecodedMorph[] = [];
  for (const controller of colladaDescendants(root, 'controller')) {
    const morph = colladaChild(controller, 'morph');
    if (!morph || !colladaIdOf(controller)) continue;
    const method = morph.attributes.method === 'NORMALIZED' ? 'NORMALIZED' : 'RELATIVE';
    if (morph.attributes.method && morph.attributes.method !== 'RELATIVE' && morph.attributes.method !== 'NORMALIZED')
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Skip,
        'collada.unsupported-morph-method',
        'decodeColladaMorphs',
        { method: morph.attributes.method },
      );
    const targets = colladaChild(morph, 'targets');
    const targetInput = targets?.children.find((e) => e.name === 'input' && e.attributes.semantic === 'MORPH_TARGET');
    const weightInput = targets?.children.find((e) => e.name === 'input' && e.attributes.semantic === 'MORPH_WEIGHT');
    const source = (ref: string | undefined, name: string) =>
      colladaDescendants(morph, 'source')
        .find((e) => colladaIdOf(e) === ref?.replace(/^#/, ''))
        ?.children.find((e) => e.name === name)
        ?.text.trim()
        .split(/\s+/)
        .filter(Boolean) ?? [];
    const targetIds = source(targetInput?.attributes.source, 'IDREF_array');
    const weights = source(weightInput?.attributes.source, 'float_array').map(Number).filter(Number.isFinite);
    if (!targetIds.length || !weights.length) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.missing-reference',
        'decodeColladaMorphs',
        { controller: colladaIdOf(controller)! },
      );
      continue;
    }
    out.push({
      controllerId: colladaIdOf(controller)!,
      baseGeometry: morph.attributes.source?.replace(/^#/, '') ?? '',
      method,
      targets: targetIds,
      weights: weights.slice(0, targetIds.length),
    });
  }
  return out;
}

function decodeColladaControllersFromRoot(root: XmlElement, diagnostics: ImportDiagnostic[]): ColladaDecodedSkin[] {
  const out: ColladaDecodedSkin[] = [];
  for (const controller of colladaDescendants(root, 'controller')) {
    const skin = colladaChild(controller, 'skin');
    if (!skin || !colladaIdOf(controller)) continue;
    const geometryRef = skin.attributes.source?.replace(/^#/, '') ?? '';
    const sourceValues = new Map<string, string[] | number[]>();
    for (const source of skin.children.filter((e) => e.name === 'source')) {
      const id = colladaIdOf(source);
      if (!id) continue;
      const arr =
        colladaChild(source, 'Name_array') ??
        colladaChild(source, 'IDREF_array') ??
        colladaChild(source, 'float_array');
      if (arr)
        sourceValues.set(
          id,
          arr.name === 'float_array' ? colladaNumbers(arr) : arr.text.trim().split(/\s+/).filter(Boolean),
        );
    }
    const joints = colladaChild(skin, 'joints');
    const jointInput = joints?.children.find((e) => e.name === 'input' && e.attributes.semantic === 'JOINT');
    const matrixInput = joints?.children.find((e) => e.name === 'input' && e.attributes.semantic === 'INV_BIND_MATRIX');
    const jointNames =
      (sourceValues.get(jointInput?.attributes.source?.replace(/^#/, '') ?? '') as string[] | undefined) ?? [];
    const matrixValues =
      (sourceValues.get(matrixInput?.attributes.source?.replace(/^#/, '') ?? '') as number[] | undefined) ?? [];
    const inverseBindMatrices: number[][] = [];
    for (let i = 0; i + 15 < matrixValues.length; i += 16) inverseBindMatrices.push(matrixValues.slice(i, i + 16));
    const weights = colladaChild(skin, 'vertex_weights');
    const vcount = colladaNumbers(colladaChild(weights, 'vcount'));
    const v = colladaNumbers(colladaChild(weights, 'v'));
    const weightInputs = weights?.children.filter((e) => e.name === 'input') ?? [];
    const jointOffset = Number(weightInputs.find((e) => e.attributes.semantic === 'JOINT')?.attributes.offset ?? 0);
    const weightOffset = Number(weightInputs.find((e) => e.attributes.semantic === 'WEIGHT')?.attributes.offset ?? 1);
    const stride = Math.max(1, ...weightInputs.map((e) => Number(e.attributes.offset ?? 0) + 1));
    const weightSource = sourceValues.get(
      weightInputs.find((e) => e.attributes.semantic === 'WEIGHT')?.attributes.source?.replace(/^#/, '') ?? '',
    ) as number[] | undefined;
    const influences: Array<Array<{ joint: string; weight: number }>> = [];
    let cursor = 0;
    for (const count of vcount) {
      const values: Array<{ joint: string; weight: number }> = [];
      for (let i = 0; i < count; i++) {
        const ji = v[cursor + i * stride + jointOffset];
        const wi = v[cursor + i * stride + weightOffset];
        if (jointNames[ji] !== undefined && weightSource?.[wi] !== undefined)
          values.push({ joint: jointNames[ji], weight: weightSource[wi] });
      }
      const sum = values.reduce((s, x) => s + x.weight, 0);
      for (const x of values) x.weight = sum > 0 ? x.weight / sum : 0;
      influences.push(values);
      cursor += count * stride;
    }
    if (cursor !== v.length)
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.vertex-weight-count-mismatch',
        'decodeColladaControllers',
        { controller: colladaIdOf(controller)! },
      );
    out.push({
      bindShapeMatrix: colladaNumbers(colladaChild(skin, 'bind_shape_matrix')),
      controllerId: colladaIdOf(controller)!,
      geometryRef,
      influences,
      inverseBindMatrices,
      jointNames,
      jointSids: jointNames.slice(),
    });
  }
  return out;
}

function resolveColladaSkins(
  document: Scene3DDocument,
  deferred: readonly ColladaDeferredControllerBinding[],
  controllerMap: ReadonlyMap<string, ColladaDecodedSkin>,
  morphMap: ReadonlyMap<string, ColladaDecodedMorph>,
  geometryIdToMeshIndex: ReadonlyMap<string, number>,
  geometryPositions: ReadonlyMap<string, number[]>,
  geometryPrimitiveSymbols: ReadonlyMap<string, string[]>,
  nodeIdMap: ReadonlyMap<string, number>,
  diagnostics: ImportDiagnostic[],
): void {
  for (const binding of deferred) {
    const decoded = controllerMap.get(binding.controllerId);
    const morph = decoded ? morphMap.get(decoded.geometryRef) : morphMap.get(binding.controllerId);

    if (!decoded && !morph) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.missing-reference',
        'parseCollada',
        { element: 'instance_controller', url: `#${binding.controllerId}` },
      );
      continue;
    }

    const geometryRef = morph ? morph.baseGeometry : decoded!.geometryRef;
    let meshIndex = geometryIdToMeshIndex.get(geometryRef);
    if (meshIndex !== undefined) {
      meshIndex = applyColladaMaterialOverrides(
        document,
        meshIndex,
        geometryPrimitiveSymbols.get(geometryRef),
        binding.materialOverrides,
      );
      document.nodes[binding.nodeIndex].mesh = meshIndex;
    }

    if (morph && meshIndex !== undefined) {
      const morphResult = buildColladaMeshMorph(morph, geometryPositions, diagnostics);
      if (morphResult) document.meshes[meshIndex].morph = morphResult;
    }

    if (decoded) {
      const joints: number[] = [];
      const inverseBind: Scene3DDocumentSkin['inverseBind'] = [];
      for (let i = 0; i < decoded.jointNames.length; i++) {
        const jointName = decoded.jointNames[i];
        const jointIndex = nodeIdMap.get(jointName);
        if (jointIndex === undefined) {
          reportImportDiagnostic(
            diagnostics,
            ImportDiagnosticSeverity.Recover,
            'collada.missing-reference',
            'parseCollada',
            { element: 'skin joint', joint: jointName },
          );
          continue;
        }
        joints.push(jointIndex);
        // COLLADA inverse-bind matrices are row-major; transpose to column-major.
        const rowMajor = decoded.inverseBindMatrices[i];
        const m = new Float32Array(16);
        if (rowMajor && rowMajor.length >= 16) {
          for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) m[c * 4 + r] = rowMajor[r * 4 + c];
        } else {
          m[0] = 1;
          m[5] = 1;
          m[10] = 1;
          m[15] = 1;
        }
        inverseBind.push({ m });
      }

      const skinIndex = document.skins.length;
      document.skins.push({ inverseBind, joints });
      if (meshIndex !== undefined) document.meshes[meshIndex].skin = skinIndex;
    }
  }
}

function buildColladaMeshMorph(
  morph: ColladaDecodedMorph,
  geometryPositions: ReadonlyMap<string, number[]>,
  diagnostics: ImportDiagnostic[],
): MeshMorph | null {
  const basePos = geometryPositions.get(morph.baseGeometry);
  if (!basePos) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Recover, 'collada.missing-reference', 'parseCollada', {
      element: 'morph base geometry',
      geometry: morph.baseGeometry,
    });
    return null;
  }
  const vertexCount = Math.floor(basePos.length / 3);
  const targets: MorphTarget[] = [];
  for (const targetId of morph.targets) {
    const targetPos = geometryPositions.get(targetId);
    if (!targetPos) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.missing-reference',
        'parseCollada',
        { element: 'morph target geometry', geometry: targetId },
      );
      continue;
    }
    const positionDeltas = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount * 3; i++) {
      positionDeltas[i] = morph.method === 'NORMALIZED' ? (targetPos[i] ?? 0) - (basePos[i] ?? 0) : (targetPos[i] ?? 0);
    }
    targets.push({ normalDeltas: null, positionDeltas, tangentDeltas: null });
  }
  if (targets.length === 0) return null;
  return { targets, weights: Float32Array.from(morph.weights.slice(0, targets.length)) };
}

export const colladaControllerDecoder: ColladaElementDecoder = {
  // ★ THIRD, AND THE ORDER MATTERS HERE MOST. Skinning REWRITES the mesh a node points at, so it has to run after
  // the walk has seated every node and before animations address those nodes by index. It reads the geometry maps
  // its own decode never filled — that is the one place a decoder depends on another, and it degrades the way the
  // rest does: without the geometry decoder the maps are empty and a skin resolves to nothing rather than to
  // something wrong.
  build(context) {
    resolveColladaSkins(
      context.parse.document,
      context.deferredControllers,
      context.parse.skins,
      context.parse.morphs,
      context.parse.geometryIdToMeshIndex,
      context.parse.geometryPositions,
      context.parse.geometryPrimitiveSymbols,
      context.nodeIdMap,
      context.parse.diagnostics,
    );
  },
  buildPhase: 30,
  decode(context) {
    for (const skin of decodeColladaControllersFromRoot(context.root, context.diagnostics)) {
      context.skins.set(skin.controllerId, skin);
    }
    for (const morph of decodeColladaMorphsFromRoot(context.root, context.diagnostics)) {
      context.morphs.set(morph.controllerId, morph);
    }
  },
  elements: ['controller'],
  features: ['Controller', 'Controller.Morph', 'Controller.Skin'],
};
