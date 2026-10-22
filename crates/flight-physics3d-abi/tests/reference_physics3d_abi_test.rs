use flight_entity::get_entity_id;
use flight_physics3d_abi::contract::*;

mod create_reference_physics3d_abi {
    use super::*;

    #[test]
    fn creates_isolated_persistent_world_storage_under_the_public_abi_version() {
        let first = create_reference_physics3d_abi();
        let second = create_reference_physics3d_abi();
        let first_world = (first.create_world)();
        let second_world = (second.create_world)();

        assert_eq!(first.version, PHYSICS3D_ABI_VERSION);
        assert_eq!(first_world, 1);
        assert_eq!(second_world, 1);
        assert!((first.destroy_world)(first_world));
        assert!((second.destroy_world)(second_world));
    }
}

mod initialize_reference_physics3d_abi {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_reference_physics3d_abi() {
        let mut abi = create_reference_physics3d_abi();
        let id = get_entity_id(&abi);
        let old = (abi.create_world)();

        initialize_reference_physics3d_abi(&mut abi);

        // A fresh backend: the old world table is gone, the identity is the same allocation.
        assert_eq!((abi.get_world_status)(old), Physics3DAbiWorldStatus::Stale);
        assert_eq!(abi.version, PHYSICS3D_ABI_VERSION);
        assert_eq!(get_entity_id(&abi), id);
        assert_eq!((abi.create_world)(), 1);
    }
}
