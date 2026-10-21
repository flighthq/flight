// The type's construction defaults, for struct-update syntax in tests.
pub fn defaults<T: Default>() -> T {
    let make: fn() -> T = T::default;
    return make();
}
