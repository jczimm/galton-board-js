import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const DEBUG_LID = false;

export class Bucket extends EventTarget {
  constructor(scene, world, x, y, width, height, depth, index) {
    super();

    this.scene = scene;
    this.world = world;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.index = index;
    this.count = 0;
    this.bodies = [];
    this.meshes = [];
    
    this.createPhysicsBodies();
    this.createVisualMeshes();
    this.createSensorLid();
    this.createCountDisplay();
  }
  
  createPhysicsBodies() {
    // Create bucket bottom
    const bottomShape = new CANNON.Box(new CANNON.Vec3(this.width/2, 0.1, this.depth/2));
    const bottomBody = new CANNON.Body({ mass: 0 });
    bottomBody.addShape(bottomShape);
    bottomBody.position.set(this.x, this.y - this.height/2, 0);
    this.world.addBody(bottomBody);
    this.bodies.push(bottomBody);
    
    // Create bucket left wall
    const leftWallShape = new CANNON.Box(new CANNON.Vec3(0.1, this.height/2, this.depth/2));
    const leftWallBody = new CANNON.Body({ mass: 0 });
    leftWallBody.addShape(leftWallShape);
    leftWallBody.position.set(this.x - this.width/2, this.y, 0);
    this.world.addBody(leftWallBody);
    this.bodies.push(leftWallBody);
    
    // Create bucket right wall
    const rightWallShape = new CANNON.Box(new CANNON.Vec3(0.1, this.height/2, this.depth/2));
    const rightWallBody = new CANNON.Body({ mass: 0 });
    rightWallBody.addShape(rightWallShape);
    rightWallBody.position.set(this.x + this.width/2, this.y, 0);
    this.world.addBody(rightWallBody);
    this.bodies.push(rightWallBody);
    
    // Create invisible front wall
    const frontWallShape = new CANNON.Box(new CANNON.Vec3(this.width/2, this.height/2, 0.1));
    const frontWallBody = new CANNON.Body({ mass: 0 });
    frontWallBody.addShape(frontWallShape);
    frontWallBody.position.set(this.x, this.y, this.depth/2);
    this.world.addBody(frontWallBody);
    this.bodies.push(frontWallBody);
    
    // Create invisible back wall
    const backWallShape = new CANNON.Box(new CANNON.Vec3(this.width/2, this.height/2, 0.1));
    const backWallBody = new CANNON.Body({ mass: 0 });
    backWallBody.addShape(backWallShape);
    backWallBody.position.set(this.x, this.y, -this.depth/2);
    this.world.addBody(backWallBody);
    this.bodies.push(backWallBody);
  }
  
  createVisualMeshes() {
    // Bottom visual
    const bottomGeometry = new THREE.BoxGeometry(this.width, 0.2, this.depth);
    const bottomMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 }); // Brown color
    const bottomMesh = new THREE.Mesh(bottomGeometry, bottomMaterial);
    bottomMesh.position.set(this.x, this.y - this.height/2, 0);
    this.scene.add(bottomMesh);
    this.meshes.push(bottomMesh);
    
    // Left wall visual
    const leftWallGeometry = new THREE.BoxGeometry(0.2, this.height, this.depth);
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x654321 }); // Darker brown
    const leftWallMesh = new THREE.Mesh(leftWallGeometry, wallMaterial);
    leftWallMesh.position.set(this.x - this.width/2, this.y, 0);
    this.scene.add(leftWallMesh);
    this.meshes.push(leftWallMesh);
    
    // Right wall visual
    const rightWallGeometry = new THREE.BoxGeometry(0.2, this.height, this.depth);
    const rightWallMesh = new THREE.Mesh(rightWallGeometry, wallMaterial);
    rightWallMesh.position.set(this.x + this.width/2, this.y, 0);
    this.scene.add(rightWallMesh);
    this.meshes.push(rightWallMesh);
  }
  
  createSensorLid() {
    const lidHeight = 1.5;

    // Create a shape so we can visualise the lid
    if (DEBUG_LID) {
        const lidMesh = new THREE.Mesh(
            new THREE.BoxGeometry(this.width, lidHeight, this.depth),
            new THREE.MeshStandardMaterial({ color: 0x8B4513 })
        );
        lidMesh.position.set(this.x, this.y + this.height/2 + lidHeight/2, 0);
        this.scene.add(lidMesh);
        this.meshes.push(lidMesh);
    }

    // Create invisible sensor lid at the top of the bucket
    const lidShape = new CANNON.Box(new CANNON.Vec3(this.width/2, lidHeight, this.depth/2));
    const lidBody = new CANNON.Body({ 
      mass: 0,
      isTrigger: true // Make this a sensor - detects collisions but doesn't apply physical response
    });


    lidBody.addShape(lidShape);
    lidBody.position.set(this.x, this.y + this.height/2, 0);
    this.world.addBody(lidBody);
    this.bodies.push(lidBody);
    
    // Store reference to this bucket instance on the sensor body
    lidBody.userData = { bucket: this, reset: this.reset.bind(this) };
    
    // Add collision event listener
    lidBody.addEventListener('collide', (event) => {
      this.onBallEnter(event);
    });
    
    this.sensorLid = lidBody;
  }
  
  createCountDisplay() {
    // Create canvas for text
    this.canvas = document.createElement('canvas');
    this.canvas.width = 128;
    this.canvas.height = 64;
    this.context = this.canvas.getContext('2d');
    
    // Create texture from canvas
    this.textTexture = new THREE.CanvasTexture(this.canvas);
    
    // Create material and mesh for the text
    const textMaterial = new THREE.MeshBasicMaterial({ 
      map: this.textTexture,
      transparent: true,
      alphaTest: 0.1
    });
    
    const textGeometry = new THREE.PlaneGeometry(1, .5);
    this.textMesh = new THREE.Mesh(textGeometry, textMaterial);
    
    // Position text below the bucket
    this.textMesh.position.set(this.x, this.y - this.height/2 - 1.3, 0);
    this.scene.add(this.textMesh);
    this.meshes.push(this.textMesh);
    
    // Initial text update
    this.updateCountDisplay();
  }
  
  updateCountDisplay() {
    // Clear canvas
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Set text style
    this.context.font = 'bold 64px Arial';
    this.context.fillStyle = '#000000';
    this.context.textAlign = 'center';
    this.context.textBaseline = 'middle';
    
    // Draw the count
    this.context.fillText(this.count.toString(), this.canvas.width / 2, this.canvas.height / 2);
    
    // Update texture
    this.textTexture.needsUpdate = true;
  }
  
  onBallEnter(event) {
    const { target, body } = event;
    
    // Check if the colliding body has ball data
    if (body.userData && body.userData.ball) {
      const ball = body.userData.ball;
      
      // Only count this ball if it hasn't been counted in this bucket yet
      if (ball.inBucket == null) {
        ball.inBucket = this;
        this.count++;
        
        // Update the visual display
        this.updateCountDisplay();

        // Dispatch event when ball enters bucket
        this.dispatchEvent(new CustomEvent('ball-entered-bucket', {
          detail: { ball, bucket: this }
        }));
      }
    }
  }
  
  getCount() {
    return this.count;
  }

  reset() {
    this.count = 0;
  }
  
  destroy() {
    // Clean up physics bodies
    this.bodies.forEach(body => {
      this.world.removeBody(body);
    });
    
    // Clean up visual meshes
    this.meshes.forEach(mesh => {
      this.scene.remove(mesh);
    });
  }
}

export function createBuckets(scene, world, pegRows, pegSpacingX, pegSpacingY) {
  // Create buckets below the last row of pegs
  const bucketWidth = pegSpacingX * 1.8; // Width based on peg spacing
  const bucketHeight = 7;
  const bucketDepth = 1.5;
  // Position so the bucket top sits just below the last peg row regardless of
  // bucketHeight (rim ≈ pegSpacingY * 0.5 below the last row's pegs).
  const bucketY = -pegRows * pegSpacingY - 0.5 * pegSpacingY - bucketHeight / 2;

  // Calculate bucket positions - position them exactly where the next row of pegs would be
  const nextRowCols = pegRows + 1; // Next row would have 'rows + 1' pegs
  const numBuckets = nextRowCols; // Same number of buckets as pegs in next row

  const buckets = [];

  for (let i = 0; i < numBuckets; i++) {
    // Position buckets exactly like pegs: (j - (cols - 1) / 2) * 2 * PEG_SPACING_X
    const bucketX = (i - (nextRowCols - 1) / 2) * 2 * pegSpacingX;
    
    const bucket = new Bucket(scene, world, bucketX, bucketY, bucketWidth, bucketHeight, bucketDepth, i);
    buckets.push(bucket);
  }

  return buckets;
}
