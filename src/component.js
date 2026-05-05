import { LitElement, html, css } from 'lit';
import { GaltonBoard } from './galton-board.js';
import { GRAVITY, ANIMATION_SPEED, PEG_RADIUS, BALL_RADIUS } from './constants.js';

export class GaltonBoardComponent extends LitElement {
  static properties = {
    width: { type: Number },
    height: { type: Number },
    pegRows: { 
      type: Number,
      attribute: 'peg-rows',
      converter: {
        fromAttribute: (value) => {
          console.log(`Converting pegRows from attribute: "${value}" (type: ${typeof value})`);
          const numValue = Number(value);
          return isNaN(numValue) ? 12 : numValue;
        }
      }
    },
    pegPositions: { type: Array, attribute: 'peg-positions' },
    pegRadius: { type: Number, attribute: 'peg-radius' },
    ballRadius: { type: Number },
    parallelBalls: { type: Number, attribute: 'parallel-balls' },
    diagonalWalls: { type: Boolean, attribute: 'diagonal-walls' },
    autoSpawn: {
      type: Boolean,
      attribute: 'auto-spawn',
      converter: {
        fromAttribute: (value) => {
          console.log(`Converting autoSpawn from attribute: "${value}" (type: ${typeof value})`);
          if (value === null) return true; // Default when attribute not present
          if (value === 'false' || value === false) return false;
          return Boolean(value);
        }
      }
    },
    gravity: { type: Number },
    animationSpeed: { type: Number }
  };

  // Ensure pegRows is always a number
  set pegRows(value) {
    const numValue = Number(value);
    const newValue = isNaN(numValue) ? 12 : numValue;
    if (this._pegRows !== newValue) {
      this._pegRows = newValue;
      this.requestUpdate('pegRows', undefined);
    }
  }

  get pegRows() {
    return this._pegRows;
  }

  // Ensure autoSpawn is always a boolean
  set autoSpawn(value) {
    // Convert string "false" to boolean false, everything else follows normal JS truthy/falsy rules
    const boolValue = value === "false" ? false : Boolean(value);
    console.log(`Setting autoSpawn: "${value}" (type: ${typeof value}) -> ${boolValue}`);
    if (this._autoSpawn !== boolValue) {
      this._autoSpawn = boolValue;
      this.requestUpdate('autoSpawn', undefined);
    }
  }

  get autoSpawn() {
    console.log(`Getting autoSpawn: ${this._autoSpawn}`);
    return this._autoSpawn;
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: relative;
    }
    
    #canvas-container {
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
  `;

  constructor() {
    super();

    // Set default property values
    this.width = 800;
    this.height = 600;
    this._pegRows = 12; // Use private property for internal storage
    this.pegPositions = undefined;
    this.pegRadius = PEG_RADIUS;
    this.ballRadius = BALL_RADIUS;
    this.parallelBalls = 1;
    this.diagonalWalls = false;
    this._autoSpawn = true; // Use private property for internal storage
    this.gravity = GRAVITY;
    this.animationSpeed = ANIMATION_SPEED;

    // Initialize the simulation
    this.galtonBoard = null;
    
    // Bind resize handler
    this.handleResize = this.handleResize.bind(this);
  }

  firstUpdated() {
    console.log(`firstUpdated called. autoSpawn: ${this.autoSpawn}`);
    this.initializeSimulation();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.cleanup();
  }

  initializeSimulation() {
    const container = this.shadowRoot.querySelector('#canvas-container');
    if (!container) return;

    // Create the simulation instance
    this.galtonBoard = new GaltonBoard({
      container,
      width: this.width,
      height: this.height,
      pegRows: this.pegRows,
      pegPositions: this.pegPositions,
      pegRadius: this.pegRadius,
      ballRadius: this.ballRadius,
      parallelBalls: this.parallelBalls,
      diagonalWalls: this.diagonalWalls,
      autoSpawn: this.autoSpawn,
      gravity: this.gravity,
      animationSpeed: this.animationSpeed
    });

    // Set up event listeners for simulation events
    // Use a Proxy to automatically forward all dispatched events
    const originalDispatchEvent = this.galtonBoard.dispatchEvent.bind(this.galtonBoard);
    this.galtonBoard.dispatchEvent = new Proxy(originalDispatchEvent, {
      apply: (target, thisArg, args) => {
        const [event] = args;
        // Dispatch on the original target first
        const result = target.apply(thisArg, args);
        // Then forward through this component
        this.dispatchEvent(event);
        return result;
      }
    });

    // Handle window resize
    window.addEventListener('resize', this.handleResize);

    console.log(`Simulation initialized with ${this.pegRows} peg rows`);
  }

  handleResize() {
    if (!this.galtonBoard) return;
    
    const container = this.shadowRoot.querySelector('#canvas-container');
    if (!container) return;

    const rect = container.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;

    this.galtonBoard.resize(this.width, this.height);
  }

  cleanup() {
    if (this.galtonBoard) {
      this.galtonBoard.cleanup();
      this.galtonBoard = null;
    }

    window.removeEventListener('resize', this.handleResize);
  }

  // Public methods that delegate to the simulation
  addBall() {
    return this.galtonBoard ? this.galtonBoard.addBall() : null;
  }

  reset() {
    if (this.galtonBoard) {
      this.galtonBoard.reset();
    }
  }

  getBallCount() {
    return this.galtonBoard ? this.galtonBoard.getBallCount() : 0;
  }

  getBucketCounts() {
    return this.galtonBoard ? this.galtonBoard.getBucketCounts() : [];
  }

  render() {
    return html`
      <div id="canvas-container"></div>
    `;
  }

  updated(changedProperties) {
    super.updated(changedProperties);
    
    if (!this.galtonBoard) return;

    // If critical properties changed, reinitialize
    if (changedProperties.has('pegRows') ||
        changedProperties.has('pegPositions') ||
        changedProperties.has('pegRadius') ||
        changedProperties.has('parallelBalls') ||
        changedProperties.has('diagonalWalls') ||
        changedProperties.has('gravity') ||
        changedProperties.has('animationSpeed')) {
      console.log('Updating simulation. Pegs: ', this.pegRows);
      this.cleanup();
      this.initializeSimulation();
      return;
    }

    // Update autoSpawn if it changed
    if (changedProperties.has('autoSpawn')) {
      console.log(`AutoSpawn changed to: ${this.autoSpawn}`);
      this.galtonBoard.setAutoSpawn(this.autoSpawn);
    }

    // Update ball radius if it changed
    if (changedProperties.has('ballRadius')) {
      this.galtonBoard.setBallRadius(this.ballRadius);
    }
  }
}

customElements.define('galton-board', GaltonBoardComponent); 