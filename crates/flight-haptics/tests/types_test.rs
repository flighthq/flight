use flight_haptics::contract::*;

mod get_haptic_impact_style_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_haptic_impact_style_string(HapticImpactStyle::Light),
            "light"
        );
        assert_eq!(
            get_haptic_impact_style_string(HapticImpactStyle::Medium),
            "medium"
        );
        assert_eq!(
            get_haptic_impact_style_string(HapticImpactStyle::Heavy),
            "heavy"
        );
        assert_eq!(
            get_haptic_impact_style_string(HapticImpactStyle::Soft),
            "soft"
        );
        assert_eq!(
            get_haptic_impact_style_string(HapticImpactStyle::Rigid),
            "rigid"
        );
    }
}

mod get_haptic_notification_type_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_haptic_notification_type_string(HapticNotificationType::Success),
            "success"
        );
        assert_eq!(
            get_haptic_notification_type_string(HapticNotificationType::Warning),
            "warning"
        );
        assert_eq!(
            get_haptic_notification_type_string(HapticNotificationType::Error),
            "error"
        );
    }
}

mod get_haptics_operation_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        let cases = [
            (HapticsOperation::Cancel, "cancel"),
            (HapticsOperation::Capabilities, "capabilities"),
            (HapticsOperation::Impact, "impact"),
            (HapticsOperation::IsSupported, "isSupported"),
            (HapticsOperation::Notification, "notification"),
            (HapticsOperation::Prepare, "prepare"),
            (HapticsOperation::Selection, "selection"),
            (HapticsOperation::Vibrate, "vibrate"),
            (HapticsOperation::VibratePattern, "vibratePattern"),
            (HapticsOperation::VibrateWaveform, "vibrateWaveform"),
        ];
        for (value, string) in cases {
            assert_eq!(get_haptics_operation_string(value), string);
        }
    }
}

mod parse_haptic_impact_style {
    use super::*;

    #[test]
    fn parses_exact_strings_and_rejects_other_spellings() {
        assert_eq!(
            parse_haptic_impact_style("light"),
            Some(HapticImpactStyle::Light)
        );
        assert_eq!(
            parse_haptic_impact_style("medium"),
            Some(HapticImpactStyle::Medium)
        );
        assert_eq!(
            parse_haptic_impact_style("heavy"),
            Some(HapticImpactStyle::Heavy)
        );
        assert_eq!(
            parse_haptic_impact_style("soft"),
            Some(HapticImpactStyle::Soft)
        );
        assert_eq!(
            parse_haptic_impact_style("rigid"),
            Some(HapticImpactStyle::Rigid)
        );
        assert_eq!(parse_haptic_impact_style("Light"), None);
        assert_eq!(parse_haptic_impact_style(""), None);
    }
}

mod parse_haptic_notification_type {
    use super::*;

    #[test]
    fn parses_exact_strings_and_rejects_other_spellings() {
        assert_eq!(
            parse_haptic_notification_type("success"),
            Some(HapticNotificationType::Success)
        );
        assert_eq!(
            parse_haptic_notification_type("warning"),
            Some(HapticNotificationType::Warning)
        );
        assert_eq!(
            parse_haptic_notification_type("error"),
            Some(HapticNotificationType::Error)
        );
        assert_eq!(parse_haptic_notification_type("Success"), None);
        assert_eq!(parse_haptic_notification_type(""), None);
    }
}

mod parse_haptics_operation {
    use super::*;

    #[test]
    fn parses_exact_strings_and_rejects_other_spellings() {
        let cases = [
            ("cancel", HapticsOperation::Cancel),
            ("capabilities", HapticsOperation::Capabilities),
            ("impact", HapticsOperation::Impact),
            ("isSupported", HapticsOperation::IsSupported),
            ("notification", HapticsOperation::Notification),
            ("prepare", HapticsOperation::Prepare),
            ("selection", HapticsOperation::Selection),
            ("vibrate", HapticsOperation::Vibrate),
            ("vibratePattern", HapticsOperation::VibratePattern),
            ("vibrateWaveform", HapticsOperation::VibrateWaveform),
        ];
        for (string, value) in cases {
            assert_eq!(parse_haptics_operation(string), Some(value));
        }
        assert_eq!(parse_haptics_operation("issupported"), None);
        assert_eq!(parse_haptics_operation(""), None);
    }
}
