import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { synthesizeHeartSound } from '../src/audio.js';

// Deterministic output-device simulation. This tests timing and state handling,
// not a browser's implementation, speaker response, or subjective sound quality.
const source=(await Promise.all(['cycle','audio'].map(name=>fs.readFile(new URL(`../src/${name}.js`,import.meta.url),'utf8'))))
  .map(s=>s.replace(/^import .+?;\s*$/gm,'').replace(/^export\s+/gm,'')).join('\n');
const near=(a,b,tolerance,message)=>assert(Math.abs(a-b)<=tolerance,`${message}: ${a} vs ${b}`);

function harness({bpm=72,latency=.08,timestamps=true,skew=0}={}){
  let wall=20,id=0;
  const intervals=new Map(),timeouts=new Map(),sources=[],contexts=[];
  const timers={
    setInterval(fn,ms){const key=++id;intervals.set(key,{fn,at:wall+ms/1000,delay:ms/1000});return key;},
    clearInterval(key){intervals.delete(key);},
    setTimeout(fn,ms){const key=++id;timeouts.set(key,{fn,at:wall+ms/1000});return key;},
    clearTimeout(key){timeouts.delete(key);}
  };
  class Param{
    constructor(){this.value=1;this.events=[];}
    setValueAtTime(value,at){this.value=value;this.events.push({kind:'set',value,at});}
    linearRampToValueAtTime(value,at){this.events.push({kind:'ramp',value,at});}
    cancelScheduledValues(at){this.events=this.events.filter(e=>e.at<at);}
  }
  class Node{
    connect(target){this.target=target;return target;}
    disconnect(){this.disconnected=true;}
  }
  class AudioContext{
    constructor(options){
      this.options=options;this.currentTime=0;this.sampleRate=48000;this.state='suspended';
      this.baseLatency=Math.min(.008,latency);this.outputLatency=latency-this.baseLatency;
      this.destination=new Node();this.listeners=[];contexts.push(this);
      if(!timestamps)this.getOutputTimestamp=undefined;
    }
    getOutputTimestamp(){
      const age=.011;
      return {contextTime:Math.max(0,this.currentTime-latency-age*(1+skew)),performanceTime:(wall-age)*1000};
    }
    addEventListener(name,fn){if(name==='statechange')this.listeners.push(fn);}
    stateTo(state){if(this.state===state)return;this.state=state;this.listeners.forEach(fn=>fn());}
    async resume(){this.stateTo('running');}
    async suspend(){this.stateTo('suspended');}
    createGain(){const n=new Node();n.gain=new Param();return n;}
    createBuffer(channels,length,sampleRate){return {length,sampleRate,duration:length/sampleRate,copyToChannel(a){this.data=a;}};}
    createBufferSource(){
      const node=new Node();node.stopAt=Infinity;node.heard=false;node.ended=false;
      node.start=at=>{assert(at>=this.currentTime+.005,'Audio scheduled too late');node.at=at;node.epoch=api.clock.epoch;node.bpm=api.clock.bpm;sources.push(node);};
      node.stop=at=>{node.stopAt=at;};return node;
    }
  }
  const context=vm.createContext({performance:{now:()=>wall*1000},window:{AudioContext},...timers});
  vm.runInContext(source+'\nthis.clock=new PulseClock('+bpm+');this.sound=new HeartAudio(this.clock);this.timing=cardiacTiming;',context);
  const api={clock:context.clock,sound:context.sound,timing:context.timing,sources,intervals,timeouts,errors:[],heard:[]};
  api.advance=(seconds,{schedule=true,verify=false}={})=>{
    const end=wall+seconds;
    const advanceTime=delta=>{wall+=delta;contexts.forEach(c=>{if(c.state==='running')c.currentTime+=delta*(1+skew);});};
    // Sample the visual timeline exactly when a source's first frame arrives at
    // the simulated speaker. This measures latency compensation independently
    // of the scheduler's chosen timestamps.
    while(true){
      const c=api.sound.context;
      let next=null,delay=Infinity;
      if(c?.state==='running')for(const s of sources){
        if(s.heard||s.stopAt<=s.at)continue;
        const d=(s.at+latency-c.currentTime)/(1+skew);
        if(d>=-1e-8&&d<delay){next=s;delay=Math.max(0,d);}
      }
      if(!next||wall+delay>end+1e-9)break;
      advanceTime(delay);next.heard=true;api.heard.push(next);
      if(verify){
        const second=next.buffer.duration<.15,k=api.timing(next.bpm),want=second?k.s2:k.s1;
        let error=(api.clock.phase()*k.period-want+k.period*1.5)%k.period-k.period*.5;
        api.errors.push(Math.abs(error));
        near(error,0,.00015,'Visual/audio onset mismatch');
      }
    }
    advanceTime(Math.max(0,end-wall));
    for(const c of contexts)for(const s of sources){
      if(!s.ended&&c.currentTime>=Math.min(s.stopAt,s.at+s.buffer.duration)){
        s.ended=true;s.onended?.();
      }
    }
    for(const [key,t] of [...timeouts])if(wall>=t.at){timeouts.delete(key);t.fn();}
    if(schedule)for(const [key,t] of [...intervals])if(wall>=t.at&&intervals.has(key)){t.at=wall+t.delay;t.fn();}
  };
  api.run=(seconds,options={})=>{
    const steps=[.017,.043,.009,.061,.025];let elapsed=0,i=0;
    while(elapsed<seconds){const dt=Math.min(steps[i++%steps.length],seconds-elapsed);api.advance(dt,options);elapsed+=dt;}
  };
  return api;
}

let buffers=0;
for(const sampleRate of [44100,48000,96000])for(let variant=0;variant<12;variant++){
  const pair=[false,true].map(second=>synthesizeHeartSound(sampleRate,second,variant));
  for(const samples of pair){
    assert(samples.every(Number.isFinite),'Non-finite audio data');
    const peak=Math.max(...samples.map(Math.abs)),rms=Math.sqrt(samples.reduce((s,x)=>s+x*x,0)/samples.length);
    assert(peak<.70&&peak>.30&&rms>.06&&rms<.15,'Unexpected audio level or clipping');
    assert.equal(samples[0],0);assert.equal(Math.abs(samples.at(-1)),0);
    const tail=samples.slice(-Math.round(sampleRate*.004));
    assert(Math.max(...tail.map(Math.abs))<.0015,'Abrupt sound ending');
    let step=0;for(let i=1;i<samples.length;i++)step=Math.max(step,Math.abs(samples[i]-samples[i-1]));
    assert(step<.04,'Discontinuous or excessively sharp transient');buffers++;
  }
  assert(pair[1].length<pair[0].length,'S2 must be shorter');
  const another=synthesizeHeartSound(sampleRate,false,(variant+1)%12);
  assert(pair[0].some((x,i)=>Math.abs(x-another[i])>.02),'Identical beat variants');
}
console.log(`Audio synthesis: ${buffers} buffers at 44.1 / 48 / 96 kHz; finite, unclipped, smooth boundaries, distinct variants.`);

let heard=0,maxError=0;
for(const bpm of [50,72,110])for(const latency of [.012,.09,.22]){
  const h=harness({bpm,latency,skew:.000025});
  await h.sound.enable();h.run(600,{verify:true});
  assert(h.heard.length>bpm*19-3,'Missing heartbeat pairs');
  for(let i=0;i+1<h.heard.length;i+=2){
    const first=h.heard[i],second=h.heard[i+1];
    assert(first.buffer.duration>second.buffer.duration,'S1 / S2 order changed');
    near(second.at-first.at,h.timing(bpm).systole,1e-9,'Incorrect inter-sound interval');
    if(i+2<h.heard.length)near(h.heard[i+2].at-first.at,60/bpm,1e-9,'Duplicate or drifting beat');
  }
  assert.equal(h.intervals.size,1,'More than one scheduler');
  assert(h.sound.active.size<=4,'Finished nodes were not released');
  heard+=h.heard.length;maxError=Math.max(maxError,...h.errors);h.sound.disable();h.advance(.04);
}
console.log(`Output-clock simulation: ${heard} sound onsets across 9 ten-minute runs (50 / 72 / 110 BPM; 12 / 90 / 220 ms latency). Max numerical alignment error ${(maxError*1000).toFixed(4)} ms.`);

// Browsers without getOutputTimestamp use their reported output/base latency.
const fallback=harness({latency:.14,timestamps:false});await fallback.sound.enable();fallback.run(10,{verify:true});fallback.sound.disable();

const h=harness();await h.sound.enable();h.run(2);
const oldPhase=h.clock.phase();h.clock.setBpm(110);h.sound.resync();
near(h.clock.phase(),oldPhase,1e-9,'Tempo edit moved the visual phase');
h.run(3,{verify:true});
for(const bpm of [50,72,110,60,80]){h.clock.setBpm(bpm);h.sound.resync();h.advance(.012);}
assert.equal(h.intervals.size,1,'Rapid tempo changes left extra timers');
h.run(3,{verify:true});
h.clock.pause();h.sound.resync();const held=h.clock.elapsed();h.run(1);
assert.equal(h.clock.elapsed(),held,'Paused clock moved');assert.equal(h.intervals.size,0);
assert.equal(h.sound.active.size,0,'Audio continued after pause fade');
h.clock.resume();h.sound.resync();h.run(3,{verify:true});
await h.sound.setHidden(true);h.run(.1);
assert.equal(h.sound.context.state,'suspended');assert.equal(h.intervals.size,0);
h.run(2);await h.sound.setHidden(false);h.run(3,{verify:true});
h.sound.context.stateTo('interrupted');assert.equal(h.sound.bound,false);
h.run(.2);h.sound.context.stateTo('running');h.run(3,{verify:true});
// Event-loop starvation must not cause a burst of late queued beats.
const count=h.sources.length;h.advance(4,{schedule:false});h.sound.schedule();
assert(h.sources.length-count<=2,'Scheduler replayed a backlog');h.run(2,{verify:true});
const beforeOff=h.clock.phase();h.sound.disable();
near(h.clock.phase(),beforeOff,1e-9,'Switching off sound jumped the animation');
h.advance(.01);await h.sound.enable();h.run(2,{verify:true});
assert.equal(h.sound.context.state,'running','Old suspend timer shut down newly enabled sound');
assert.equal(h.intervals.size,1);

// An in-progress voice gets a release ramp; future voices are cancelled.
let voice;
for(let i=0;i<100&&!voice;i++){
  h.advance(.005);voice=[...h.sound.active].find(v=>v.at<=h.sound.context.currentTime&&v.at+.06>h.sound.context.currentTime);
}
assert(voice,'Could not reach an active voice');h.sound.disable();
assert(voice.gain.gain.events.some(e=>e.kind==='ramp'&&e.value===0),'Missing click-free release');
h.advance(.05);assert.equal(h.sound.active.size,0);assert.equal(h.intervals.size,0);
console.log('Transitions verified: phase-preserving tempo edits, rapid changes, pause/resume, hidden page, interruption, delayed UI, rapid sound toggles, release ramps and node cleanup.');
console.log('These are deterministic code tests; browser listening and physical device latency have not been measured.');
