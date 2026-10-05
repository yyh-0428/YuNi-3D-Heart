import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { myocardiumGeometry, atriumGeometry, tubeGeometry, coronaryPoints, smooth } from './geometry.js';
import { tissueMaterial } from './materials.js';

/**
 * Original anatomical exterior, entirely generated as Three.js geometry.
 * No downloaded mesh, stock heart, texture, or model-loading request is used.
 * Viewer coordinates: +X is anatomical left; +Z is anterior; +Y is superior.
 */
export function createHeart() {
  const heart=new THREE.Group();heart.name='Original anatomical heart';
  const tissue=[],arteries=[],veins=[],coronaries=[],smallVeins=[];
  tissue.push(myocardiumGeometry());
  // Atria lie above and behind the ventricles; appendages wrap the vessel roots.
  tissue.push(atriumGeometry([-.73,.67,-.23],[.48,.64,.51],[.12,-.15,-.18],'#e3b4c2',.7));
  tissue.push(atriumGeometry([.38,.79,-.37],[.59,.43,.46],[0,.1,-.08],'#e1b2c0',.65));
  tissue.push(atriumGeometry([-.58,.76,.29],[.49,.25,.28],[-.15,-.15,-.32],'#eab7c7',1.35));
  tissue.push(atriumGeometry([.68,.77,.28],[.34,.36,.25],[.1,.35,-.48],'#e5afc1',1.45));
  tissue.push(atriumGeometry([.76,.59,.42],[.18,.23,.18],[.2,.2,-.35],'#e4aebf',1.3));

  const artery=(p,r,o={})=>arteries.push(tubeGeometry(p,r,{sides:28,segments:100,fadeStart:.73,color:'#e3a4b6',...o}));
  const vein=(p,r,o={})=>veins.push(tubeGeometry(p,r,{sides:26,segments:76,fadeStart:.62,color:'#c5afca',...o}));

  // Ascending aorta -> arch -> descending aorta, behind the pulmonary trunk.
  artery([[-.14,.49,.02],[-.19,1.13,-.03],[-.22,1.72,-.11],[.10,2.01,-.20],[.58,1.91,-.34],[.79,1.51,-.51],[.73,.90,-.68],[.63,.22,-.68]],
    [.22,.235,.243,.24,.215,.20],{fadeStart:.88,taper:.40,color:'#dda0b0'});
  // Three arch branches; the innominate branch bifurcates naturally.
  artery([[-.15,1.78,-.11],[-.29,2.05,-.08],[-.37,2.40,-.06],[-.38,2.64,-.08]],
    [.122,.107,.081,.054],{fadeStart:.48,taper:.88});
  artery([[-.29,2.14,-.08],[-.51,2.32,-.10],[-.79,2.41,-.12],[-.96,2.49,-.16]],
    [.077,.067,.044,.030],{fadeStart:.41,taper:.93});
  artery([[.13,1.99,-.21],[.13,2.25,-.22],[.17,2.51,-.24],[.23,2.70,-.28]],
    [.085,.075,.059,.031],{fadeStart:.45,taper:.90});
  artery([[.49,1.96,-.31],[.64,2.18,-.34],[.82,2.40,-.40],[.98,2.53,-.47]],
    [.095,.082,.057,.030],{fadeStart:.43,taper:.91});

  // Superior and inferior caval inflow, at anatomical right (screen left).
  vein([[-.88,.47,-.18],[-1.00,1.02,-.17],[-1.00,1.50,-.19],[-1.07,1.98,-.25],[-1.14,2.22,-.31]],
    [.20,.205,.186,.16,.10],{fadeStart:.49,taper:.71,color:'#baaac1'});
  vein([[-.85,.37,-.33],[-1.02,-.08,-.36],[-1.10,-.47,-.49],[-1.12,-.73,-.63]],
    [.185,.177,.155,.10],{fadeStart:.42,taper:.89,color:'#c9b0c6'});

  // Pulmonary trunk emerges anteriorly and crosses before the aortic root.
  vein([[-.37,.26,.18],[-.35,.80,.46],[-.16,1.16,.39],[.11,1.43,.19],[.58,1.45,.04],[1.04,1.46,-.10],[1.40,1.57,-.18]],
    [.24,.25,.23,.202,.166,.12],{fadeStart:.63,taper:.86,color:'#cfaabe'});
  vein([[.01,1.35,.17],[-.35,1.49,-.35],[-.78,1.42,-.54],[-1.19,1.39,-.57],[-1.40,1.48,-.62]],
    [.16,.17,.14,.11,.075],{fadeStart:.50,taper:.90,color:'#c4a7bd'});
  // Paired pulmonary veins blend into the rear of the left atrium.
  artery([[.48,.94,-.42],[.89,1.02,-.47],[1.18,1.09,-.53],[1.38,1.13,-.63]],[.13,.125,.10,.06],{fadeStart:.41,taper:.94,color:'#e6b8c5'});
  artery([[.52,.66,-.45],[.93,.68,-.51],[1.20,.76,-.60],[1.38,.87,-.70]],[.13,.12,.09,.05],{fadeStart:.44,taper:.94,color:'#e6b8c5'});
  artery([[-.15,.92,-.58],[-.58,1.00,-.68],[-1.08,1.13,-.72],[-1.35,1.24,-.73]],[.14,.12,.08,.04],{fadeStart:.42,taper:.93,color:'#e1b0c1'});
  artery([[-.10,.62,-.63],[-.56,.63,-.70],[-.96,.72,-.73],[-1.28,.82,-.75]],[.13,.11,.08,.04],{fadeStart:.48,taper:.93,color:'#e1b0c1'});

  const coronary=(points,r=.027,{back=false,vein=false,fade=.70,color,...rest}={})=>{
    const target=vein?smallVeins:coronaries;
    const c=color||(vein?'#b598b4':'#c77f98');
    target.push(tubeGeometry(coronaryPoints(points,{back,offset:vein?.012:.014,samples:62}),
      t=>r*(.98-.70*t),{segments:80,sides:r>.020?10:7,fadeStart:fade,taper:.985,fadeIn:.055,color:c,...rest}));
  };
  // LAD in the anterior interventricular sulcus, with diagonal branches.
  coronary([[.43,.81],[.28,.61],[.28,.42],[.20,.15],[.14,-.21],[.18,-.53],[.30,-.91],[.43,-1.24],[.47,-1.48]],.038,{fade:.78});
  coronary([[.24,.28],[.45,.12],[.66,-.04],[.77,-.27],[.74,-.51]],.021);
  coronary([[.16,-.12],[.38,-.28],[.62,-.50],[.72,-.80],[.63,-1.08]],.025);
  coronary([[.21,-.57],[.45,-.66],[.54,-.88],[.53,-1.17]],.019);
  coronary([[.36,-1.06],[.27,-1.18],[.32,-1.42]],.012);
  coronary([[.64,-.50],[.82,-.47],[.90,-.56]],.010);
  coronary([[.50,-.39],[.68,-.31],[.88,-.31],[.95,-.45]],.011);
  coronary([[.42,-.76],[.36,-.96],[.40,-1.20]],.009);
  coronary([[.44,.13],[.64,.23],[.82,.17],[1.00,-.02]],.011);
  coronary([[.29,.52],[.57,.55],[.83,.43],[.99,.16],[.98,-.10]],.029,{fade:.77});
  // Right coronary artery in the atrioventricular groove, then acute margin.
  coronary([[-.30,.77],[-.49,.60],[-.77,.49],[-.99,.28],[-1.10,-.01],[-1.03,-.28]],.036,{fade:.80});
  coronary([[-.75,.47],[-.70,.20],[-.71,-.11],[-.61,-.47],[-.43,-.78],[-.20,-1.03],[.18,-1.29]],.027,{fade:.75});
  coronary([[-.69,.13],[-.45,.01],[-.27,-.16],[-.12,-.40],[-.07,-.69]],.022);
  coronary([[-.45,-.01],[-.34,.16],[-.18,.25],[.00,.28]],.013);
  coronary([[-.67,-.31],[-.43,-.43],[-.24,-.61],[-.10,-.89],[.10,-1.13]],.017);
  coronary([[-.61,-.49],[-.75,-.53],[-.71,-.76],[-.52,-.94]],.012);
  coronary([[-.28,-.57],[-.07,-.54],[.05,-.70]],.011);
  coronary([[-.74,.21],[-.93,.02],[-.97,-.20]],.013);
  coronary([[-.36,-.83],[-.28,-1.03],[-.04,-1.17]],.009);
  coronary([[-.51,.53],[-.33,.46],[-.09,.47],[.01,.30]],.018);
  // Great cardiac vein accompanies the LAD with a cooler, quieter rose hue.
  coronary([[.47,.79],[.35,.60],[.35,.35],[.28,.05],[.22,-.27],[.26,-.58],[.36,-.94],[.49,-1.33]],.026,{vein:true,fade:.81});
  coronary([[.24,-.19],[.01,-.18],[-.25,-.32],[-.43,-.50]],.014,{vein:true});
  coronary([[.32,-.78],[.51,-.70],[.74,-.73],[.87,-.86]],.013,{vein:true});
  coronary([[.35,.37],[.57,.32],[.77,.24],[.90,.03]],.015,{vein:true});
  coronary([[-.93,.34],[-.89,.07],[-.83,-.31],[-.68,-.63],[-.38,-.98]],.018,{vein:true});
  // Posterior surface is also finished: circumflex, PDA, marginal branches.
  coronary([[-.85,.41],[-.48,.54],[-.09,.58],[.35,.55],[.70,.39],[.86,.14]],.032,{back:true,fade:.85});
  coronary([[.08,.54],[.09,.21],[.09,-.14],[.17,-.48],[.30,-.88],[.44,-1.33]],.030,{back:true,fade:.78});
  coronary([[.08,.21],[-.23,.05],[-.50,-.17],[-.64,-.44]],.019,{back:true});
  coronary([[.12,-.26],[-.14,-.39],[-.32,-.64],[-.28,-.84]],.018,{back:true});
  coronary([[.17,-.46],[.39,-.48],[.63,-.67],[.66,-.95]],.017,{back:true});
  coronary([[.48,.48],[.59,.14],[.64,-.17],[.63,-.47]],.022,{back:true});
  coronary([[-.53,.51],[-.67,.19],[-.74,-.15],[-.61,-.52]],.020,{back:true});
  coronary([[.00,.48],[.00,.06],[.03,-.32],[.14,-.73],[.36,-1.28]],.022,{back:true,vein:true});
  coronary([[.10,-.65],[-.12,-.67],[-.30,-.85]],.014,{back:true,vein:true});

  function merge(list,material,name,kind){
    // Regional attributes keep atrial motion separate from ventricular motion.
    // Coronary branches share the ventricular field of the surface they follow.
    list.forEach((g,i)=>{
      const region=kind==='tissue'?(i===0?0:1):kind==='artery'?2:kind==='vein'?3:0;
      g.setAttribute('aRegion',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(region),1));
    });
    const geometry=mergeGeometries(list,false);const mesh=new THREE.Mesh(geometry,material);
    const base=new THREE.Color({tissue:'#9f4842',artery:'#a74b43',vein:'#793e47',coronary:'#bf826b',smallVein:'#71394c'}[kind]);
    const fat=new THREE.Color('#ceb08c'),colors=[];
    const positions=geometry.attributes.position,regions=geometry.attributes.aRegion;
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
      const mottling=.97+.055*Math.sin(x*13+y*17+z*9)*Math.sin(y*8-z*11);
      const c=base.clone().multiplyScalar(mottling);
      if(kind==='tissue'){
        if(regions.getX(i)===1)c.multiplyScalar(.86);
        const front=smooth(.15,.59,z);
        const grooveX=.20+.12*y+.25*smooth(-.65,-1.50,y);
        const coronaryFat=.13*Math.exp(-Math.pow((x-grooveX)/.085,2))*front*(1-smooth(.48,.80,y));
        const basalFat=.16*Math.exp(-Math.pow((y-.54)/.14,2))*front;
        c.lerp(fat,Math.min(.22,coronaryFat+basalFat));
      }
      colors.push(c.r,c.g,c.b);
    }
    geometry.setAttribute('aNaturalColor',new THREE.Float32BufferAttribute(colors,3));
    mesh.name=name;heart.add(mesh);list.forEach(g=>g.dispose());return mesh;
  }
  merge(tissue,tissueMaterial({color:'#ffffff'}),'Ventricles, atria and auricles','tissue');
  merge(arteries,tissueMaterial({color:'#ffffff',vessel:true}),'Aorta and arch branches','artery');
  merge(veins,tissueMaterial({color:'#ffffff',vessel:true,vein:true}),'Pulmonary trunk and caval veins','vein');
  merge(coronaries,tissueMaterial({color:'#ffffff',vessel:true,fine:true}),'Coronary arterial tree','coronary');
  merge(smallVeins,tissueMaterial({color:'#ffffff',vessel:true,vein:true,fine:true}),'Coronary venous tree','smallVein');
  heart.userData={originalGeometry:true,anatomicalAxes:'+X left, +Y superior, +Z anterior',meshes:heart.children.length};
  return heart;
}
