import * as sdk from './index';
import * as rendering from './rendering';

describe('package exports', () => {
  describe('adjustments domain', () => {
    it('exports createIdentityColorMatrix', () => {
      expect(sdk.createIdentityColorMatrix).toBeTypeOf('function');
    });
  });

  describe('application domain', () => {
    it('exports createApplication', () => {
      expect(sdk.createApplication).toBeTypeOf('function');
    });

    it('exports createApplicationWindow', () => {
      expect(sdk.createApplicationWindow).toBeTypeOf('function');
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

    it('exports registerRenderer', () => {
      expect(sdk.registerRenderer).toBeTypeOf('function');
    });

    it('exports caller-owned 2D root transforms through both SDK render barrels', () => {
      for (const barrel of [sdk, rendering]) {
        expect(barrel.setCanvasRenderTransform2D).toBeTypeOf('function');
        expect(barrel.setGlRenderTransform2D).toBeTypeOf('function');
        expect(barrel.setWgpuRenderTransform2D).toBeTypeOf('function');
      }
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
