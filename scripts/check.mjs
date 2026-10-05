import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=f=>fs.readFile(path.join(root,f),'utf8');
const html=await read('index.html');
const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
new vm.Script(script,{filename:'index.html'});
assert(!/<script[^>]+src\s*=/i.test(html),'External script found');
assert(!/<link[^>]+href=["']https?:/i.test(html),'External stylesheet found');
assert(!/\/\* APP_(CSS|SCRIPT) \*\//.test(html),'Unreplaced build marker');
const runtime=await read('vendor/three-runtime.min.js');
const parts=await Promise.all(['geometry','cycle','materials','heart','audio'].map(n=>read(`src/${n}.js`)));
const source=parts.map(c=>c.replace(/^import .+?;\s*$/gm,'').replace(/^export\s+/gm,'')).join('\n');
const context=vm.createContext({console,performance,structuredClone,TextDecoder,TextEncoder,URL,Blob,AbortController});
try{vm.runInContext(runtime+'\nconst {mergeGeometries}=THREE;\n'+source+'\nthis.model=createHeart();this.audioSamples=[synthesizeHeartSound(48000,false),synthesizeHeartSound(48000,true)];',context);}
catch(error){console.error('Model check failed:',error.message);process.exit(1);}
let vertices=0,triangles=0;
for(const mesh of context.model.children){
  const g=mesh.geometry;
  assert(g&&g.index,`${mesh.name}: missing geometry`);
  const count=g.attributes.position.count;
  vertices+=count;triangles+=g.index.count/3;
  for(const [name,a] of Object.entries(g.attributes)){
    assert.equal(a.count,count,`${mesh.name}: ${name} attribute mismatch`);
    assert(Array.from(a.array).every(Number.isFinite),`${mesh.name}: non-finite ${name}`);
  }
  assert(Array.from(g.index.array).every(i=>i>=0&&i<count),`${mesh.name}: invalid index`);
  if(mesh.material.transparent){const f=Array.from(g.attributes.aFade.array);assert(Math.min(...f)===0&&Math.max(...f)===1,`${mesh.name}: missing fade range`);}
  const shader={vertexShader:context.THREE.ShaderLib.physical.vertexShader,fragmentShader:context.THREE.ShaderLib.physical.fragmentShader,uniforms:{}};
  mesh.material.onBeforeCompile(shader);
  assert(shader.vertexShader.includes('uniform vec3 uContraction'),'Missing regional deformation');
  assert(shader.vertexShader.includes('deformHeart(position+tangentA'),'Normals must follow deformation');
  assert(shader.fragmentShader.includes('float softRim'),'Missing edge gradient');
  assert(shader.fragmentShader.includes('mix(diffuseColor.rgb,vNaturalColor,uNatural)'),'Missing palette interpolation');
  const soft=g.attributes.color.array,natural=g.attributes.aNaturalColor.array;
  assert(natural.some((x,i)=>Math.abs(x-soft[i])>.05),'The natural palette must differ visibly');
  assert.equal(g.attributes.aRegion.count,count,'Missing motion regions');
}
for(const [i,samples] of context.audioSamples.entries()){
  const peak=Math.max(...Array.from(samples,x=>Math.abs(x)));
  const rms=Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length);
  assert(peak>.1&&peak<1&&rms>.03,'Invalid or clipped audio');
  assert(Math.abs(samples[samples.length-1])<.001,'Audio ending is not smooth');
  console.log(`Heart sound ${i+1}: ${samples.length} samples, peak ${peak.toFixed(3)}, RMS ${rms.toFixed(3)}`);
}
console.log(`Geometry verified: ${context.model.children.length} meshes, ${vertices.toLocaleString()} vertices, ${triangles.toLocaleString()} triangles.`);
const cycleReport=vm.runInContext(`[50,72,110].map(bpm=>{const timing=cardiacTiming(bpm);return {bpm,timing,samples:Array.from({length:1001},(_,i)=>sampleCardiacCycle(i/1000,bpm))};})`,context);
for(const {bpm,timing,samples} of cycleReport){
  assert(timing.s1<timing.s2&&timing.s2+timing.relaxation<timing.period,'Invalid heart sound timing');
  assert(samples.every(s=>Object.values(s).every(v=>Number.isFinite(v)&&v>=0&&v<=1.001)),'Invalid cardiac deformation');
  const peaks=samples.filter((s,i)=>i>0&&i<1000&&s.apex>samples[i-1].apex&&s.apex>=samples[i+1].apex&&s.apex>.5);
  assert.equal(peaks.length,1,'Each beat must contain one ventricular contraction');
  assert(samples.at(-2).apex<.01&&samples[0].apex===0,'Cycle boundary must return to relaxation');
  console.log(`${bpm} BPM: S1 ${Math.round(timing.s1*1000)} ms, S2 ${Math.round(timing.s2*1000)} ms, one contraction with separate atrial phase.`);
}
assert.equal((html.match(/<input\b[^>]*\bname="palette"[^>]*>/g)||[]).length,2,'Exactly two palette choices expected');
console.log('Standalone HTML syntax, embedded assets, geometry attributes and audio buffers verified.');
await import('./check-audio.mjs');
console.log('This check does not replace visual browser/device testing.');
