import type { Bitmap, BitmapData, BitmapRuntime } from './Bitmap';
import { BitmapKind } from './Bitmap';
import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';

describe('Bitmap', () => {
  describe('BitmapKind', () => {
    it('is the string Bitmap', () => {
      expect(BitmapKind).toBe('Bitmap');
    });

    it('satisfies the literal kind type', () => {
      const kindLiteral: 'Bitmap' = BitmapKind;
      expect(kindLiteral).toBe('Bitmap');
    });
  });

  describe('BitmapData', () => {
    it('carries the bitmap-specific data fields atop the display-object data', () => {
      type DataKeys = keyof BitmapData;

      type _HasImage = 'image' extends DataKeys ? true : false;
      const _hasImage: _HasImage = true;
      void _hasImage;

      type _HasSmoothing = 'smoothing' extends DataKeys ? true : false;
      const _hasSmoothing: _HasSmoothing = true;
      void _hasSmoothing;

      type _HasSourceRectangle = 'sourceRectangle' extends DataKeys ? true : false;
      const _hasSourceRectangle: _HasSourceRectangle = true;
      void _hasSourceRectangle;

      expect(true).toBe(true);
    });
  });
});

// Compile-time quartet law: the Bitmap entity quartet extends the DisplayObject quartet.
type _BitmapExtendsDisplayObject = Bitmap extends DisplayObject ? true : false;
const _bitmapIsDisplayObject: _BitmapExtendsDisplayObject = true;
void _bitmapIsDisplayObject;

type _BitmapDataExtendsDisplayObjectData = BitmapData extends DisplayObjectData ? true : false;
const _bitmapDataIsDisplayObjectData: _BitmapDataExtendsDisplayObjectData = true;
void _bitmapDataIsDisplayObjectData;

type _BitmapRuntimeExtendsDisplayObjectRuntime = BitmapRuntime extends DisplayObjectRuntime ? true : false;
const _bitmapRuntimeIsDisplayObjectRuntime: _BitmapRuntimeExtendsDisplayObjectRuntime = true;
void _bitmapRuntimeIsDisplayObjectRuntime;
