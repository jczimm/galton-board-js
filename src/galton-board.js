import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as CANNON from 'cannon-es';
import { createBuckets } from './buckets.js';
import { Ball } from './balls.js';
import { Peg, createPegGrid } from './pegs.js';
import { PEG_SPACING_X, PEG_SPACING_Y, PEG_RADIUS, BALL_RADIUS } from './constants.js';

export class GaltonBoard extends EventTarget {
  constructor(options = {}) {
    super();

    // Extract options with defaults
    const {
      container,
      width = 800,
      height = 600,
      pegRows = 12,
      pegPositions,
      pegRadius = PEG_RADIUS,
      ballRadius = BALL_RADIUS,
      autoSpawn = true,
      parallelBalls = 1,
      diagonalWalls = false,
      gravity = 9.81,
      animationSpeed = 1.0
    } = options;

    if (!container) {
      throw new Error('Container element is required');
    }

    // Store configuration
    this.container = container;
    this.width = width;
    this.height = height;
    this.pegRows = pegRows;
    this.pegPositions = pegPositions;
    this.pegRadius = pegRadius;
    this.ballRadius = ballRadius;
    this.autoSpawn = autoSpawn;
    this.parallelBalls = Math.max(1, parallelBalls);
    this.diagonalWalls = diagonalWalls;
    this.gravity = gravity;
    this.animationSpeed = animationSpeed;
    this.boardHeight = this.pegRows * PEG_SPACING_Y;

    // Initialize instance variables
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.world = null;
    this.balls = [];
    this.pegs = null;
    this.buckets = null;
    this.clock = null;
    this.animationId = null;
    this.isInitialized = false;
    this.ballsSpawned = 0;
    this.pendingSpawnTimers = new Set();

    this.initialize();
  }

  initialize() {
    if (this.isInitialized) return;

    console.log(`Initializing simulation. Pegs: ${this.pegRows}`);

    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f0f0);
    
    this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 1000);
    this.camera.position.set(0, -this.boardHeight / 2, 25);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.width, this.height);

    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, -this.boardHeight / 2, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enableZoom = true;

    // Physics
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -this.gravity, 0),
    });

    this.world.allowSleep = true;

    const material = new CANNON.Material();
    this.world.defaultContactMaterial = new CANNON.ContactMaterial(material, material, {
      friction: 1.,
      restitution: 0,
    });

    // Balls have their own material so we can give ball-vs-ball pairs zero
    // friction (so balls slip past each other without dragging) while keeping
    // default friction for ball-vs-peg/bucket/wall interactions (which don't
    // assign an explicit material → fall back to defaultContactMaterial).
    // Every spawned ball is tagged with this material in spawnBall.
    this.ballMaterial = new CANNON.Material('ball');
    this.world.addContactMaterial(new CANNON.ContactMaterial(
      this.ballMaterial, this.ballMaterial,
      { friction: 0.3, restitution: 0. }
    ));

    // Create pegs
    if (this.pegPositions) {
      this.pegs = this.createPegsFromPositions(this.pegPositions);
    } else {
      this.pegs = createPegGrid(this.scene, this.world, this.pegRows, PEG_SPACING_X, PEG_SPACING_Y, this.pegRadius);
    }

    // Create buckets
    this.buckets = createBuckets(this.scene, this.world, this.pegRows, PEG_SPACING_X, PEG_SPACING_Y);
    this.buckets.forEach(bucket => {
      bucket.addEventListener('ball-entered-bucket', this.onBallEnteredBucket.bind(this));
    });

    // Funnel above the top peg — collimates every ball into a narrow stream.
    // Built before the diagonal walls so they can hinge off its mouth.
    this.funnelBodies = [];
    this.funnelMeshes = [];
    this.createFunnel();

    // Optional diagonal walls hugging the peg-triangle envelope
    this.diagonalWallBodies = [];
    this.diagonalWallMeshes = [];
    if (this.diagonalWalls) {
      this.createDiagonalWalls();
    }

    // Setup lighting
    this.setupLighting();

    this.ballsSpawned = 0;
    if (this.autoSpawn) {
      this.startSpawnChains();
    }

    this.clock = new THREE.Clock();
    this.isInitialized = true;
    this.startAnimation();
  }

  createPegsFromPositions(positions) {
    const pegs = [];
    for (let row = 0; row < positions.length; row++) {
      for (const pos of positions[row]) {
        const x = pos[0];
        const y = pos[1];
        const z = pos[2] || 0;
        pegs.push(new Peg(this.scene, this.world, x, y, z, this.pegRadius, row));
      }
    }
    console.log(pegs);
    return pegs;
  }

  // Build two long thin walls along the left and right diagonals of the
  // peg-triangle, just outside the envelope of the actual pegs. Catches balls
  // that bounce energetically enough to escape the grid sideways (especially
  // common with high restitution).
  createDiagonalWalls() {
    const colSpacing = 2 * PEG_SPACING_X;
    const margin = colSpacing;

    let leftEdge = 0;
    let rightEdge = 0;
    let bottomY = 0;
    if (this.pegPositions) {
      for (const row of this.pegPositions) {
        for (const [x, y] of row) {
          if (x < leftEdge) leftEdge = x;
          if (x > rightEdge) rightEdge = x;
          if (y < bottomY) bottomY = y;
        }
      }
    } else {
      const lastRow = this.pegRows - 1;
      leftEdge = -lastRow * PEG_SPACING_X;
      rightEdge = lastRow * PEG_SPACING_X;
      bottomY = -lastRow * PEG_SPACING_Y;
    }

    // Hinge each diagonal at the inner (exit) corner of the funnel so the
    // diagonals continue outward from where the funnel walls end.
    const exitY = this.funnelExitY;
    const exitHalfWidth = this.funnelExitHalfWidth;
    const cx = this.funnelCenterX;

    this.buildStaticWall(cx - exitHalfWidth, exitY, leftEdge - margin, bottomY - margin, this.diagonalWallBodies, this.diagonalWallMeshes);
    this.buildStaticWall(cx + exitHalfWidth, exitY, rightEdge + margin, bottomY - margin, this.diagonalWallBodies, this.diagonalWallMeshes);
  }

  // Build a thin static box wall from (ax, ay) to (bx, by), oriented along the
  // segment, and register the body+mesh in the supplied arrays for later cleanup.
  buildStaticWall(ax, ay, bx, by, bodies, meshes, { thickness = 0.1, depth = 2.0, color = 0x654321 } = {}) {
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const cx = (ax + bx) / 2;
    const cy = (ay + by) / 2;

    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(length / 2, thickness / 2, depth / 2)));
    body.position.set(cx, cy, 0);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), angle);
    this.world.addBody(body);
    bodies.push(body);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(length, thickness, depth),
      new THREE.MeshStandardMaterial({ color })
    );
    mesh.position.set(cx, cy, 0);
    mesh.rotation.z = angle;
    this.scene.add(mesh);
    meshes.push(mesh);
  }

  // Two angled walls forming a V above the top peg — every spawned ball passes
  // through the narrow exit before reaching the peg grid. Acts as a collimator
  // so the actual entry into the grid is consistent regardless of spawn jitter
  // or upstream perturbations. Walls use a frictionless contact material so
  // balls slide rather than catching/jamming at the narrow exit.
  createFunnel() {
    const mouthY = 9.5;
    const exitY = 2.;
    const mouthHalfWidth = 20.0;
    const exitHalfWidth = this.ballRadius * 1.5;
    const cx = 0; // top peg is at x=0 (custom.html xOffset shift, or grid default)

    // Stash for createDiagonalWalls so it can hinge the diagonals at the funnel.
    this.funnelMouthY = mouthY;
    this.funnelMouthHalfWidth = mouthHalfWidth;
    this.funnelExitY = exitY;
    this.funnelExitHalfWidth = exitHalfWidth;
    this.funnelCenterX = cx;

    const funnelMaterial = new CANNON.Material('funnel');
    this.world.addContactMaterial(new CANNON.ContactMaterial(
      this.ballMaterial, funnelMaterial,
      { friction: 0.001, restitution: 0. }
    ));

    this.buildStaticWall(cx - mouthHalfWidth, mouthY, cx - exitHalfWidth, exitY,
                         this.funnelBodies, this.funnelMeshes);
    this.buildStaticWall(cx + mouthHalfWidth, mouthY, cx + exitHalfWidth, exitY,
                         this.funnelBodies, this.funnelMeshes);

    for (const body of this.funnelBodies) {
      body.material = funnelMaterial;
    }
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const light = new THREE.DirectionalLight(0xffffff, 5);
    light.position.set(5, 10, 7.5);
    this.scene.add(light);

    const light2 = new THREE.DirectionalLight(0xffffff, 0.4);
    light2.position.set(-5, 5, 5);
    this.scene.add(light2);
  }

  // Kick off `parallelBalls` independent spawn chains. Each new ball perpetuates
  // its own chain via the row>0 collision trigger in spawnBall(). Initial spawns
  // are staggered by the free-fall time over one row spacing so balls never
  // overlap at the spawn point — overlapping bodies in cannon-es would resolve
  // by exploding upward. This matches a real Galton board's hopper releasing
  // balls in rapid sequence rather than simultaneously.
  startSpawnChains() {
    const staggerMs = 1000 * Math.sqrt(2 * PEG_SPACING_Y / this.gravity);
    this.spawnBall();
    for (let i = 1; i < this.parallelBalls; i++) {
      const timerId = setTimeout(() => {
        this.pendingSpawnTimers.delete(timerId);
        if (this.autoSpawn && this.isInitialized) this.spawnBall();
      }, i * staggerMs);
      this.pendingSpawnTimers.add(timerId);
    }
  }

  // True if no existing ball is close enough to the spawn point to overlap or
  // be hit by a freshly-created ball. Used to defer parallel spawns when the
  // hopper is still occupied (e.g. a previous ball jammed briefly in the funnel
  // or fell slowly enough that the next stagger tick has already arrived).
  isSpawnAreaClear() {
    const spawnX = 0;
    const spawnY = 4; // matches Ball.createRandomBall in balls.js
    const minDist = this.ballRadius * 2.5;
    const minDistSq = minDist * minDist;
    for (const ball of this.balls) {
      const dx = ball.body.position.x - spawnX;
      const dy = ball.body.position.y - spawnY;
      if (dx * dx + dy * dy < minDistSq) return false;
    }
    return true;
  }

  spawnBall() {
    if (!this.scene || !this.world) return null;

    // if (!this.isSpawnAreaClear()) {
    //   // Defer until the spawn region is clear; recheck shortly.
    //   const retryId = setTimeout(() => {
    //     this.pendingSpawnTimers.delete(retryId);
    //     if (this.autoSpawn && this.isInitialized) this.spawnBall();
    //   }, 40);
    //   this.pendingSpawnTimers.add(retryId);
    //   return null;
    // }

    const ball = Ball.createRandomBall(this.scene, this.world, this.ballRadius);
    ball.body.material = this.ballMaterial;
    this.ballsSpawned++;

    // Idempotent next-spawn trigger: fires once, on this ball's first collision
    // with any peg past row 0 (see balls.js#setupPegCollisionHandler).
    let nextSpawnTriggered = false;
    const triggerNextSpawn = () => {
      if (nextSpawnTriggered) return;
      nextSpawnTriggered = true;
      if (this.autoSpawn && this.isInitialized) {
        this.spawnBall();
      }
    };

    ball.setupPegCollisionHandler(triggerNextSpawn);

    this.balls.push(ball);
    
    // Dispatch custom event when ball is spawned
    this.dispatchEvent(new CustomEvent('ball-spawned', {
      detail: { ball, totalBalls: this.balls.length }
    }));
    
    return ball;
  }

  startAnimation() {
    if (this.animationId) return;
    
    const animate = () => {
      this.animationId = requestAnimationFrame(animate);

      if (!this.world || !this.scene || !this.camera || !this.renderer) return;

      const delta = this.clock.getDelta();
      this.world.step(1 / 60, delta * this.animationSpeed, 3);

      // Update all balls
      this.balls.forEach(ball => {
        ball.update();
        
        if (ball.inBucket != null && ball.body.sleepState === CANNON.Body.AWAKE) {
          const displacement = ball.getDisplacementInLastSecond();
          if (displacement < 0.05) {
            ball.body.sleep();
          }
        }
      });

      // Clean up balls that have fallen too low or become static
      for (let i = this.balls.length - 1; i >= 0; i--) {
        if (this.balls[i].getPosition().y < -this.boardHeight * 2){
          this.balls[i].destroy();
          this.balls.splice(i, 1);
        }
        if (this.balls[i].body.type === CANNON.Body.STATIC) {
          this.balls.splice(i, 1);
        }
      }

      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };

    animate();
  }

  stopAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  resize(width, height) {
    if (!this.camera || !this.renderer) return;
    
    this.width = width;
    this.height = height;

    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  cleanup() {
    this.stopAnimation();

    this.pendingSpawnTimers.forEach(clearTimeout);
    this.pendingSpawnTimers.clear();

    // Clean up balls
    this.balls.forEach(ball => ball.destroy());
    this.balls = [];

    // Clean up Three.js objects
    if (this.renderer) {
      this.renderer.dispose();
      const canvas = this.renderer.domElement;
      if (canvas && canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    }

    if (this.controls) {
      this.controls.dispose();
    }

    // Clean up physics world
    if (this.world) {
      this.world.bodies.forEach(body => {
        this.world.removeBody(body);
      });
    }
    
    this.isInitialized = false;
  }

  // Public methods for external control
  addBall() {
    return this.spawnBall();
  }

  reset() {
    const toDestroy = [];
    this.world.bodies.forEach(body => {
      if (body.userData?.ball) {
        toDestroy.push(body.userData.ball);
      }
      if (body.userData?.reset) {
        body.userData.reset();
      }
    });
    toDestroy.forEach(ball => ball.destroy());
    this.balls = [];
    this.ballsSpawned = 0;
    
    if (this.autoSpawn) {
      this.startSpawnChains();
    }

    this.dispatchEvent(new CustomEvent('reset'));
  }

  getBallCount() {
    return this.ballsSpawned;
  }

  getBucketCounts() {
    if (!this.buckets) return [];
    return this.buckets.map(bucket => bucket.getCount());
  }

  getPegs() {
    return this.world.bodies.filter(body => body.userData?.peg).map(body => body.userData.peg);
  }

  getPegsForRow(row) {
    return this.world.bodies.filter(body => body.userData?.peg && body.userData.peg.row === row).map(body => body.userData.peg);
  }

  // Configuration setters
  setAutoSpawn(autoSpawn) {
    this.autoSpawn = autoSpawn;
    console.log(`AutoSpawn updated to: ${this.autoSpawn}`);

    if (this.autoSpawn) {
      this.startSpawnChains();
    }
  }

  setBallRadius(ballRadius) {
    this.ballRadius = ballRadius;
    console.log(`Ball radius updated to: ${this.ballRadius}`);
  }

  setGravity(gravity) {
    this.gravity = gravity;
    if (this.world) {
      this.world.gravity.set(0, -this.gravity, 0);
    }
    console.log(`Gravity updated to: ${this.gravity}`);
  }

  setAnimationSpeed(animationSpeed) {
    this.animationSpeed = animationSpeed;
    console.log(`Animation speed updated to: ${this.animationSpeed}`);
  }

  onBallEnteredBucket(event) {
    this.dispatchEvent(new CustomEvent('ball-entered-bucket', {
      detail: { ball: event.detail.ball, bucket: event.detail.bucket },
      originalEvent: event
    }));
  }
} 