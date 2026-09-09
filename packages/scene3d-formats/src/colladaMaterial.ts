import { packLinearToColor } from '@flighthq/color/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createStandardPbrMaterial, getPbrRoughnessFromPhongShininess } from '@flighthq/materials/contract';
import type {
  ImageResourceReference,
  ImportDiagnostic,
  LinearColor,
  MaterialLike,
  StandardPbrMaterial,
  Texture,
  TextureColorSpace,
  XmlElement,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { createExternalTextureRef } from './shared';

/**
 * Appends COLLADA profile_COMMON materials to format-neutral document tables. `materialIndices`
 * receives each COLLADA material ID's index in `materials`, which lets later geometry/hierarchy
 * passes bind `instance_material` symbols without retaining XML nodes in the document.
 */
export function appendColladaMaterials(
  root: Readonly<XmlElement>,
  materials: MaterialLike[],
  resources: ImageResourceReference[],
  materialIndices: Map<string, number>,
  baseUrl: string | null = null,
  diagnostics?: ImportDiagnostic[],
): void {
  const images = indexElementsById(root, 'image');
  const effects = indexElementsById(root, 'effect');
  const missingReferences = new Set<string>();

  for (const effect of effects.values()) reportUnsupportedEffectProfiles(effect, diagnostics);

  for (const source of findDescendants(root, 'material')) {
    const materialId = source.attributes.id?.trim() ?? '';
    const instanceEffect = child(source, 'instance_effect');
    const effectId = referenceId(instanceEffect?.attributes.url);
    const effect = effectId === null ? null : (effects.get(effectId) ?? null);
    let material: StandardPbrMaterial;

    if (effect === null) {
      if (effectId !== null) {
        reportMissingReference(diagnostics, missingReferences, 'effect', effectId, materialId);
      }
      material = createStandardPbrMaterial();
    } else {
      material = convertColladaEffectToStandardPbrMaterial(
        effect,
        instanceEffect,
        images,
        resources,
        baseUrl,
        diagnostics,
        missingReferences,
      );
    }

    material.name = source.attributes.name?.trim() || materialId || null;
    const materialIndex = materials.length;
    materials.push(material);
    if (materialId !== '') materialIndices.set(materialId, materialIndex);
  }
}

function child(element: Readonly<XmlElement> | null | undefined, name: string): XmlElement | null {
  if (element === null || element === undefined) return null;
  return element.children.find((entry) => localName(entry.name) === name) ?? null;
}

function collectParameters(
  profile: Readonly<XmlElement>,
  technique: Readonly<XmlElement>,
  instanceEffect: Readonly<XmlElement> | null,
): Map<string, XmlElement> {
  const parameters = new Map<string, XmlElement>();
  appendParameters(parameters, profile, 'newparam', 'sid');
  appendParameters(parameters, technique, 'newparam', 'sid');
  if (instanceEffect !== null) appendParameters(parameters, instanceEffect, 'setparam', 'ref');
  return parameters;
}

function appendParameters(
  parameters: Map<string, XmlElement>,
  parent: Readonly<XmlElement>,
  elementName: string,
  attributeName: string,
): void {
  for (const parameter of parent.children) {
    if (localName(parameter.name) !== elementName) continue;
    const id = parameter.attributes[attributeName]?.trim();
    if (id !== undefined && id !== '') parameters.set(id, parameter);
  }
}

function convertColladaEffectToStandardPbrMaterial(
  effect: Readonly<XmlElement>,
  instanceEffect: Readonly<XmlElement> | null,
  images: ReadonlyMap<string, XmlElement>,
  resources: ImageResourceReference[],
  baseUrl: string | null,
  diagnostics: ImportDiagnostic[] | undefined,
  missingReferences: Set<string>,
): StandardPbrMaterial {
  const profile = child(effect, 'profile_COMMON');
  const technique = child(profile, 'technique');
  const shading = technique?.children.find((entry) => SUPPORTED_SHADING_MODELS.has(localName(entry.name))) ?? null;
  if (profile === null || technique === null || shading === null) {
    const declaredShading = technique?.children.find((entry) => SHADING_MODELS.has(localName(entry.name)));
    if (declaredShading !== undefined) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Skip,
        'collada.unsupported-shading-model',
        'appendColladaMaterials',
        { effect: effect.attributes.id ?? '', shadingModel: localName(declaredShading.name) },
      );
    }
    return createStandardPbrMaterial();
  }

  const parameters = collectParameters(profile, technique, instanceEffect);
  const diffuse = resolveColorProperty(child(shading, 'diffuse'), parameters, DEFAULT_DIFFUSE);
  const emission = resolveColorProperty(child(shading, 'emission'), parameters, DEFAULT_EMISSION);
  const opacity = resolveColladaOpacity(shading, parameters);
  diffuse[3] *= opacity;
  const shadingModel = localName(shading.name);
  const shininess = resolveFloatProperty(child(shading, 'shininess'), parameters, 0);
  const material = createStandardPbrMaterial({
    baseColor: packLinearToColor(diffuse),
    baseColorMap: resolveTextureProperty(
      child(shading, 'diffuse'),
      effect,
      parameters,
      images,
      resources,
      baseUrl,
      'srgb',
      diagnostics,
      missingReferences,
    ),
    emissive: packLinearToColor(emission),
    emissiveMap: resolveTextureProperty(
      child(shading, 'emission'),
      effect,
      parameters,
      images,
      resources,
      baseUrl,
      'srgb',
      diagnostics,
      missingReferences,
    ),
    metallic: 0,
    normalMap: resolveNormalTexture(
      profile,
      effect,
      parameters,
      images,
      resources,
      baseUrl,
      diagnostics,
      missingReferences,
    ),
    // Flight's canonical conversion is sqrt(2 / (shininess + 2)), clamped to [0, 1].
    roughness: shadingModel === 'lambert' ? 1 : getPbrRoughnessFromPhongShininess(shininess),
  });
  material.alphaMode = hasTransparency(shading) ? 'blend' : 'opaque';
  return material;
}

function findDescendants(element: Readonly<XmlElement>, name: string): XmlElement[] {
  const matches: XmlElement[] = [];
  for (const descendant of element.children) {
    if (localName(descendant.name) === name) matches.push(descendant);
    matches.push(...findDescendants(descendant, name));
  }
  return matches;
}

function findFirstDescendant(element: Readonly<XmlElement>, names: ReadonlySet<string>): XmlElement | null {
  for (const descendant of element.children) {
    if (names.has(localName(descendant.name))) return descendant;
    const nested = findFirstDescendant(descendant, names);
    if (nested !== null) return nested;
  }
  return null;
}

function hasTransparency(shading: Readonly<XmlElement>): boolean {
  return child(shading, 'transparent') !== null || child(shading, 'transparency') !== null;
}

function indexElementsById(root: Readonly<XmlElement>, name: string): Map<string, XmlElement> {
  const indexed = new Map<string, XmlElement>();
  for (const element of findDescendants(root, name)) {
    const id = element.attributes.id?.trim();
    if (id !== undefined && id !== '' && !indexed.has(id)) indexed.set(id, element);
  }
  return indexed;
}

function localName(name: string): string {
  const separator = name.lastIndexOf(':');
  return separator < 0 ? name : name.slice(separator + 1);
}

function parseNumbers(text: string): number[] {
  return text.trim().split(/\s+/).map(Number).filter(Number.isFinite);
}

function referenceId(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === '') return null;
  const hash = trimmed.lastIndexOf('#');
  return hash < 0 ? trimmed : trimmed.slice(hash + 1);
}

function reportMissingReference(
  diagnostics: ImportDiagnostic[] | undefined,
  reported: Set<string>,
  element: string,
  reference: string,
  owner: string,
): void {
  const key = `${element}\u0000${reference}\u0000${owner}`;
  if (reported.has(key)) return;
  reported.add(key);
  reportImportDiagnostic(
    diagnostics,
    ImportDiagnosticSeverity.Recover,
    'collada.missing-reference',
    'appendColladaMaterials',
    { element, owner, reference },
  );
}

function reportUnsupportedEffectProfiles(
  effect: Readonly<XmlElement>,
  diagnostics: ImportDiagnostic[] | undefined,
): void {
  for (const profile of effect.children) {
    const name = localName(profile.name);
    if (!name.startsWith('profile_') || name === 'profile_COMMON') continue;
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'collada.unsupported-profile',
      'appendColladaMaterials',
      { effect: effect.attributes.id ?? '', profile: name },
    );
  }
}

function resolveColladaOpacity(shading: Readonly<XmlElement>, parameters: ReadonlyMap<string, XmlElement>): number {
  const transparent = child(shading, 'transparent');
  const transparency = resolveFloatProperty(child(shading, 'transparency'), parameters, 1);
  const color = resolveColorProperty(transparent, parameters, DEFAULT_TRANSPARENT);
  if (transparent?.attributes.opaque === 'RGB_ZERO') {
    const luminance = color[0] * 0.212671 + color[1] * 0.71516 + color[2] * 0.072169;
    return clamp01(1 - luminance * transparency);
  }
  return clamp01(color[3] * transparency);
}

function resolveColorProperty(
  property: Readonly<XmlElement> | null,
  parameters: ReadonlyMap<string, XmlElement>,
  fallback: Readonly<LinearColor>,
): LinearColor {
  const value = resolvePropertyValue(property, parameters, COLOR_VALUE_NAMES);
  if (value === null) return [...fallback];
  const numbers = parseNumbers(value.text);
  if (numbers.length < 3) return [...fallback];
  return [numbers[0], numbers[1], numbers[2], numbers[3] ?? 1];
}

function resolveFloatProperty(
  property: Readonly<XmlElement> | null,
  parameters: ReadonlyMap<string, XmlElement>,
  fallback: number,
): number {
  const value = resolvePropertyValue(property, parameters, FLOAT_VALUE_NAMES);
  if (value === null) return fallback;
  const number = Number(value.text.trim());
  return Number.isFinite(number) ? number : fallback;
}

function resolveNormalTexture(
  profile: Readonly<XmlElement>,
  effect: Readonly<XmlElement>,
  parameters: ReadonlyMap<string, XmlElement>,
  images: ReadonlyMap<string, XmlElement>,
  resources: ImageResourceReference[],
  baseUrl: string | null,
  diagnostics: ImportDiagnostic[] | undefined,
  missingReferences: Set<string>,
): Texture | null {
  const normal = findFirstDescendant(profile, NORMAL_PROPERTY_NAMES);
  return resolveTextureProperty(
    normal,
    effect,
    parameters,
    images,
    resources,
    baseUrl,
    'linear',
    diagnostics,
    missingReferences,
  );
}

function resolvePropertyValue(
  property: Readonly<XmlElement> | null,
  parameters: ReadonlyMap<string, XmlElement>,
  valueNames: ReadonlySet<string>,
): XmlElement | null {
  if (property === null) return null;
  const direct = property.children.find((entry) => valueNames.has(localName(entry.name)));
  if (direct !== undefined) return direct;
  const parameter = child(property, 'param');
  const ref = parameter?.attributes.ref?.trim();
  if (ref === undefined || ref === '') return null;
  const definition = parameters.get(ref);
  return definition?.children.find((entry) => valueNames.has(localName(entry.name))) ?? null;
}

function resolveTextureProperty(
  property: Readonly<XmlElement> | null,
  effect: Readonly<XmlElement>,
  parameters: ReadonlyMap<string, XmlElement>,
  images: ReadonlyMap<string, XmlElement>,
  resources: ImageResourceReference[],
  baseUrl: string | null,
  colorSpace: TextureColorSpace,
  diagnostics: ImportDiagnostic[] | undefined,
  missingReferences: Set<string>,
): Texture | null {
  const textureElement = property === null ? null : findFirstDescendant(property, TEXTURE_ELEMENT_NAMES);
  const samplerId = textureElement?.attributes.texture?.trim();
  if (samplerId === undefined || samplerId === '') return null;
  const sampler = parameters.get(samplerId);
  if (sampler === undefined) {
    reportMissingReference(diagnostics, missingReferences, 'sampler2D', samplerId, effect.attributes.id ?? '');
    return null;
  }
  const surfaceId = child(child(sampler, 'sampler2D'), 'source')?.text.trim() ?? '';
  const surface = parameters.get(surfaceId);
  if (surface === undefined) {
    reportMissingReference(
      diagnostics,
      missingReferences,
      'surface',
      surfaceId || samplerId,
      effect.attributes.id ?? '',
    );
    return null;
  }
  const imageId = referenceId(child(child(surface, 'surface'), 'init_from')?.text);
  const image = imageId === null ? null : (images.get(imageId) ?? null);
  if (image === null) {
    reportMissingReference(diagnostics, missingReferences, 'image', imageId ?? surfaceId, effect.attributes.id ?? '');
    return null;
  }
  const uri = child(image, 'init_from')?.text.trim() || child(child(image, 'init_from'), 'ref')?.text.trim() || '';
  if (uri === '') {
    reportMissingReference(diagnostics, missingReferences, 'image', imageId ?? '', effect.attributes.id ?? '');
    return null;
  }
  const texture = createExternalTextureRef(uri, baseUrl, resources);
  texture.colorSpace = colorSpace;
  return texture;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

const COLOR_VALUE_NAMES = new Set(['color', 'float3', 'float4']);
const DEFAULT_DIFFUSE: LinearColor = [1, 1, 1, 1];
const DEFAULT_EMISSION: LinearColor = [0, 0, 0, 1];
const DEFAULT_TRANSPARENT: LinearColor = [1, 1, 1, 1];
const FLOAT_VALUE_NAMES = new Set(['float']);
const NORMAL_PROPERTY_NAMES = new Set(['bump', 'normal']);
const SHADING_MODELS = new Set(['blinn', 'constant', 'lambert', 'phong']);
const SUPPORTED_SHADING_MODELS = new Set(['blinn', 'lambert', 'phong']);
const TEXTURE_ELEMENT_NAMES = new Set(['texture']);
