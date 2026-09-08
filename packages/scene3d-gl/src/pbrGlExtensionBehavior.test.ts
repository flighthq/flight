import {
  createAnisotropyPbrExtension,
  createClearcoatPbrExtension,
  createIridescencePbrExtension,
  createSheenPbrExtension,
  createSpecularPbrExtension,
  createTransmissionVolumePbrExtension,
  createWrappedDiffusePbrExtension,
} from '@flighthq/materials/contract';
import type {
  GlPbrExtensionBindContext,
  GlPbrExtensionRegistration,
  PbrExtension,
  PbrUvSet,
  Texture,
} from '@flighthq/types/contract';

import { anisotropyPbrGlExtension } from './anisotropyPbrGlExtension';
import { clearcoatPbrGlExtension } from './clearcoatPbrGlExtension';
import { iridescencePbrGlExtension } from './iridescencePbrGlExtension';
import { sheenPbrGlExtension } from './sheenPbrGlExtension';
import { specularPbrGlExtension } from './specularPbrGlExtension';
import { transmissionVolumePbrGlExtension } from './transmissionVolumePbrGlExtension';
import { wrappedDiffusePbrGlExtension } from './wrappedDiffusePbrGlExtension';

interface ExpectedMap {
  name: string;
  texture: Texture;
  uvSet: PbrUvSet;
}

interface ExtensionCase {
  colors: Readonly<Record<string, number>>;
  extension: PbrExtension;
  floats: Readonly<Record<string, number>>;
  maps: readonly ExpectedMap[];
  name: string;
  registration: GlPbrExtensionRegistration;
  transmissionSceneColor: boolean;
}

interface TextureBindCall {
  samplerUniform: string;
  texture: Readonly<Texture> | null;
  uvSet: PbrUvSet;
  uvSetUniform: string;
  uvTransformUniform: string;
}

describe('PBR extension binding behavior', () => {
  it.each(createCases())('$name binds every scalar, color, map, UV set, and transform independently', (testCase) => {
    const calls = createBindRecorder();

    testCase.registration.bind(calls.context, testCase.extension);

    expect(Object.fromEntries(calls.floats)).toEqual(testCase.floats);
    expect(Object.fromEntries(calls.colors)).toEqual(testCase.colors);
    expect(calls.transmissionSceneColorCount).toBe(testCase.transmissionSceneColor ? 1 : 0);
    expect(calls.textures).toEqual(
      testCase.maps.map(({ name, texture, uvSet }) => ({
        samplerUniform: `u_flight${name}Map`,
        texture,
        uvSet,
        uvSetUniform: `u_flight${name}MapUvSet`,
        uvTransformUniform: `u_flight${name}MapTransform`,
      })),
    );
  });
});

describe('PBR extension map shader behavior', () => {
  it.each(createCases())('$name samples every ready map through its own UV selector and transform', (testCase) => {
    const ready = new Set(testCase.maps.map((value) => value.texture));
    const contribution = testCase.registration.createShaderContribution(
      {
        hasTransmissionSceneColor: () => testCase.transmissionSceneColor,
        isTextureReady: (texture) => texture !== null && ready.has(texture as Texture),
      },
      testCase.extension,
    );
    const source = `${contribution.fragmentDeclarations}\n${contribution.fragmentFunctions}\n${contribution.applySurface}\n${contribution.contributePunctual}\n${contribution.contributeIbl}\n${contribution.finalize}`;

    expect(contribution.textureCount).toBe(testCase.maps.length + Number(testCase.transmissionSceneColor));
    for (const { name } of testCase.maps) {
      expect(source).toContain(`uniform sampler2D u_flight${name}Map`);
      expect(source).toContain(`u_flight${name}MapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0`);
      expect(source).toContain(`u_flight${name}MapTransform * vec3(uv, 1.0)`);
      expect(source).toContain(`texture(u_flight${name}Map`);
    }
  });

  it.each(createCases())('$name omits map uniforms and texture units when no map is ready', (testCase) => {
    const contribution = testCase.registration.createShaderContribution(
      { hasTransmissionSceneColor: () => false, isTextureReady: () => false },
      testCase.extension,
    );

    expect(contribution.textureCount).toBe(0);
    for (const { name } of testCase.maps) {
      expect(contribution.fragmentDeclarations).not.toContain(`u_flight${name}Map`);
    }
  });
});

function createBindRecorder(): {
  colors: [string, number][];
  context: GlPbrExtensionBindContext;
  floats: [string, number][];
  readonly transmissionSceneColorCount: number;
  textures: TextureBindCall[];
} {
  const colors: [string, number][] = [];
  const floats: [string, number][] = [];
  const textures: TextureBindCall[] = [];
  let transmissionSceneColorCount = 0;
  return {
    colors,
    context: {
      bindTexture(samplerUniform, uvSetUniform, uvTransformUniform, texture, uvSet): boolean {
        textures.push({ samplerUniform, texture, uvSet, uvSetUniform, uvTransformUniform });
        return true;
      },
      bindTransmissionSceneColor(): boolean {
        transmissionSceneColorCount++;
        return true;
      },
      setFloat(uniform, value): void {
        floats.push([uniform, value]);
      },
      setLinearColor(uniform, color): void {
        colors.push([uniform, color]);
      },
    },
    floats,
    get transmissionSceneColorCount(): number {
      return transmissionSceneColorCount;
    },
    textures,
  };
}

function createCases(): ExtensionCase[] {
  const anisotropy = map('anisotropy');
  const clearcoat = map('clearcoat');
  const clearcoatRoughness = map('clearcoat-roughness');
  const clearcoatNormal = map('clearcoat-normal');
  const iridescence = map('iridescence');
  const iridescenceThickness = map('iridescence-thickness');
  const sheenColor = map('sheen-color');
  const sheenRoughness = map('sheen-roughness');
  const specular = map('specular');
  const specularColor = map('specular-color');
  const transmission = map('transmission');
  const transmissionThickness = map('transmission-thickness');
  const wrappedDiffuse = map('wrapped-diffuse');
  const wrappedDiffuseThickness = map('wrapped-diffuse-thickness');

  return [
    {
      colors: {},
      extension: createAnisotropyPbrExtension({
        anisotropyMap: anisotropy,
        anisotropyMapUvSet: 1,
        anisotropyRotation: 0.7,
        anisotropyStrength: 0.6,
      }),
      floats: { u_flightAnisotropyRotation: 0.7, u_flightAnisotropyStrength: 0.6 },
      maps: [{ name: 'Anisotropy', texture: anisotropy, uvSet: 1 }],
      name: 'anisotropy',
      registration: anisotropyPbrGlExtension,
      transmissionSceneColor: false,
    },
    {
      colors: {},
      extension: createClearcoatPbrExtension({
        clearcoat: 0.8,
        clearcoatMap: clearcoat,
        clearcoatMapUvSet: 1,
        clearcoatNormalMap: clearcoatNormal,
        clearcoatNormalMapUvSet: 1,
        clearcoatNormalScale: 0.5,
        clearcoatRoughness: 0.3,
        clearcoatRoughnessMap: clearcoatRoughness,
        clearcoatRoughnessMapUvSet: 0,
      }),
      floats: {
        u_flightClearcoat: 0.8,
        u_flightClearcoatNormalScale: 0.5,
        u_flightClearcoatRoughness: 0.3,
      },
      maps: [
        { name: 'Clearcoat', texture: clearcoat, uvSet: 1 },
        { name: 'ClearcoatRoughness', texture: clearcoatRoughness, uvSet: 0 },
        { name: 'ClearcoatNormal', texture: clearcoatNormal, uvSet: 1 },
      ],
      name: 'clearcoat',
      registration: clearcoatPbrGlExtension,
      transmissionSceneColor: false,
    },
    {
      colors: {},
      extension: createIridescencePbrExtension({
        iridescence: 0.75,
        iridescenceIor: 1.4,
        iridescenceMap: iridescence,
        iridescenceMapUvSet: 0,
        iridescenceThicknessMap: iridescenceThickness,
        iridescenceThicknessMapUvSet: 1,
        iridescenceThicknessMax: 700,
        iridescenceThicknessMin: 200,
      }),
      floats: {
        u_flightIridescence: 0.75,
        u_flightIridescenceIor: 1.4,
        u_flightIridescenceThicknessMax: 700,
        u_flightIridescenceThicknessMin: 200,
      },
      maps: [
        { name: 'Iridescence', texture: iridescence, uvSet: 0 },
        { name: 'IridescenceThickness', texture: iridescenceThickness, uvSet: 1 },
      ],
      name: 'iridescence',
      registration: iridescencePbrGlExtension,
      transmissionSceneColor: false,
    },
    {
      colors: { u_flightSheenColor: 0x804020ff },
      extension: createSheenPbrExtension({
        sheenColor: 0x804020ff,
        sheenColorMap: sheenColor,
        sheenColorMapUvSet: 1,
        sheenRoughness: 0.4,
        sheenRoughnessMap: sheenRoughness,
        sheenRoughnessMapUvSet: 0,
      }),
      floats: { u_flightSheenRoughness: 0.4 },
      maps: [
        { name: 'SheenColor', texture: sheenColor, uvSet: 1 },
        { name: 'SheenRoughness', texture: sheenRoughness, uvSet: 0 },
      ],
      name: 'sheen',
      registration: sheenPbrGlExtension,
      transmissionSceneColor: false,
    },
    {
      colors: { u_flightSpecularColor: 0x406080ff },
      extension: createSpecularPbrExtension({
        specular: 0.65,
        specularColor: 0x406080ff,
        specularColorMap: specularColor,
        specularColorMapUvSet: 0,
        specularMap: specular,
        specularMapUvSet: 1,
      }),
      floats: { u_flightSpecular: 0.65 },
      maps: [
        { name: 'Specular', texture: specular, uvSet: 1 },
        { name: 'SpecularColor', texture: specularColor, uvSet: 0 },
      ],
      name: 'specular',
      registration: specularPbrGlExtension,
      transmissionSceneColor: false,
    },
    {
      colors: { u_flightAttenuationColor: 0x204060ff },
      extension: createTransmissionVolumePbrExtension({
        attenuationColor: 0x204060ff,
        attenuationDistance: 9,
        ior: 1.45,
        thickness: 0.25,
        thicknessMap: transmissionThickness,
        thicknessMapUvSet: 1,
        transmission: 0.85,
        transmissionMap: transmission,
        transmissionMapUvSet: 0,
      }),
      floats: {
        u_flightAttenuationDistance: 9,
        u_flightTransmission: 0.85,
        u_flightTransmissionIor: 1.45,
        u_flightTransmissionThickness: 0.25,
      },
      maps: [
        { name: 'Transmission', texture: transmission, uvSet: 0 },
        { name: 'TransmissionThickness', texture: transmissionThickness, uvSet: 1 },
      ],
      name: 'transmission-volume',
      registration: transmissionVolumePbrGlExtension,
      transmissionSceneColor: true,
    },
    {
      colors: { u_flightWrappedDiffuseColor: 0x608040ff },
      extension: createWrappedDiffusePbrExtension({
        thickness: 0.35,
        thicknessMap: wrappedDiffuseThickness,
        thicknessMapUvSet: 0,
        wrappedDiffuseColor: 0x608040ff,
        wrappedDiffuseMap: wrappedDiffuse,
        wrappedDiffuseMapUvSet: 1,
        wrappedDiffuseStrength: 0.9,
      }),
      floats: { u_flightWrappedDiffuseStrength: 0.9, u_flightWrappedDiffuseThickness: 0.35 },
      maps: [
        { name: 'WrappedDiffuse', texture: wrappedDiffuse, uvSet: 1 },
        { name: 'WrappedDiffuseThickness', texture: wrappedDiffuseThickness, uvSet: 0 },
      ],
      name: 'wrapped-diffuse',
      registration: wrappedDiffusePbrGlExtension,
      transmissionSceneColor: false,
    },
  ];
}

function map(name: string): Texture {
  return { name } as unknown as Texture;
}
