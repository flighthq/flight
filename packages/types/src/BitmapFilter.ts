import type { Kind } from './Entity';

// Open base contract for every bitmap filter. Each concrete filter is plain data carrying a `kind`
// discriminant (the canonical PascalCase type name); per-backend recipes operate on the concrete
// filter type directly. A new filter is added by defining its interface (extending BitmapFilter with a
// literal `kind`) — no central union to edit here.
export interface BitmapFilter {
  readonly kind: Kind;
}
