// flight-lint: conform-skip(finishEntity) D12: a type-only cast with no runtime effect; create_* is allocate_entity + initialize_*

/// The single named allocation hook (D12; TS `allocateEntity`): returns a value of the entity
/// type with an empty runtime slot, ready for `initialize_*`.
pub fn allocate_entity<T: Default>() -> T {
    return T::default();
}
