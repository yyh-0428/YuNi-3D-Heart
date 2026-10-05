import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createHeart } from './heart.js';
import { heartbeatUniforms, paletteUniforms } from './materials.js';
import { PulseClock, HeartAudio } from './audio.js';
import { cardiacTiming, sampleCardiacCycle } from './cycle.js';

const $=id=>document.getElementById(id);
const stage=$('stage'),canvas=$('heart-canvas');
const clock=new PulseClock(72);
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if(reduced)clock.pause();
const announce=message=>{$('announcement').textContent=message;};
const sound=new HeartAudio(clock,state=>{
  if(sound.enabled&&!document.hidden)$('sound-hint').textContent=state!=='running'?'轻触按钮，恢复心跳声。':clock.paused?'继续跳动时，声音也会回来。':'每一声，都与你同频。';
});
let renderer,scene,camera,heart,frame,ready=false,disposed=false;
let yaw=-.17,pitch=-.065,targetYaw=yaw,targetPitch=pitch,distance=8.35,targetDistance=8.35;
let spin=false,pointers=new Map(),pinchDistance=0,lastInteraction=0,lastFrame=0;
const paletteInputs=Array.from(document.querySelectorAll('input[name="palette"]'));
let paletteMode='soft';
try{if(localStorage.getItem('yu-ni-palette')==='natural')paletteMode='natural';}catch{}
let paletteAmount=paletteMode==='natural'?1:0;
paletteUniforms.uNatural.value=paletteAmount;
function describeHeart(){canvas.setAttribute('aria-label',`${paletteMode==='natural'?'深红色':'淡玫瑰色'}人体心脏，${clock.paused?'已暂停':'正在跳动'}`);}
function setPalette(mode,notify=true){
  paletteMode=mode==='natural'?'natural':'soft';
  paletteInputs.forEach(input=>input.checked=input.value===paletteMode);
  document.body.dataset.palette=paletteMode;
  try{localStorage.setItem('yu-ni-palette',paletteMode);}catch{}
  describeHeart();if(notify)announce(`已切换为${paletteMode==='natural'?'真实':'柔粉'}配色`);
}
function updatePalette(dt=0){
  const target=paletteMode==='natural'?1:0;
  paletteAmount=reduced||dt===0?target:paletteAmount+(target-paletteAmount)*(1-Math.exp(-dt*8));
  if(Math.abs(target-paletteAmount)<.001)paletteAmount=target;
  paletteUniforms.uNatural.value=paletteAmount;
  if(heart)heart.children.forEach(mesh=>{
    const m=mesh.material;
    m.roughness=THREE.MathUtils.lerp(m.userData.softRoughness,.34,paletteAmount);
    m.clearcoat=THREE.MathUtils.lerp(m.userData.softClearcoat,m.userData.softClearcoat+.11,paletteAmount);
  });
}
paletteInputs.forEach(input=>input.addEventListener('change',()=>{if(input.checked)setPalette(input.value);}));
setPalette(paletteMode,false);
const ecg=$('ecg'),ctx=ecg.getContext('2d');
const ecgDpr=Math.min(window.devicePixelRatio||1,2);
ecg.width=190*ecgDpr;ecg.height=70*ecgDpr;
ctx.scale(ecgDpr,ecgDpr);

function setPaused(paused){
  if(paused&&!clock.paused)clock.pause();else if(!paused&&clock.paused)clock.resume();
  $('pause').setAttribute('aria-pressed',String(paused));
  $('pause').setAttribute('aria-label',paused?'继续跳动':'暂停跳动');$('pause').title=paused?'继续跳动':'暂停跳动';
  $('pulse-state').textContent=paused?'让心动停留':'此刻的心跳';
  document.body.classList.toggle('is-paused',paused);
  describeHeart();
  sound.resync();
  if(sound.enabled)$('sound-hint').textContent=paused?'继续跳动时，声音也会回来。':'每一声，都与你同频。';
}

$('pause').addEventListener('click',()=>{setPaused(!clock.paused);announce(clock.paused?'已暂停心跳与声音':'已继续心跳');});
$('sound').addEventListener('click',async()=>{
  const button=$('sound');button.disabled=true;
  try{
    if(sound.enabled&&sound.context?.state==='running'){sound.disable();button.setAttribute('aria-pressed','false');$('sound-label').textContent='听见心跳';$('sound-hint').textContent='轻触，听一听此刻。';announce('心跳声已关闭');}
    else{await sound.enable();button.setAttribute('aria-pressed','true');$('sound-label').textContent='心跳声已开启';$('sound-hint').textContent=clock.paused?'继续跳动时，声音也会回来。':'每一声，都与你同频。';announce('心跳声已开启');}
  }catch(error){$('sound-hint').textContent=error.message;announce(error.message);}
  finally{button.disabled=false;}
});
$('tempo').addEventListener('input',e=>{
  const bpm=Number(e.target.value);clock.setBpm(bpm);sound.resync();
  $('bpm-display').textContent=String(bpm);e.target.setAttribute('aria-valuetext',`每分钟 ${bpm} 次`);
  e.target.style.setProperty('--range-progress',`${(bpm-50)/60*100}%`);
});
$('orbit').addEventListener('click',()=>{
  spin=!spin;$('orbit').setAttribute('aria-pressed',String(spin));announce(spin?'自动环绕已开启':'自动环绕已关闭');
});
function reset(){targetYaw=yaw+Math.atan2(Math.sin(-.17-yaw),Math.cos(-.17-yaw));targetPitch=-.065;targetDistance=8.35;spin=false;$('orbit').setAttribute('aria-pressed','false');announce('已恢复初始视角');}
$('reset').addEventListener('click',reset);
$('brand').addEventListener('click',e=>{e.preventDefault();reset();});
$('reload').addEventListener('click',()=>window.location.reload());
setPaused(reduced);
if(window.matchMedia('(pointer:coarse)').matches)$('gesture-hint').textContent='拖动旋转 · 双指缩放';

function pointerGap(){const p=[...pointers.values()];return p.length===2?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0;}
stage.addEventListener('pointerdown',e=>{
  if(e.target.closest('button'))return;
  stage.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});pinchDistance=pointerGap();lastInteraction=performance.now();
});
stage.addEventListener('pointermove',e=>{
  const previous=pointers.get(e.pointerId);if(!previous)return;
  if(pointers.size===1){targetYaw+=(e.clientX-previous.x)*.007;targetPitch+= (e.clientY-previous.y)*.005;targetPitch=THREE.MathUtils.clamp(targetPitch,-.85,.75);}
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2){const gap=pointerGap();if(pinchDistance>0)targetDistance=THREE.MathUtils.clamp(targetDistance*pinchDistance/gap,6.2,11.5);pinchDistance=gap;}
  lastInteraction=performance.now();
});
['pointerup','pointercancel','lostpointercapture'].forEach(name=>stage.addEventListener(name,e=>{pointers.delete(e.pointerId);pinchDistance=pointerGap();lastInteraction=performance.now();}));
stage.addEventListener('wheel',e=>{e.preventDefault();targetDistance=THREE.MathUtils.clamp(targetDistance+e.deltaY*.004,6.2,11.5);lastInteraction=performance.now();},{passive:false});
stage.addEventListener('dblclick',reset);
stage.addEventListener('keydown',e=>{
  const actions={ArrowLeft:()=>targetYaw-=.13,ArrowRight:()=>targetYaw+=.13,ArrowUp:()=>targetPitch=Math.max(-.85,targetPitch-.09),ArrowDown:()=>targetPitch=Math.min(.75,targetPitch+.09),'+':()=>targetDistance=Math.max(6.2,targetDistance-.3),'=':()=>targetDistance=Math.max(6.2,targetDistance-.3),'-':()=>targetDistance=Math.min(11.5,targetDistance+.3),Home:reset};
  if(actions[e.key]){e.preventDefault();actions[e.key]();lastInteraction=performance.now();}
});

function resize(){
  if(!renderer||!camera)return;
  const w=stage.clientWidth,h=stage.clientHeight;
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
}

function electrocardiogram(phase){
  const g=(x,mu,sigma)=>Math.exp(-Math.pow((x-mu)/sigma,2));
  const k=cardiacTiming(clock.bpm),t=phase*k.period;
  return .13*g(t,k.period-.153,.024)-.14*g(t,.010,.005)+g(t,.020,.006)-.31*g(t,.032,.008)+.23*g(t,k.s2-.052,.040);
}
function drawECG(elapsed){
  const w=190,h=70;ctx.clearRect(0,0,w,h);
  const phase=elapsed/clock.period;
  const gradient=ctx.createLinearGradient(0,0,w,0);gradient.addColorStop(0,'rgba(180,113,141,.10)');gradient.addColorStop(.5,'rgba(180,113,141,.50)');gradient.addColorStop(1,'rgba(165,94,123,.85)');
  ctx.beginPath();ctx.strokeStyle=gradient;ctx.lineWidth=1.7;ctx.lineCap='round';
  for(let x=0;x<=w;x++){const p=((phase-1.4+x/w*1.4)%1+1)%1;const y=h*.57-electrocardiogram(p)*24;x?ctx.lineTo(x,y):ctx.moveTo(x,y);}
  ctx.stroke();
}

function animate(now){
  if(disposed||document.hidden)return;
  frame=requestAnimationFrame(animate);
  const dt=Math.min(.05,(now-(lastFrame||now))/1000);lastFrame=now;
  if(spin&&pointers.size===0)targetYaw+=dt*.22;
  const damping=1-Math.exp(-dt*9);
  yaw+=(targetYaw-yaw)*damping;pitch+=(targetPitch-pitch)*damping;distance+=(targetDistance-distance)*damping;
  heart.rotation.set(pitch,yaw,-.045);heart.position.y=-.48;
  camera.position.set(0,.08,distance);camera.lookAt(0,.08,0);
  const elapsed=clock.elapsed();
  const motion=sampleCardiacCycle((elapsed/clock.period)%1,clock.bpm);
  heartbeatUniforms.uContraction.value.set(motion.apex,motion.mid,motion.base);
  heartbeatUniforms.uAtrial.value=motion.atrial;
  heartbeatUniforms.uTwist.value=motion.twist;
  heartbeatUniforms.uArterial.value=motion.arterial;
  updatePalette(dt);
  renderer.render(scene,camera);drawECG(elapsed);
}

async function init(){
  try{
    renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:false});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,window.innerWidth<=700?1.75:2));
    renderer.setClearColor(0xfcfafb,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.06;
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(34,1,.1,40);camera.position.set(0,.08,8.35);
    const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
    const env=pmrem.fromScene(room,.05,0.1,100);scene.environment=env.texture;
    room.dispose();pmrem.dispose();
    const key=new THREE.DirectionalLight('#fff7f9',3.0);key.position.set(-3,5,6);scene.add(key);
    const fill=new THREE.DirectionalLight('#f9dbe8',1.05);fill.position.set(4,.5,3);scene.add(fill);
    const rim=new THREE.DirectionalLight('#fffafd',2.5);rim.position.set(2.4,3,-4);scene.add(rim);
    scene.add(new THREE.HemisphereLight('#fffaff','#b8a3b5',.8));
    heart=createHeart();scene.add(heart);heart.position.y=-.48;heart.rotation.set(pitch,yaw,-.045);updatePalette();resize();
    await renderer.compileAsync(scene,camera);
    renderer.render(scene,camera);ready=true;
    document.body.classList.add('ready');$('loading').setAttribute('aria-hidden','true');
    new ResizeObserver(resize).observe(stage);requestAnimationFrame(animate);
  }catch(error){
    console.error('Heart renderer:',error);$('loading').hidden=true;$('webgl-error').hidden=false;
    ['pause','orbit','reset','sound','tempo'].forEach(id=>$(id).disabled=true);
    paletteInputs.forEach(input=>input.disabled=true);
  }
}
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);sound.disable();$('sound').setAttribute('aria-pressed','false');$('sound-label').textContent='听见心跳';$('webgl-error').hidden=false;});
canvas.addEventListener('webglcontextrestored',()=>window.location.reload());
document.addEventListener('visibilitychange',()=>{
  sound.setHidden(document.hidden).catch(()=>{});
  if(document.hidden)cancelAnimationFrame(frame);else if(ready){lastFrame=0;requestAnimationFrame(animate);}
});
window.addEventListener('pagehide',()=>{sound.setHidden(true).catch(()=>{});cancelAnimationFrame(frame);});
window.addEventListener('pageshow',e=>{if(e.persisted&&ready){lastFrame=0;sound.setHidden(document.hidden).catch(()=>{});requestAnimationFrame(animate);}});
// Give the typography one frame before preparing the procedural geometry.
requestAnimationFrame(()=>setTimeout(init,30));
