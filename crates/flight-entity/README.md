# flight-entity

Entity lifecycle management: allocation, finalization, runtime keys, and component storage. Also home of the IR vocabulary aliases (`Ref`, `Kind`, `AnySlot`, and the typed-array aliases).

## Numeric id

`get_entity_id(&entity) -> u64` reads the id assigned when the entity's runtime slot was allocated (D12, Principal c92ee207). One process-wide atomic sequence supplies it, starting at 1 and never reused, so it is unique across threads and increases with allocation order. A clone is a new allocation and gets a new id. The same allocation keeps its id through initialize, binding and uid operations. The id is identity, not value: it is excluded from equality and Debug, never serialized, and independent of the string uid. Ids stay below `ENTITY_ID_LIMIT` (2^53, exact as a TS number); exhausting the range is a RangeError. The slot is the id plus one thin pointer that stays null until a runtime is needed.

## Precision

- `Float64Array = [f64]`: vocabulary alias for TS `Float64Array`, used only where a TS API declares one.
