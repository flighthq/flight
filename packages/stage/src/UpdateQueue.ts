import type { BitmapDrawable } from './BitmapDrawable.js';

export default class UpdateQueue
{
    private static items = new Set<BitmapDrawable>();

    static add(obj: BitmapDrawable)
    {
        if (!this.items.has(obj))
        {
            this.items.add(obj);
        }
    }

    static process()
    {
        // this.items.forEach((obj) => obj.validate());
        this.items.clear();
    }

    static has(obj: BitmapDrawable): boolean
    {
        return this.items.has(obj);
    }
}
