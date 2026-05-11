import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs/promises';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.js'),
      name: 'GaltonBoard',
      fileName: (format) => `galton-board-js.${format}.js`,
      formats: ['es', 'iife'],
    },
    minify: true,
  },
  plugins: [
    {
      name: 'copy-demo-html',
      writeBundle: async () => {
        for (const demoPath of ['index.html', 'custom.html', 'simulate_stl.html']) {
          const demoHtmlPath = path.resolve(__dirname, demoPath);
          const outHtmlPath = path.resolve(__dirname, path.join('dist', demoPath));
          let html = await fs.readFile(demoHtmlPath, 'utf8');
          html = html.replace(
            /<script type="module" src="[^"]+"><\/script>/,
            `<script type="module" src="galton-board-js.iife.js"></script>`,
          );
          await fs.writeFile(outHtmlPath, html);
        }
      },
    },
    {
      name: 'copy-demo-json',
      writeBundle: async () => {
        for (const demoPath of ['peg_positions.json']) {
          const demoJsonPath = path.resolve(__dirname, demoPath);
          const outJsonPath = path.resolve(__dirname, path.join('dist', demoPath));
          let json = await fs.readFile(demoJsonPath, 'utf8');
          await fs.writeFile(outJsonPath, json);
        }
      },
    },
    {
      name: 'copy-stl-assets',
      writeBundle: async () => {
        for (const assetPath of ['board_def.stl']) {
          const srcPath = path.resolve(__dirname, assetPath);
          const outPath = path.resolve(__dirname, path.join('dist', assetPath));
          const buf = await fs.readFile(srcPath);
          await fs.writeFile(outPath, buf);
        }
      },
    },
  ],
});
