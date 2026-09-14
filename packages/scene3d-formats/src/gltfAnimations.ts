import { createAnimationTrack } from '@flighthq/animation/contract';
import type {
  AnimationInterpolation,
  GltfCoreFeatureContext,
  GltfCoreFeatureHandler,
  Scene3DAnimationPath,
  Scene3DDocumentAnimation,
  Scene3DDocumentAnimationChannel,
  Scene3DDocumentMesh,
  Scene3DDocumentNode,
} from '@flighthq/types/contract';
import {
  ImportDiagnosticSeverity,
  Scene3DAnimationPathRotation,
  Scene3DAnimationPathScale,
  Scene3DAnimationPathTranslation,
  Scene3DAnimationPathWeights,
} from '@flighthq/types/contract';

// Imports the optional top-level `animations` section after the bedrock mesh/node decomposition exists.
// Its kind is the source JSON member itself, so registration and skip diagnostics use the asset author's
// vocabulary rather than a Flight-only alias.
export const GltfAnimationsCoreFeatureHandler: GltfCoreFeatureHandler = {
  apply(context) {
    context.document.animations.push(...buildGltfAnimations(context));
  },
  kind: 'animations',
};

// Builds the document's animation table. Each glTF animation becomes a Scene3DDocumentAnimation whose channels
// carry a document node index + Scene3DAnimationPath + a sampled AnimationTrack. A `weights` (morph) channel
// fans out to each morphable mesh node the target produced (the group's per-primitive children, or the leaf
// mesh node itself), its track width set to that mesh's morph-target count.
function buildGltfAnimations(context: Readonly<GltfCoreFeatureContext>): Scene3DDocumentAnimation[] {
  const animations: Scene3DDocumentAnimation[] = [];
  const gltfAnimations = context.source.animations ?? [];
  for (let a = 0; a < gltfAnimations.length; a++) {
    const animation = gltfAnimations[a];
    const channels: Scene3DDocumentAnimationChannel[] = [];
    let duration = 0;
    for (const channel of animation.channels) {
      const targetNodeIndex = channel.target.node;
      if (targetNodeIndex === undefined || context.nodeIndices[targetNodeIndex] === undefined) {
        context.reportDiagnostic(ImportDiagnosticSeverity.Drop, 'gltf.animation-target-unresolved', {
          firstTarget: targetNodeIndex ?? -1,
        });
        continue;
      }
      const sampler = animation.samplers[channel.sampler];
      if (sampler === undefined) {
        context.reportDiagnostic(ImportDiagnosticSeverity.Drop, 'gltf.animation-missing-sampler', {
          firstSampler: channel.sampler,
        });
        continue;
      }
      const inputResult = context.readAccessor(sampler.input, 'SCALAR');
      const outputResult = context.readAccessor(sampler.output, GLTF_ANIMATION_OUTPUT_TYPES[channel.target.path]);
      if (inputResult.fault !== null || outputResult.fault !== null) {
        context.reportAccessorFault(ImportDiagnosticSeverity.Drop, inputResult.fault ?? outputResult.fault!);
        continue;
      }
      const times = inputResult.data;
      const values = outputResult.data;
      if (inputResult.count === 0 || outputResult.count === 0) {
        context.reportDiagnostic(ImportDiagnosticSeverity.Drop, 'gltf.animation-sampler-empty', {
          firstSampler: channel.sampler,
        });
        continue;
      }
      const cubic = sampler.interpolation === 'CUBICSPLINE';
      if (channel.target.path !== 'weights' && outputResult.count !== (cubic ? 3 : 1) * inputResult.count) {
        context.reportDiagnostic(ImportDiagnosticSeverity.Drop, 'gltf.animation-sampler-cardinality', {
          firstSampler: channel.sampler,
        });
        continue;
      }
      duration = Math.max(duration, times.length > 0 ? times[times.length - 1] : 0);

      if (channel.target.path === 'weights') {
        const meshNodeIndices =
          context.primitiveNodeIndices[targetNodeIndex].length > 0
            ? context.primitiveNodeIndices[targetNodeIndex]
            : [context.nodeIndices[targetNodeIndex]];
        appendGltfWeightsChannels(
          context,
          channels,
          meshNodeIndices,
          context.document.nodes,
          context.document.meshes,
          times,
          values,
          sampler.interpolation,
        );
        continue;
      }
      const path = GLTF_ANIMATION_PATHS[channel.target.path];
      if (path === undefined) {
        context.reportDiagnostic(ImportDiagnosticSeverity.Skip, 'gltf.animation-unsupported-path', {
          firstPath: channel.target.path,
        });
        continue;
      }
      const quaternion = path === Scene3DAnimationPathRotation;
      const track = createAnimationTrack({
        components: quaternion ? 4 : 3,
        interpolation: GLTF_SAMPLER_INTERPOLATIONS[sampler.interpolation ?? 'LINEAR'],
        quaternion,
        times,
        values,
      });
      channels.push({ node: context.nodeIndices[targetNodeIndex], path, track });
    }
    if (channels.length > 0) animations.push({ channels, duration, name: animation.name ?? `animation${a}` });
  }
  return animations;
}

function appendGltfWeightsChannels(
  context: Readonly<GltfCoreFeatureContext>,
  channels: Scene3DDocumentAnimationChannel[],
  meshNodeIndices: readonly number[],
  nodes: readonly Scene3DDocumentNode[],
  meshes: readonly Scene3DDocumentMesh[],
  times: ArrayLike<number>,
  values: ArrayLike<number>,
  interpolation: string | undefined,
): void {
  const perKey = interpolation === 'CUBICSPLINE' ? 3 : 1;
  let bound = 0;
  let cardinalityDropped = false;
  for (let i = 0; i < meshNodeIndices.length; i++) {
    const meshIndex = nodes[meshNodeIndices[i]]?.mesh;
    const morph = meshIndex !== undefined ? meshes[meshIndex]?.morph : null;
    if (morph == null || morph.targets.length === 0) continue;
    if (values.length !== perKey * times.length * morph.targets.length) {
      context.reportDiagnostic(ImportDiagnosticSeverity.Drop, 'gltf.weights-cardinality-mismatch', {
        firstActual: values.length,
        firstExpected: perKey * times.length * morph.targets.length,
      });
      cardinalityDropped = true;
      continue;
    }
    const track = createAnimationTrack({
      components: morph.targets.length,
      interpolation: GLTF_SAMPLER_INTERPOLATIONS[interpolation ?? 'LINEAR'],
      times,
      values,
    });
    channels.push({ node: meshNodeIndices[i], path: Scene3DAnimationPathWeights, track });
    bound++;
  }
  if (bound === 0 && !cardinalityDropped) {
    context.reportDiagnostic(ImportDiagnosticSeverity.Drop, 'gltf.weights-no-morphable-mesh');
  }
}

const GLTF_ANIMATION_PATHS: Record<string, Scene3DAnimationPath | undefined> = {
  rotation: Scene3DAnimationPathRotation,
  scale: Scene3DAnimationPathScale,
  translation: Scene3DAnimationPathTranslation,
};

const GLTF_ANIMATION_OUTPUT_TYPES: Record<string, string | undefined> = {
  rotation: 'VEC4',
  scale: 'VEC3',
  translation: 'VEC3',
  weights: 'SCALAR',
};

const GLTF_SAMPLER_INTERPOLATIONS: Record<string, AnimationInterpolation> = {
  CUBICSPLINE: 'Cubic',
  LINEAR: 'Linear',
  STEP: 'Step',
};
