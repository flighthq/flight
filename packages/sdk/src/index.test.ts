import { TextFormatRange as ContractTextFormatRange } from './contract.ts';
import type { TextFormatRangeRaw as ContractTextFormatRangeRaw } from './contract.ts';
import * as sdk from './index.ts';

describe('package exports', () => {
  describe('adjustments domain', () => {
    it('exports createIdentityColorMatrix', () => {
      expect(sdk.createIdentityColorMatrix).toBeTypeOf('function');
    });
  });

  describe('application domain', () => {
    it('exports createAppLoop', () => {
      expect(sdk.createAppLoop).toBeTypeOf('function');
    });

    it('exports createAppWindow', () => {
      expect(sdk.createAppWindow).toBeTypeOf('function');
    });
  });

  describe('display object domain', () => {
    it('exports SpriteKind with expected value', () => {
      expect(sdk.SpriteKind).toBe('Sprite');
    });

    it('exports createSprite', () => {
      expect(sdk.createSprite).toBeTypeOf('function');
    });

    it('exports createDisplayObject', () => {
      expect(sdk.createDisplayObject).toBeTypeOf('function');
    });

    it('exports DisplayObjectKind with expected value', () => {
      expect(sdk.DisplayObjectKind).toBe('DisplayObject');
    });
  });

  describe('effects domain', () => {
    it('exports createBloomEffect', () => {
      expect(sdk.createBloomEffect).toBeTypeOf('function');
    });
  });

  describe('geometry domain', () => {
    it('exports createMatrix', () => {
      expect(sdk.createMatrix).toBeTypeOf('function');
    });

    it('exports createRectangle', () => {
      expect(sdk.createRectangle).toBeTypeOf('function');
    });
  });

  describe('particles domain', () => {
    it('exports createParticleEmitterConfig', () => {
      expect(sdk.createParticleEmitterConfig).toBeTypeOf('function');
    });

    it('exports ParticleEmitter2DKind with expected value', () => {
      expect(sdk.ParticleEmitter2DKind).toBe('ParticleEmitter2D');
    });
  });

  describe('render domain', () => {
    it('exports createGlRenderState', () => {
      expect(sdk.createGlRenderState).toBeTypeOf('function');
    });

    it('exports registerNodeRenderer', () => {
      expect(sdk.registerNodeRenderer).toBeTypeOf('function');
    });
  });

  describe('sprite domain', () => {
    it('exports createSprite', () => {
      expect(sdk.createSprite).toBeTypeOf('function');
    });

    it('exports SpriteKind with expected value', () => {
      expect(sdk.SpriteKind).toBe('Sprite');
    });
  });

  describe('text domain', () => {
    it('exports createTextLabel', () => {
      expect(sdk.createTextLabel).toBeTypeOf('function');
    });

    it('exports TextLabelKind with expected value', () => {
      expect(sdk.TextLabelKind).toBe('TextLabel');
    });

    it('prefers the Textformat wrapper class over the Types raw compatibility alias', () => {
      const range = new sdk.TextFormatRange({ bold: true }, 1, 3);

      expect(range.raw).toMatchObject({ end: 3, format: { bold: true }, start: 1 });
      expectTypeOf(range.raw).toEqualTypeOf<sdk.TextFormatRangeRaw>();
      expectTypeOf(range.raw.format).toEqualTypeOf<sdk.TextFormat>();
      expectTypeOf(range.raw.start).toEqualTypeOf<number>();
      expectTypeOf(range.raw.end).toEqualTypeOf<number>();
    });

    it('prefers the same wrapper class from the aggregate contract lane', () => {
      const range = new ContractTextFormatRange({}, 2, 4);

      expect(range.raw).toMatchObject({ end: 4, format: {}, start: 2 });
      expectTypeOf(range.raw).toEqualTypeOf<ContractTextFormatRangeRaw>();
      expectTypeOf(range.raw.format).toEqualTypeOf<sdk.TextFormat>();
      expectTypeOf(range.raw.start).toEqualTypeOf<number>();
      expectTypeOf(range.raw.end).toEqualTypeOf<number>();
    });
  });

  describe('timeline/tween domain', () => {
    it('exports createTween', () => {
      expect(sdk.createTween).toBeTypeOf('function');
    });

    it('exports createTweenManager', () => {
      expect(sdk.createTweenManager).toBeTypeOf('function');
    });
  });
});
