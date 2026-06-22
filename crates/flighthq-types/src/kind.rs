use std::any::TypeId;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::atomic::{AtomicU64, Ordering};

/// Runtime identifier for a scene graph primitive type.
///
/// Serves two roles: keys for renderer registration and scene graph hierarchy enforcement.
/// Created with `KindId::of::<T>()` for type-derived stability, or `KindId::new()` for
/// a unique runtime-allocated id.
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub struct KindId(u64);

impl KindId {
    /// Returns the stable `KindId` derived from `T`'s `TypeId`.
    pub fn of<T: 'static>() -> Self {
        let mut h = DefaultHasher::new();
        TypeId::of::<T>().hash(&mut h);
        KindId(h.finish())
    }

    /// Allocates a new unique `KindId` using a monotonic counter.
    ///
    /// The counter starts at `1 << 32` so runtime ids never collide with
    /// hashed type ids in the lower 32 bits.
    pub fn new() -> Self {
        static COUNTER: AtomicU64 = AtomicU64::new(1 << 32);
        KindId(COUNTER.fetch_add(1, Ordering::Relaxed))
    }

    /// Returns the raw u64 value.
    #[inline]
    pub fn as_u64(self) -> u64 {
        self.0
    }
}

impl Default for KindId {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Foo;
    struct Bar;

    #[test]
    fn of_is_stable() {
        assert_eq!(KindId::of::<Foo>(), KindId::of::<Foo>());
    }

    #[test]
    fn of_is_unique_across_types() {
        assert_ne!(KindId::of::<Foo>(), KindId::of::<Bar>());
    }

    #[test]
    fn new_is_monotonic() {
        let a = KindId::new();
        let b = KindId::new();
        let c = KindId::new();
        assert!(a.as_u64() < b.as_u64());
        assert!(b.as_u64() < c.as_u64());
    }

    #[test]
    fn new_does_not_collide_with_of() {
        let runtime = KindId::new();
        let typed = KindId::of::<Foo>();
        assert_ne!(runtime, typed);
    }

    #[test]
    fn copy_and_eq() {
        let a = KindId::of::<Foo>();
        let b = a;
        assert_eq!(a, b);
    }
}
