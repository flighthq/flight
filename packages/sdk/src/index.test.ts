import * as sdk from './index';

describe('package exports', () => {
  describe('application domain', () => {
    it('exports createApplication', () => {
      expect(sdk.createApplication).toBeTypeOf('function');
    });

    it('exports createApplicationWindow', () => {
      expect(sdk.createApplicationWindow).toBeTypeOf('function');
    });
  });

  describe('display object domain', () => {
    it('exports BitmapKind with expected value', () => {
      expect(sdk.BitmapKind).toBe('Bitmap');
    });

    it('exports createBitmap', () => {
      expect(sdk.createBitmap).toBeTypeOf('function');
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

  describe('filters domain', () => {
    it('exports createBlurFilter', () => {
      expect(sdk.createBlurFilter).toBeTypeOf('function');
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

  describe('loader domain', () => {
    it('exports createResourceLoader', () => {
      expect(sdk.createResourceLoader).toBeTypeOf('function');
    });
  });

  describe('particles domain', () => {
    it('exports createParticleEmitterConfig', () => {
      expect(sdk.createParticleEmitterConfig).toBeTypeOf('function');
    });

    it('exports ParticleEmitterKind with expected value', () => {
      expect(sdk.ParticleEmitterKind).toBe('ParticleEmitter');
    });
  });

  describe('platform domain', () => {
    it('exports getPlatformName', () => {
      expect(sdk.getPlatformName).toBeTypeOf('function');
    });
  });

  describe('render domain', () => {
    it('exports createRenderState', () => {
      expect(sdk.createRenderState).toBeTypeOf('function');
    });

    it('exports registerRenderer', () => {
      expect(sdk.registerRenderer).toBeTypeOf('function');
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
