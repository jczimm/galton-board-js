import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

await RAPIER.init();

const BATCH_COUNT = 10;
const BALL_RADIUS = 0.5;
const SPAWN_Y = 50;
const Z_BOUND_INITIAL = 2.7;     // half-distance between front/back panes
const Z_BOUND_STEP = 0.5;      // how much [/] adjust the spacing per keypress
const Z_BOUND_MIN = 0.5;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
dir1.position.set(50, 100, 50);
scene.add(dir1);
const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
dir2.position.set(-50, 50, -50);
scene.add(dir2);

const world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });
const PHYSICS_STEP = 1 / 120;
world.timestep = PHYSICS_STEP;

const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 12, 12);
const ballMat = new THREE.MeshStandardMaterial({ color: 0xff4444 });

let balls = [];
let bbox = null;
let bboxSize = null;

function spawnBall(x, y, z) {
  const rbDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, y, z)
    .setLinearDamping(0.0)
    .setAngularDamping(0.0)
    .setCcdEnabled(true);
  const rigidBody = world.createRigidBody(rbDesc);

  const colliderDesc = RAPIER.ColliderDesc.ball(BALL_RADIUS)
    .setRestitution(0.1)
    .setFriction(0.2);
  world.createCollider(colliderDesc, rigidBody);

  const mesh = new THREE.Mesh(ballGeo, ballMat);
  mesh.position.set(x, y, z);
  scene.add(mesh);

  return { mesh, rigidBody };
}

let zBound = Z_BOUND_INITIAL;
let panePosBody = null;  // back pane (at center.z + zBound)
let paneNegBody = null;  // front pane (at center.z - zBound)
let paneCenterZ = 0;

function createZPanes(center) {
  paneCenterZ = center.z - 2.5;
  const halfX = Math.max(bboxSize.x, 1) * 4;
  const halfY = Math.max(bboxSize.y, 1) * 4;
  const halfThickness = 0.5;

  const buildPane = (z) => {
    const desc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(center.x, center.y, z);
    const body = world.createRigidBody(desc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfX, halfY, halfThickness)
      .setRestitution(0.1)
      .setFriction(0.2);
    world.createCollider(colliderDesc, body);
    return body;
  };

  panePosBody = buildPane(center.z - 2.5 + zBound);
  paneNegBody = buildPane(center.z - 2.5 - zBound);
}

function updatePanePositions() {
  if (!panePosBody || !paneNegBody) return;
  panePosBody.setNextKinematicTranslation({
    x: panePosBody.translation().x,
    y: panePosBody.translation().y,
    z: paneCenterZ + zBound,
  });
  paneNegBody.setNextKinematicTranslation({
    x: paneNegBody.translation().x,
    y: paneNegBody.translation().y,
    z: paneCenterZ - zBound,
  });
}

window.addEventListener('keydown', (e) => {
  if (e.key === ']') {
    zBound += Z_BOUND_STEP;
    updatePanePositions();
  } else if (e.key === '[') {
    zBound = Math.max(Z_BOUND_MIN, zBound - Z_BOUND_STEP);
    updatePanePositions();
  }
});

function spawnBatch() {
  if (!bbox) return;
  const spreadX = bboxSize.x * 0.75;
  const spreadZ = 0;
  const center = bbox.getCenter(new THREE.Vector3());
  for (let i = 0; i < BATCH_COUNT; i++) {
    const x = center.x + (Math.random() - 0.5) * spreadX;
    const z = center.z - 2.5 + (Math.random() - 0.5) * spreadZ;
    balls.push(spawnBall(x, SPAWN_Y, z));
  }
}

const loader = new STLLoader();
loader.load('/models/from-stl/board_def.stl', (geometry) => {
  geometry.rotateX(+Math.PI / 2);
  geometry.computeBoundingBox();
  geometry.computeVertexNormals();

  bbox = geometry.boundingBox.clone();
  bboxSize = bbox.getSize(new THREE.Vector3());
  const center = bbox.getCenter(new THREE.Vector3());

  const frontMaterial = new THREE.MeshStandardMaterial({
    color: 0xcccccc,
    metalness: 0.1,
    roughness: 0.8,
    side: THREE.FrontSide,
  });
  scene.add(new THREE.Mesh(geometry, frontMaterial));

  const positions = geometry.attributes.position.array;
  const vertices = positions instanceof Float32Array
    ? positions
    : new Float32Array(positions);

  let indices;
  if (geometry.index) {
    const src = geometry.index.array;
    indices = src instanceof Uint32Array ? src : new Uint32Array(src);
  } else {
    const count = positions.length / 3;
    indices = new Uint32Array(count);
    for (let i = 0; i < count; i++) indices[i] = i;
  }

  const stlBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices), stlBody);

  createZPanes(center);

  const maxDim = Math.max(bboxSize.x, bboxSize.y, bboxSize.z);

  camera.position.set(
    center.x,
    center.y + bboxSize.y * 0.5,
    center.z + maxDim * 1.8,
  );
  controls.target.copy(center);
  controls.update();

  spawnBatch();
}, undefined, (err) => {
  console.error('Failed to load board_def.stl:', err);
});

renderer.domElement.addEventListener('click', () => {
  spawnBatch();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
let accumulator = 0;
const MAX_STEPS_PER_FRAME = 10;

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1);
  accumulator += delta;

  let stepsThisFrame = 0;
  while (accumulator >= PHYSICS_STEP && stepsThisFrame < MAX_STEPS_PER_FRAME) {
    world.step();
    accumulator -= PHYSICS_STEP;
    stepsThisFrame++;
  }
  if (stepsThisFrame === MAX_STEPS_PER_FRAME) {
    accumulator = 0;
  }

  for (const b of balls) {
    const t = b.rigidBody.translation();
    const r = b.rigidBody.rotation();
    b.mesh.position.set(t.x, t.y, t.z);
    b.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }

  balls = balls.filter((b) => {
    const t = b.rigidBody.translation();
    if (bbox && t.y < bbox.min.y - bboxSize.y) {
      world.removeRigidBody(b.rigidBody);
      scene.remove(b.mesh);
      return false;
    }
    return true;
  });

  controls.update();
  renderer.render(scene, camera);
}
animate();
