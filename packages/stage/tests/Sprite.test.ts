import { describe, it, expect } from 'vitest';
import { Sprite, create } from '../src/Sprite.js';

describe('create', () =>
{
    it('makes an instance of Sprite with default values', () =>
    {
        const sprite = create();
        expect(sprite).toBeInstanceOf(Sprite);
        expect(sprite.x).toBe(0);
        expect(sprite.y).toBe(0);
    });
});
