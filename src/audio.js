import { cardiacTiming } from './cycle.js';

const wallTime=()=>performance.now()/1000;

// Animation and audio use the same timeline. When sound is enabled, now() is
// the audio frame reaching the output device, not the ahead-of-time render head.
export class PulseClock {
  constructor(bpm=72){
    this.bpm=bpm;this.readTime=wallTime;this.epoch=this.now()+.16;
    this.paused=false;this.held=0;this.revision=0;
  }
  now(){return this.readTime();}
  get period(){return 60/this.bpm;}
  elapsed(){return this.paused?this.held:Math.max(0,this.now()-this.epoch);}
  phase(){return (this.elapsed()/this.period)%1;}
  setTimeSource(readTime=wallTime){
    if(this.readTime===readTime)return;
    const elapsed=this.elapsed(),delay=this.paused?0:Math.max(0,this.epoch-this.now());
    this.readTime=readTime;this.held=elapsed;this.epoch=this.now()-elapsed+delay;this.revision++;
  }
  setBpm(value){const phase=this.phase();this.bpm=value;this.held=phase*this.period;this.epoch=this.now()-this.held;this.revision++;}
  pause(){if(this.paused)return;this.held=this.elapsed();this.paused=true;this.revision++;}
  resume(){if(!this.paused)return;this.epoch=this.now()-this.held;this.paused=false;this.revision++;}
}

// Broad, noise-excited tissue resonances; no sustained pitched oscillator.
// Two closely spaced transients form each valve-sound complex. The second
// heart sound is shorter and lighter. All randomness is deterministic, local,
// and affects timbre only: it never moves S1/S2 away from the cardiac cycle.
export function synthesizeHeartSound(sampleRate,second=false,variant=0){
  const duration=second?.138:.186,length=Math.round(sampleRate*duration);
  const data=new Float32Array(length);
  let seed=((second?7391:4129)+Math.imul(variant+1,2654435761))>>>0;
  let tissueSeed=second?9187:3313;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const shade=1+(random()-.5)*.038;
  const split=(second?.023:.017)+(random()-.5)*.006;
  const stretch=1+(random()-.5)*.065;
  const frequencies=second?[70,112,174,258]:[46,73,116,186];
  const weights=second?[.70,1,.52,.18]:[.93,1,.48,.15];
  const resonators=frequencies.map((f,j)=>{
    const omega=2*Math.PI*f*shade/sampleRate,alpha=Math.sin(omega)/(2*(.85+j*.22));
    return {b:alpha/(1+alpha),a1:-2*Math.cos(omega)/(1+alpha),a2:(1-alpha)/(1+alpha),x1:0,x2:0,y1:0,y2:0};
  });
  const pulse=(t,decay)=>t<=0?0:(1-Math.exp(-t/.0032))*Math.exp(-t*decay/stretch);
  const hp=1-Math.exp(-2*Math.PI*26/sampleRate),lp=1-Math.exp(-2*Math.PI*(second?380:300)/sampleRate);
  const noiseScale=Math.sqrt(sampleRate/48000);
  let dc=0,body=0,skin=0,peak=0,energy=0;
  for(let i=0;i<length;i++){
    const t=i/sampleRate;
    const envelope=pulse(t,second?45:25)+(second?.39:.48)*pulse(t-split,second?58:34);
    // A short, rounded mechanical contact under the irregular tissue texture.
    const contact=Math.exp(-Math.pow((t-.005)/.0032,2))
      +(second?.28:.34)*Math.exp(-Math.pow((t-split-.004)/.0028,2));
    tissueSeed=(Math.imul(tissueSeed,1664525)+1013904223)>>>0;
    const texture=.8*(tissueSeed/4294967296*2-1)+.36*(random()*2-1);
    const excitation=texture*noiseScale*envelope+contact*.085;
    let resonant=0;
    resonators.forEach((r,j)=>{
      const y=r.b*(excitation-r.x2)-r.a1*r.y1-r.a2*r.y2;
      r.x2=r.x1;r.x1=excitation;r.y2=r.y1;r.y1=y;
      resonant+=y*weights[j];
    });
    dc+=hp*(resonant-dc);body+=lp*(resonant-dc-body);skin+=lp*(body-skin);
    const attack=Math.min(1,t/.0025),tail=Math.min(1,(length-1-i)/(sampleRate*.025));
    const sample=skin*attack*attack*tail*tail;
    data[i]=sample;peak=Math.max(peak,Math.abs(sample));energy+=sample*sample;
  }
  // Keep perceived loudness stable across timbre variants, with peak headroom.
  const gain=Math.min((second?.51:.68)/Math.max(peak,1e-6),(second?.092:.128)/Math.max(Math.sqrt(energy/length),1e-6));
  for(let i=0;i<length;i++)data[i]*=gain;
  return data;
}

export class HeartAudio {
  constructor(clock,onState){
    this.clock=clock;this.onState=onState;this.enabled=false;this.context=null;
    this.timer=null;this.idleTimer=null;this.active=new Set();this.hidden=false;
    this.lastOutputTime=-Infinity;this.audioTime=()=>this.outputTime();this.bound=false;
  }

  outputTime(){
    const context=this.context,now=wallTime();
    const base=Number.isFinite(context.baseLatency)?Math.max(0,context.baseLatency):128/context.sampleRate;
    const output=Number.isFinite(context.outputLatency)?Math.max(0,context.outputLatency):.02;
    let time=context.currentTime-base-output;
    try{
      const stamp=context.getOutputTimestamp?.(),age=stamp?now-stamp.performanceTime/1000:Infinity;
      if(stamp&&Number.isFinite(stamp.contextTime)&&stamp.contextTime>0&&stamp.contextTime<=context.currentTime+.01&&stamp.performanceTime>0&&age>=-.025&&age<.25){
        time=stamp.contextTime+age;
      }
    }catch{}
    // Stale or coarsely rounded timestamps must never run the heart backwards.
    this.lastOutputTime=Math.max(this.lastOutputTime,Math.min(context.currentTime,time));
    return this.lastOutputTime;
  }

  async enable(){
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)throw new Error('当前浏览器不支持心跳声音，请换一个浏览器试试。');
    clearTimeout(this.idleTimer);
    if(!this.context){
      this.context=new Audio({latencyHint:'interactive'});
      this.master=this.context.createGain();this.master.gain.value=.86;
      // Buffers are already band-limited and level-matched. No compressor or
      // reverb here: their extra processing delay would obscure the transients.
      this.master.connect(this.context.destination);
      this.buffers=Array.from({length:12},(_,variant)=>[false,true].map(second=>{
        const data=synthesizeHeartSound(this.context.sampleRate,second,variant);
        const buffer=this.context.createBuffer(1,data.length,this.context.sampleRate);
        buffer.copyToChannel(data,0);return buffer;
      }));
      this.context.addEventListener('statechange',()=>{
        if(this.enabled&&!this.hidden){
          if(this.context.state!=='running'||!this.bound)this.resync();
          this.onState?.(this.context.state);
        }
      });
    }
    await this.context.resume();
    if(this.context.state!=='running')throw new Error('请再次轻触，开启心跳声。');
    this.enabled=true;this.resync();if(this.hidden)this.suspendSoon();
  }

  disable(){this.enabled=false;this.resync();this.suspendSoon();}

  suspendSoon(){
    clearTimeout(this.idleTimer);
    this.idleTimer=setTimeout(()=>{
      if((!this.enabled||this.hidden)&&this.context?.state==='running')this.context.suspend().catch(()=>{});
    },32);
  }

  stop(){
    clearInterval(this.timer);this.timer=null;
    const now=this.context?.currentTime??0;
    for(const voice of this.active){
      if(voice.stopping)continue;
      voice.stopping=true;
      try{
        if(voice.at>now||this.context.state!=='running'){
          voice.gain.gain.setValueAtTime(0,now);voice.source.stop(now);
        }else{
          voice.gain.gain.cancelScheduledValues(now);
          voice.gain.gain.setValueAtTime(voice.level,now);
          voice.gain.gain.linearRampToValueAtTime(0,now+.018);
          voice.source.stop(now+.020);
        }
      }catch{}
    }
  }

  resync(){
    this.stop();
    const running=this.enabled&&!this.hidden&&this.context?.state==='running';
    if(running&&!this.bound){
      this.lastOutputTime=-Infinity;this.clock.setTimeSource(this.audioTime);this.bound=true;
    }else if(!running&&this.bound){
      this.clock.setTimeSource();this.bound=false;
    }
    if(!running||this.clock.paused)return;
    const {s1}=cardiacTiming(this.clock.bpm);
    // Enter at the next schedulable complete pair, never a stray second sound.
    this.nextCycle=Math.max(0,Math.ceil((this.context.currentTime+.025-this.clock.epoch-s1)/this.clock.period));
    this.revision=this.clock.revision;
    this.schedule();this.timer=setInterval(()=>this.schedule(),25);
  }

  schedule(){
    const context=this.context;
    if(!this.enabled||this.hidden||!context||context.state!=='running'||this.clock.paused)return;
    if(this.revision!==this.clock.revision){this.resync();return;}
    const now=context.currentTime,p=this.clock.period,k=cardiacTiming(this.clock.bpm);
    // A stalled UI may skip a pair; it must not replay a backlog of heartbeats.
    this.nextCycle=Math.max(this.nextCycle,Math.ceil((now+.006-this.clock.epoch-k.s1)/p));
    while(this.clock.epoch+this.nextCycle*p+k.s1<now+.18){
      const n=this.nextCycle++,at=this.clock.epoch+n*p;
      const variant=((Math.imul(n+this.revision*13+1,2654435761)>>>0)%this.buffers.length);
      const breath=1+.028*Math.sin(n*p*2*Math.PI/4.6);
      const variation=1+.024*Math.sin(n*2.399963+variant);
      this.play(this.buffers[variant][0],at+k.s1,breath*variation);
      this.play(this.buffers[variant][1],at+k.s2,breath*(1+.017*Math.cos(n*1.71)));
    }
  }

  play(buffer,at,level){
    const source=this.context.createBufferSource(),gain=this.context.createGain();
    source.buffer=buffer;gain.gain.value=level;source.connect(gain);gain.connect(this.master);
    const voice={source,gain,at,level,stopping:false};this.active.add(voice);
    source.onended=()=>{source.disconnect();gain.disconnect();this.active.delete(voice);};
    source.start(at);
  }

  async setHidden(hidden){
    this.hidden=hidden;clearTimeout(this.idleTimer);
    if(hidden){this.resync();this.suspendSoon();}
    else if(this.enabled){
      try{
        await this.context.resume();this.resync();
        if(this.hidden||!this.enabled)this.suspendSoon();
      }catch{this.onState?.('suspended');}
    }
  }
}
