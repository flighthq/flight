import {
  createOrbitCameraController,
  rotateOrbitCameraController,
  updateOrbitCameraController,
} from '@flighthq/camera-controls';
import { createSceneNode } from '@flighthq/scene';
import type { BlinnPhongMaterial, Camera3D, SceneLightsLike, Surface, Texture } from '@flighthq/sdk';
import {
  addNodeChild,
  createAmbientLight,
  createBlinnPhongMaterial,
  createBoxMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createMesh,
  createPerspectiveProjection,
  createPlaneMeshGeometry,
  createPointLight,
  createSampler,
  createSphereMeshGeometry,
  createSurface,
  createTexture,
  createTorusMeshGeometry,
  createVector2,
  createVector3,
  invalidateNodeLocalTransform,
  normalizeVector3,
  SceneNodeKind,
  setQuaternionFromEuler,
} from '@flighthq/sdk';

import { render, scale } from './render';

interface MaterialMaps {
  diffuse: Texture;
  normal: Texture;
  specular: Texture;
}

const logicalWidth = 800 / scale;
const logicalHeight = 600 / scale;

function createMaterialMaps(kind: 'stripe' | 'tile' | 'weave', repeat: number): MaterialMaps {
  const diffuseSurface = createSurface(128, 128);
  const normalSurface = createSurface(128, 128);
  const specularSurface = createSurface(128, 128);
  fillMaterialSurfaces(diffuseSurface, normalSurface, specularSurface, kind);
  const sampler = createSampler({ anisotropy: 4, wrapU: 'repeat', wrapV: 'repeat' });
  const uvScale = createVector2(repeat, repeat);
  return {
    diffuse: createTexture({ image: diffuseSurface, sampler, uvScale }),
    normal: createTexture({ colorSpace: 'linear', image: normalSurface, sampler, uvScale }),
    specular: createTexture({ colorSpace: 'linear', image: specularSurface, sampler, uvScale }),
  };
}

function fillMaterialSurfaces(
  diffuse: Surface,
  normal: Surface,
  specular: Surface,
  kind: 'stripe' | 'tile' | 'weave',
): void {
  for (let y = 0; y < diffuse.height; y++) {
    for (let x = 0; x < diffuse.width; x++) {
      const offset = (y * diffuse.width + x) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      let nx = 128;
      let ny = 128;
      let shine = 128;

      if (kind === 'stripe') {
        const band = Math.floor(x / 18) % 4;
        const colors = [
          [232, 64, 48],
          [245, 190, 48],
          [54, 158, 222],
          [245, 245, 230],
        ];
        [r, g, b] = colors[band];
        nx = 128 + Math.round(Math.sin((x / 18) * Math.PI * 2) * 18);
        shine = band === 3 ? 225 : 150;
      } else if (kind === 'tile') {
        const grout = x % 24 < 2 || y % 24 < 2;
        const alternate = (Math.floor(x / 24) + Math.floor(y / 24)) % 2 === 0;
        r = grout ? 28 : alternate ? 164 : 105;
        g = grout ? 32 : alternate ? 114 : 71;
        b = grout ? 40 : alternate ? 72 : 48;
        nx = grout ? 108 : 128;
        ny = grout ? 108 : 128;
        shine = grout ? 38 : alternate ? 190 : 120;
      } else {
        const warp = Math.sin((x / 10) * Math.PI);
        const weft = Math.sin((y / 10) * Math.PI);
        const crossing = warp * weft;
        r = 48 + Math.round((crossing + 1) * 34);
        g = 86 + Math.round((warp + 1) * 38);
        b = 122 + Math.round((weft + 1) * 42);
        nx = 128 + Math.round(warp * 42);
        ny = 128 + Math.round(weft * 42);
        shine = 95 + Math.round(Math.abs(crossing) * 140);
      }

      writePixel(diffuse, offset, r, g, b);
      writePixel(normal, offset, nx, ny, 246);
      writePixel(specular, offset, shine, shine, shine);
    }
  }
}

function writePixel(surface: Surface, offset: number, r: number, g: number, b: number): void {
  surface.data[offset] = r;
  surface.data[offset + 1] = g;
  surface.data[offset + 2] = b;
  surface.data[offset + 3] = 255;
}

function createMappedMaterial(maps: Readonly<MaterialMaps>, shininess: number): BlinnPhongMaterial {
  return createBlinnPhongMaterial({
    diffuse: 0xffffffff,
    diffuseMap: maps.diffuse,
    normalMap: maps.normal,
    normalScale: 0.75,
    shininess,
    specular: 0xffffffff,
    specularMap: maps.specular,
  });
}

const tileMaps = createMaterialMaps('tile', 3);
const stripeMaps = createMaterialMaps('stripe', 1);
const weaveMaps = createMaterialMaps('weave', 4);

const scene = createSceneNode(SceneNodeKind);

const floor = createMesh(createPlaneMeshGeometry(10, 8, 8, 8), [createMappedMaterial(tileMaps, 42)]);
floor.position.y = -1.35;
invalidateNodeLocalTransform(floor);
addNodeChild(scene, floor);

const sphere = createMesh(createSphereMeshGeometry(1.05, 48, 32), [createMappedMaterial(stripeMaps, 76)]);
sphere.position.x = 2.55;
sphere.position.y = -0.15;
invalidateNodeLocalTransform(sphere);
addNodeChild(scene, sphere);

const cube = createMesh(createBoxMeshGeometry(1.75, 1.75, 1.75), [createMappedMaterial(tileMaps, 58)]);
cube.position.x = 0.15;
cube.position.y = -0.45;
cube.position.z = -0.25;
invalidateNodeLocalTransform(cube);
addNodeChild(scene, cube);

const torusMaterial = createMappedMaterial(weaveMaps, 96);
torusMaterial.doubleSided = true;
const torus = createMesh(createTorusMeshGeometry(1.05, 0.34, 32, 56), [torusMaterial]);
torus.position.x = -2.55;
torus.position.y = -0.25;
setQuaternionFromEuler(torus.rotation, Math.PI * 0.38, 0, 0);
invalidateNodeLocalTransform(torus);
addNodeChild(scene, torus);

const camera: Camera3D = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
const cameraController = createOrbitCameraController({
  azimuth: 0.08,
  distance: 10.2,
  polar: 0.3,
  smoothTime: 0.16,
  target: createVector3(0, -0.2, 0),
});

const directionalDirection = createVector3(-0.8, -1, -0.35);
normalizeVector3(directionalDirection, directionalDirection);
const lights: SceneLightsLike = {
  ambient: createAmbientLight({ color: 0x506080ff, intensity: 0.16 }),
  directional: createDirectionalLight({
    color: 0xffe4c2ff,
    direction: directionalDirection,
    intensity: 2.2,
  }),
  point: [
    createPointLight({
      color: 0x4fd9ffff,
      intensity: 18,
      position: createVector3(-2.2, 2.4, 2.2),
      range: 9,
    }),
  ],
};

let previousTime = performance.now();
let lightAngle = 0;
let cubeAngle = 0;

function enterFrame(now: number): void {
  const deltaTime = Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;

  rotateOrbitCameraController(cameraController, deltaTime * 0.09, 0);
  updateOrbitCameraController(cameraController, camera, deltaTime);

  lightAngle += deltaTime * 0.34;
  const pointLight = lights.point![0];
  pointLight.position.x = Math.cos(lightAngle) * 3.8;
  pointLight.position.z = Math.sin(lightAngle) * 3.8;

  cubeAngle += deltaTime * 0.22;
  setQuaternionFromEuler(cube.rotation, 0, cubeAngle, 0);
  invalidateNodeLocalTransform(cube);

  render(scene, camera, lights);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
