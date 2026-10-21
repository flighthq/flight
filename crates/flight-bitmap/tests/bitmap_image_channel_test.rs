use flight_bitmap::contract::*;

mod image_channel_values {
    use super::*;

    #[test]
    fn red_is_zero() {
        assert_eq!(ImageChannel::Red as u8, 0);
    }

    #[test]
    fn green_is_one() {
        assert_eq!(ImageChannel::Green as u8, 1);
    }

    #[test]
    fn blue_is_two() {
        assert_eq!(ImageChannel::Blue as u8, 2);
    }

    #[test]
    fn alpha_is_three() {
        assert_eq!(ImageChannel::Alpha as u8, 3);
    }
}
