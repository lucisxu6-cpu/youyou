import {ZONES, BODY_PROFILES, GESTURE_LABELS} from './body.mjs';
import {validChannelMap} from './mapping.mjs';

const elapsed=(now,then)=>(now-then)>>>0;
const freshChannel=()=>({active:false,armed:false,settled:null,candidate:null,start:0,id:null,held:false,longHeld:false,taps:null});
const handTypes=new Set(['both_hands_hold','both_hands_long_hold','both_hands_release']);

/** Time-based interpretation of contact; never estimates force, movement or emotion. */
export class TouchDetector {
  constructor(config,baseline,channelMap=ZONES.slice(0,baseline.length)) {
    if(!Array.isArray(baseline)||![3,4].includes(baseline.length)||!baseline.every(n=>Number.isFinite(n)&&n>=0&&n<=4095))throw new Error('Invalid touch baseline');
    if(!validChannelMap(channelMap,baseline.length))throw new Error('Invalid body mapping');
    this.config=config;this.baseline=[...baseline];this.channelMap=[...channelMap];this.counter=0;this.reset();
  }
  reset(){this.generation=(this.generation??0)+1;this.channels=ZONES.map(freshChannel);this.lastMs=null;this.pair=null;}
  available(zone){return this.channelMap.includes(zone);}
  event(type,zones,contactIds,ms,durationMs,extra={}){return {type,zone:zones.length===1?zones[0]:'both_hands',zones,contactIds,ms,durationMs,...extra};}
  flushTaps(channel,zone,ms,events){
    const taps=channel.taps;if(!taps)return;
    const intervals=taps.starts.slice(1).map((start,i)=>elapsed(start,taps.starts[i]));
    const rhythmic=intervals.length>=2&&Math.max(...intervals)-Math.min(...intervals)<=Math.max(120,intervals.reduce((a,b)=>a+b,0)/intervals.length*.3);
    events.push(this.event(taps.ids.length>1?'repeated_tap':'tap',[zone],taps.ids,ms,taps.total,{count:taps.ids.length,rhythmic,ended:true}));
    channel.taps=null;
  }
  feed(frame){
    const events=[];
    if(frame.raw.length!==this.baseline.length){this.reset();return events;}
    if(this.lastMs!==null&&elapsed(frame.ms,this.lastMs)>200)this.reset();
    this.lastMs=frame.ms;
    for(let i=0;i<this.baseline.length;i++){
      const zone=this.channelMap[i],profile=BODY_PROFILES[zone],c=this.channels[ZONES.indexOf(zone)],ms=frame.ms;
      const delta=Math.max(0,this.baseline[i]-frame.raw[i]);
      // Require released data after connection/gap/resume. An already loaded pad is not a new touch.
      if(!c.armed){if(delta<=this.config.releaseDelta){c.settled??=ms;if(elapsed(ms,c.settled)>=120)c.armed=true;}else c.settled=null;continue;}
      if(!c.active){
        if(c.taps&&elapsed(ms,c.taps.lastEnd)>profile.tapGapMs)this.flushTaps(c,zone,ms,events);
        if(delta>=this.config.pressDelta){
          c.candidate??=ms;
          if(elapsed(ms,c.candidate)>=profile.pressMs){
            c.active=true;c.start=c.candidate;c.id=++this.counter;c.held=false;c.longHeld=false;c.candidate=null;
            events.push(this.event('press_start',[zone],[c.id],ms,0));
          }
        }else c.candidate=null;
      }else{
        if(delta<=this.config.releaseDelta){
          c.candidate??=ms;
          if(elapsed(ms,c.candidate)>=profile.releaseMs){
            const end=c.candidate,duration=elapsed(end,c.start);c.active=false;c.candidate=null;
            events.push(this.event('press_end',[zone],[c.id],ms,duration,{endedAt:end}));
            if(duration<=profile.tapMaxMs){
              c.taps??={ids:[],starts:[],lastEnd:end,total:0};
              c.taps.ids.push(c.id);c.taps.starts.push(c.start);c.taps.lastEnd=end;c.taps.total+=duration;
              // Bound a long stream of rhythmic taps; the response gate merges adjacent batches.
              if(c.taps.ids.length>=3)this.flushTaps(c,zone,ms,events);
            }else{
              this.flushTaps(c,zone,ms,events);
              events.push(this.event(duration>=profile.holdMs?'hold_release':'press',[zone],[c.id],ms,duration,{ended:true}));
            }
          }
        }else{
          c.candidate=null;
          const duration=elapsed(ms,c.start);
          if(duration>=profile.holdMs&&!c.held){this.flushTaps(c,zone,ms,events);c.held=true;events.push(this.event('hold',[zone],[c.id],ms,duration));}
          if(duration>=profile.longHoldMs&&!c.longHeld){c.longHeld=true;events.push(this.event('long_hold',[zone],[c.id],ms,duration));}
        }
      }
    }
    this.combineHands(frame.ms,events);
    return events;
  }
  combineHands(ms,events){
    if(!this.available('right_hand')||!this.available('left_hand'))return;
    const hands=[this.channels[1],this.channels[3]],zones=['left_hand','right_hand'];
    const same=this.pair&&hands.every((c,i)=>c.active&&c.id===this.pair.ids[i]);
    if(this.pair&&!same){
      const pair=this.pair;
      if(pair.reported){
        const ended=events.filter(e=>e.type==='press_end'&&e.contactIds.some(id=>pair.ids.includes(id)));
        const endedDurations=ended.map(e=>elapsed(e.endedAt,pair.start));
        events.push(this.event('both_hands_release',zones,pair.ids,ms,Math.max(0,endedDurations.length?Math.min(...endedDurations):elapsed(ms,pair.start)),{ended:true,releasedZones:zones.filter((_,i)=>!hands[i].active||hands[i].id!==pair.ids[i])}));
      }
      this.pair=null;
    }
    if(hands.every(c=>c.active)){
      if(!this.pair)this.pair={ids:hands.map(c=>c.id),start:elapsed(ms,hands[0].start)<elapsed(ms,hands[1].start)?hands[0].start:hands[1].start,reported:false,longReported:false};
      const pair=this.pair,duration=elapsed(ms,pair.start);
      if(hands.some(c=>c.candidate!==null))return;
      if(duration>=1600&&!pair.reported){pair.reported=true;events.push(this.event('both_hands_hold',zones,pair.ids,ms,duration));}
      if(duration>=6000&&!pair.longReported){pair.longReported=true;events.push(this.event('both_hands_long_hold',zones,pair.ids,ms,duration));}
    }
  }
  currentEvent(event){
    if(event.ended)return event;
    const active=event.zones.every((zone,i)=>{const c=this.channels[ZONES.indexOf(zone)];return c?.active&&c.id===event.contactIds[i]&&c.candidate===null;});
    if(!active)return null; // Never claim an old hold is still happening.
    const durationMs=Math.min(...event.zones.map(zone=>elapsed(this.lastMs,this.channels[ZONES.indexOf(zone)].start)));
    return {...event,durationMs};
  }
}

/** One bounded conversation queue; newer evidence replaces earlier stages of the same touch. */
export class ResponseGate {
  constructor(config){this.config=config;this.pending=[];this.lastSent=-Infinity;}
  clear(){this.pending=[];}
  add(event,now){
    if(!GESTURE_LABELS[event.type])return;
    this.pending=this.pending.filter(e=>now-e.receivedAt<=this.config.eventMaxAgeMs);
    const overlap=other=>other.contactIds.some(id=>event.contactIds.includes(id));
    // A simultaneous-hand event summarizes both individual hands, even across milestones.
    if(!handTypes.has(event.type)&&!event.ended&&this.pending.some(e=>handTypes.has(e.type)&&!e.ended&&overlap(e)))return;
    this.pending=this.pending.filter(e=>!overlap(e));
    const previous=this.pending.find(e=>e.zone===event.zone&&['tap','repeated_tap'].includes(e.type)&&['tap','repeated_tap'].includes(event.type));
    if(previous){
      this.pending=this.pending.filter(e=>e!==previous);
      event={...event,type:'repeated_tap',count:previous.count+event.count,contactIds:[...previous.contactIds,...event.contactIds].slice(-12),durationMs:previous.durationMs+event.durationMs,rhythmic:false};
    }
    this.pending.push({...event,receivedAt:now});this.pending=this.pending.slice(-12);
  }
  take(now,idle,resolve=event=>event){
    this.pending=this.pending.filter(e=>now-e.receivedAt<=this.config.eventMaxAgeMs).map(resolve).filter(Boolean);
    if(!idle||!this.pending.length||now-this.lastSent<this.config.responseGapMs||now-this.pending[0].receivedAt<this.config.coalesceMs)return null;
    const batch=this.pending;this.pending=[];this.lastSent=now;return batch;
  }
}
