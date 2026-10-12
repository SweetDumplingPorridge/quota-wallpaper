import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('wallpaper', { recursive: true });
await build({ entryPoints: ['src/ui.js'], bundle: true, outfile: 'wallpaper/app.js', format: 'iife', target: ['chrome100'], minify: true, legalComments: 'eof' });
console.log('Web wallpaper bundle built.');
