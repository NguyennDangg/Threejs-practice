import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";

export class PhysicsWorld {
  constructor() {
    this.world = null;
    this.bodies = new Map(); // mesh → { rigidBody, collider }
    this._ready = this._init();
  }

  async _init() {
    await RAPIER.init();
    const gravity = { x: 0, y: -9.81, z: 0 };
    this.world = new RAPIER.World(gravity);
  }

  async ready() {
    await this._ready;
  }

  // ---- body creation ------------------------------------------------
  // All dimensions in THREE units, Rapier converts internally.

  addBox(mesh, { mass = 1, restitution = 0.4, friction = 0.6 } = {}) {
    if (!this.world) throw new Error("PhysicsWorld not ready");

    const box = mesh.geometry.boundingBox;
    if (!box) mesh.geometry.computeBoundingBox();
    const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3());

    const desc =
      mass > 0 ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed();

    const body = this.world.createRigidBody(
      desc
        .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
        .setRotation(mesh.quaternion),
    );

    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
        .setRestitution(restitution)
        .setFriction(friction),
      body,
    );

    this.bodies.set(mesh, { body, collider });
    return body;
  }

  addSphere(mesh, { mass = 1, restitution = 0.5, friction = 0.5 } = {}) {
    if (!this.world) throw new Error("PhysicsWorld not ready");

    const sphere = mesh.geometry.boundingSphere;
    if (!sphere) mesh.geometry.computeBoundingSphere();
    const radius = mesh.geometry.boundingSphere.radius;

    const desc =
      mass > 0 ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed();

    const body = this.world.createRigidBody(
      desc.setTranslation(mesh.position.x, mesh.position.y, mesh.position.z),
    );

    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(radius)
        .setRestitution(restitution)
        .setFriction(friction),
      body,
    );

    this.bodies.set(mesh, { body, collider });
    return body;
  }

  addCylinder(mesh, { mass = 1, restitution = 0.4, friction = 0.6 } = {}) {
    if (!this.world) throw new Error("PhysicsWorld not ready");

    // Assume CylinderGeometry(radiusTop, radiusBottom, height)
    const params = mesh.geometry.parameters;
    const radius = params.radiusTop ?? 0.5;
    const height = params.height ?? 1;

    const desc =
      mass > 0 ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed();

    const body = this.world.createRigidBody(
      desc
        .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
        .setRotation(mesh.quaternion),
    );

    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(height / 2, radius)
        .setRestitution(restitution)
        .setFriction(friction),
      body,
    );

    this.bodies.set(mesh, { body, collider });
    return body;
  }

  remove(mesh) {
    const entry = this.bodies.get(mesh);
    if (!entry) return;
    this.world.removeCollider(entry.collider, true);
    this.world.removeRigidBody(entry.body);
    this.bodies.delete(mesh);
  }

  // ---- apply forces -------------------------------------------------

  applyImpulse(mesh, force) {
    const entry = this.bodies.get(mesh);
    if (!entry) return;
    entry.body.applyImpulse(force, true);
  }

  setLinearVelocity(mesh, velocity) {
    const entry = this.bodies.get(mesh);
    if (!entry) return;
    entry.body.setLinvel(velocity, true);
  }

  // ---- step ---------------------------------------------------------

  step(dt) {
    if (!this.world) return;
    this.world.step();

    // Sync Three.js meshes from Rapier bodies
    for (const [mesh, { body }] of this.bodies) {
      if (body.isDynamic()) {
        const pos = body.translation();
        const rot = body.rotation();
        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
      }
    }
  }
}
