import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import stlUrl from '/cad/models/from-stl/recreate_original_board.stl?url';
import { TriMeshFlags } from '@dimforge/rapier3d-simd';

const RAPIER = await import('@dimforge/rapier3d-simd');

const params = (searchParams => ({
  model: stlUrl.match(/([^/]+)\.stl$/)[1].replaceAll('_', ''),
  balls: parseInt(searchParams.get('balls')) || 100,
  ballRest: parseFloat(searchParams.get('ballRest')) || .85,
  ballFric: parseFloat(searchParams.get('ballFric')) || .1,
  paneRest: parseFloat(searchParams.get('paneRest')) || .1,
  paneFric: parseFloat(searchParams.get('paneFric')) || .05,
  boardRest: parseFloat(searchParams.get('boardRest')) || .5,
  boardFric: parseFloat(searchParams.get('boardFric')) || .1
}))(new URLSearchParams(window.location.search));

const BALL_RADIUS = .5;
const SPAWN_Y = 50;
const Z_BOUND_INITIAL = 2.5;     // half-distance between front/back panes

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
const dir3 = new THREE.DirectionalLight(0xffffff, 0.6);
dir3.position.set(50, 50, -50);
scene.add(dir3);

const world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });
const PHYSICS_STEP = 1 / 60;
world.timestep = PHYSICS_STEP;
world.integrationParameters.numSolverIterations = 8;

const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 12, 12);
const ballMat = new THREE.MeshBasicMaterial({ color: 0x000000, metalness: .7, roughness: .3 });

const balls = [];
let bbox = null;
let bboxSize = null;

function spawnBall(x, y, z) {
  const rbDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, y, z)
    .setLinearDamping(0.) // in real galton board, this should be negligible - balls are spherical, and the air in the board/buckets should be displaced easily because there's plenty of room around the balls 
    .setAngularDamping(0.);
  const rigidBody = world.createRigidBody(rbDesc);

  const colliderDesc = RAPIER.ColliderDesc.ball(BALL_RADIUS)
    .setRestitution(params.ballRest)
    .setFriction(params.ballFric);
  world.createCollider(colliderDesc, rigidBody);

  const mesh = new THREE.Mesh(ballGeo, ballMat);
  mesh.position.set(x, y, z);
  scene.add(mesh);

  return { mesh, rigidBody };
}

let zBound = Z_BOUND_INITIAL;
let paneCenterZ = 0;

function createZPanes(center) {
  paneCenterZ = center.z - 2.54;
  const halfX = Math.max(bboxSize.x, 1) * 4;
  const halfY = Math.max(bboxSize.y, 1) * 4;
  const halfThickness = 0.5;

  const buildPane = (z) => {
    const desc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(center.x, center.y, z);
    const body = world.createRigidBody(desc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfX, halfY, halfThickness)
      .setRestitution(params.paneRest)
      .setFriction(params.paneFric);
    world.createCollider(colliderDesc, body);
    return body;
  };

  buildPane(paneCenterZ + zBound);
  buildPane(paneCenterZ - zBound);
}

function spawnBatch() {
  if (!bbox) return;
  const spreadX = bboxSize.x * 0.2;
  const spreadZ = bboxSize.z * 0.1;
  const center = bbox.getCenter(new THREE.Vector3());
  for (let i = 0; i < params.balls; i++) {
    const x = center.x + (Math.random() - 0.5) * spreadX;
    const z = paneCenterZ + (Math.random() - 0.5) * spreadZ;
    const y = SPAWN_Y + (Math.random() - 0.5) * spreadX;
    balls.push(spawnBall(x, y, z));
  }
}

const loader = new STLLoader();
loader.load(stlUrl, (geometry) => {
  geometry.rotateX(+Math.PI / 2);
  // geometry.scale(-1, 1, 1); // uncomment to test if the stl is imparting any asymmetry (and it's not just coming from the simulation) 
  geometry.computeBoundingBox();
  geometry.computeVertexNormals();

  bbox = geometry.boundingBox.clone();
  bboxSize = bbox.getSize(new THREE.Vector3());
  const center = bbox.getCenter(new THREE.Vector3());

  const boardMaterial = new THREE.MeshStandardMaterial({
    color: 0xbaba48,
    metalness: 0.0,
    roughness: 0.75,
    side: THREE.FrontSide,
  });
  scene.add(new THREE.Mesh(geometry, boardMaterial));

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
  const flags = TriMeshFlags.FIX_INTERNAL_EDGES; // KEY for making the simulation result in symmetric distribution!
  const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices, flags)
    .setRestitution(params.boardRest)
    .setFriction(params.boardFric);
  world.createCollider(colliderDesc, stlBody);

  createZPanes(center);

  const centerLineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(center.x, bbox.max.y + 10, paneCenterZ + zBound - .5),
    new THREE.Vector3(center.x, bbox.min.y, paneCenterZ + zBound - .5),
  ]);
  scene.add(new THREE.Line(centerLineGeo, new THREE.LineBasicMaterial({ color: 0xff0000 })));

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

function ballsAsCsv() {
  return 'x,y,z\n' + balls.map(({ mesh: { position: { x, y, z } }}) =>
    [x, y, z].map(v => v.toFixed(16)).join(',')).join('\n');
}
function paramsAsBIDSString() {
  params.steps = worldSteps;
  return new URLSearchParams(params).toString().replaceAll('&', '_').replaceAll('=', '-').replaceAll('-0.', '-.');
}
function downloadBlob(content, fileName, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();

  // Cleanup: Revoke URL to release memory
  URL.revokeObjectURL(url);
}
renderer.domElement.addEventListener('dblclick', () => {
  const filename = 'fromstl_' + paramsAsBIDSString() + '_ballpositions.csv';
  downloadBlob(ballsAsCsv(), filename, 'text/plain');
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
let worldSteps = 0;
let accumulator = 0;
const MAX_STEPS_PER_FRAME = 5;

// Enable CCD only for balls fast enough to risk tunneling through a ball-radius
// of geometry in one step. With PHYSICS_STEP=1/60 and ball radius 0.5, a speed of
// 30 units/s travels exactly one radius per step. Hysteresis avoids per-frame toggling.
const CCD_ON_SPEED_SQ = 25 * 25;
const CCD_OFF_SPEED_SQ = 15 * 15;

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1);
  accumulator += delta;

  let stepsThisFrame = 0;
  while (accumulator >= PHYSICS_STEP && stepsThisFrame < MAX_STEPS_PER_FRAME) {
    world.step();
    worldSteps++;
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

    const v = b.rigidBody.linvel();
    const speedSq = v.x * v.x + v.y * v.y + v.z * v.z;
    const ccd = b.rigidBody.isCcdEnabled();
    if (!ccd && speedSq > CCD_ON_SPEED_SQ) {
      b.rigidBody.enableCcd(true);
    } else if (ccd && speedSq < CCD_OFF_SPEED_SQ) {
      b.rigidBody.enableCcd(false);
    }
  }

  if (bbox) {
    const killY = bbox.min.y - bboxSize.y;
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      if (b.rigidBody.translation().y < killY) {
        world.removeRigidBody(b.rigidBody);
        scene.remove(b.mesh);
        balls[i] = balls[balls.length - 1];
        balls.pop();
      }
    }
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();
