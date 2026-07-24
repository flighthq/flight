import {
  getMeshGeometryIndexCount,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexNormal,
  getMeshGeometryVertexPosition,
  getMeshGeometryVertexUv0,
} from '@flighthq/mesh';
import { getNodeChildren } from '@flighthq/node';
import { isMesh } from '@flighthq/scene';
import type { BlinnPhongMaterial, ExternalImageResourceReference, Mesh, SceneNode } from '@flighthq/types';
import { BlinnPhongMaterialKind } from '@flighthq/types';
import {
  THREE_DS_CHUNK_HEADER_BYTES,
  THREE_DS_COLOR_BYTE,
  THREE_DS_COLOR_FLOAT,
  THREE_DS_EDITOR,
  THREE_DS_FACE_MATERIAL,
  THREE_DS_FACES,
  THREE_DS_MAIN,
  THREE_DS_MATERIAL,
  THREE_DS_MATERIAL_BUMP_MAP,
  THREE_DS_MATERIAL_DIFFUSE,
  THREE_DS_MATERIAL_NAME,
  THREE_DS_MATERIAL_SHININESS,
  THREE_DS_MATERIAL_SPECULAR,
  THREE_DS_MATERIAL_TEXTURE_FILENAME,
  THREE_DS_MATERIAL_TEXTURE_MAP,
  THREE_DS_MATERIAL_TRANSPARENCY,
  THREE_DS_OBJECT,
  THREE_DS_PERCENT_INT,
  THREE_DS_SMOOTH_GROUP,
  THREE_DS_TRIMESH,
  THREE_DS_UV_COORDS,
  THREE_DS_VERTICES,
} from '@flighthq/types';

import { createSceneFrom3ds, parse3ds } from './threeDsParse';

// Builds a minimal valid 3DS binary from helper functions. The 3DS format is a recursive chunk tree:
// each chunk has a uint16 ID + uint32 length (including the 6-byte header) + payload.

function writeChunk(id: number, payload: Uint8Array): Uint8Array {
  const total = THREE_DS_CHUNK_HEADER_BYTES + payload.byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, id, true);
  view.setUint32(2, total, true);
  out.set(payload, THREE_DS_CHUNK_HEADER_BYTES);
  return out;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (let i = 0; i < arrays.length; i++) totalLength += arrays[i].byteLength;
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (let i = 0; i < arrays.length; i++) {
    result.set(arrays[i], offset);
    offset += arrays[i].byteLength;
  }
  return result;
}

function writeNullTerminatedString(s: string): Uint8Array {
  const out = new Uint8Array(s.length + 1);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  out[s.length] = 0;
  return out;
}

// Builds a vertex sub-chunk (0x4110): uint16 count + count * 3 * float32 (x, y, z in Z-up).
function writeVertices(positions: readonly number[]): Uint8Array {
  const count = positions.length / 3;
  const payload = new Uint8Array(2 + count * 3 * 4);
  const view = new DataView(payload.buffer);
  view.setUint16(0, count, true);
  let offset = 2;
  for (let i = 0; i < positions.length; i++) {
    view.setFloat32(offset, positions[i], true);
    offset += 4;
  }
  return writeChunk(THREE_DS_VERTICES, payload);
}

// Builds a face sub-chunk (0x4120): uint16 count + count * 4 * uint16 (v0, v1, v2, flags).
function writeFaces(indices: readonly number[]): Uint8Array {
  const count = indices.length / 3;
  const payload = new Uint8Array(2 + count * 4 * 2);
  const view = new DataView(payload.buffer);
  view.setUint16(0, count, true);
  let offset = 2;
  for (let i = 0; i < count; i++) {
    view.setUint16(offset, indices[i * 3], true);
    view.setUint16(offset + 2, indices[i * 3 + 1], true);
    view.setUint16(offset + 4, indices[i * 3 + 2], true);
    view.setUint16(offset + 6, 0, true); // flags
    offset += 8;
  }
  return writeChunk(THREE_DS_FACES, payload);
}

// Builds a UV sub-chunk (0x4140): uint16 count + count * 2 * float32 (u, v).
function writeUvCoords(uvs: readonly number[]): Uint8Array {
  const count = uvs.length / 2;
  const payload = new Uint8Array(2 + count * 2 * 4);
  const view = new DataView(payload.buffer);
  view.setUint16(0, count, true);
  let offset = 2;
  for (let i = 0; i < uvs.length; i++) {
    view.setFloat32(offset, uvs[i], true);
    offset += 4;
  }
  return writeChunk(THREE_DS_UV_COORDS, payload);
}

// Builds a complete 3DS file with one or more meshes.
function buildTriangle3ds(
  name: string,
  positions: readonly number[],
  indices: readonly number[],
  uvs?: readonly number[],
): Uint8Array {
  const trimeshPayload =
    uvs !== undefined
      ? concatBytes(writeVertices(positions), writeFaces(indices), writeUvCoords(uvs))
      : concatBytes(writeVertices(positions), writeFaces(indices));

  const trimesh = writeChunk(THREE_DS_TRIMESH, trimeshPayload);
  const objectPayload = concatBytes(writeNullTerminatedString(name), trimesh);
  const object = writeChunk(THREE_DS_OBJECT, objectPayload);
  const editor = writeChunk(THREE_DS_EDITOR, object);
  return writeChunk(THREE_DS_MAIN, editor);
}

function buildMultiMesh3ds(
  meshes: readonly { indices: readonly number[]; name: string; positions: readonly number[] }[],
): Uint8Array {
  const objects: Uint8Array[] = [];
  for (let i = 0; i < meshes.length; i++) {
    const m = meshes[i];
    const trimeshPayload = concatBytes(writeVertices(m.positions), writeFaces(m.indices));
    const trimesh = writeChunk(THREE_DS_TRIMESH, trimeshPayload);
    const objectPayload = concatBytes(writeNullTerminatedString(m.name), trimesh);
    objects.push(writeChunk(THREE_DS_OBJECT, objectPayload));
  }
  const editor = writeChunk(THREE_DS_EDITOR, concatBytes(...objects));
  return writeChunk(THREE_DS_MAIN, editor);
}

// Builds a COLOR_BYTE color sub-chunk (0x0011): 3 uint8 channels.
function writeColorByte(r: number, g: number, b: number): Uint8Array {
  return writeChunk(THREE_DS_COLOR_BYTE, new Uint8Array([r, g, b]));
}

// Builds a COLOR_FLOAT color sub-chunk (0x0010): 3 float32 channels in [0,1].
function writeColorFloat(r: number, g: number, b: number): Uint8Array {
  const payload = new Uint8Array(12);
  const view = new DataView(payload.buffer);
  view.setFloat32(0, r, true);
  view.setFloat32(4, g, true);
  view.setFloat32(8, b, true);
  return writeChunk(THREE_DS_COLOR_FLOAT, payload);
}

// Builds an INT_PERCENTAGE sub-chunk (0x0030): a uint16 in [0,100].
function writePercentInt(percent: number): Uint8Array {
  const payload = new Uint8Array(2);
  new DataView(payload.buffer).setUint16(0, percent, true);
  return writeChunk(THREE_DS_PERCENT_INT, payload);
}

// Builds a material block (0xAFFF) with a name, diffuse/specular colors, and optional texture/shininess/
// transparency/bump sub-chunks. `diffuseFloat` writes the diffuse color via COLOR_FLOAT instead of COLOR_BYTE.
function writeMaterial(opts: {
  bumpFilename?: string;
  diffuse: readonly [number, number, number];
  diffuseFloat?: boolean;
  name: string;
  shininessPercent?: number;
  specular?: readonly [number, number, number];
  textureFilename?: string;
  transparencyPercent?: number;
}): Uint8Array {
  const diffuseColor = opts.diffuseFloat ? writeColorFloat(...opts.diffuse) : writeColorByte(...opts.diffuse);
  const parts: Uint8Array[] = [
    writeChunk(THREE_DS_MATERIAL_NAME, writeNullTerminatedString(opts.name)),
    writeChunk(THREE_DS_MATERIAL_DIFFUSE, diffuseColor),
  ];
  if (opts.specular !== undefined) parts.push(writeChunk(THREE_DS_MATERIAL_SPECULAR, writeColorByte(...opts.specular)));
  if (opts.shininessPercent !== undefined) {
    parts.push(writeChunk(THREE_DS_MATERIAL_SHININESS, writePercentInt(opts.shininessPercent)));
  }
  if (opts.transparencyPercent !== undefined) {
    parts.push(writeChunk(THREE_DS_MATERIAL_TRANSPARENCY, writePercentInt(opts.transparencyPercent)));
  }
  if (opts.textureFilename !== undefined) {
    const filename = writeChunk(THREE_DS_MATERIAL_TEXTURE_FILENAME, writeNullTerminatedString(opts.textureFilename));
    parts.push(writeChunk(THREE_DS_MATERIAL_TEXTURE_MAP, filename));
  }
  if (opts.bumpFilename !== undefined) {
    const filename = writeChunk(THREE_DS_MATERIAL_TEXTURE_FILENAME, writeNullTerminatedString(opts.bumpFilename));
    parts.push(writeChunk(THREE_DS_MATERIAL_BUMP_MAP, filename));
  }
  return writeChunk(THREE_DS_MATERIAL, concatBytes(...parts));
}

// Builds a face sub-chunk (0x4120) whose face array is followed by a FACE_MATERIAL sub-chunk (0x4130)
// naming the material every face uses.
function writeFacesWithMaterial(indices: readonly number[], materialName: string): Uint8Array {
  const count = indices.length / 3;
  const faceArray = new Uint8Array(2 + count * 4 * 2);
  const faceView = new DataView(faceArray.buffer);
  faceView.setUint16(0, count, true);
  for (let i = 0; i < count; i++) {
    const o = 2 + i * 8;
    faceView.setUint16(o, indices[i * 3], true);
    faceView.setUint16(o + 2, indices[i * 3 + 1], true);
    faceView.setUint16(o + 4, indices[i * 3 + 2], true);
    faceView.setUint16(o + 6, 0, true); // flags
  }
  const faceRefs = new Uint8Array(2 + count * 2);
  const refView = new DataView(faceRefs.buffer);
  refView.setUint16(0, count, true);
  for (let i = 0; i < count; i++) refView.setUint16(2 + i * 2, i, true);
  const faceMaterial = writeChunk(
    THREE_DS_FACE_MATERIAL,
    concatBytes(writeNullTerminatedString(materialName), faceRefs),
  );
  return writeChunk(THREE_DS_FACES, concatBytes(faceArray, faceMaterial));
}

// Builds a face sub-chunk (0x4120) followed by any number of FACE_MATERIAL (0x4130) groups and an
// optional SMOOTH_GROUP (0x4150) per-face bitmask list — the general form the subset/smoothing tests use.
function writeFacesWithGroups(
  indices: readonly number[],
  opts: { groups?: readonly { faces: readonly number[]; name: string }[]; smoothing?: readonly number[] } = {},
): Uint8Array {
  const count = indices.length / 3;
  const faceArray = new Uint8Array(2 + count * 4 * 2);
  const faceView = new DataView(faceArray.buffer);
  faceView.setUint16(0, count, true);
  for (let i = 0; i < count; i++) {
    const o = 2 + i * 8;
    faceView.setUint16(o, indices[i * 3], true);
    faceView.setUint16(o + 2, indices[i * 3 + 1], true);
    faceView.setUint16(o + 4, indices[i * 3 + 2], true);
    faceView.setUint16(o + 6, 0, true); // flags
  }
  const parts: Uint8Array[] = [faceArray];
  for (const group of opts.groups ?? []) {
    const refs = new Uint8Array(2 + group.faces.length * 2);
    const refView = new DataView(refs.buffer);
    refView.setUint16(0, group.faces.length, true);
    group.faces.forEach((f, i) => refView.setUint16(2 + i * 2, f, true));
    parts.push(writeChunk(THREE_DS_FACE_MATERIAL, concatBytes(writeNullTerminatedString(group.name), refs)));
  }
  if (opts.smoothing !== undefined) {
    const masks = new Uint8Array(opts.smoothing.length * 4);
    const maskView = new DataView(masks.buffer);
    opts.smoothing.forEach((m, i) => maskView.setUint32(i * 4, m >>> 0, true));
    parts.push(writeChunk(THREE_DS_SMOOTH_GROUP, masks));
  }
  return writeChunk(THREE_DS_FACES, concatBytes(...parts));
}

// Wraps a vertex list + a prebuilt faces chunk and any material chunks into a full one-object 3DS file.
function buildScene3ds(opts: {
  facesChunk: Uint8Array;
  materials?: readonly Uint8Array[];
  meshName: string;
  positions: readonly number[];
}): Uint8Array {
  const trimesh = writeChunk(THREE_DS_TRIMESH, concatBytes(writeVertices(opts.positions), opts.facesChunk));
  const object = writeChunk(THREE_DS_OBJECT, concatBytes(writeNullTerminatedString(opts.meshName), trimesh));
  const editor = writeChunk(THREE_DS_EDITOR, concatBytes(...(opts.materials ?? []), object));
  return writeChunk(THREE_DS_MAIN, editor);
}

// Builds a 3DS file with one material and one mesh whose faces reference it by name.
function buildMaterialScene3ds(opts: {
  faceMaterialName: string;
  indices: readonly number[];
  material: Uint8Array;
  meshName: string;
  positions: readonly number[];
}): Uint8Array {
  const trimeshPayload = concatBytes(
    writeVertices(opts.positions),
    writeFacesWithMaterial(opts.indices, opts.faceMaterialName),
  );
  const trimesh = writeChunk(THREE_DS_TRIMESH, trimeshPayload);
  const object = writeChunk(THREE_DS_OBJECT, concatBytes(writeNullTerminatedString(opts.meshName), trimesh));
  const editor = writeChunk(THREE_DS_EDITOR, concatBytes(opts.material, object));
  return writeChunk(THREE_DS_MAIN, editor);
}

describe('createSceneFrom3ds', () => {
  it('decodes a material to BlinnPhong and attaches it to the mesh that references it by name', () => {
    const material = writeMaterial({
      diffuse: [204, 102, 51],
      name: 'Skin',
      specular: [255, 255, 255],
      textureFilename: 'skin.png',
    });
    const scene = createSceneFrom3ds(
      buildMaterialScene3ds({
        faceMaterialName: 'Skin',
        indices: [0, 1, 2],
        material,
        meshName: 'Cube',
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      }),
    );

    const mesh = getNodeChildren(scene.root)[0] as Mesh;
    expect(mesh.materials).toHaveLength(1);
    const mat = mesh.materials[0] as BlinnPhongMaterial;
    expect(mat.kind).toBe(BlinnPhongMaterialKind);
    expect(mat.diffuse).toBe(0xcc6633ff); // 204,102,51 → opaque
    expect(mat.specular).toBe(0xffffffff);
    expect(mat.name).toBe('Skin'); // 3DS material chunk name preserved as the authored identity
    // Texture filename is referenced, not decoded.
    expect((mat.diffuseMap!.resource as ExternalImageResourceReference).uri).toBe('skin.png');
    expect(mat.diffuseMap!.image).toBeNull();
  });

  // Builds a one-material scene from a material chunk and returns that material as a BlinnPhongMaterial.
  const materialFrom3ds = (material: Uint8Array): BlinnPhongMaterial => {
    const scene = createSceneFrom3ds(
      buildMaterialScene3ds({
        faceMaterialName: 'M',
        indices: [0, 1, 2],
        material,
        meshName: 'Cube',
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      }),
    );
    return (getNodeChildren(scene.root)[0] as Mesh).materials[0] as BlinnPhongMaterial;
  };

  it('maps the shininess percentage to a Blinn-Phong specular exponent', () => {
    const mat = materialFrom3ds(writeMaterial({ diffuse: [128, 128, 128], name: 'M', shininessPercent: 50 }));
    expect(mat.shininess).toBeCloseTo(64); // 50% → 0.5 × 128
  });

  it('maps the bump map filename to an unresolved normalMap reference', () => {
    const mat = materialFrom3ds(writeMaterial({ bumpFilename: 'bump.png', diffuse: [128, 128, 128], name: 'M' }));
    expect((mat.normalMap!.resource as ExternalImageResourceReference).uri).toBe('bump.png');
    expect(mat.normalMap!.image).toBeNull();
  });

  it('folds transparency into the diffuse alpha and a blend alphaMode', () => {
    const mat = materialFrom3ds(writeMaterial({ diffuse: [255, 0, 0], name: 'M', transparencyPercent: 25 }));
    // 25% transparent → 0.75 opacity → alpha 0xBF; diffuse RGB unchanged.
    expect(mat.diffuse).toBe(0xff0000bf);
    expect(mat.alphaMode).toBe('blend');
  });

  it('leaves a fully-opaque material at alphaMode opaque', () => {
    const mat = materialFrom3ds(writeMaterial({ diffuse: [255, 0, 0], name: 'M' }));
    expect(mat.diffuse).toBe(0xff0000ff);
    expect(mat.alphaMode).not.toBe('blend');
  });

  it('reads a diffuse color from the COL_FLOAT sub-chunk', () => {
    const mat = materialFrom3ds(writeMaterial({ diffuse: [1, 0.4, 0.2], diffuseFloat: true, name: 'M' }));
    // 1, 0.4, 0.2 → 255, 102, 51 → 0xff6633ff
    expect(mat.diffuse).toBe(0xff6633ff);
  });

  it('leaves a mesh unmaterialed when it references no material', () => {
    const mesh = getNodeChildren(
      createSceneFrom3ds(buildTriangle3ds('Tri', [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2])).root,
    )[0] as Mesh;
    // A mesh with no FACE_MATERIAL group is one default subset with a null (default-material) binding.
    expect(mesh.materials).toEqual([null]);
  });

  it('splits a multi-material mesh into one MeshSubset per FACE_MATERIAL group', () => {
    const red = writeMaterial({ diffuse: [255, 0, 0], name: 'Red' });
    const blue = writeMaterial({ diffuse: [0, 0, 255], name: 'Blue' });
    // A quad (two triangles): face 0 → Red, face 1 → Blue.
    const facesChunk = writeFacesWithGroups([0, 1, 2, 0, 2, 3], {
      groups: [
        { faces: [0], name: 'Red' },
        { faces: [1], name: 'Blue' },
      ],
    });
    const scene = createSceneFrom3ds(
      buildScene3ds({
        facesChunk,
        materials: [red, blue],
        meshName: 'Quad',
        positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
      }),
    );

    const mesh = getNodeChildren(scene.root)[0] as Mesh;
    // Two contiguous subsets, one per material, each covering its triangle's 3 indices.
    expect(mesh.geometry.subsets).toEqual([
      { indexCount: 3, indexOffset: 0 },
      { indexCount: 3, indexOffset: 3 },
    ]);
    expect(mesh.materials).toHaveLength(2);
    expect((mesh.materials[0] as BlinnPhongMaterial).name).toBe('Red');
    expect((mesh.materials[1] as BlinnPhongMaterial).name).toBe('Blue');
  });

  it('gives faces belonging to no material group a trailing default subset', () => {
    const red = writeMaterial({ diffuse: [255, 0, 0], name: 'Red' });
    // Face 0 → Red; face 1 is in no group.
    const facesChunk = writeFacesWithGroups([0, 1, 2, 0, 2, 3], { groups: [{ faces: [0], name: 'Red' }] });
    const scene = createSceneFrom3ds(
      buildScene3ds({
        facesChunk,
        materials: [red],
        meshName: 'Quad',
        positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
      }),
    );

    const mesh = getNodeChildren(scene.root)[0] as Mesh;
    expect(mesh.geometry.subsets).toHaveLength(2);
    // The Red subset then the unassigned faces as a null-material default subset.
    expect((mesh.materials[0] as BlinnPhongMaterial).name).toBe('Red');
    expect(mesh.materials[1]).toBeNull();
  });

  it('splits shared vertices across smoothing groups so a crease stays hard', () => {
    // Two perpendicular triangles sharing edge v1–v2 (a 90° fold): face 0 in the z=0 plane, face 1 in x=1.
    const positions = [0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1];
    const indices = [0, 1, 2, 1, 3, 2];

    // Same smoothing group → the shared edge is smoothed, so v1/v2 stay merged: 4 output vertices.
    const smooth = createSceneFrom3ds(
      buildScene3ds({ facesChunk: writeFacesWithGroups(indices, { smoothing: [1, 1] }), meshName: 'Fold', positions }),
    );
    expect(getMeshGeometryVertexCount((getNodeChildren(smooth.root)[0] as Mesh).geometry)).toBe(4);

    // Different smoothing groups → the shared edge is a hard crease, so v1/v2 split: 6 output vertices.
    const hard = createSceneFrom3ds(
      buildScene3ds({ facesChunk: writeFacesWithGroups(indices, { smoothing: [1, 2] }), meshName: 'Fold', positions }),
    );
    const hardGeom = (getNodeChildren(hard.root)[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(hardGeom)).toBe(6);

    // Flat shading: face 0's corner (vertex 0) and face 1's corner (vertex 3) carry their own, differing
    // face normals — the perpendicular faces do not blend into a rounded edge.
    const n0 = { x: 0, y: 0, z: 0 };
    const n3 = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexNormal(n0, hardGeom, 0);
    getMeshGeometryVertexNormal(n3, hardGeom, 3);
    expect([n0.x, n0.y, n0.z]).not.toEqual([n3.x, n3.y, n3.z]);
    expect(Math.hypot(n0.x, n0.y, n0.z)).toBeCloseTo(1);
  });

  it('smooths every shared vertex when the mesh carries no smoothing chunk', () => {
    // The same fold without a SMOOTH_GROUP chunk smooths across the crease (legacy behavior): 4 vertices.
    const positions = [0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1];
    const scene = createSceneFrom3ds(
      buildScene3ds({ facesChunk: writeFacesWithGroups([0, 1, 2, 1, 3, 2]), meshName: 'Fold', positions }),
    );
    expect(getMeshGeometryVertexCount((getNodeChildren(scene.root)[0] as Mesh).geometry)).toBe(4);
  });

  it('converts Z-up to Y-up coordinates', () => {
    // A triangle in 3DS Z-up: (0,0,0), (1,0,0), (0,0,1) → Y-up: (0,0,0), (1,0,0), (0,1,0)
    const bytes = buildTriangle3ds('Tri', [0, 0, 0, 1, 0, 0, 0, 0, 1], [0, 1, 2]);
    const scene = createSceneFrom3ds(bytes);
    const children = getNodeChildren(scene.root);
    expect(children).toHaveLength(1);

    // A named 3DS object is returned as a bare Mesh carrying the name, not a transform wrapper.
    const mesh = children[0] as SceneNode;
    expect(isMesh(mesh)).toBe(true);
    expect(mesh.name).toBe('Tri');

    const geometry = (mesh as Mesh).geometry;
    const p = { x: 0, y: 0, z: 0 };

    getMeshGeometryVertexPosition(p, geometry, 0);
    expect([p.x, p.y, p.z]).toEqual([0, 0, 0]);

    getMeshGeometryVertexPosition(p, geometry, 1);
    expect([p.x, p.y, p.z]).toEqual([1, 0, 0]);

    // Z-up (0,0,1) → Y-up (0,1,0): the 3DS Z component becomes the Y component.
    getMeshGeometryVertexPosition(p, geometry, 2);
    expect([p.x, p.y, p.z]).toEqual([0, 1, 0]);
  });

  it('parses a single mesh with a triangle', () => {
    // 3DS Z-up vertices: (0,0,0), (1,0,0), (0,1,0) — note Y is the "forward" axis in Z-up.
    const bytes = buildTriangle3ds('Triangle', [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
    const scene = createSceneFrom3ds(bytes);
    const children = getNodeChildren(scene.root);
    expect(children).toHaveLength(1);

    const mesh = children[0] as SceneNode;
    expect(isMesh(mesh)).toBe(true);
    expect(mesh.name).toBe('Triangle');

    const geometry = (mesh as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    expect(getMeshGeometryIndexCount(geometry)).toBe(3);
  });

  it('parses multiple meshes', () => {
    const bytes = buildMultiMesh3ds([
      { indices: [0, 1, 2], name: 'MeshA', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
      { indices: [0, 1, 2], name: 'MeshB', positions: [2, 0, 0, 3, 0, 0, 2, 1, 0] },
    ]);
    const scene = createSceneFrom3ds(bytes);
    const children = getNodeChildren(scene.root);
    expect(children).toHaveLength(2);

    // Each named object is a bare Mesh child of the scene, carrying its name.
    expect(isMesh(children[0] as SceneNode)).toBe(true);
    expect((children[0] as SceneNode).name).toBe('MeshA');
    expect(isMesh(children[1] as SceneNode)).toBe(true);
    expect((children[1] as SceneNode).name).toBe('MeshB');
  });

  it('parses UV coordinates', () => {
    const bytes = buildTriangle3ds('UvTri', [0, 0, 0, 1, 0, 0, 0, 0, 1], [0, 1, 2], [0, 0, 1, 0, 0.5, 1]);
    const scene = createSceneFrom3ds(bytes);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;

    const uv = { x: 0, y: 0 };
    getMeshGeometryVertexUv0(uv, geometry, 0);
    expect([uv.x, uv.y]).toEqual([0, 1]);
    getMeshGeometryVertexUv0(uv, geometry, 1);
    expect([uv.x, uv.y]).toEqual([1, 1]);
    getMeshGeometryVertexUv0(uv, geometry, 2);
    expect([uv.x, uv.y]).toEqual([0.5, 0]);
  });

  it('computes face normals facing outward, not inverted', () => {
    // A flat triangle wound CCW in the Z-up XY plane: its outward normal is +Z in Z-up, which
    // must become +Y after the -90°-about-X rotation. A reflection-based conversion would flip the
    // winding and produce -Y — the "holes into the model" / inverted-lighting symptom — so this
    // asserts the sign, not just the magnitude.
    const bytes = buildTriangle3ds('NormalTri', [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
    const scene = createSceneFrom3ds(bytes);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;

    const n = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexNormal(n, geometry, 0);
    expect(n.y).toBeGreaterThan(0.9);
    expect(Math.abs(n.x)).toBeLessThan(0.1);
    expect(Math.abs(n.z)).toBeLessThan(0.1);
  });

  it('converts Z-up to Y-up by rotation, not reflection', () => {
    // A vertex with a non-zero Y (forward) component distinguishes a rotation from a mirror: the
    // rotation (x, y, z) → (x, z, -y) negates the forward axis, whereas a Y↔Z swap would keep it
    // positive and mirror the model. Vertex (0, 1, 0) in 3DS Z-up must land at (0, 0, -1).
    const bytes = buildTriangle3ds('RotTri', [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
    const scene = createSceneFrom3ds(bytes);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;

    const p = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(p, geometry, 2);
    expect([p.x, p.y, p.z]).toEqual([0, 0, -1]);
  });

  it('returns an empty scene for empty input', () => {
    const scene = createSceneFrom3ds(new Uint8Array(0));
    expect(getNodeChildren(scene.root)).toHaveLength(0);
  });

  it('warns on empty input', () => {
    const warnings: string[] = [];
    createSceneFrom3ds(new Uint8Array(0), warnings);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('smaller than');
  });

  it('warns on invalid main chunk ID', () => {
    const warnings: string[] = [];
    const bytes = new Uint8Array(6);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, 0x1234, true);
    view.setUint32(2, 6, true);
    createSceneFrom3ds(bytes, warnings);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('0x4D4D');
  });

  it('warns on truncated chunk data and returns partial result', () => {
    const warnings: string[] = [];
    // Build a valid 3DS but truncate it.
    const full = buildTriangle3ds('Trunc', [0, 0, 0, 1, 0, 0, 0, 0, 1], [0, 1, 2]);
    // Cut off a significant portion of the end.
    const truncated = full.slice(0, Math.floor(full.byteLength * 0.5));
    createSceneFrom3ds(truncated, warnings);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('handles a mesh with no faces gracefully', () => {
    // Build a trimesh chunk with vertices but no faces sub-chunk.
    const trimeshPayload = writeVertices([0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const trimesh = writeChunk(THREE_DS_TRIMESH, trimeshPayload);
    const objectPayload = concatBytes(writeNullTerminatedString('NoFaces'), trimesh);
    const object = writeChunk(THREE_DS_OBJECT, objectPayload);
    const editor = writeChunk(THREE_DS_EDITOR, object);
    const bytes = writeChunk(THREE_DS_MAIN, editor);

    const warnings: string[] = [];
    const scene = createSceneFrom3ds(bytes, warnings);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    expect(warnings.some((w) => w.includes('missing'))).toBe(true);
  });
});

describe('createSceneFrom3ds animations', () => {
  it('wraps the parsed scene with no animation and a one-element scenes array', () => {
    const bytes = buildTriangle3ds('Tri', [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
    const scene = createSceneFrom3ds(bytes);

    expect(Object.keys(scene.animations)).toHaveLength(0);
    expect(getNodeChildren(scene.root)).toHaveLength(1);
  });

  it('returns an empty import (no scene children) for non-3DS input', () => {
    const warnings: string[] = [];
    const scene = createSceneFrom3ds(new Uint8Array([0, 0, 0, 0, 0, 0]), warnings);

    expect(Object.keys(scene.animations)).toHaveLength(0);
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe('parse3ds', () => {
  it('decomposes each trimesh into a document mesh node with inline geometry', () => {
    const document = parse3ds(buildTriangle3ds('Tri', [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]));
    expect(document.meshes).toHaveLength(1);
    expect(getMeshGeometryVertexCount(document.meshes[0].geometry)).toBe(3);
    expect(document.nodes[0].mesh).toBe(0);
    expect(document.nodes[0].name).toBe('Tri');
    expect(document.scenes[0].rootNodes).toEqual([0]);
  });

  it('registers a referenced material into the document materials table by index', () => {
    const material = writeMaterial({
      diffuse: [204, 102, 51],
      name: 'Skin',
      specular: [255, 255, 255],
      textureFilename: 'skin.png',
    });
    const document = parse3ds(
      buildMaterialScene3ds({
        faceMaterialName: 'Skin',
        indices: [0, 1, 2],
        material,
        meshName: 'Cube',
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      }),
    );
    expect(document.materials).toHaveLength(1);
    expect((document.materials[0] as BlinnPhongMaterial).name).toBe('Skin');
    expect(document.meshes[0].materials).toEqual([0]);
    expect(document.resources).toHaveLength(1);
    expect(document.resources[0]).toBe((document.materials[0] as BlinnPhongMaterial).diffuseMap!.resource);
  });

  it('returns an empty document with a warning for non-3DS input', () => {
    const warnings: string[] = [];
    const document = parse3ds(new Uint8Array([0, 0, 0, 0, 0, 0]), warnings);
    expect(document.nodes).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
