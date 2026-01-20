import { describe, it, expect, beforeEach } from 'vitest';
import { DisplayObject } from '../src/DisplayObject.js';

describe('DisplayObject', () =>
{
    let displayObject: DisplayObject;

    beforeEach(() =>
    {
        displayObject = new (DisplayObject as any)();
    });

    it('makes an instance with default values', () =>
    {
        expect(displayObject).toBeInstanceOf(DisplayObject);
        expect(displayObject.alpha).toBe(1);
        // expect(displayObject.blendMode).toBe(BlendMode.NORMAL);
        expect(displayObject.cacheAsBitmap).toBe(false);
        // expect(displayObject.cacheAsBitmapMatrix).toBeNull();
        // expect(displayObject.filters).toBeNull();
        expect(displayObject.height).toBe(0);
        // expect(displayObject.loaderInfo).toBeNull();
        expect(displayObject.mask).toBeNull();
        // expect(displayObject.metaData).toBeNull();
        expect(displayObject.name).toBeNull();
        expect(displayObject.opaqueBackground).toBeNull();
        expect(displayObject.parent).toBeNull();
        expect(displayObject.root).toBeNull();
        expect(displayObject.rotation).toBe(0);
        // expect(displayObject.scroll9Grid).toBeNull();
        expect(displayObject.scaleX).toBe(0);
        expect(displayObject.scaleY).toBe(0);
        // expect(displayObject.scrollRect).toBeNull();
        // expect(displayObject.shader).toBeNull();
        // expect(displayObject.stage).toBeNull();
        // expect(displayObject.transform).toBeInstanceOf(Transform);
        expect(displayObject.width).toBe(0);
        expect(displayObject.visible).toBe(true);
        expect(displayObject.x).toBe(0);
        expect(displayObject.y).toBe(0);
    });

    describe('alpha', () =>
    {
        it('should mark renderDirty if changed', () => 
        {
            expect(displayObject.alpha).toBe(1.0);
            expect(displayObject.__renderDirty).toBe(false);
            displayObject.alpha = 1;
            expect(displayObject.__renderDirty).toBe(false);
            displayObject.alpha = 0;
            expect(displayObject.__renderDirty).toBe(true);
        });
    });
});