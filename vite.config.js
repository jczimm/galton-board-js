import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import path from 'path';
import fs from 'fs/promises';

const copyDemoHtml = {
  name: 'copy-demo-html',
  writeBundle: async () => {
    const demoPath = 'index.html';
    const html = await fs.readFile(path.resolve(__dirname, demoPath), 'utf8');
    let rewritten = html
      .replace(
        /<script type="module" src="\/src\/component\.js"><\/script>/,
        `<script type="module" src="galton-board-js.iife.js"></script>`,
      )
    await fs.writeFile(path.resolve(__dirname, 'dist', demoPath), rewritten);
  },
};

export default defineConfig(({ mode }) => {
  const base = './';

  if (mode === 'extra') {
    return {
      base,
      plugins: [wasm(), topLevelAwait()],
      build: {
        emptyOutDir: false,
        minify: true,
        target: 'esnext',
        rollupOptions: {
          input: {
            'custom': path.resolve(__dirname, 'custom.html'),
            'from-stl': path.resolve(__dirname, 'from-stl.html'),
          },
          output: {
            dir: path.resolve(__dirname, 'dist'),
            format: 'es',
          },
        },
      },
    };
  }

  return {
    base,
    plugins: [wasm(), copyDemoHtml],
    build: {
      lib: {
        entry: path.resolve(__dirname, 'src/index.js'),
        name: 'GaltonBoard',
        fileName: (format) => `galton-board-js.${format}.js`,
        formats: ['es', 'iife'],
      },
      minify: true,
    },
  };
});
