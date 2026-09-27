import { createAnimationTrack } from '@flighthq/animation/contract';
import {
  createMatrix4,
  createTransform3D,
  decomposeMatrix4ToTransform3D,
  setMatrix4,
} from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';
import type {
  AnimationInterpolation,
  ColladaDecodedAnimationChannel,
  ColladaElementDecoder,
  ImportDiagnostic,
  Scene3DAnimationPath,
  Scene3DDocument,
  Scene3DDocumentAnimationChannel,
  XmlElement,
} from '@flighthq/types/contract';
import { parseXmlDocument } from '@flighthq/xml/contract';

import { child, descendants, idOf, numbers } from './colladaXml.ts';

/** Internal Arc 6a seam; channel targets remain authored ID/SID paths for later hierarchy binding. */
export function decodeColladaAnimations(
  xml: string,
  diagnostics: ImportDiagnostic[] = [],
): ColladaDecodedAnimationChannel[] {
  const root = parseXmlDocument(xml);
  if (!root) return [];
  return decodeColladaAnimationsFromRoot(root, diagnostics);
}

function decodeColladaAnimationsFromRoot(
  root: XmlElement,
  diagnostics: ImportDiagnostic[],
): ColladaDecodedAnimationChannel[] {
  const out: ColladaDecodedAnimationChannel[] = [];
  for (const animation of descendants(root, 'animation')) {
    const values = new Map<string, string[] | number[]>();
    for (const source of animation.children.filter((e) => e.name === 'source')) {
      const id = idOf(source);
      const arr = child(source, 'float_array') ?? child(source, 'Name_array');
      if (id && arr)
        values.set(id, arr.name === 'float_array' ? numbers(arr) : arr.text.trim().split(/\s+/).filter(Boolean));
    }
    const sampler = child(animation, 'sampler');
    const channel = child(animation, 'channel');
    if (!sampler || !channel) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.missing-reference',
        'decodeColladaAnimations',
        { element: 'sampler/channel' },
      );
      continue;
    }
    const input = sampler.children.find((e) => e.name === 'input' && e.attributes.semantic === 'INPUT');
    const output = sampler.children.find((e) => e.name === 'input' && e.attributes.semantic === 'OUTPUT');
    const interp = sampler.children.find((e) => e.name === 'input' && e.attributes.semantic === 'INTERPOLATION');
    const times = (values.get(input?.attributes.source?.replace(/^#/, '') ?? '') as number[] | undefined) ?? [];
    const outputValues = (values.get(output?.attributes.source?.replace(/^#/, '') ?? '') as number[] | undefined) ?? [];
    const interpolation =
      (values.get(interp?.attributes.source?.replace(/^#/, '') ?? '') as string[] | undefined) ?? [];
    for (const mode of interpolation)
      if (mode !== 'LINEAR' && mode !== 'STEP' && mode !== 'BEZIER')
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Skip,
          'collada.unsupported-interpolation',
          'decodeColladaAnimations',
          { interpolation: mode },
        );
    if (!times.length || !outputValues.length) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.missing-reference',
        'decodeColladaAnimations',
        { element: 'animation source' },
      );
      continue;
    }
    out.push({
      target: channel.attributes.target ?? '',
      times,
      values: outputValues,
      interpolation,
      inTangents: [],
      outTangents: [],
    });
  }
  return out;
}

function resolveColladaAnimations(
  document: Scene3DDocument,
  channels: readonly ColladaDecodedAnimationChannel[],
  nodeIdMap: ReadonlyMap<string, number>,
  diagnostics: ImportDiagnostic[],
): void {
  if (channels.length === 0) return;

  const resolvedChannels: Scene3DDocumentAnimationChannel[] = [];
  let duration = 0;

  for (const ch of channels) {
    const slashIndex = ch.target.indexOf('/');
    if (slashIndex < 0) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Skip,
        'collada.unsupported-animation-target',
        'parseCollada',
        { target: ch.target },
      );
      continue;
    }
    const nodeId = ch.target.slice(0, slashIndex);
    const property = ch.target.slice(slashIndex + 1);

    const nodeIndex = nodeIdMap.get(nodeId);
    if (nodeIndex === undefined) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'collada.animation-target-unresolved',
        'parseCollada',
        { target: ch.target },
      );
      continue;
    }

    const interp = mapColladaInterpolation(ch.interpolation);
    const maxTime = ch.times.length > 0 ? ch.times[ch.times.length - 1] : 0;

    if (property === 'matrix' || property === 'transform') {
      if (ch.values.length < ch.times.length * 16) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Drop,
          'collada.animation-cardinality',
          'parseCollada',
          { target: ch.target, expected: ch.times.length * 16, actual: ch.values.length },
        );
        continue;
      }
      const tValues: number[] = [];
      const rValues: number[] = [];
      const sValues: number[] = [];
      for (let k = 0; k < ch.times.length; k++) {
        const offset = k * 16;
        const rv = ch.values;
        // Row-major → column-major, then decompose.
        setMatrix4(
          __scratch,
          rv[offset],
          rv[offset + 4],
          rv[offset + 8],
          rv[offset + 12],
          rv[offset + 1],
          rv[offset + 5],
          rv[offset + 9],
          rv[offset + 13],
          rv[offset + 2],
          rv[offset + 6],
          rv[offset + 10],
          rv[offset + 14],
          rv[offset + 3],
          rv[offset + 7],
          rv[offset + 11],
          rv[offset + 15],
        );
        const trs = createTransform3D();
        decomposeMatrix4ToTransform3D(trs, __scratch);
        tValues.push(trs.position.x, trs.position.y, trs.position.z);
        rValues.push(trs.rotation.x, trs.rotation.y, trs.rotation.z, trs.rotation.w);
        sValues.push(trs.scale.x, trs.scale.y, trs.scale.z);
      }
      resolvedChannels.push(
        {
          node: nodeIndex,
          path: 'Translation',
          track: createAnimationTrack({ components: 3, interpolation: interp, times: ch.times, values: tValues }),
        },
        {
          node: nodeIndex,
          path: 'Rotation',
          track: createAnimationTrack({
            components: 4,
            interpolation: interp,
            quaternion: true,
            times: ch.times,
            values: rValues,
          }),
        },
        {
          node: nodeIndex,
          path: 'Scale',
          track: createAnimationTrack({ components: 3, interpolation: interp, times: ch.times, values: sValues }),
        },
      );
      duration = Math.max(duration, maxTime);
      continue;
    }

    let path: Scene3DAnimationPath;
    let components: number;
    let quaternion = false;
    let values: ArrayLike<number> = ch.values;

    if (property === 'translate' || property === 'translation') {
      path = 'Translation';
      components = 3;
    } else if (property === 'scale') {
      path = 'Scale';
      components = 3;
    } else if (property.endsWith('.ANGLE')) {
      const axisName = property.slice(0, -6);
      let ax = 0;
      let ay = 0;
      let az = 0;
      if (axisName === 'rotateX' || axisName === 'rotationX') ax = 1;
      else if (axisName === 'rotateY' || axisName === 'rotationY') ay = 1;
      else if (axisName === 'rotateZ' || axisName === 'rotationZ') az = 1;
      else {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Skip,
          'collada.unsupported-animation-target',
          'parseCollada',
          { target: ch.target },
        );
        continue;
      }
      path = 'Rotation';
      components = 4;
      quaternion = true;
      const qValues: number[] = [];
      for (let k = 0; k < ch.values.length; k++) {
        const halfRad = ((ch.values[k] * Math.PI) / 180) * 0.5;
        const s = Math.sin(halfRad);
        qValues.push(ax * s, ay * s, az * s, Math.cos(halfRad));
      }
      values = qValues;
    } else {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Skip,
        'collada.unsupported-animation-target',
        'parseCollada',
        { target: ch.target },
      );
      continue;
    }

    resolvedChannels.push({
      node: nodeIndex,
      path,
      track: createAnimationTrack({ components, interpolation: interp, quaternion, times: ch.times, values }),
    });
    duration = Math.max(duration, maxTime);
  }

  if (resolvedChannels.length > 0) {
    document.animations.push({ channels: resolvedChannels, duration });
  }
}

function mapColladaInterpolation(modes: readonly string[]): AnimationInterpolation {
  if (modes.length === 0) return 'Linear';
  const first = modes[0];
  if (modes.every((m) => m === first)) {
    if (first === 'STEP') return 'Step';
    if (first === 'BEZIER') return 'Linear';
    return 'Linear';
  }
  return 'Linear';
}

export const colladaAnimationDecoder: ColladaElementDecoder = {
  // Last: a channel addresses a node by the id map every earlier phase has finished populating.
  build(context) {
    resolveColladaAnimations(
      context.parse.document,
      context.parse.animationChannels,
      context.nodeIdMap,
      context.parse.diagnostics,
    );
  },
  buildPhase: 40,
  decode(context) {
    context.animationChannels.push(...decodeColladaAnimationsFromRoot(context.root, context.diagnostics));
  },
  elements: ['animation'],
  features: ['Animation'],
};

// A scratch matrix for decomposing a channel's sampled transforms. Local to this module: the parser used to share
// one, which is exactly the kind of incidental coupling that kept animation code in the orchestrator.
const __scratch = createMatrix4();
