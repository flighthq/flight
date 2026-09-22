import { detectImageMimeType } from '@flighthq/image-codec/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createShadedMaterial } from '@flighthq/shading/contract';
import type {
  Awd2BlockHandler,
  Awd2ParsedMaterial,
  Awd2ParsedTexture,
  ImportDiagnostic,
  Material,
  Material3D,
  MaterialLike,
  Scene3DDocument,
  Texture,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import {
  readAwdProperties,
  readAwdPropertyFloat32,
  readAwdPropertyNumber,
  readAwdPropertyUint32,
  readAwdString,
} from './awd2Reader';
import {
  AWD2_BLOCK_MATERIAL,
  AWD2_BLOCK_TEXTURE,
  AWD2_MATERIAL_DEFAULT_GLOSS,
  AWD2_MATERIAL_DEFAULT_SPECULAR_RGB,
  AWD2_MATERIAL_DEFAULT_SPECULAR_STRENGTH,
  AWD2_MATERIAL_PROP_ALPHA,
  AWD2_MATERIAL_PROP_COLOR,
  AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE,
  AWD2_MATERIAL_PROP_GLOSS,
  AWD2_MATERIAL_PROP_NORMAL_TEXTURE,
  AWD2_MATERIAL_PROP_SPECULAR_COLOR,
  AWD2_MATERIAL_PROP_SPECULAR_STRENGTH,
  AWD2_MATERIAL_PROP_SPECULAR_TEXTURE,
  AWD2_TEXTURE_TYPE_EMBEDDED,
} from './awd2Schema';
import { createEmbeddedTextureRef, createExternalTextureRef } from './shared';

// Materials and the textures they sample. This handler owns the only reach into @flighthq/shading and the
// image-codec chain, so a build that loads geometry and scene structure without registering it carries
// neither — its mesh instances simply come back with no materials, which is what a file referencing a
// material block nobody parsed would produce anyway.
//
// The build phase installs a resolver on the state rather than producing document content directly: a
// material becomes a document entry only when a mesh instance asks for it, so a file's unused materials
// cost nothing and the scene-structure handler needs no import from here.

export const awd2MaterialHandler: Awd2BlockHandler = {
  blockTypes: [AWD2_BLOCK_MATERIAL],
  parse(state, block) {
    const material = parseMaterialBlock(block.view, block.source, block.dataStart, block.dataEnd, state.diagnostics);
    if (material !== null) state.materials.set(block.blockId, material);
  },
  build(state) {
    // One Flight Material per AWD material block, shared across every subset that references it (and so
    // one Texture and one Image per shared texture), keyed by block id.
    const resolved = new Map<number, number>();
    state.resolveMaterial = (materialId: number): number =>
      resolveAwdMaterial(materialId, state.materials, state.textures, resolved, state.document, state.diagnostics);
  },
};

// Textures are pure data: parsed into the state and read by material resolution, never built from on
// their own. A build that registers this without the material handler carries the payloads and resolves
// nothing, which is what a file whose materials were all absent would produce.
export const awd2TextureHandler: Awd2BlockHandler = {
  blockTypes: [AWD2_BLOCK_TEXTURE],
  parse(state, block) {
    const texture = parseTextureBlock(block.view, block.source, block.dataStart, block.dataEnd, state.diagnostics);
    if (texture !== null) state.textures.set(block.blockId, texture);
  },
};

// Parses a Material block (type 81). Layout:
// name(VarString) → matType(uint8) → numMethods(uint8) → PropertyList → methods → UserAttrList.
// The base PropertyList carries the flat color (property 1), diffuse texture id (property 2), normal
// texture id (property 3), alpha (property 10), and the specular tuple — strength (18), gloss (19),
// color (20), and specular texture id (21) — the properties Flight maps onto the ShadedMaterial
// base. `numMethods` is captured so the resolver can record a diagnostic that a method-bearing material's shading methods
// (fog/env/fresnel in Away3D's MethodMaterial model) are not yet imported as modifiers; the
// method bodies themselves (which follow the base PropertyList) are left unwalked pending a real
// method-bearing fixture and the verified AWD2 method-type layout — every AWD2 asset in the reference
// corpus is `numMethods == 0`, so there is nothing to observe or test the walk against yet.
function parseMaterialBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  diagnostics?: ImportDiagnostic[],
): Awd2ParsedMaterial | null {
  let offset = start;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.material-truncated',
      'parseMaterialBlock',
      {
        field: 'name',
      },
    );
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.material-truncated',
      'parseMaterialBlock',
      {
        field: 'type',
      },
    );
    return null;
  }
  offset += 1; // matType (uint8) — texture vs color is inferred from which properties are present
  const numMethods = source[offset];
  offset += 1; // numMethods (uint8)

  const props = readAwdProperties(view, offset, end);
  const diffuseTextureId = readAwdPropertyUint32(view, props.values, AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE) ?? 0;
  const normalTextureId = readAwdPropertyUint32(view, props.values, AWD2_MATERIAL_PROP_NORMAL_TEXTURE) ?? 0;
  const specularTextureId = readAwdPropertyUint32(view, props.values, AWD2_MATERIAL_PROP_SPECULAR_TEXTURE) ?? 0;
  const color = readAwdPropertyUint32(view, props.values, AWD2_MATERIAL_PROP_COLOR);
  const alpha = readAwdPropertyFloat32(view, props.values, AWD2_MATERIAL_PROP_ALPHA);
  // Gloss and specular strength are AWD "property numbers": the exporter picks float32 or float64, so
  // the width comes from each record's own byte-length prefix rather than the file's wide-properties flag.
  const gloss = readAwdPropertyNumber(view, props.values, AWD2_MATERIAL_PROP_GLOSS);
  const specularColor = readAwdPropertyUint32(view, props.values, AWD2_MATERIAL_PROP_SPECULAR_COLOR);
  const specularStrength = readAwdPropertyNumber(view, props.values, AWD2_MATERIAL_PROP_SPECULAR_STRENGTH);

  return {
    alpha,
    color,
    diffuseTextureId,
    gloss,
    name: nameResult.value,
    normalTextureId,
    numMethods,
    specularColor,
    specularStrength,
    specularTextureId,
  };
}

// Parses a Texture block (type 82). Layout:
// name(VarString) → texType(uint8) → dataLen(uint32) → data(dataLen bytes) → PropertyList → UserAttrList.
// The embedded form carries a self-describing image payload (PNG/JPEG/…); the external form stores a
// URL Flight cannot fetch at parse time and is returned as an unresolved (byte-less) slot.
function parseTextureBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  diagnostics?: ImportDiagnostic[],
): Awd2ParsedTexture | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 2 > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.texture-truncated', 'parseTextureBlock', {
      field: 'name',
    });
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 5 > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.texture-truncated', 'parseTextureBlock', {
      field: 'payload',
    });
    return null;
  }
  const texType = (source as Uint8Array)[offset];
  offset += 1;
  const dataLen = dv.getUint32(offset, true);
  offset += 4;

  if (offset + dataLen > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.texture-truncated', 'parseTextureBlock', {
      bytes: dataLen,
      field: 'data',
    });
    return null;
  }

  if (texType !== AWD2_TEXTURE_TYPE_EMBEDDED) {
    // AWD's external form carries the image URL as the block name; emit it as an External ref for
    // the resolver to fetch, rather than dropping it.
    return {
      bytes: null,
      mimeType: null,
      name: nameResult.value,
      url: nameResult.value,
    };
  }

  const bytes = (source as Uint8Array).slice(offset, offset + dataLen);
  const mimeType = detectImageMimeType(bytes);
  if (mimeType === null) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'awd2.texture-unrecognized-format',
      'parseTextureBlock',
    );
    return { bytes: null, mimeType: null, name: nameResult.value, url: null };
  }

  return { bytes, mimeType, name: nameResult.value, url: null };
}

// Resolves an AWD material block id to a document material INDEX (appended to `document.materials`),
// memoized so a material shared by several subsets registers one entry (and one Texture/Image per
// shared texture). An EXISTING material block ALWAYS produces a ShadedMaterial — a block with no base
// properties (no color, no textures, alpha-only, or method-only) is a valid material and defaults to
// opaque white, honoring the uniform-ShadedMaterial rule. Only the sentinel id 0 (subset declares no
// material) and a referenced-but-missing block id return -1 (the assembler resolves that to a null material).
//
// AWD materials import as ShadedMaterial UNIFORMLY — including numMethods=0 (empty modifiers[]). AWD's
// material model is a MethodMaterial = a BlinnPhong base + a METHODS ARRAY; ShadedMaterial (base + an
// ordered modifiers[]) is its structural image. An empty stack honestly encodes a method-less material
// and compiles to the same base program as BlinnPhong (zero pixel cost), while (a) preserving losslessness
// if a file/exporter DOES carry methods, and (b) letting a demo author reproduce the original Away3D look
// by APPENDING a fresnel/fog modifier — no material-kind conversion. Do NOT collapse method-less materials
// to BlinnPhong: that discards the format's array-shaped intent to save a type. (Callers who genuinely want
// the leaner kind can down-convert a modifier-less ShadedMaterial to BlinnPhong themselves.)
//
// A method-bearing material (numMethods > 0) records a Skip diagnostic and imports its base only: the AWD2 method-block layout
// is unverified in-sandbox (the whole reference corpus is numMethods=0), so shipping a blind method→modifier
// walk would be speculative. The base carries color(1), diffuseTex(2), normalTex(3), alpha(10), and the
// specular tuple strength(18)/gloss(19)/specularColor(20)/specularTex(21).
//
// The specular tuple is a BASE property group, not a method. AwayJS's parseMaterial_v1 reads all four keys
// off the material's own property list and configures `mat.specularMethod` from them, so a numMethods=0
// material still carries a full specular description — and an ABSENT key means AwayJS's default, not an
// absent term. That is why gloss defaults to 50 rather than createShadedMaterial's own 32: importing a
// shambler material at 32 widens every highlight the file authored tight.
//
// Away3D's separate specular STRENGTH scalar has no Flight counterpart, so it folds into the packed
// `specular` RGB. That is exact rather than approximate: both backends' shaded fragment path multiplies
// the specular term by `specular.rgb` (then by the specular map) and nothing else reads the channel, so
// color × strength and color-then-scale-by-strength are the same product. A strength above 1 cannot
// survive the fold — packed RGBA is 8-bit unsigned — so it clamps and records a diagnostic.
function resolveAwdMaterial(
  materialId: number,
  materialBlocks: Readonly<Map<number, Awd2ParsedMaterial>>,
  textureBlocks: Readonly<Map<number, Awd2ParsedTexture>>,
  cache: Map<number, number>,
  document: Scene3DDocument,
  diagnostics?: ImportDiagnostic[],
): number {
  if (materialId === 0) return -1;
  const cached = cache.get(materialId);
  if (cached !== undefined) return cached;

  const parsed = materialBlocks.get(materialId);
  if (parsed === undefined) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.material-missing', 'resolveAwdMaterial', {
      material: materialId,
    });
    cache.set(materialId, -1);
    return -1;
  }

  const diffuseTexture =
    parsed.diffuseTextureId !== 0
      ? resolveAwdTexture(parsed.diffuseTextureId, textureBlocks, document, diagnostics)
      : null;
  const normalTexture =
    parsed.normalTextureId !== 0
      ? resolveAwdTexture(parsed.normalTextureId, textureBlocks, document, diagnostics)
      : null;
  if (normalTexture !== null) normalTexture.colorSpace = 'linear';
  // The specular map keeps the default 'srgb': Away3D samples it as a plain color multiplier on the
  // specular term, exactly as the diffuse map is sampled — it is not a linear data mask.
  const specularTexture =
    parsed.specularTextureId !== 0
      ? resolveAwdTexture(parsed.specularTextureId, textureBlocks, document, diagnostics)
      : null;

  // A method-bearing material imports its base only (see the header note) — record a diagnostic rather than silently drop.
  if (parsed.numMethods > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'awd2.material-methods-unsupported',
      'resolveAwdMaterial',
      { methods: parsed.numMethods },
    );
  }

  const diffuse = getAwdDiffuseRgba(parsed.color, parsed.alpha);
  const strength = parsed.specularStrength ?? AWD2_MATERIAL_DEFAULT_SPECULAR_STRENGTH;
  if (strength > 1) {
    reportImportDiagnostic(
      diagnostics,
      // Recover: the clamped value IS written — createShadedMaterial below builds from it. The kind name
      // says clamped and a substitute stands in, so this was never an ignored feature.
      ImportDiagnosticSeverity.Recover,
      'awd2.material-specular-strength-clamped',
      'resolveAwdMaterial',
      { strength },
    );
  }
  const material = createShadedMaterial({
    diffuse,
    diffuseMap: diffuseTexture,
    normalMap: normalTexture,
    shininess: parsed.gloss ?? AWD2_MATERIAL_DEFAULT_GLOSS,
    specular: getAwdSpecularRgba(parsed.specularColor, strength),
    specularMap: specularTexture,
  }) as unknown as Material;
  // An alpha below 1 must actually blend; ShadedMaterial defaults to opaque coverage.
  if (parsed.alpha !== null && parsed.alpha < 1) (material as unknown as Material3D).alphaMode = 'blend';
  // Preserve the AWD material block name as the material's authored name (empty → anonymous).
  material.name = parsed.name.length > 0 ? parsed.name : null;
  const index = document.materials.length;
  document.materials.push(material as unknown as MaterialLike);
  cache.set(materialId, index);
  return index;
}

// Resolves an AWD texture block id to a Flight Texture carrying an unresolved ImageResourceReference, or
// null when the texture is missing or its embedded payload was an unrecognized image format. The
// parser references — it does not decode: an embedded block emits an Embedded ref holding the encoded
// bytes; an external block emits an External ref holding the URL. The Texture's `image` stays null
// until @flighthq/scene3d-resources resolves the ref.
function resolveAwdTexture(
  textureId: number,
  textureBlocks: Readonly<Map<number, Awd2ParsedTexture>>,
  document: Scene3DDocument,
  diagnostics?: ImportDiagnostic[],
): Texture | null {
  const parsed = textureBlocks.get(textureId);
  if (parsed === undefined) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.texture-missing', 'resolveAwdTexture', {
      texture: textureId,
    });
    return null;
  }
  if (parsed.bytes !== null && parsed.mimeType !== null) {
    return createEmbeddedTextureRef(parsed.bytes, parsed.mimeType, document.resources);
  }
  if (parsed.url !== null) {
    return createExternalTextureRef(parsed.url, null, document.resources);
  }
  return null;
}

// Packs an AWD material's diffuse into a Flight 0xrrggbbaa color. AWD stores the color as 24-bit 0xrrggbb
// (property 1) and opacity as a separate float32 alpha (property 10); Flight folds them into one packed
// RGBA. A missing color defaults to white, a missing alpha to fully opaque.
function getAwdDiffuseRgba(color: number | null, alpha: number | null): number {
  const rgb = color ?? 0xffffff;
  const alphaByte = alpha !== null ? Math.max(0, Math.min(255, Math.round(alpha * 255))) : 0xff;
  return (((rgb << 8) >>> 0) | alphaByte) >>> 0;
}

// Packs AWD's specular tuple into ShadedMaterial's single packed-RGBA `specular`, folding Away3D's
// separate strength scalar into the channels (see the resolveAwdMaterial note for why that product is
// exact). Alpha stays opaque: nothing in either backend's shaded path reads the specular alpha channel.
function getAwdSpecularRgba(color: number | null, strength: number): number {
  const rgb = color ?? AWD2_MATERIAL_DEFAULT_SPECULAR_RGB;
  const scale = Math.max(0, Math.min(1, strength));
  const red = Math.round(((rgb >>> 16) & 0xff) * scale);
  const green = Math.round(((rgb >>> 8) & 0xff) * scale);
  const blue = Math.round((rgb & 0xff) * scale);
  return ((red << 24) | (green << 16) | (blue << 8) | 0xff) >>> 0;
}
