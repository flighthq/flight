import {
  createOrbitCameraController,
  orbitCameraController,
  updateOrbitCameraController,
} from '@flighthq/camera-controls';
import { createSceneHit, pickScene } from '@flighthq/picking';
import { createSceneNode } from '@flighthq/scene';
import type { Camera3D, Mesh, SceneLightsLike, StandardPbrMaterial } from '@flighthq/sdk';
import {
  addNodeChild,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createMesh,
  createPerspectiveProjection,
  createSphereMeshGeometry,
  createStandardPbrMaterial,
  createTorusMeshGeometry,
  createVector3,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  normalizeVector3,
  SceneNodeKind,
  setQuaternionFromEuler,
} from '@flighthq/sdk';

import { canvas, render, scale } from './render';

interface Pickable {
  baseColor: number;
  material: StandardPbrMaterial;
  mesh: Mesh;
}

const logicalWidth = 800 / scale;
const logicalHeight = 600 / scale;
const scene = createSceneNode(SceneNodeKind);
const pickables: Pickable[] = [];
const colors = [0xe95f6dff, 0x44c6d8ff, 0xf1af4bff, 0x8d71eaff, 0x62c979ff, 0xe076b4ff];

for (let row = 0; row < 3; row++) {
  for (let column = 0; column < 3; column++) {
    const index = row * 3 + column;
    const baseColor = colors[index % colors.length];
    const material = createStandardPbrMaterial({ baseColor, metallic: 0.15, roughness: 0.3 });
    const geometry =
      index % 3 === 0
        ? createBoxMeshGeometry(1.05, 1.05, 1.05)
        : index % 3 === 1
          ? createSphereMeshGeometry(0.62, 28, 20)
          : createTorusMeshGeometry(0.52, 0.2, 20, 32);
    const mesh = createMesh(geometry, [material]);
    mesh.position.x = (column - 1) * 1.75;
    mesh.position.y = (1 - row) * 1.55;
    mesh.position.z = ((column + row) % 2) * 0.42 - 0.2;
    setQuaternionFromEuler(mesh.rotation, row * 0.18, column * 0.22, index * 0.13);
    invalidateNodeLocalTransform(mesh);
    addNodeChild(scene, mesh);
    pickables.push({ baseColor, material, mesh });
  }
}

const camera: Camera3D = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
const controller = createOrbitCameraController({
  azimuth: 0,
  distance: 8.8,
  polar: 0.05,
  smoothTime: 0.15,
  target: createVector3(0, 0, 0),
});
const direction = createVector3(-0.6, -1, -0.8);
normalizeVector3(direction, direction);
const lights: SceneLightsLike = {
  ambient: createAmbientLight({ color: 0x7890b8ff, intensity: 0.3 }),
  directional: createDirectionalLight({ color: 0xffead2ff, direction, intensity: 3.2 }),
};

const hit = createSceneHit();
const pickableMeshes = new Set(pickables.map((item) => item.mesh));
let hovered: Mesh | null = null;
let selected: Mesh | null = pickables[4].mesh;

function refreshColors(): void {
  for (let i = 0; i < pickables.length; i++) {
    const item = pickables[i];
    item.material.baseColor = item.mesh === selected ? 0xffd84dff : item.mesh === hovered ? 0x67f0ffff : item.baseColor;
    item.material.emissive = item.mesh === selected ? 0xffa51fff : item.mesh === hovered ? 0x23a9d8ff : 0x000000ff;
    item.material.emissiveStrength = item.mesh === selected ? 0.35 : item.mesh === hovered ? 0.22 : 0;
    invalidateNodeAppearance(item.mesh);
  }
}

function pickPointer(event: PointerEvent): Mesh | null {
  const bounds = canvas.getBoundingClientRect();
  const screenX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  const screenY = 1 - ((event.clientY - bounds.top) / bounds.height) * 2;
  return (
    pickScene(scene, camera, screenX, screenY, hit, {
      predicate: (mesh) => pickableMeshes.has(mesh),
    })?.node ?? null
  );
}

canvas.addEventListener('pointermove', (event) => {
  hovered = pickPointer(event);
  canvas.style.cursor = hovered === null ? 'default' : 'pointer';
  refreshColors();
});
canvas.addEventListener('pointerleave', () => {
  hovered = null;
  canvas.style.cursor = 'default';
  refreshColors();
});
canvas.addEventListener('click', (event) => {
  selected = pickPointer(event);
  refreshColors();
});
refreshColors();

let previousTime = performance.now();
function enterFrame(now: number): void {
  const deltaTime = Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;
  orbitCameraController(controller, deltaTime * 0.035, 0);
  updateOrbitCameraController(controller, camera, deltaTime);
  render(scene, camera, lights);
  requestAnimationFrame(enterFrame);
}
requestAnimationFrame(enterFrame);
