import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Peg {
  constructor(scene, world, x, y, z = 0, radius, row = 0, height = 2.0) {
    this.scene = scene;
    this.world = world;
    this.x = x;
    this.y = y;
    this.z = z;
    this.radius = radius;
    this.height = height;
    this.row = row;
    this.count = 0;

    this.createPhysicsBody();
    this.createVisualMesh();
  }

  createPhysicsBody() {
    // Use a Sphere for physics (rotationally invariant, no orientation, exactly
    // left-right symmetric). The visual is still a cylinder (createVisualMesh).
    // Cannon-es's Cylinder is a 16-gon convex polyhedron whose vertices align
    // with world axes after our rotation, which gives every peg a tiny
    // direction-biased SAT tie-break — that compounds row-by-row into a
    // one-sided distribution. Balls stay near z=0 and the cylinder spans the
    // full play depth, so a sphere of the same radius matches the side-impact
    // geometry exactly while removing the bias.
    this.body = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Sphere(this.radius),
      position: new CANNON.Vec3(this.x, this.y, this.z),
    });

    this.body.userData = { peg: this };
    this.world.addBody(this.body);
  }

  createVisualMesh() {
    this.mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(this.radius, this.radius, this.height, 16),
      new THREE.MeshStandardMaterial({ color: 0x8888ff })
    );
    // Three's CylinderGeometry axis is along y; rotate to z to match the body.
    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.position.copy(this.body.position);
    this.scene.add(this.mesh);
  }
  
  getBody() {
    return this.body;
  }
  
  reset() {
    this.count = 0;
  }
  
  destroy() {
    this.world.removeBody(this.body);
    this.scene.remove(this.mesh);
  }
}

export function createPegGrid(scene, world, pegRows, pegSpacingX, pegSpacingY, pegRadius) {
  const pegs = [];

  // Rectangular hex-packed grid: every row spans the full width
  // ±(pegRows-1)*pegSpacingX, with pegs at every other integer multiple of
  // pegSpacingX. Adjacent rows alternate parity so the hex offset between
  // them is preserved (otherwise balls would fall straight through column
  // gaps without ever hitting a peg). Both row parities are centered on x=0.
  const span = 2 * (pegRows - 1);
  for (let i = 0; i < pegRows; i++) {
    for (let j = 0; j <= span; j++) {
      if ((j + i) % 2 !== 0) continue;
      const x = (j - (pegRows - 1)) * pegSpacingX;
      const y = -i * pegSpacingY;
      pegs.push(new Peg(scene, world, x, y, 0, pegRadius, i));
    }
  }

  return pegs;
} 