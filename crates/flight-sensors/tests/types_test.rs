use flight_sensors::contract::*;

mod get_sensor_accuracy_string {
    use super::*;

    #[test]
    fn returns_every_exact_source_literal() {
        assert_eq!(get_sensor_accuracy_string(SensorAccuracy::High), "high");
        assert_eq!(get_sensor_accuracy_string(SensorAccuracy::Low), "low");
        assert_eq!(get_sensor_accuracy_string(SensorAccuracy::Medium), "medium");
        assert_eq!(
            get_sensor_accuracy_string(SensorAccuracy::Unknown),
            "unknown"
        );
    }
}

mod get_sensors_permission_sensor_string {
    use super::*;

    #[test]
    fn returns_every_exact_source_literal() {
        assert_eq!(
            get_sensors_permission_sensor_string(SensorsPermissionSensor::Magnetometer),
            "magnetometer"
        );
        assert_eq!(
            get_sensors_permission_sensor_string(SensorsPermissionSensor::Motion),
            "motion"
        );
        assert_eq!(
            get_sensors_permission_sensor_string(SensorsPermissionSensor::Orientation),
            "orientation"
        );
    }
}

mod get_sensors_permission_state_string {
    use super::*;

    #[test]
    fn returns_every_exact_source_literal() {
        assert_eq!(
            get_sensors_permission_state_string(SensorsPermissionState::Denied),
            "denied"
        );
        assert_eq!(
            get_sensors_permission_state_string(SensorsPermissionState::Granted),
            "granted"
        );
        assert_eq!(
            get_sensors_permission_state_string(SensorsPermissionState::Prompt),
            "prompt"
        );
        assert_eq!(
            get_sensors_permission_state_string(SensorsPermissionState::Unsupported),
            "unsupported"
        );
    }
}

mod parse_sensor_accuracy {
    use super::*;

    #[test]
    fn round_trips_all_literals_and_rejects_unknown_input() {
        for value in [
            SensorAccuracy::High,
            SensorAccuracy::Low,
            SensorAccuracy::Medium,
            SensorAccuracy::Unknown,
        ] {
            assert_eq!(
                parse_sensor_accuracy(get_sensor_accuracy_string(value)),
                Some(value)
            );
        }
        assert_eq!(parse_sensor_accuracy("HIGH"), None);
    }
}

mod parse_sensors_permission_sensor {
    use super::*;

    #[test]
    fn round_trips_all_literals_and_rejects_unknown_input() {
        for value in [
            SensorsPermissionSensor::Magnetometer,
            SensorsPermissionSensor::Motion,
            SensorsPermissionSensor::Orientation,
        ] {
            assert_eq!(
                parse_sensors_permission_sensor(get_sensors_permission_sensor_string(value)),
                Some(value)
            );
        }
        assert_eq!(parse_sensors_permission_sensor("ambient-light"), None);
    }
}

mod parse_sensors_permission_state {
    use super::*;

    #[test]
    fn round_trips_all_literals_and_rejects_unknown_input() {
        for value in [
            SensorsPermissionState::Denied,
            SensorsPermissionState::Granted,
            SensorsPermissionState::Prompt,
            SensorsPermissionState::Unsupported,
        ] {
            assert_eq!(
                parse_sensors_permission_state(get_sensors_permission_state_string(value)),
                Some(value)
            );
        }
        assert_eq!(parse_sensors_permission_state("allowed"), None);
    }
}
