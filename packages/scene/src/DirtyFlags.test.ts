import { DirtyFlags } from './DirtyFlags';

describe('DirtyFlags enum', () =>
{
    it('should have correct individual values', () =>
    {
        expect(DirtyFlags.None).toBe(0);
        expect(DirtyFlags.Transform).toBe(1 << 0); // 1
        expect(DirtyFlags.Appearance).toBe(1 << 1); // 2
        expect(DirtyFlags.Bounds).toBe(1 << 2); // 4
        expect(DirtyFlags.Clip).toBe(1 << 3); // 8
        expect(DirtyFlags.CacheAsBitmap).toBe(1 << 4); // 16
        expect(DirtyFlags.Children).toBe(1 << 5); // 32
        expect(DirtyFlags.TransformedBounds).toBe(1 << 6); // 64
    });

    it('should combine flags correctly', () =>
    {
        const combined = DirtyFlags.Transform | DirtyFlags.Appearance;
        expect(combined).toBe(DirtyFlags.Transform + DirtyFlags.Appearance); // 3
    });

    it('Render should be combination of Transform, Appearance, Clip, and Cache', () =>
    {
        const expectedRender = DirtyFlags.Transform | DirtyFlags.Appearance | DirtyFlags.Clip;
        expect(DirtyFlags.Render).toBe(expectedRender);
    });

    it('should check if specific flag is set', () =>
    {
        const flags = DirtyFlags.Render | DirtyFlags.Children; // 15 | 16 = 31

        expect((flags & DirtyFlags.Transform) !== 0).toBe(true);
        expect((flags & DirtyFlags.Appearance) !== 0).toBe(true);
        expect((flags & DirtyFlags.Clip) !== 0).toBe(true);
        expect((flags & DirtyFlags.CacheAsBitmap) !== 0).toBe(false);
        expect((flags & DirtyFlags.Children) !== 0).toBe(true);
        expect((flags & DirtyFlags.TransformedBounds) !== 0).toBe(false);
        expect((flags & DirtyFlags.None) !== 0).toBe(false);
    });

    it('should correctly unset a flag', () =>
    {
        let flags = DirtyFlags.Render | DirtyFlags.Children; // 31
        flags &= ~DirtyFlags.Clip; // Remove Clip (4)
        expect((flags & DirtyFlags.Clip) !== 0).toBe(false);
        expect(flags).toBe(DirtyFlags.Transform | DirtyFlags.Appearance | DirtyFlags.CacheAsBitmap | DirtyFlags.Children); // 27
    });
});
