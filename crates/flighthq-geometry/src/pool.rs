//! Generic object pool for `acquire`/`release` bracket allocation.
//!
//! Every [`Pool::acquire`] must be paired with a [`Pool::release`].
//! Treat the pair like open/close brackets — do not acquire without releasing.

/// A simple stack-based pool for reusable values of type `T`.
///
/// `T` must implement [`Default`] (used when the pool is empty) and [`Clone`]
/// (used when the value must be cleared before reuse by the caller).
pub struct Pool<T: Default> {
    items: Vec<T>,
}

impl<T: Default> Pool<T> {
    /// Creates an empty pool.
    pub fn new() -> Self {
        Pool { items: Vec::new() }
    }

    /// Acquires a value from the pool, or creates a new default value if the pool is empty.
    pub fn acquire(&mut self) -> T {
        self.items.pop().unwrap_or_default()
    }

    /// Returns a previously acquired value back to the pool.
    pub fn release(&mut self, item: T) {
        self.items.push(item);
    }

    /// Clears all pooled values, dropping them immediately.
    pub fn clear(&mut self) {
        self.items.clear();
    }

    /// Returns the number of items currently in the pool.
    pub fn len(&self) -> usize {
        self.items.len()
    }

    /// Returns `true` if the pool is empty.
    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }
}

impl<T: Default> Default for Pool<T> {
    fn default() -> Self {
        Pool::new()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // acquire
    #[test]
    fn acquire_from_empty_pool_returns_default() {
        let mut pool: Pool<i32> = Pool::new();
        let val = pool.acquire();
        assert_eq!(val, 0);
    }

    // clear
    #[test]
    fn clear_empties_pool() {
        let mut pool: Pool<i32> = Pool::new();
        pool.release(1);
        pool.release(2);
        pool.clear();
        assert!(pool.is_empty());
    }

    // is_empty
    #[test]
    fn is_empty_on_new_pool() {
        let pool: Pool<i32> = Pool::new();
        assert!(pool.is_empty());
    }

    // len
    #[test]
    fn len_tracks_released_items() {
        let mut pool: Pool<i32> = Pool::new();
        pool.release(1);
        pool.release(2);
        assert_eq!(pool.len(), 2);
    }

    // release then acquire
    #[test]
    fn release_then_acquire_returns_same_value() {
        let mut pool: Pool<i32> = Pool::new();
        pool.release(42);
        let val = pool.acquire();
        assert_eq!(val, 42);
    }

    #[test]
    fn acquire_decrements_pool_len() {
        let mut pool: Pool<i32> = Pool::new();
        pool.release(1);
        pool.release(2);
        pool.acquire();
        assert_eq!(pool.len(), 1);
    }

    #[test]
    fn pool_lifo_order() {
        let mut pool: Pool<i32> = Pool::new();
        pool.release(1);
        pool.release(2);
        pool.release(3);
        assert_eq!(pool.acquire(), 3);
        assert_eq!(pool.acquire(), 2);
        assert_eq!(pool.acquire(), 1);
    }

    #[test]
    fn default_pool_is_empty() {
        let pool: Pool<i32> = Pool::default();
        assert!(pool.is_empty());
    }
}
