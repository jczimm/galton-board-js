import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import path from 'path';
import fs from 'fs/promises';

const copyDemoHtml = {
  name: 'copy-demo-html',
  writeBundle: async () => {
    for (const demoPath of ['index.html', 'custom.html', 'from-stl.html']) {
      const html = await fs.readFile(path.resolve(__dirname, demoPath), 'utf8');
      const rewritten = html
        .replace(
          /<script type="module" src="\/src\/component\.js"><\/script>/,
          `<script type="module" src="galton-board-js.iife.js"></script>`,
        )
        .replace(
          /<script type="module" src="\/src\/extra\/from-stl\.js"><\/script>/,
          `<script type="module" src="from-stl.js"></script>`,
        );
      await fs.writeFile(path.resolve(__dirname, 'dist', demoPath), rewritten);
    }
  },
};

export default defineConfig(({ mode }) => {
  if (mode === 'from-stl') {
    return {
      plugins: [wasm(), topLevelAwait()],
      build: {
        emptyOutDir: false,
        minify: true,
        target: 'esnext',
        rollupOptions: {
          input: path.resolve(__dirname, 'src/extra/from-stl.js'),
          output: {
            dir: path.resolve(__dirname, 'dist'),
            entryFileNames: 'from-stl.js',
            format: 'es',
          },
        },
      },
    };
  }

  return {
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
