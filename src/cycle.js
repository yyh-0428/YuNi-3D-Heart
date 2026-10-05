// Shared timing for the visual cycle and the two valve-closure sound events.
// This is an anatomical animation, not a clinical mechanics simulation.
export function cardiacTiming(bpm) {
  const period=60/bpm;
  const systole=Math.min(.355,Math.max(.245,.31*Math.pow(72/bpm,.25)));
  const relaxation=Math.min(.108,Math.max(.076,.094*Math.pow(72/bpm,.15)));
  const s1=.032,s2=s1+systole;
  return {period,s1,s2,systole,relaxation,fillEnd:Math.max(s2+relaxation+.035,period-.115),atrialStart:period-.125};
}

function cycleEase(a,b,x) {
  const t=Math.max(0,Math.min(1,(x-a)/(b-a)));
  return t*t*t*(t*(6*t-15)+10);
}

export function sampleCardiacCycle(phase,bpm) {
  const k=cardiacTiming(bpm),t=((phase%1+1)%1)*k.period;
  const contraction=(delay=0)=>{
    const x=t-delay;
    // Isovolumic onset, rapid ejection, slower late ejection. There is ONE
    // ventricular contraction per cycle; S2 does not cause a second squeeze.
    const onset=.16*cycleEase(k.s1,k.s1+.036,x);
    const ejection=.63*cycleEase(k.s1+.026,k.s1+k.systole*.48,x);
    const late=.21*cycleEase(k.s1+k.systole*.40,k.s2,x);
    const release=1-.89*cycleEase(k.s2,k.s2+k.relaxation,x)
      -.11*cycleEase(k.s2+k.relaxation,k.fillEnd,x);
    return Math.max(0,(onset+ejection+late)*release);
  };
  const atrial=cycleEase(k.atrialStart,k.atrialStart+.043,t)
    *(1-cycleEase(k.period-.043,k.period-.006,t));
  const twist=contraction()*(1-cycleEase(k.s2,k.s2+k.relaxation*.63,t));
  const arterial=cycleEase(k.s1+.044,k.s1+.12,t)*(1-cycleEase(k.s2+.035,k.s2+.17,t));
  return {apex:contraction(),mid:contraction(.008),base:contraction(.016),atrial,twist,arterial};
}
