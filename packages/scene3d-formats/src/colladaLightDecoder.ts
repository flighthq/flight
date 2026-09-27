import { packLinearToColor } from '@flighthq/color/contract';
import { createTransform3D, decomposeMatrix4ToTransform3D } from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import {
  createAmbientLight,
  createDirectionalLight,
  createPointLight,
  createSpotLight,
} from '@flighthq/lighting/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';
import type {
  ColladaDeferredLightBinding,
  ColladaElementDecoder,
  ColladaLightDefinition,
  ColladaLightKind,
  ImportDiagnostic,
  Light,
  Scene3DDocument,
  XmlElement,
} from '@flighthq/types/contract';

import { buildColladaNodeWorldMatrices } from './colladaSceneShared.ts';
import { colladaChild, colladaChildren, colladaIdOf, colladaLocalName } from './colladaXml.ts';

// Decodes the reusable light definitions without adding uninstantiated library entries to the document.
// A null value records an ID whose definition was present but malformed, so an instance of it is skipped
// without also being mislabeled as a missing reference.
function parseColladaLightDefinitions(
  root: XmlElement,
  diagnostics: ImportDiagnostic[],
): Map<string, ColladaLightDefinition | null> {
  const definitions = new Map<string, ColladaLightDefinition | null>();
  for (const lightElement of colladaChildren(colladaChild(root, 'library_lights'), 'light')) {
    const id = colladaIdOf(lightElement);
    if (id === null || id.length === 0) {
      reportMalformedColladaLight(diagnostics, '(missing)', 'id');
      continue;
    }
    definitions.set(id, parseColladaLightDefinition(lightElement, id, diagnostics));
  }
  return definitions;
}

function parseColladaLightDefinition(
  lightElement: XmlElement,
  id: string,
  diagnostics: ImportDiagnostic[],
): ColladaLightDefinition | null {
  const techniqueCommon = colladaChild(lightElement, 'technique_common');
  if (techniqueCommon === undefined) {
    reportMalformedColladaLight(diagnostics, id, 'technique_common');
    return null;
  }
  const techniques = techniqueCommon.children.filter((entry) => {
    const name = colladaLocalName(entry);
    return name === 'ambient' || name === 'directional' || name === 'point' || name === 'spot';
  });
  if (techniques.length !== 1) {
    reportMalformedColladaLight(diagnostics, id, 'type');
    return null;
  }

  const technique = techniques[0];
  const kind = colladaLocalName(technique) as ColladaLightKind;
  const colorValues = parseFiniteNumberList(colladaChild(technique, 'color'));
  if (colorValues === null || colorValues.length !== 3 || colorValues.some((value) => value < 0)) {
    reportMalformedColladaLight(diagnostics, id, 'color');
    return null;
  }

  // Flight stores radiance as packed color × intensity. Pull HDR energy out of COLLADA's unbounded
  // linear RGB so packing does not clip it, while ordinary [0, 1] colors retain unit intensity.
  const colorIntensity = Math.max(1, colorValues[0], colorValues[1], colorValues[2]);
  const color = packLinearToColor([
    colorValues[0] / colorIntensity,
    colorValues[1] / colorIntensity,
    colorValues[2] / colorIntensity,
    1,
  ]);
  const definition: ColladaLightDefinition = {
    color,
    decay: 0,
    innerConeDegrees: 0,
    intensity: colorIntensity,
    kind,
    name: lightElement.attributes.name,
    outerConeDegrees: 0,
    spotBlend: 0,
  };

  if (kind === 'point' || kind === 'spot') {
    const constant = parseNonnegativeColladaLightScalar(technique, 'constant_attenuation', 1, id, diagnostics);
    const linear = parseNonnegativeColladaLightScalar(technique, 'linear_attenuation', 0, id, diagnostics);
    const quadratic = parseNonnegativeColladaLightScalar(technique, 'quadratic_attenuation', 0, id, diagnostics);
    if (constant === null || linear === null || quadratic === null) return null;
    const denominatorAtUnitDistance = constant + linear + quadratic;
    if (!(denominatorAtUnitDistance > 0)) {
      reportMalformedColladaLight(diagnostics, id, 'attenuation');
      return null;
    }

    // COLLADA uses 1/(c + l*d + q*d²), while Flight has intensity/d^decay. Matching the value and
    // logarithmic slope at d=1 gives an exact mapping whenever only one coefficient is non-zero and a
    // stable local approximation for mixed polynomials.
    definition.intensity *= 1 / denominatorAtUnitDistance;
    definition.decay = (linear + 2 * quadratic) / denominatorAtUnitDistance;
    if ([constant, linear, quadratic].filter((value) => value > 0).length > 1) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.light-attenuation-approximated',
        'parseColladaLightDefinition',
        { constant, light: id, linear, quadratic },
      );
    }
  }

  if (kind === 'spot') {
    const angle = parseNonnegativeColladaLightScalar(technique, 'falloff_angle', 180, id, diagnostics);
    const exponent = parseNonnegativeColladaLightScalar(technique, 'falloff_exponent', 0, id, diagnostics);
    if (angle === null || exponent === null) return null;
    if (angle > 180) {
      reportMalformedColladaLight(diagnostics, id, 'falloff_angle');
      return null;
    }
    // COLLADA states a full cone aperture; Flight stores half-angles. Its normalized blend has no
    // unbounded exponent representation, so x/(x+1) preserves zero and orders every finite exponent.
    definition.outerConeDegrees = angle / 2;
    definition.spotBlend = exponent / (exponent + 1);
  }

  return definition;
}

function parseNonnegativeColladaLightScalar(
  parent: XmlElement,
  name: string,
  defaultValue: number,
  id: string,
  diagnostics: ImportDiagnostic[],
): number | null {
  const element = colladaChild(parent, name);
  if (element === undefined) return defaultValue;
  const values = parseFiniteNumberList(element);
  if (values === null || values.length !== 1 || values[0] < 0) {
    reportMalformedColladaLight(diagnostics, id, name);
    return null;
  }
  return values[0];
}

function parseFiniteNumberList(element: XmlElement | undefined): number[] | null {
  if (element === undefined) return null;
  const tokens = element.text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const values = tokens.map(Number);
  return values.every(Number.isFinite) ? values : null;
}

function reportMalformedColladaLight(diagnostics: ImportDiagnostic[], light: string, field: string): void {
  reportImportDiagnostic(
    diagnostics,
    ImportDiagnosticSeverity.Drop,
    'collada.light-malformed',
    'parseColladaLightDefinition',
    { field, light },
  );
}

function resolveColladaLights(
  document: Scene3DDocument,
  deferred: readonly ColladaDeferredLightBinding[],
  definitions: ReadonlyMap<string, ColladaLightDefinition | null>,
  rootNodeIndices: readonly number[],
  diagnostics: ImportDiagnostic[],
): void {
  const worldMatrices = buildColladaNodeWorldMatrices(document.nodes, rootNodeIndices);
  for (const binding of deferred) {
    if (!binding.url.startsWith('#') || binding.url.length === 1) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.missing-reference',
        'resolveColladaLights',
        { element: 'instance_light', url: binding.url },
      );
      continue;
    }
    const id = binding.url.slice(1);
    const definition = definitions.get(id);
    if (definition === undefined) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.missing-reference',
        'resolveColladaLights',
        { element: 'instance_light', url: binding.url },
      );
      continue;
    }
    if (definition === null) continue;
    const worldMatrix = worldMatrices[binding.nodeIndex];
    if (worldMatrix === undefined) continue;
    const transform = createTransform3D();
    decomposeMatrix4ToTransform3D(transform, worldMatrix);
    document.lights.push({
      descriptor: createColladaLight(definition),
      name: definition.name,
      node: binding.nodeIndex,
      transform,
    });
  }
}

function createColladaLight(definition: Readonly<ColladaLightDefinition>): Light {
  const common = { color: definition.color, intensity: definition.intensity };
  if (definition.kind === 'ambient') return createAmbientLight(common);
  if (definition.kind === 'directional') {
    return createDirectionalLight({ ...common, direction: { x: 0, y: 0, z: -1 } });
  }
  if (definition.kind === 'point') {
    return createPointLight({ ...common, decay: definition.decay, range: -1 });
  }
  return createSpotLight({
    ...common,
    decay: definition.decay,
    direction: { x: 0, y: 0, z: -1 },
    innerConeDegrees: definition.innerConeDegrees,
    outerConeDegrees: definition.outerConeDegrees,
    range: -1,
    spotBlend: definition.spotBlend,
  });
}

export const colladaLightDecoder: ColladaElementDecoder = {
  // Same shape as cameras: a light is declared in a library and seated by a node, so the seating waits for the
  // walk. Second phase, preserving the sequence the single function ran.
  build(context) {
    resolveColladaLights(
      context.parse.document,
      context.deferredLights,
      context.parse.lightDefinitions,
      context.rootNodeIndices,
      context.parse.diagnostics,
    );
  },
  buildPhase: 20,
  decode(context) {
    for (const [id, definition] of parseColladaLightDefinitions(context.root, context.diagnostics)) {
      context.lightDefinitions.set(id, definition);
    }
  },
  elements: ['light'],
  features: ['Light', 'Light.Ambient', 'Light.Directional', 'Light.Point', 'Light.Spot'],
};
