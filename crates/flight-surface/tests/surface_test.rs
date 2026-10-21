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
        let surface: flight_entity::Ref<SurfaceBase> = allocate_surface(handle);
        let borrowed = surface.read().unwrap();
        assert!(flight_entity::has_entity_runtime(&*borrowed));
        let stored = get_surface_handle(&*borrowed).expect("handle is stored");
        assert_eq!(stored.downcast_ref::<Drawable>(), Some(&Drawable { id: 1 }));
    }

    #[test]
    fn gives_each_surface_its_own_runtime_rather_than_a_shared_side_table() {
        let (_, first_handle) = drawable(1);
        let (_, second_handle) = drawable(2);
        let first: flight_entity::Ref<SurfaceBase> = allocate_surface(first_handle);
        let second: flight_entity::Ref<SurfaceBase> = allocate_surface(second_handle);
        let first_borrowed = first.read().unwrap();
        let second_borrowed = second.read().unwrap();
        assert!(!std::ptr::eq(
            get_surface_runtime(&*first_borrowed),
            get_surface_runtime(&*second_borrowed)
        ));
    }

    #[test]
    fn accepts_any_host_representation_including_non_object_and_null_handles() {
        let number_handle: Unknown = Some(Arc::new(7_i32));
        let surface: flight_entity::Ref<SurfaceBase> = allocate_surface(number_handle);
        let borrowed = surface.read().unwrap();
        assert_eq!(
            get_surface_handle(&*borrowed)
                .expect("number handle")
                .downcast_ref::<i32>(),
            Some(&7_i32)
        );
        let null_surface: flight_entity::Ref<SurfaceBase> = allocate_surface(None);
        assert!(get_surface_handle(&*null_surface.read().unwrap()).is_none());
    }
}

mod get_surface_handle {
    use super::*;

    #[test]
    fn reads_through_the_runtime_and_preserves_identity() {
        let (original, handle) = drawable(3);
        let surface: flight_entity::Ref<SurfaceBase> = allocate_surface(handle);
        let read = get_surface_handle(&*surface.read().unwrap()).expect("handle is readable");
        let expected: Arc<dyn std::any::Any + Send + Sync> = original.clone();
        assert!(Arc::ptr_eq(&read, &expected));
    }
}

mod get_surface_runtime {
    use super::*;

    #[test]
    fn returns_the_runtime_attached_to_the_entity_and_matches_the_handle_accessor() {
        let (original, handle) = drawable(4);
        let surface: flight_entity::Ref<SurfaceBase> = allocate_surface(handle);
        let borrowed = surface.read().unwrap();
        let stored = get_surface_runtime(&*borrowed)
            .handle
            .as_ref()
            .expect("runtime handle");
        let expected: Arc<dyn std::any::Any + Send + Sync> = original.clone();
        assert!(Arc::ptr_eq(stored, &expected));
    }
}
