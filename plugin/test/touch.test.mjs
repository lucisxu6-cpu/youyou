import test from 'node:test';
import assert from 'node:assert/strict';
import {TouchDetector,ResponseGate,validateHello,validateSample} from '../src/protocol.mjs';
import {DEFAULT_CONFIG} from '../src/index.mjs';
import {ZONES,BODY_PROFILES,GESTURE_LABELS} from '../src/body.mjs';

function replay(windows,{end=10000,count=4,offset=0,skip=()=>false}={}){
  const engine=new TouchDetector(DEFAULT_CONFIG,Array(count).fill(4095));const events=[];
  for(let time=0;time<=end;time+=20){if(skip(time))continue;const raw=Array(count).fill(4095);for(const w of windows)if(time>=w.start&&time<w.end)raw[ZONES.indexOf(w.zone)]=w.value??900;
    events.push(...engine.feed({ms:(time+offset)>>>0,raw}));}
  return {engine,events,gestures:events.filter(e=>GESTURE_LABELS[e.type])};
}
test('known three and four channel layouts are accepted, permutations and wrong widths fail',()=>{
  const hello={type:'hello',product:'loveandrobot.pet',protocol:1,firmware:'1.1.0',board:'esp32s3-n8r8',device_id:'LR-1234567890AB',boot_id:'ABCDEF1234567890',nonce:'ab'.repeat(16),pins:[4,6,7,5],zones:ZONES,adc_bits:12,sample_ms:20};
  assert.equal(validateHello(hello,hello.nonce),hello);
  assert.throws(()=>validateHello({...hello,pins:[4,7,6,5]},hello.nonce));
  assert.throws(()=>validateHello({...hello,zones:['head','back','left_hand','right_hand']},hello.nonce));
  assert.equal(validateSample({type:'sample',seq:0,ms:0,raw:[4095,4095,4095,4095]},4).raw.length,4);
  assert.throws(()=>validateSample({type:'sample',seq:0,ms:0,raw:[4095,4095,4095]},4));
  assert.throws(()=>validateHello({...hello,firmware:'1.0.0'},hello.nonce));
});
test('short tap is decided after release, while a 20 ms spike and threshold chatter are ignored',()=>{
  const r=replay([{zone:'head',start:300,end:320},{zone:'head',start:700,end:820},{zone:'head',start:1500,end:1800,value:3700}],{end:2500});
  assert.deepEqual(r.gestures.map(e=>[e.type,e.durationMs]),[['tap',120]]);
  assert.ok(r.gestures[0].ms>=820+BODY_PROFILES.head.tapGapMs);
});
test('each body region uses its own timing; hands are symmetric',()=>{
  for(const zone of ZONES){const r=replay([{zone,start:300,end:900}],{end:2500});assert.equal(r.gestures[0].type,zone==='back'?'tap':'press');}
  assert.deepEqual(BODY_PROFILES.left_hand,BODY_PROFILES.right_hand);
});
test('three back pats form one rhythmic gesture, not three start messages',()=>{
  const r=replay([300,900,1500].map(start=>({zone:'back',start,end:start+180})),{end:3000});
  assert.equal(r.gestures.length,1);assert.equal(r.gestures[0].type,'repeated_tap');assert.equal(r.gestures[0].count,3);assert.equal(r.gestures[0].rhythmic,true);
});
test('one long hand contact has bounded milestones and one release, even for a full minute',()=>{
  const r=replay([{zone:'left_hand',start:300,end:60300}],{end:61000});
  assert.deepEqual(r.gestures.map(e=>e.type),['hold','long_hold','hold_release']);
  assert.equal(r.gestures.at(-1).durationMs,60000);
});
test('two hands require actual overlap; releasing one hand does not claim both were released',()=>{
  const r=replay([{zone:'left_hand',start:300,end:10000},{zone:'right_hand',start:1300,end:8500}],{end:11000});
  const pair=r.gestures.filter(e=>e.zones.length===2);
  assert.deepEqual(pair.map(e=>e.type),['both_hands_hold','both_hands_long_hold','both_hands_release']);
  assert.deepEqual(pair.at(-1).releasedZones,['right_hand']);assert.equal(pair.at(-1).durationMs,7200);
  const sequential=replay([{zone:'left_hand',start:300,end:2300},{zone:'right_hand',start:2600,end:4600}],{end:6000});
  assert.equal(sequential.gestures.some(e=>e.zones.length===2),false);
});
test('legacy three-channel firmware exposes no right hand and cannot produce a two-hand gesture',()=>{
  const r=replay([{zone:'left_hand',start:300,end:8000}],{count:3,end:8500});
  assert.equal(r.engine.available('right_hand'),false);assert.equal(r.gestures.some(e=>e.zones.length===2),false);
});
test('reconnect while loaded, pauses, and sample gaps require release before new recognition',()=>{
  const alreadyLoaded=replay([{zone:'head',start:0,end:5000},{zone:'head',start:5500,end:5700}],{end:7000});
  assert.deepEqual(alreadyLoaded.gestures.map(e=>e.type),['tap']);
  const gap=replay([{zone:'left_hand',start:300,end:6000}],{end:7000,skip:time=>time>=700&&time<1500});
  assert.equal(gap.gestures.length,0);
  const r=replay([{zone:'head',start:300,end:8000}],{end:2200});r.engine.reset();
  for(let ms=2220;ms<8000;ms+=20)assert.equal(r.engine.feed({ms,raw:[900,4095,4095,4095]}).length,0);
});
test('device millisecond rollover preserves durations and tap grouping',()=>{
  const r=replay([{zone:'head',start:300,end:480},{zone:'head',start:700,end:860}],{end:2000,offset:0xFFFFFF00});
  assert.equal(r.gestures.length,1);assert.equal(r.gestures[0].type,'repeated_tap');assert.equal(r.gestures[0].durationMs,340);
});
test('latest stage wins while busy; pair milestones replace individual hands; stale batches never revive',()=>{
  const gate=new ResponseGate(DEFAULT_CONFIG);
  const make=(type,ids,zones=['left_hand'])=>({type,contactIds:ids,zones,zone:zones.length===1?zones[0]:'both_hands',durationMs:5000,count:1});
  gate.add(make('hold',[1]),0);gate.add(make('long_hold',[1]),1000);assert.equal(gate.pending.length,1);
  gate.add(make('hold',[2],['right_hand']),1100);gate.add(make('both_hands_hold',[1,2],['left_hand','right_hand']),1200);assert.equal(gate.pending.length,1);
  assert.equal(gate.take(2000,false),null);
  gate.add({...make('both_hands_release',[1,2],['left_hand','right_hand']),ended:true,releasedZones:['right_hand']},2100);
  assert.equal(gate.take(3000,true)[0].type,'both_hands_release');
  gate.clear();gate.add({...make('tap',[3],['head']),ended:true},4000);gate.add({...make('tap',[4],['head']),ended:true},11000);
  assert.equal(gate.pending[0].count,1,'An expired tap must not be folded into a new pattern');
});
test('dispatch checks whether a hold still exists and does not spend the rate limit on invalid evidence',()=>{
  const r=replay([{zone:'head',start:300,end:2400}],{end:3000});
  const hold=r.gestures.find(e=>e.type==='hold');assert.equal(r.engine.currentEvent(hold),null);
  const gate=new ResponseGate(DEFAULT_CONFIG);gate.add(hold,1000);
  assert.equal(gate.take(2000,true,e=>r.engine.currentEvent(e)),null);assert.equal(gate.lastSent,-Infinity);
});
