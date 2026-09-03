import type { Scale9Sprite, Scale9SpriteData, Scale9SpriteRuntime } from './Scale9Sprite';
import { Scale9SpriteKind } from './Scale9Sprite';
import type { Sprite, SpriteData, SpriteRuntime } from './Sprite';

describe('Scale9Sprite', () => {
  describe('Scale9SpriteKind', () => {
    it('is the string Scale9Sprite', () => {
      expect(Scale9SpriteKind).toBe('Scale9Sprite');
    });
  });

  describe('Scale9SpriteData', () => {
    it('has scale9Grid in addition to SpriteData fields', () => {
      type DataKeys = keyof Scale9SpriteData;
      const key: DataKeys = 'scale9Grid';
      expect(key).toBe('scale9Grid');
    });

    it('has texture from SpriteData', () => {
      type DataKeys = keyof Scale9SpriteData;
      const key: DataKeys = 'texture';
      expect(key).toBe('texture');
    });
  });
});

type _Scale9SpriteExtendsSprite = Scale9Sprite extends Sprite ? true : false;
type _Scale9SpriteDataExtendsSpriteData = Scale9SpriteData extends SpriteData ? true : false;
type _Scale9SpriteRuntimeExtendsSpriteRuntime = Scale9SpriteRuntime extends SpriteRuntime ? true : false;

const _scale9SpriteExtendsSprite: _Scale9SpriteExtendsSprite = true;
const _scale9SpriteDataExtendsSpriteData: _Scale9SpriteDataExtendsSpriteData = true;
const _scale9SpriteRuntimeExtendsSpriteRuntime: _Scale9SpriteRuntimeExtendsSpriteRuntime = true;

void _scale9SpriteExtendsSprite;
void _scale9SpriteDataExtendsSpriteData;
void _scale9SpriteRuntimeExtendsSpriteRuntime;
