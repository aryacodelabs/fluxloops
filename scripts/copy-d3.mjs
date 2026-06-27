import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, 'node_modules', 'd3', 'dist', 'd3.min.js');
const target = path.join(root, 'media', 'webview', 'd3.min.js');

if (!fs.existsSync(source)) {
  console.error('d3 not installed. Run: npm install');
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
console.log('Copied d3.min.js to media/webview/');