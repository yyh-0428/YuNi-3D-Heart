import * as THREE from 'three';

// The same deformation is applied to myocardium and vessels in one coordinate
// system. This keeps fine coronary branches attached during systole.
export const heartbeatUniforms = {
  uContraction: { value: new THREE.Vector3() },
  uAtrial: { value: 0 }, uTwist: { value: 0 }, uArterial: { value: 0 },
};
export const paletteUniforms = { uNatural: { value: 0 } };

export function tissueMaterial({ color = '#e3a9b6', vessel = false, vein = false, fine = false } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color, roughness: fine ? 0.44 : 0.43, metalness: 0,
    clearcoat: fine ? 0.13 : 0.28, clearcoatRoughness: 0.38,
    sheen: 0.22, sheenColor: new THREE.Color('#fbd9e3'), sheenRoughness: 0.65,
    specularIntensity: 0.34, envMapIntensity: 0.5,
    vertexColors: true, transparent: vessel, depthWrite: true,
  });
  m.userData.softRoughness=m.roughness;
  m.userData.softClearcoat=m.clearcoat;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms,heartbeatUniforms,paletteUniforms);
    s.vertexShader = s.vertexShader.replace('#include <common>', `
      #include <common>
      uniform vec3 uContraction;
      uniform float uAtrial;
      uniform float uTwist;
      uniform float uArterial;
      attribute float aFade;
      attribute float aRegion;
      attribute vec3 aNaturalColor;
      varying float vFade;
      varying vec3 vSculptPosition;
      varying vec3 vNaturalColor;
      vec3 deformHeart(vec3 p) {
        float height = smoothstep(-1.55, 0.74, p.y);
        float regional = height < 0.5 ? mix(uContraction.x,uContraction.y,height*2.0)
          : mix(uContraction.y,uContraction.z,(height-0.5)*2.0);
        float ventricular = 1.0-smoothstep(0.54,1.08,p.y);
        float centerX = mix(0.44,-0.12,height);
        vec3 q=p;
        if(aRegion<0.5) {
          float squeeze=regional*ventricular;
          float lv=smoothstep(-0.25,0.60,p.x);
          q.x=centerX+(q.x-centerX)*(1.0-(0.071+0.027*lv)*squeeze+0.005*uAtrial);
          q.z*=1.0-(0.098-0.019*lv)*squeeze+0.007*uAtrial;
          // Base descends towards the relatively stationary apex: longitudinal
          // SHORTENING, rather than the previous whole-body stretch.
          q.y=-1.56+(q.y+1.56)*(1.0-0.064*squeeze);
          float angle=0.135*uTwist*(0.77-height)*ventricular;
          vec2 radial=q.xz-vec2(centerX,-0.04);
          q.xz=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*radial+vec2(centerX,-0.04);
        } else if(aRegion<1.5) {
          vec3 center=vec3(p.x<0.0?-0.64:0.55,0.76,-0.02);
          vec3 local=q-center;
          local.xz*=1.0-0.047*uAtrial+0.012*uContraction.z;
          local.y*=1.0-0.055*uAtrial;
          q=center+local;
          q.y-=0.118*uContraction.z;
        } else {
          // Great vessels stay anchored superiorly and follow the moving base.
          float tether=1.0-smoothstep(0.50,1.88,p.y);
          q.y-=0.125*uContraction.z*tether;
          q.x+=0.013*uTwist*tether;
          q.z+=uArterial*(aRegion<2.5?0.014:0.003)*tether;
        }
        return q;
      }
    `).replace('#include <beginnormal_vertex>', `
      #include <beginnormal_vertex>
      // Push normals through the same local deformation as the surface.
      vec3 refAxis=abs(normal.y)<0.86?vec3(0,1,0):vec3(1,0,0);
      vec3 tangentA=normalize(cross(refAxis,normal));
      vec3 tangentB=cross(normal,tangentA);
      vec3 surfacePoint=deformHeart(position);
      vec3 tangentAD=deformHeart(position+tangentA*0.002)-surfacePoint;
      vec3 tangentBD=deformHeart(position+tangentB*0.002)-surfacePoint;
      objectNormal=normalize(cross(tangentAD,tangentBD));
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vSculptPosition = position;
      vFade = aFade;
      vNaturalColor = aNaturalColor;
      transformed=deformHeart(position);
    `);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `
      #include <common>
      varying float vFade;
      varying vec3 vSculptPosition;
      varying vec3 vNaturalColor;
      uniform float uNatural;
      float hash3(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x+p.y+p.z));
      }
      float tissueNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash3(i), hash3(i+vec3(1,0,0)),f.x),
          mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),
          mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
    `).replace('#include <color_fragment>', `
      #include <color_fragment>
      diffuseColor.rgb=mix(diffuseColor.rgb,vNaturalColor,uNatural);
      float grain = tissueNoise(vSculptPosition * 26.0);
      float broad = tissueNoise(vSculptPosition * 6.0);
      diffuseColor.rgb *= 0.955 + 0.065 * grain + 0.055 * broad;
      ${vessel ? 'vec3 tipColor=mix(vec3(0.99,0.91,0.94),vec3(0.94,0.79,0.71),uNatural); diffuseColor.rgb=mix(tipColor,diffuseColor.rgb,smoothstep(0.08,0.87,vFade));' : ''}
    `).replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      vec3 p = vSculptPosition;
      float fiber = sin(p.y*93.0 + p.x*37.0 + sin(p.z*9.0)*3.0 + sin(p.y*7.0)*1.5);
      float h = (${vessel ? '0.00020' : '0.00085'} * fiber + ${fine ? '0.00008' : '0.00120'} * tissueNoise(p*71.0)) * mix(1.0,1.22,uNatural);
      vec3 qx = dFdx(-vViewPosition), qy = dFdy(-vViewPosition);
      vec3 r1 = cross(qy, normal), r2 = cross(normal, qx);
      float det = dot(qx, r1);
      vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
      normal = normalize(abs(det) * normal - grad);
    `).replace('#include <opaque_fragment>', `
      // Soft, pale grazing light blends the outline into the porcelain space.
      float facing = max(0.0, dot(normal, normalize(vViewPosition)));
      float softRim = pow(1.0 - facing, 3.8);
      outgoingLight = mix(outgoingLight, vec3(1.12, 1.00, 1.045), softRim * mix(${fine ? '0.20' : '0.47'},${fine ? '0.08' : '0.19'},uNatural));
      outgoingLight += vec3(0.030, 0.006, 0.012) * pow(1.0-facing, 1.6);
      ${vessel ? 'diffuseColor.a *= smoothstep(0.015, 0.95, vFade); if (diffuseColor.a < 0.008) discard;' : ''}
      #include <opaque_fragment>
    `);
  };
  m.customProgramCacheKey = () => `tissue-v5-${vessel}-${vein}-${fine}`;
  return m;
}
