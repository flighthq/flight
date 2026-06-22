// Bounce/damping response shared by every particle collider: `restitution` is the normal-direction
// bounce factor, `friction` damps the tangential velocity on contact.
export interface CollisionResponse {
  restitution?: number;
  friction?: number;
}
