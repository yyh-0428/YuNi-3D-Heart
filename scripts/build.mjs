import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFile(path.join(root,p),'utf8');
// This normal build has ZERO npm dependencies. A pinned, licensed Three.js
// runtime is included in vendor/, so the whole project rebuilds offline.
const runtime=await read('vendor/three-runtime.min.js');
const modules=['geometry','cycle','materials','heart','audio','main'];
const source=(await Promise.all(modules.map(name=>read(`src/${name}.js`))))
  .map(code=>code.replace(/^import .+?;\s*$/gm,'').replace(/^export\s+/gm,''))
  .join('\n\n');
const script=runtime+'\n;(function(THREE){\n"use strict";\nconst {RoomEnvironment,mergeGeometries}=THREE;\n'+source+'\n})(THREE);';
const [template,css]=await Promise.all([read('src/template.html'),read('src/styles.css')]);
let fontCSS='';
for(const [name,file] of [['YuNi Serif','serif.woff2'],['YuNi Sans','sans.woff2']]){
  try{const data=await fs.readFile(path.join(root,'vendor',file));fontCSS+=`@font-face{font-family:'${name}';font-style:normal;font-weight:100 900;font-display:swap;src:url(data:font/woff2;base64,${data.toString('base64')}) format('woff2')}\n`;}
  catch{console.log(`Optional font ${file} absent; using the local system font.`);}
}
const html=template.replace('/* APP_CSS */',()=>css.replace('/* FONT_CSS */',fontCSS)).replace('/* APP_SCRIPT */',()=>script.replace(/<\/script/gi,'<\\/script'));
await fs.mkdir(path.join(root,'dist'),{recursive:true});
await fs.writeFile(path.join(root,'dist/index.html'),html);
await fs.writeFile(path.join(root,'index.html'),html);
console.log(`Built offline index.html: ${(Buffer.byteLength(html)/1024).toFixed(0)} KiB. No external requests.`);
