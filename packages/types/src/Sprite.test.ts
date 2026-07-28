import type { Node2D, Node2DData } from './Node2D';
import type { Sprite, SpriteData, SpriteRuntime } from './Sprite';
import { SpriteKind } from './Sprite';

describe('Sprite', () => {
  describe('SpriteKind', () => {
    it('is the string Sprite', () => {
      expect(SpriteKind).toBe('Sprite');
    });
  });

  describe('SpriteData', () => {
    it('has texture in addition to Node2DData fields', () => {
      type DataKeys = keyof SpriteData;
      const key: DataKeys = 'texture';
      expect(key).toBe('texture');
    });
  });
});

type _SpriteExtendsNode2D = Sprite extends Node2D ? true : false;
type _SpriteDataExtendsNode2DData = SpriteData extends Node2DData ? true : false;
type _SpriteRuntimeExists = SpriteRuntime extends object ? true : false;

const _spriteExtendsNode2D: _SpriteExtendsNode2D = true;
const _spriteDataExtendsNode2DData: _SpriteDataExtendsNode2DData = true;
const _spriteRuntimeExists: _SpriteRuntimeExists = true;

void _spriteExtendsNode2D;
void _spriteDataExtendsNode2DData;
void _spriteRuntimeExists;
