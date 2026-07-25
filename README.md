# 🎯 Galton Board LIT Component

A reusable web component built with LIT that creates an interactive 3D Galton Board (bean machine) simulation using Three.js and Cannon.js physics.

## Features

- **Reusable Web Component**: Built with LIT for easy integration into any web application
- **3D Physics Simulation**: Realistic ball physics using Cannon.js
- **Interactive Controls**: Orbit controls for camera movement
- **Customizable Properties**: Configure pegs, gravity, animation speed, and more
- **Event System**: Listen for ball spawning and reset events
- **Multiple Instances**: Run multiple boards simultaneously
- **Responsive**: Adapts to container size changes

## Installation

```bash
# Install dependencies
pnpm install install
```

## Development

```bash
pnpm run dev
```


## Quick Start

### Basic Usage

```html
<!DOCTYPE html>
<html>
<head>
    <script type="module" src="./src/galton-board.js"></script>
</head>
<body>
    <galton-board style="width: 800px; height: 600px;"></galton-board>
</body>
</html>
```

### JavaScript Usage

```javascript
import './component.js';

// Create component programmatically
const board = document.createElement('galton-board');
board.pegRows = 10;
board.autoSpawn = true;
document.body.appendChild(board);

// Add event listeners
board.addEventListener('ball-spawned', (e) => {
    console.log(`Ball spawned! Total: ${e.detail.totalBalls}`);
});

// Control the simulation
board.addBall();        // Add a ball manually
board.reset();          // Reset the simulation
board.getBallCount();   // Get current ball count
board.getBucketCounts(); // Get distribution data
```

## Component Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `width` | Number | 800 | Canvas width in pixels |
| `height` | Number | 600 | Canvas height in pixels |
| `pegRows` | Number | 12 | Number of peg rows |
| `ballRadius` | Number | 0.2 | Radius of the balls |
| `autoSpawn` | Boolean | true | Automatically spawn new balls when others reach buckets |
| `gravity` | Number | 20 | Gravity strength |
| `animationSpeed` | Number | 1 | Animation speed multiplier |

### Setting Properties

#### HTML Attributes
```html
<galton-board 
    peg-rows="8" 
    auto-spawn="false" 
    gravity="15"
    width="600"
    height="400">
</galton-board>
```

#### JavaScript Properties
```javascript
const board = document.querySelector('galton-board');
board.pegRows = 10;
board.autoSpawn = false;
board.gravity = 25;
```

## Methods

### `addBall()`
Manually add a ball to the simulation.

```javascript
const ball = board.addBall();
```

### `reset()`
Reset the simulation, removing all balls.

```javascript
board.reset();
```

### `getBallCount()`
Get the current number of balls in the simulation.

```javascript
const count = board.getBallCount();
console.log(`Current balls: ${count}`);
```

### `getBucketCounts()`
Get an array representing the number of balls in each bucket.

```javascript
const distribution = board.getBucketCounts();
console.log(`Distribution: [${distribution.join(', ')}]`);
```

## Events

### `ball-spawned`
Fired when a new ball is spawned.

```javascript
board.addEventListener('ball-spawned', (event) => {
    console.log('Ball spawned:', event.detail);
    // event.detail.ball - the ball instance
    // event.detail.totalBalls - total number of balls
});
```

### `reset`
Fired when the board is reset.

```javascript
board.addEventListener('reset', () => {
    console.log('Board reset');
});
```

## Styling

The component uses Shadow DOM, so external styles won't affect its internals. The component will fill its container by default.

```css
galton-board {
    width: 100%;
    height: 500px;
    border: 2px solid #ddd;
    border-radius: 8px;
    display: block;
}
```

## Examples

### Example 1: Basic Configuration
```html
<galton-board style="width: 800px; height: 600px;"></galton-board>
```

### Example 2: Custom Configuration
```html
<galton-board 
    peg-rows="8" 
    auto-spawn="false" 
    gravity="15"
    style="width: 600px; height: 400px;">
</galton-board>
```

### Example 3: Multiple Instances
```html
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
    <galton-board peg-rows="6" style="height: 300px;"></galton-board>
    <galton-board peg-rows="6" auto-spawn="false" style="height: 300px;"></galton-board>
</div>
```

### Example 4: Programmatic Control
```javascript
import './component.js';

const board = document.createElement('galton-board');
board.style.width = '100%';
board.style.height = '500px';
board.pegRows = 10;

// Add controls
const addButton = document.createElement('button');
addButton.textContent = 'Add Ball';
addButton.onclick = () => board.addBall();

const resetButton = document.createElement('button');
resetButton.textContent = 'Reset';
resetButton.onclick = () => board.reset();

document.body.append(board, addButton, resetButton);
```

## Development

### Running the Development Server
```bash
pnpm dev
```

### Building for Production
```bash
pnpm build
```

### View Examples
Open `example.html` in your browser to see various usage examples.

## Technical Details

- **Framework**: LIT Element for web components
- **3D Rendering**: Three.js for WebGL rendering
- **Physics**: Cannon.js for realistic ball physics
- **Browser Support**: Modern browsers with WebGL support

## File Structure

```
src/
├── component.js       # LIT web component wrapper
├── galton-board.js    # Core simulation logic
├── main.js            # Demo application
├── balls.js           # Ball physics and rendering
├── pegs.js           # Peg creation and setup
├── buckets.js        # Bucket creation and ball counting
└── constants.js      # Shared constants
```

## License

MIT License - feel free to use this component in your projects!

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Troubleshooting

### Component Not Rendering
- Ensure the container has explicit width and height
- Check browser console for WebGL support
- Verify all dependencies are loaded

### Performance Issues
- Reduce the number of peg rows for better performance
- Consider limiting the maximum number of balls
- Use fewer simultaneous instances on the same page

### Memory Leaks
The component automatically cleans up Three.js resources when removed from the DOM. If you're manually managing component lifecycle, ensure you're not keeping references to removed components. 