import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await build({entryPoints:[path.join(root,'vendor/three-entry.js')],outfile:path.join(root,'vendor/three-runtime.min.js'),bundle:true,format:'iife',globalName:'THREE',platform:'browser',target:['es2020'],minify:true,legalComments:'inline'});
console.log('Updated vendored Three.js runtime. Run npm run build to embed it.');
