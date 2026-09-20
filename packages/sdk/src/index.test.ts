import * as sdk from './index';

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

    it('exports registerRenderer', () => {
      expect(sdk.registerRenderer).toBeTypeOf('function');
    });

    it('does not export internal 2D root transforms (protected plumbing)', () => {
      expect(sdk).not.toHaveProperty('setCanvasRenderTransform2D');
      expect(sdk).not.toHaveProperty('setGlRenderTransform2D');
      expect(sdk).not.toHaveProperty('setWgpuRenderTransform2D');
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
