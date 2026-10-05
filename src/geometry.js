import * as THREE from 'three';

export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const smooth = (a, b, x) => { const t = clamp((x-a)/(b-a)); return t*t*(3-2*t); };
const TAU = Math.PI * 2;
const sections = [
  // y, x centre, width, depth, z centre. A slanted LV apex, broad RV anterior face.
  [-1.62, .44, .002, .003, .03], [-1.60,.44,.075,.060,.03], [-1.50,.43,.205,.17,.03],
  [-1.29,.33,.43,.34,.02], [-1.00,.18,.70,.49,0],
  [-.65,.02,.91,.60,-.025], [-.23,-.09,1.035,.69,-.055],
  [.18,-.13,1.05,.70,-.07], [.50,-.14,.94,.63,-.085],
  [.75,-.12,.75,.49,-.09], [.95,-.07,.40,.28,-.08],
  [1.05,-.03,.008,.009,-.05]
];
function section(y) {
  let n = 0; while (n < sections.length-2 && y > sections[n+1][0]) n++;
  const p0=sections[Math.max(0,n-1)], p1=sections[n], p2=sections[n+1], p3=sections[Math.min(sections.length-1,n+2)];
  const t=clamp((y-p1[0])/(p2[0]-p1[0]));
  const out=[y];
  for(let k=1;k<5;k++) out[k]=.5*((2*p1[k])+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t*t+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t*t*t);
  return out;
}

export function bodyPoint(y, theta) {
  const [,cx,rx,rz,cz]=section(clamp(y,-1.62,1.05));
  let x=cx+Math.max(.001,rx)*Math.cos(theta);
  let z=cz+Math.max(.001,rz)*Math.sin(theta);
  const front=smooth(-.2,.6,Math.sin(theta));
  // Right ventricle crosses the anterior face. The interventricular groove
  // descends obliquely towards the anatomical left (screen right) apex.
  const grooveX=.20 + .12*y + .25*smooth(-.65,-1.50,y);
  const groove=Math.exp(-Math.pow((x-grooveX)/.075,2))*front*smooth(-1.48,-1.1,y)*(1-smooth(.53,.88,y));
  z-=.060*groove;
  z+=.061*Math.exp(-Math.pow((x+.47)/.58,2)-Math.pow((y+.12)/.78,2))*front;
  const noise=.007*Math.sin(theta*5+y*9)*Math.sin(y*11-theta*3)+.0035*Math.sin(theta*13+y*19);
  x+=noise*Math.cos(theta); z+=noise*Math.sin(theta);
  return new THREE.Vector3(x,y,z);
}

export function myocardiumGeometry() {
  const rings=112,sides=176,pos=[],normal=[],color=[],fade=[],index=[];
  const e=.0005;
  for(let j=0;j<=rings;j++){
    const y=-1.62+2.67*j/rings;
    for(let i=0;i<=sides;i++){
      const a=i/sides*TAU, p=bodyPoint(y,a);
      const dy=bodyPoint(Math.min(1.05,y+e),a).sub(bodyPoint(Math.max(-1.62,y-e),a));
      const da=bodyPoint(y,a+e).sub(bodyPoint(y,a-e));
      const n=dy.cross(da).normalize();
      pos.push(p.x,p.y,p.z);normal.push(n.x,n.y,n.z);fade.push(1);
      const base = new THREE.Color('#f1c3cd');
      const lower = new THREE.Color('#d99baa');
      const k=.2+.37*smooth(-1.55,.8,y)+.10*Math.sin(a*2+y*3);
      base.lerp(lower,clamp(k));
      // A softly warmer anterior groove gives depth without drawn outlines.
      const gx=.20+.12*y+.25*smooth(-.65,-1.50,y);
      const g=Math.exp(-Math.pow((p.x-gx)/.10,2))*smooth(.15,.60,p.z)*(1-smooth(.48,.8,y));
      base.multiplyScalar(1-.10*g);
      color.push(base.r,base.g,base.b);
      if(j<rings&&i<sides){const b=j*(sides+1)+i;index.push(b,b+sides+1,b+1,b+1,b+sides+1,b+sides+2);}
    }
  }
  return finishGeometry(pos,normal,color,fade,index);
}

function finishGeometry(pos,normal,color,fade,index) {
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  if(normal?.length)g.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(color,3));
  g.setAttribute('aFade',new THREE.Float32BufferAttribute(fade,1));
  g.setIndex(index); if(!normal?.length)g.computeVertexNormals();
  g.computeBoundingSphere();return g;
}

export function tubeGeometry(points, radii, {segments=72,sides=16,fadeStart=.70,taper=.65,fadeIn=0,closedEnd=false,color='#ead0d9',crease=0}={}) {
  const curve=new THREE.CatmullRomCurve3(points.map(p=>Array.isArray(p)?new THREE.Vector3(...p):p.clone()),false,'centripetal');
  const frames=curve.computeFrenetFrames(segments,false);
  const pos=[],normal=[],colors=[],fade=[],idx=[];
  const base=new THREE.Color(color),tip=new THREE.Color('#fff1f5');
  for(let i=0;i<=segments;i++){
    const t=i/segments,pt=curve.getPointAt(t);
    // Sample the profile, then taper and fade independently. Never cut a tube.
    let radius;
    if(typeof radii==='function') radius=radii(t);
    else {const u=t*(radii.length-1),k=Math.min(radii.length-2,Math.floor(u));radius=THREE.MathUtils.lerp(radii[k],radii[k+1],u-k);}
    const terminal=smooth(fadeStart,1,t);
    const entrance=fadeIn>0?smooth(0,fadeIn,t):1;
    radius*=(1-terminal*taper)*Math.max(.004,entrance);
    const alpha=(closedEnd?1:1-terminal)*entrance;
    const c=base.clone().lerp(tip,terminal*.83);
    for(let j=0;j<=sides;j++){
      const a=j/sides*TAU;
      const n=frames.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i],Math.sin(a));
      const r=radius*(1+crease*Math.sin(a*5+t*30)+.016*Math.sin(a*3+t*22));
      const p=pt.clone().addScaledVector(n,r);
      pos.push(p.x,p.y,p.z);normal.push(n.x,n.y,n.z);colors.push(c.r,c.g,c.b);fade.push(alpha);
      if(i<segments&&j<sides){const k=i*(sides+1)+j;idx.push(k,k+1,k+sides+1,k+1,k+sides+2,k+sides+1);}
    }
  }
  // Frenet frames occasionally change orientation. Establish outward winding.
  const a=new THREE.Vector3(...pos.slice(0,3)),b=new THREE.Vector3(...pos.slice(3,6)),c=new THREE.Vector3(...pos.slice((sides+1)*3,(sides+2)*3));
  if(b.sub(a).cross(c.sub(a)).dot(new THREE.Vector3(...normal.slice(0,3)))<0) for(let k=0;k<idx.length;k+=3)[idx[k+1],idx[k+2]]=[idx[k+2],idx[k+1]];
  return finishGeometry(pos,null,colors,fade,idx);
}

export function atriumGeometry(center, scale, rotation, color, folds=0.6) {
  const g=new THREE.SphereGeometry(1,76,52);
  // Texturing is procedural in object space; match the shared attribute layout.
  g.deleteAttribute('uv');
  const p=g.attributes.position;
  const matrix=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation));
  const c=new THREE.Color(color),colors=[],fade=[];
  for(let i=0;i<p.count;i++){
    const v=new THREE.Vector3().fromBufferAttribute(p,i);
    const a=Math.atan2(v.z,v.x),b=Math.acos(clamp(v.y,-1,1));
    const ridges=1+folds*.015*Math.sin(a*7+b*11)+.014*Math.sin(a*3-b*5);
    v.multiplyScalar(ridges);v.x*=scale[0];v.y*=scale[1];v.z*=scale[2];
    v.applyMatrix4(matrix).add(new THREE.Vector3(...center));p.setXYZ(i,v.x,v.y,v.z);
    const shade=.97+.04*Math.sin(b*8+a*4);colors.push(c.r*shade,c.g*shade,c.b*shade);fade.push(1);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('aFade',new THREE.Float32BufferAttribute(fade,1));g.computeVertexNormals();return g;
}

// Find the actual model surface for every coronary sample, so branches follow
// the ventricular anatomy instead of floating in front of it.
export function frontSurface(x,y,offset=.012,back=false) {
  const [,cx,rx]=section(clamp(y,-1.60,1.03));
  const a=Math.acos(clamp((x-cx)/Math.max(.02,rx),-.99,.99));
  const p=bodyPoint(y,back?-a:a);p.z+=back?-offset:offset;return p;
}

export function coronaryPoints(waypoints,{back=false,offset=.014,samples=64}={}) {
  const path=new THREE.CatmullRomCurve3(waypoints.map(p=>new THREE.Vector3(p[0],p[1],0)),false,'centripetal');
  const out=[];
  for(let i=0;i<=samples;i++){const p=path.getPoint(i/samples);out.push(frontSurface(p.x,p.y,offset,back));}
  return out;
}
