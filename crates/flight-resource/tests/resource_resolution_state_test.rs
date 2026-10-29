use flight_resource::*;

fn get_state_ordinal(state: ResourceResolutionState) -> u32 {
    return match state {
        ResourceResolutionState::Failed => 0,
        ResourceResolutionState::Loading => 1,
        ResourceResolutionState::Resolved => 2,
        ResourceResolutionState::Unresolved => 3,
    };
}

mod resource_resolution_state {
    use super::*;

    #[test]
    fn is_a_closed_four_member_vocabulary() {
        assert_eq!(get_state_ordinal(ResourceResolutionState::Failed), 0);
        assert_eq!(get_state_ordinal(ResourceResolutionState::Loading), 1);
        assert_eq!(get_state_ordinal(ResourceResolutionState::Resolved), 2);
        assert_eq!(get_state_ordinal(ResourceResolutionState::Unresolved), 3);
    }
}
