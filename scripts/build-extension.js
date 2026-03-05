#!/usr/bin/env node
// Script para empaquetar la extensión de Chrome en un ZIP listo para instalar
// Uso: node scripts/build-extension.js

import { createWriteStream, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const extDir = join(rootDir, 'public', 'extension');
const outPath = join(rootDir, 'public', 'eficacia-extension.zip');

// Crear ZIP simple usando archiver si está disponible, o instrucciones manuales
try {
  const { default: archiver } = await import('archiver');
  const output = createWriteStream(outPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.pipe(output);
  archive.directory(extDir, false);
  await archive.finalize();

  console.log('✓ Extensión empaquetada en:', outPath);
} catch {
  console.log('Para empaquetar la extensión, instala archiver:');
  console.log('  npm install --save-dev archiver');
  console.log('');
  console.log('O ZIP manual:');
  console.log('  cd public/extension && zip -r ../eficacia-extension.zip .');
}
