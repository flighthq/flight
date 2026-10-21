use flight_permissions::{
    HostMidiPermissionCapability, PermissionQueryOutcome, PermissionQueryReason,
};

pub async fn get_midi_permission(
    host_midi_permission: &HostMidiPermissionCapability,
) -> PermissionQueryOutcome {
    return match (host_midi_permission.get_permission)().await {
        Ok(outcome) => outcome,
        Err(_) => PermissionQueryOutcome {
            reason: PermissionQueryReason::OperationFailed,
            state: None,
        },
    };
}
