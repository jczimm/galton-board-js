import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PEG_SPACING_X, PEG_SPACING_Y } from './constants.js';

const DEBUG_STATIC = false;

let ballIdCounter = 0;
export class Ball {
  constructor(scene, world, x = 0, y = 2, z = 0, radius) {
    this.id = ballIdCounter++;
    this.scene = scene;
    this.world = world;
    this.radius = radius;
    this.inBucket = null;
    this.lastWakeTime = 0; // Track when this ball was last woken up
    this.spawnTime = performance.now(); // Track when this ball was created
    
    // Position tracking for displacement measurement
    this.positionHistory = [];
    this.lastDisplacementCheck = performance.now();
    
    // Collision-based movement tracking
    this.lastCollisionPosition = null; // Store only the last collision position
    this.smallMovementCounter = 0; // Count consecutive small movements
    this.smallMovementThreshold = 0.5; // Displacement threshold for "small movement"
    this.maxSmallMovements = 500; // If we see this many small movements in a row, mark as static

    this.createPhysicsBody(x, y, z);
    this.createVisualMesh();
    this.setupSmartWakeUp();
  }
  
  createPhysicsBody(x, y, z) {
    this.body = new CANNON.Body({
      mass: 1,
      shape: new CANNON.Sphere(this.radius),
      position: new CANNON.Vec3(x, y, z),
      allowSleep: true,
    });

    // Don't allow air resistance to slightly affect trajectory
    this.body.linearDamping = 0;
    this.body.angularDamping = 0;
    
    // Store reference to this ball instance on the physics body
    this.body.userData = { ball: this };

    this.world.addBody(this.body);
  }

  setupPegCollisionHandler(ballFactory) {
    this.addCollisionListener((event) => {
      const { body } = event;
      if (body?.userData?.peg === undefined) return;

      const peg = body.userData.peg;
      peg.count++;

      // // Override the physics deflection with an explicit 50/50 left/right
      // // trajectory: each peg is a fresh coin flip, the textbook Galton board.
      // // Aim for an arc that lands on the next-row neighbor peg one column over.
      // const g = -this.body.world.gravity.y;
      // const yMax = PEG_SPACING_Y + 0.25 + 0.75 * Math.random() * PEG_SPACING_Y;
      // const vy = Math.sqrt(2 * g * (yMax - PEG_SPACING_Y));
      // const tTotal = vy / g + Math.sqrt(2 * yMax / g);
      // const vx = PEG_SPACING_X / tTotal;
      // const direction = Math.random() < 0.5 ? -1 : 1;
      // this.setVelocity(vx * direction, vy, 0);

      // Spawn a new ball on the first collision with any peg past row 0.
      // Idempotency is enforced by the caller's ballFactory.
      if (peg.row > 0) {
        ballFactory();
      }
    });
  };
  
  setupSmartWakeUp() {
    // Override the default collision behavior to implement smart wake-up
    this.body.addEventListener('collide', (event) => {
      this.handleSmartWakeUp(event);
    });
  }
  
  handleSmartWakeUp(event) {
    // Record current position on collision
    this.recordCollisionPosition();
    
    // Check if ball should be marked as static
    this.checkForStaticState();

  }
  
  recordCollisionPosition() {
    const currentPosition = this.body.position.clone();
    
    // If this is the first collision, just store the position
    if (this.lastCollisionPosition === null) {
      this.lastCollisionPosition = currentPosition;
      return;
    }
    
    // Calculate displacement from last collision
    const displacement = currentPosition.distanceTo(this.lastCollisionPosition);
    
    // If displacement is small, increment counter; otherwise reset it
    if (displacement < this.smallMovementThreshold) {
      this.smallMovementCounter++;
    } else {
      this.smallMovementCounter = 0;
      this.lastCollisionPosition = currentPosition;
    }
  }
  
  checkForStaticState() {
    // If we've seen enough consecutive small movements, mark as static
    if (this.smallMovementCounter >= this.maxSmallMovements) {
      this.body.type = CANNON.Body.STATIC;
      this.isStatic = true;
    }
  }
  
  
  createVisualMesh() {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xff4444 })
    );
    this.scene.add(this.mesh);
  }
  
  update() {
    // Update visual mesh position and rotation from physics body
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);
    
    // Track position for displacement calculation
    this.updatePositionHistory();
    
    // Update color based on sleep state
    if (DEBUG_STATIC) {
      this.updateSleepColor();
    }
  }
  
  updatePositionHistory() {
    const now = performance.now();
    const currentPos = this.body.position.clone();
    
    // Add current position to history with timestamp
    this.positionHistory.push({
      position: currentPos,
      time: now
    });
    
    // Keep only the last 1 second of history
    const cutoffTime = now - 1000;
    this.positionHistory = this.positionHistory.filter(entry => entry.time > cutoffTime);
  }
  
  getDisplacementInLastSecond() {
    if (this.positionHistory.length < 2) return 0;
    
    const newest = this.positionHistory[this.positionHistory.length - 1];
    const oldest = this.positionHistory[0];
    
    return newest.position.distanceTo(oldest.position);
  }
  
  updateSleepColor() {
    const material = this.mesh.material;
    
    // Show static balls in a distinct color
    if (this.body.type === CANNON.Body.STATIC) {
      material.color.setHex(0x444444); // Dark gray - static/jiggling
      return;
    }
    
    switch (this.body.sleepState) {
      case CANNON.Body.AWAKE:
        material.color.setHex(0xff4444); // Bright red - active
        break;
      case CANNON.Body.SLEEPY:
        material.color.setHex(0xff8844); // Orange - getting sleepy
        break;
      case CANNON.Body.SLEEPING:
        material.color.setHex(0x661111); // Dark red - sleeping
        break;
      default:
        material.color.setHex(0xff4444); // Default to bright red
    }
  }
  
  setVelocity(x, y, z) {
    this.body.velocity.set(x, y, z);
  }
  
  getPosition() {
    return this.body.position;
  }
  
  addCollisionListener(callback) {
    this.body.addEventListener('collide', callback);
  }
  
  destroy() {
    this.world.removeBody(this.body);
    this.scene.remove(this.mesh);
  }
  
  static createRandomBall(scene, world, radius, y = 4) {
    // Small lateral jitter so the ball doesn't land dead-center on a
    // perfectly-symmetric top peg (under real physics, that bounces straight
    // up forever). This is the analog of a real Galton hopper releasing balls
    // with tiny positional variation — the only source of randomness needed.
    const jitter = (Math.random() - 0.5) * radius;
    return new Ball(scene, world, jitter, y, 0, radius);
  }
} 