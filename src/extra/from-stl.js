import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TriMeshFlags } from '@dimforge/rapier3d-simd';

const RAPIER = await import('@dimforge/rapier3d-simd');

const searchParams = new URLSearchParams(window.location.search);

// Every board in cad/models/from-stl is bundled and selectable at runtime via
// `?model=`, so a sweep can target a board without a rebuild. Keys match the
// `model-` token in exported filenames (underscores stripped), e.g. boarddef.
const stlUrls = Object.fromEntries(
  Object.entries(import.meta.glob('/cad/models/from-stl/*.stl', {
    query: '?url', import: 'default', eager: true,
  })).map(([p, url]) => [p.match(/([^/]+)\.stl$/)[1].replaceAll('_', ''), url]),
);

const modelName = searchParams.get('model') || 'boarddef';
const stlUrl = stlUrls[modelName];
if (!stlUrl) {
  throw new Error(`unknown model "${modelName}"; available: ${Object.keys(stlUrls).join(', ')}`);
}

// num() keeps 0 as a legitimate value -- `|| default` would silently collapse
// seed=0 into seed=1, which would quietly duplicate runs in a seed sweep.
const num = (key, fallback, parse = parseFloat) =>
  searchParams.has(key) && Number.isFinite(parse(searchParams.get(key)))
    ? parse(searchParams.get(key))
    : fallback;

// everything in `params` ends up in the exported filename, so keep run-control
// knobs (autorun, maxSteps) out of it
const params = {
  model: modelName,
  seed: num('seed', 1, parseInt),
  balls: num('balls', 100, parseInt),
  ballRest: num('ballRest', .85),
  ballFric: num('ballFric', .1),
  paneRest: num('paneRest', .1),
  paneFric: num('paneFric', .05),
  boardRest: num('boardRest', .5),
  boardFric: num('boardFric', .1),
  // degrees the board leans back from vertical. The real board sits in a stand
  // rather than standing upright (see analysis/reference/), which reduces
  // in-plane gravity and presses every ball against the back plate -- so pane
  // friction carries load in reality but almost none at tilt 0.
  tilt: num('tilt', 0),
  // half-width of the ball spawn, as a fraction of board width
  spawnSpread: num('spawnSpread', .2)
};

const bidsString = obj => new URLSearchParams(obj).toString()
  .replaceAll('&', '_').replaceAll('=', '-').replaceAll('-0.', '-.');

// Published before the run starts so a sweep driver can tell whether this run's
// output already exists without having to run it first -- the final filename is
// this key plus the settled/steps suffix, which is only known at the end.
window.__simRunKey = bidsString(params);

// headless/batch mode: step as fast as the CPU allows (decoupled from the
// display clock) and hand the CSV to the driver via window.__simResult
const AUTORUN = searchParams.has('autorun');
const AUTORUN_STEPS_PER_FRAME = 100;

// settle detection -- a run is "done" when every remaining ball has been below
// SETTLE_SPEED for SETTLE_HOLD_STEPS consecutive steps. MIN_STEPS guards the
// start, where every ball is legitimately at rest because it hasn't fallen yet.
const SETTLE_SPEED_SQ = .05 * .05;
const SETTLE_HOLD_STEPS = 60;   // 1s of sim time
const MIN_STEPS = 120;
const MAX_STEPS = num('maxSteps', 60000, parseInt);

// mulberry32 -- small seeded PRNG so spawn positions are reproducible
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(params.seed);

const BALL_RADIUS = .5;
const SPAWN_Y = 50;
const SPAWN_Y_SPREAD = .2;   // as a fraction of board width, like spawnSpread

// The ball channel measured off board_def.stl: the divider fins and the pegs
// both span sim z -3.24 .. -0.54, which is the gap between the printed back
// plate and the clear front cover. The panes used to sit at -5.04 and -0.04, a
// 5mm channel -- 1.8mm of that was empty space *behind* the plate, and ~0.8% of
// balls ended up in it. Tilt would press balls straight into that void.
const CHANNEL_CENTER_OFFSET = 1.89;  // below bbox centre z
const Z_BOUND = 1.35;                // half-depth of the channel
const FLOOR_Y = -58;

const GRAVITY = 9.81;
const tiltRad = params.tilt * Math.PI / 180;

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

// leaning the board back tips gravity out of the board plane: what's left
// in-plane is g*cos(tilt), and g*sin(tilt) presses balls toward the back plate
// (-z, the side the pegs stand on)
const world = new RAPIER.World({
  x: 0.0,
  y: -GRAVITY * Math.cos(tiltRad),
  z: -GRAVITY * Math.sin(tiltRad),
});
const PHYSICS_STEP = 1 / 60;
world.timestep = PHYSICS_STEP;
world.integrationParameters.numSolverIterations = 8;

const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 12, 12);
const ballMat = new THREE.MeshBasicMaterial({ color: 0x000000, metalness: .7, roughness: .3 });

const balls = [];
let bbox = null;
let bboxSize = null;
// The STL loads asynchronously. Stepping before the board and balls exist would
// (a) trip settle detection immediately on an empty world and (b) make step 0
// mean something different depending on how long the load took.
let ready = false;

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

  // ccd mirrored in JS to avoid an isCcdEnabled() call per ball per step
  return { mesh, rigidBody, ccd: false };
}

let paneCenterZ = 0;
const paneHalfThickness = 0.5;

function createZPanes(center) {
  paneCenterZ = center.z - CHANNEL_CENTER_OFFSET;
  const halfX = Math.max(bboxSize.x, 1) * 4;
  const halfY = Math.max(bboxSize.y, 1) * 4;

  const buildPane = (z) => {
    const desc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(center.x, center.y, z);
    const body = world.createRigidBody(desc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfX, halfY, paneHalfThickness)
      .setRestitution(params.paneRest)
      .setFriction(params.paneFric);
    world.createCollider(colliderDesc, body);
  };

  buildPane(paneCenterZ + Z_BOUND);
  buildPane(paneCenterZ - Z_BOUND);
}

function createFloor(center) {
  const halfX = Math.max(bboxSize.x, 1) * 4;
  const halfZ = Math.max(bboxSize.z, 1) * 4;
  const y = FLOOR_Y;
  
  const desc = RAPIER.RigidBodyDesc.fixed()
    .setTranslation(center.x, y, center.z)
  const body = world.createRigidBody(desc);
  const colliderDesc = RAPIER.ColliderDesc.cuboid(halfX, paneHalfThickness, halfZ)
    .setRestitution(params.paneRest)
    .setFriction(params.paneFric);
  world.createCollider(colliderDesc, body);
}

function spawnBatch() {
  if (!bbox) return;
  const spreadX = bboxSize.x * params.spawnSpread;
  const spreadZ = bboxSize.z * 0.1;
  // vertical stagger of the spawn column, kept independent of spawnSpread --
  // it used to reuse spreadX, so sweeping the feed width would have moved the
  // drop height at the same time
  const spreadY = bboxSize.x * SPAWN_Y_SPREAD;
  const center = bbox.getCenter(new THREE.Vector3());
  for (let i = 0; i < params.balls; i++) {
    const x = center.x + (rand() - 0.5) * spreadX;
    const z = paneCenterZ + (rand() - 0.5) * spreadZ;
    const y = SPAWN_Y + (rand() - 0.5) * spreadY;
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
  // floor ensures that balls can't escape the bottom of the buckets due to any holes in the single side of the STL we're using
  createFloor(center);

  const centerLineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(center.x, bbox.max.y + 10, paneCenterZ + Z_BOUND - .5),
    new THREE.Vector3(center.x, bbox.min.y, paneCenterZ + Z_BOUND - .5),
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
  // only now does stepping begin -- see `ready` in animate()
  ready = true;
}, undefined, (err) => {
  console.error(`Failed to load ${modelName} (${stlUrl}):`, err);
});

// read straight from the rigid bodies rather than the meshes -- in autorun the
// meshes are only synced on the frames we actually render, so they go stale
function ballsAsCsv() {
  return 'x,y,z\n' + balls.map(({ rigidBody }) => {
    const { x, y, z } = rigidBody.translation();
    return [x, y, z].map(v => v.toFixed(16)).join(',');
  }).join('\n');
}
function paramsAsBIDSString() {
  params.steps = worldSteps;
  return bidsString(params);
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
let done = false;

// End of run. Publishes the result on `window` for the headless driver to pick
// up (more robust than intercepting a browser download) and, outside autorun,
// still downloads it so the page behaves like it always did.
function finish(settled) {
  if (done) return;
  done = true;
  params.settled = settled ? 1 : 0;
  const filename = 'fromstl_' + paramsAsBIDSString() + '_ballpositions.csv';
  const csv = ballsAsCsv();

  window.__simResult = { filename, csv, steps: worldSteps, settled, ballsRemaining: balls.length };
  window.__simDone = true;
  window.dispatchEvent(new CustomEvent('sim-done', { detail: window.__simResult }));
  document.title = `sim done - ${filename}`;
  console.log(`[sim] ${settled ? 'settled' : 'hit maxSteps'} at step ${worldSteps}, ${balls.length} balls remaining`);

  if (!AUTORUN) downloadBlob(csv, filename, 'text/plain');
}

// manual export still available mid-run
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
// 30 units/s travels exactly one radius per step. Hysteresis avoids toggling.
const CCD_ON_SPEED_SQ = 25 * 25;
const CCD_OFF_SPEED_SQ = 15 * 15;

// Bookkeeping that isn't per-step (escapee removal) runs on a cadence keyed to
// worldSteps rather than to frames, so a run is identical whether it was paced
// by the display clock or batched in autorun.
const CHECK_EVERY = 15;
const SETTLE_HOLD_CHECKS = SETTLE_HOLD_STEPS / CHECK_EVERY;
let restingChecks = 0;

function killEscapees() {
  if (!bbox) return;
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

function stepWorld() {
  world.step();
  worldSteps++;

  // one pass over the balls serving both CCD hysteresis and settle detection --
  // both want linvel, and linvel() is a wasm boundary crossing per call
  let resting = true;
  for (const b of balls) {
    const v = b.rigidBody.linvel();
    const speedSq = v.x * v.x + v.y * v.y + v.z * v.z;
    if (speedSq > SETTLE_SPEED_SQ) resting = false;
    if (!b.ccd && speedSq > CCD_ON_SPEED_SQ) {
      b.rigidBody.enableCcd(true);
      b.ccd = true;
    } else if (b.ccd && speedSq < CCD_OFF_SPEED_SQ) {
      b.rigidBody.enableCcd(false);
      b.ccd = false;
    }
  }

  if (worldSteps % CHECK_EVERY === 0) {
    killEscapees();
    // MIN_STEPS guard: at spawn every ball is at rest simply because it hasn't
    // started falling yet, which would otherwise trip settle immediately
    if (resting && worldSteps >= MIN_STEPS) {
      if (++restingChecks >= SETTLE_HOLD_CHECKS) finish(true);
    } else {
      restingChecks = 0;
    }
  }

  if (!done && worldSteps >= MAX_STEPS) finish(false);
}

let frame = 0;

function animate() {
  requestAnimationFrame(animate);
  frame++;

  if (ready && !done) {
    if (AUTORUN) {
      // run free of the display clock: fixed timestep means the physics is
      // unchanged, we just get through the run far faster
      for (let i = 0; i < AUTORUN_STEPS_PER_FRAME && !done; i++) stepWorld();
    } else {
      const delta = Math.min(clock.getDelta(), 0.1);
      accumulator += delta;

      let stepsThisFrame = 0;
      while (accumulator >= PHYSICS_STEP && stepsThisFrame < MAX_STEPS_PER_FRAME && !done) {
        stepWorld();
        accumulator -= PHYSICS_STEP;
        stepsThisFrame++;
      }
      if (stepsThisFrame === MAX_STEPS_PER_FRAME) {
        accumulator = 0;
      }
    }
  }

  // in autorun, drawing thousands of spheres every frame costs more than the
  // physics does -- keep an occasional frame so a headed run is still watchable
  if (AUTORUN && !done && frame % 10 !== 0) return;

  for (const b of balls) {
    const t = b.rigidBody.translation();
    const r = b.rigidBody.rotation();
    b.mesh.position.set(t.x, t.y, t.z);
    b.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();
