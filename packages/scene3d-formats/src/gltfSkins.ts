import type { GltfCoreFeatureContext, GltfCoreFeatureHandler, Scene3DDocumentSkin } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

// Imports the optional top-level `skins` section and binds each referencing mesh after the bedrock mesh and
// node tables exist. JOINTS_0/WEIGHTS_0 remain bedrock vertex data; this handler owns only skeleton topology,
// inverse-bind matrices, and the mesh-to-skin relationship.
export const GltfSkinsCoreFeatureHandler: GltfCoreFeatureHandler = {
  apply(context) {
    context.document.skins.push(...buildGltfSkins(context));
    bindGltfSkins(context);
  },
  kind: 'skins',
};

function bindGltfSkins(context: Readonly<GltfCoreFeatureContext>): void {
  const nodes = context.source.nodes ?? [];
  for (let node = 0; node < nodes.length; node++) {
    const skinIndex = nodes[node].skin;
    const meshIndex = nodes[node].mesh;
    if (skinIndex === undefined || meshIndex === undefined) continue;
    const documentMeshIndices = context.meshIndices[meshIndex] ?? [];
    for (let mesh = 0; mesh < documentMeshIndices.length; mesh++) {
      context.document.meshes[documentMeshIndices[mesh]].skin = skinIndex;
    }
  }
}

// Builds the document's skin table: each glTF `skins[]` entry becomes a Scene3DDocumentSkin whose `joints` are
// document node indices and whose `inverseBind` is one Matrix4 per joint (identity when the accessor is absent).
function buildGltfSkins(context: Readonly<GltfCoreFeatureContext>): Scene3DDocumentSkin[] {
  return (context.source.skins ?? []).map((gltfSkin) => {
    const joints = gltfSkin.joints.map((jointNodeIndex) => context.nodeIndices[jointNodeIndex]);
    const inverseBind: { m: Float32Array }[] = [];
    if (gltfSkin.inverseBindMatrices !== undefined) {
      const matrices = context.readAccessor(gltfSkin.inverseBindMatrices, 'MAT4');
      if (matrices.fault !== null) {
        context.reportAccessorFault(ImportDiagnosticSeverity.Recover, matrices.fault);
        for (let joint = 0; joint < joints.length; joint++) inverseBind.push({ m: identityMatrix16() });
      } else if (matrices.count < joints.length) {
        context.reportDiagnostic(ImportDiagnosticSeverity.Recover, 'gltf.skin-ibm-count-mismatch', {
          firstActual: matrices.count,
          firstExpected: joints.length,
        });
        for (let joint = 0; joint < joints.length; joint++) inverseBind.push({ m: identityMatrix16() });
      } else {
        for (let joint = 0; joint < joints.length; joint++) {
          inverseBind.push({
            m: Float32Array.from({ length: 16 }, (_, component) => matrices.data[joint * 16 + component] ?? 0),
          });
        }
      }
    } else {
      for (let joint = 0; joint < joints.length; joint++) inverseBind.push({ m: identityMatrix16() });
    }
    return { inverseBind, joints };
  });
}

function identityMatrix16(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
