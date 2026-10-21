use std::sync::Arc;

use flight_entity::Unknown;
use flight_surface::contract::*;

#[derive(Debug, PartialEq, Eq)]
struct Drawable {
    id: i32,
}

fn drawable(id: i32) -> (Arc<Drawable>, Unknown) {
    let value = Arc::new(Drawable { id });
    return (value.clone(), Some(value));
}

mod allocate_surface {
    use super::*;

    #[test]
    fn puts_the_drawable_on_the_runtime_and_leaves_the_entity_data_free() {
        let (_, handle) = drawable(1);
        let surface: Surface = allocate_surface(handle);
        assert!(flight_entity::has_entity_runtime(&surface));
        let stored = get_surface_handle(&surface).expect("handle is stored");
        assert_eq!(stored.downcast_ref::<Drawable>(), Some(&Drawable { id: 1 }));
    }

    #[test]
    fn gives_each_surface_its_own_runtime_rather_than_a_shared_side_table() {
        let (_, first_handle) = drawable(1);
        let (_, second_handle) = drawable(2);
        let first: Surface = allocate_surface(first_handle);
        let second: Surface = allocate_surface(second_handle);
        assert!(!std::ptr::eq(
            get_surface_runtime(&first),
            get_surface_runtime(&second)
        ));
        assert_eq!(
            get_surface_handle(&first)
                .expect("first handle")
                .downcast_ref::<Drawable>(),
            Some(&Drawable { id: 1 })
        );
        assert_eq!(
            get_surface_handle(&second)
                .expect("second handle")
                .downcast_ref::<Drawable>(),
            Some(&Drawable { id: 2 })
        );
    }

    #[test]
    fn accepts_any_host_representation_including_non_object_and_null_handles() {
        let (_, handle) = drawable(7);
        let integer_surface: Surface = allocate_surface(handle);
        let stored = get_surface_handle(&integer_surface).expect("integer handle");
        assert_eq!(stored.downcast_ref::<Drawable>(), Some(&Drawable { id: 7 }));

        let number_handle: Unknown = Some(Arc::new(7_i32));
        let number_surface: Surface = allocate_surface(number_handle);
        assert_eq!(
            get_surface_handle(&number_surface)
                .expect("number handle")
                .downcast_ref::<i32>(),
            Some(&7_i32)
        );

        let null_surface: Surface = allocate_surface(None);
        assert!(get_surface_handle(&null_surface).is_none());
    }
}

mod get_surface_handle {
    use super::*;

    #[test]
    fn reads_through_the_runtime_the_surface_was_allocated_with_and_preserves_identity() {
        let (original, handle) = drawable(3);
        let surface: Surface = allocate_surface(handle);
        let read = get_surface_handle(&surface).expect("handle is readable");
        let original_any: Arc<dyn std::any::Any + Send + Sync> = original.clone();
        assert!(Arc::ptr_eq(&read, &original_any));
    }
}

mod get_surface_runtime {
    use super::*;

    #[test]
    fn returns_the_runtime_attached_to_the_entity_and_matches_the_handle_accessor() {
        let (original, handle) = drawable(4);
        let surface: Surface = allocate_surface(handle);
        let runtime = get_surface_runtime(&surface);
        let stored = runtime.handle.as_ref().expect("runtime handle");
        let original_any: Arc<dyn std::any::Any + Send + Sync> = original.clone();
        assert!(Arc::ptr_eq(stored, &original_any));
    }
}
