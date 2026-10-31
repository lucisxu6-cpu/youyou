import {ZONES, DISPLAY_ZONES} from './body.mjs';

export function validChannelMap(value, count) {
  return Array.isArray(value) && [3,4].includes(value.length) && (count === undefined || value.length === count) && new Set(value).size === value.length && value.every(zone=>ZONES.includes(zone));
}

/** Pair physical inputs by touching them. Drafts never change the saved assignment. */
export class MappingWizard {
  constructor(baseline, config, now) {
    if(baseline.length!==4)throw new Error('部位配对需要四片感应片和四路固件。');
    this.baseline=[...baseline];this.config=config;this.startedAt=now;
    this.map=Array(4).fill(null);this.step=0;this.armed=false;this.settled=null;this.candidate=null;this.lastMs=null;this.hint='请先松开所有感应片。';
    this.level=0;this.lastContact=null;this.capturedZone=null;
  }
  get complete(){return this.step===4&&this.armed;}
  snapshot(){
    const phase=this.complete?'complete':!this.armed?(this.capturedZone?'recognized':'release'):this.candidate?'confirming':'ready';
    const recentContact=this.lastContact!==null&&((this.lastMs-this.lastContact)>>>0)<450;
    return {step:this.step,zone:this.capturedZone&&!this.armed?this.capturedZone:DISPLAY_ZONES[this.step]||null,assigned:DISPLAY_ZONES.slice(0,this.step),complete:this.complete,hint:this.hint,phase,signalLevel:this.level,contact:recentContact};
  }
  feed(frame){
    if(frame.raw.length!==4 || (this.lastMs!==null&&((frame.ms-this.lastMs)>>>0)>200))throw new Error('配对时采样中断，原位置设置未改变，请重新开始。');
    this.lastMs=frame.ms;
    const delta=frame.raw.map((value,i)=>Math.max(0,this.baseline[i]-value));
    // Feedback is distinct from acceptance. Even a short/light contact is visible,
    // but assigning a body part still requires the original debounce and threshold.
    const peak=Math.max(...delta);
    this.level=Math.round(Math.min(100,peak/this.config.pressDelta*100));
    if(peak>=80)this.lastContact=frame.ms;
    const released=delta.every(value=>value<=this.config.releaseDelta);
    if(!this.armed){
      if(released){this.settled??=frame.ms;if(((frame.ms-this.settled)>>>0)>=120){this.armed=true;if(this.capturedZone)this.lastContact=null;this.capturedZone=null;this.hint=this.step===4?'四个位置都认识啦，请保存。':'用指腹轻按感应区域，稍停片刻，再松开。';}}
      else this.settled=null;
      return;
    }
    if(this.step===4)return;
    const touched=delta.flatMap((value,i)=>value>=this.config.pressDelta?[i]:[]);
    if(touched.length!==1 || delta.some((value,i)=>i!==touched[0]&&value>this.config.releaseDelta)){
      this.candidate=null;
      if(touched.length>1){this.hint='一次只按一片哦，请全部松开后再试。';this.armed=false;this.settled=null;}
      return;
    }
    const channel=touched[0];
    if(this.map[channel]){this.hint='这片已经配对过了，请松开，换另一片。';this.armed=false;this.settled=null;this.candidate=null;return;}
    if(this.candidate?.channel!==channel)this.candidate={channel,since:frame.ms};
    if(((frame.ms-this.candidate.since)>>>0)>=100){
      this.capturedZone=DISPLAY_ZONES[this.step];
      this.map[channel]=DISPLAY_ZONES[this.step++];this.armed=false;this.settled=null;this.candidate=null;
      this.hint='记住了，请松开这片，再继续。';
    }
  }
}
