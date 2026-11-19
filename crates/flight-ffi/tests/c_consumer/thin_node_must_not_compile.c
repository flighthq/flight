#include "flight_ffi.h"

typedef struct FakeThinNode FakeThinNode;

void pass_thin_node_to_fat_node_consumer(FakeThinNode *thin) {
  (void)flight_add_node_child(thin, thin);
}
