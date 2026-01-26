import { Matrix } from '@flighthq/core';
import { Rectangle } from '@flighthq/core';

import DisplayObject from './DisplayObject.js';

describe('DisplayObject', () =>
{
    let displayObject: DisplayObject;

    beforeEach(() =>
    {
        displayObject = new (DisplayObject as any)();
    });

    function getRenderDirty(displayObject: DisplayObject): boolean
    {
        // @ts-expect-error:
        return displayObject.__renderDirty;
    }

    function getTransformDirty(displayObject: DisplayObject): boolean
    {
        // @ts-expect-error:
        return displayObject.__transformDirty;
    }

    // Constructor

    it('makes an instance with default values', () =>
    {
        expect(displayObject).toBeInstanceOf(DisplayObject);
        expect(displayObject.alpha).toBe(1);
        expect(displayObject.cacheAsBitmap).toBe(false);
        expect(displayObject.height).toBe(0);
        expect(displayObject.mask).toBeNull();
        expect(displayObject.name).toBeNull();
        expect(displayObject.opaqueBackground).toBeNull();
        expect(displayObject.parent).toBeNull();
        expect(displayObject.root).toBeNull();
        expect(displayObject.rotation).toBe(0);
        expect(displayObject.scaleX).toBe(0);
        expect(displayObject.scaleY).toBe(0);
        expect(displayObject.visible).toBe(true);
        expect(displayObject.width).toBe(0);
        expect(displayObject.x).toBe(0);
        expect(displayObject.y).toBe(0);
    });

    // Properties

    describe('alpha', () =>
    {
        it('should mark render dirty if changed', () =>
        {
            expect(displayObject.alpha).toBe(1.0);
            expect(getRenderDirty(displayObject)).toBe(false);

            displayObject.alpha = 1;
            expect(getRenderDirty(displayObject)).toBe(false);

            displayObject.alpha = 0;
            expect(getRenderDirty(displayObject)).toBe(true);
        });
    });

    describe('cacheAsBitmap', () =>
    {
        it('should mark render dirty if changed', () =>
        {
            expect(displayObject.cacheAsBitmap).toBe(false);
            expect(getRenderDirty(displayObject)).toBe(false);

            displayObject.cacheAsBitmap = true;
            expect(getRenderDirty(displayObject)).toBe(true);

            displayObject.cacheAsBitmap = false;
            expect(getRenderDirty(displayObject)).toBe(true);
        });
    });

    describe('cacheAsBitmapMatrix', () =>
    {
        it('should mark render dirty if matrix changes', () =>
        {
            const matrix1 = new Matrix();
            const matrix2 = new Matrix();

            displayObject.cacheAsBitmapMatrix = matrix1;
            expect(getRenderDirty(displayObject)).toBe(true);

            displayObject.cacheAsBitmapMatrix = matrix2;
            expect(getRenderDirty(displayObject)).toBe(true);
        });
    });

    describe('mask', () =>
    {
        it('should set mask and mark render and transform dirty', () =>
        {
            const maskObject = new DisplayObject();

            expect(displayObject.mask).toBeNull();
            expect(getRenderDirty(displayObject)).toBe(false);
            expect(getTransformDirty(displayObject)).toBe(false);

            displayObject.mask = maskObject;
            expect(displayObject.mask).toBe(maskObject);
            expect(getRenderDirty(displayObject)).toBe(true);
            expect(getTransformDirty(displayObject)).toBe(true);
        });
    });

    describe('rotation', () =>
    {
        it('should mark transform dirty if changed', () =>
        {
            expect(displayObject.rotation).toBe(0);
            expect(getTransformDirty(displayObject)).toBe(false);

            displayObject.rotation = 45;
            expect(getTransformDirty(displayObject)).toBe(true);

            displayObject.rotation = 0;
            expect(getTransformDirty(displayObject)).toBe(true);
        });
    });

    describe('scaleX and scaleY', () =>
    {
        it('should mark transform dirty if scale changes', () =>
        {
            expect(displayObject.scaleX).toBe(0);
            expect(displayObject.scaleY).toBe(0);
            expect(getTransformDirty(displayObject)).toBe(false);

            displayObject.scaleX = 2;
            displayObject.scaleY = 2;
            expect(getTransformDirty(displayObject)).toBe(true);

            displayObject.scaleX = 1;
            displayObject.scaleY = 1;
            expect(getTransformDirty(displayObject)).toBe(true);
        });
    });

    describe('visible', () =>
    {
        it('should mark render dirty if changed', () =>
        {
            expect(displayObject.visible).toBe(true);
            expect(getRenderDirty(displayObject)).toBe(false);

            displayObject.visible = false;
            expect(getRenderDirty(displayObject)).toBe(true);

            displayObject.visible = true;
            expect(getRenderDirty(displayObject)).toBe(true);
        });
    });

    describe('name', () =>
    {
        it('should set and get name correctly', () =>
        {
            expect(displayObject.name).toBeNull();

            displayObject.name = 'TestObject';
            expect(displayObject.name).toBe('TestObject');

            displayObject.name = null;
            expect(displayObject.name).toBeNull();
        });
    });

    describe('scrollRect', () =>
    {
        it('should set scrollRect and mark transform dirty', () =>
        {
            const rect = new Rectangle();
            expect(displayObject.scrollRect).toBeNull();
            expect(getTransformDirty(displayObject)).toBe(false);

            displayObject.scrollRect = rect;
            expect(displayObject.scrollRect).toBe(rect);
            expect(getTransformDirty(displayObject)).toBe(true);

            displayObject.scrollRect = null;
            expect(displayObject.scrollRect).toBeNull();
            expect(getTransformDirty(displayObject)).toBe(true);
        });
    });

    describe('x', () =>
    {
        it('should mark transform dirty if changed', () =>
        {
            expect(displayObject.x).toBe(0);
            expect(getTransformDirty(displayObject)).toBe(false);

            displayObject.x = 0;
            expect(getTransformDirty(displayObject)).toBe(false);

            displayObject.x = 1;
            expect(getTransformDirty(displayObject)).toBe(true);
        });
    });

    describe('y', () =>
    {
        it('should mark transform dirty if changed', () =>
        {
            expect(displayObject.y).toBe(0);
            expect(getTransformDirty(displayObject)).toBe(false);

            displayObject.y = 0;
            expect(getTransformDirty(displayObject)).toBe(false);

            displayObject.y = 1;
            expect(getTransformDirty(displayObject)).toBe(true);
        });
    });
});
