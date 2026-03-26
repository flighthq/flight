import { invalidateAppearance } from '@flighthq/scene-graph-core';
import { createQuadBatch, reserveQuadBatch, resizeQuadBatch } from '@flighthq/scene-graph-sprite';
import type { QuadBatch as RawQuadBatch, QuadBatchData, QuadTransformType } from '@flighthq/types';

import TextureAtlas from '../../../assets/TextureAtlas';
import FlightObject from '../../../FlightObject';
import Matrix from '../../../geometry/Matrix';
import Vector2 from '../../../geometry/Vector2';
import SpriteNode from './SpriteNode';

export default class QuadBatch extends SpriteNode {
  protected __data: QuadBatchData;
  declare protected __raw: RawQuadBatch;

  constructor() {
    super();
    this.__data = this.__raw.data as QuadBatchData;
  }

  protected override __create() {
    return createQuadBatch();
  }

  static fromRaw(raw: RawQuadBatch): QuadBatch {
    return FlightObject.getOrCreate(raw, QuadBatch)!;
  }

  readID(index: number): number {
    return this.__data.ids[index];
  }

  readMatrix(index: number): Matrix {
    return Matrix.fromFloat32Array(this.__data.transforms, index * 6);
  }

  readVector2(index: number): Vector2 {
    return Vector2.fromFloat32Array(this.__data.transforms, index * 2);
  }

  reserve(capacity: number): void {
    reserveQuadBatch(this.__raw, capacity);
  }

  resize(instanceCount: number): void {
    resizeQuadBatch(this.__raw, instanceCount);
  }

  writeID(index: number, id: number): void {
    this.__data.ids[index] = id;
    invalidateAppearance(this.__raw);
  }

  writeIDs(startIndex: number, values: Uint16Array): void {
    this.__data.ids.set(values, startIndex);
    invalidateAppearance(this.__raw);
  }

  writeMatrices(startIndex: number, values: Float32Array): void {
    this.__data.transforms.set(values, startIndex * 6);
    invalidateAppearance(this.__raw);
  }

  writeMatrix(index: number, matrix: Readonly<Matrix>): void {
    matrix.writeToFloat32Array(this.__data.transforms, index * 6);
    invalidateAppearance(this.__raw);
  }

  writeVector(index: number, vector: Readonly<Vector2>): void {
    vector.writeToFloat32Array(this.__data.transforms, index * 2);
    invalidateAppearance(this.__raw);
  }

  writeVectors(startIndex: number, values: Float32Array): void {
    this.__data.transforms.set(values, startIndex * 2);
    invalidateAppearance(this.__raw);
  }

  // Get & Set Methods

  get atlas(): TextureAtlas | null {
    if (this.__data.atlas === null) return null;
    return FlightObject.getOrCreate(this.__data.atlas, TextureAtlas);
  }

  set atlas(value: TextureAtlas | null) {
    this.__data.atlas = value !== null ? value.raw : null;
  }

  get ids(): Uint16Array {
    return this.__data.ids;
  }

  set indices(value: Uint16Array) {
    this.__data.ids = value;
  }

  get instanceCount(): number {
    return this.__data.instanceCount;
  }

  set instanceCount(value: number) {
    this.__data.instanceCount = value;
  }

  override get raw(): RawQuadBatch {
    return this.__raw;
  }

  get transforms(): Float32Array {
    return this.__data.transforms;
  }

  set transforms(value: Float32Array) {
    this.__data.transforms = value;
  }

  get transformType(): QuadTransformType {
    return this.__data.transformType;
  }

  set transformType(value: QuadTransformType) {
    this.__data.transformType = value;
  }
}

export { QuadTransformType };
