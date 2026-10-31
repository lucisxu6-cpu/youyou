import test from 'node:test';
import assert from 'node:assert/strict';
import {MappingWizard,validChannelMap} from '../src/mapping.mjs';
import {TouchDetector} from '../src/touch.mjs';
import {PetController,DEFAULT_CONFIG} from '../src/index.mjs';
import {uiAction,uiSnapshot} from '../src/ui-api.mjs';
import {validateState} from '../src/state.mjs';

const baseline=[4095,4000,3900,3800];
function stream(target){let ms=0;return (duration,channels=[])=>{const events=[];for(let t=0;t<duration;t+=20){const result=target.feed({ms:ms+=20,raw:baseline.map((v,i)=>channels.includes(i)?v-1000:v)});if(result)events.push(...result);}return events;};}

test('pairing permits arbitrary physical order, requires release, and saves only four unique channels',()=>{
  const wizard=new MappingWizard(baseline,DEFAULT_CONFIG,0),feed=stream(wizard);
  feed(300);feed(160,[3]);assert.equal(wizard.step,1);feed(1000,[3]);assert.equal(wizard.step,1);
  feed(300);feed(160,[3]);assert.equal(wizard.step,1);assert.match(wizard.hint,/配对过/);
  feed(300);feed(160,[0,1]);assert.equal(wizard.step,1);assert.match(wizard.hint,/一次只按一片/);
  for(const i of [0,2,1]){feed(300);feed(160,[i]);}
  assert.equal(wizard.complete,false);feed(300);assert.equal(wizard.complete,true);
  assert.deepEqual(wizard.map,['back','right_hand','left_hand','head']);
});

test('pairing ignores startup pressure and noise; a sample gap invalidates the draft',()=>{
  const wizard=new MappingWizard(baseline,DEFAULT_CONFIG,0),feed=stream(wizard);
  feed(1000,[0]);assert.equal(wizard.step,0);feed(300);feed(20,[0]);feed(300);assert.equal(wizard.step,0);
  assert.throws(()=>wizard.feed({ms:4000,raw:baseline}),/采样中断/);
});

test('first contact produces feedback before acceptance; a short or light contact never silently assigns a zone',()=>{
  const wizard=new MappingWizard(baseline,DEFAULT_CONFIG,0),feed=stream(wizard);
  assert.equal(wizard.snapshot().phase,'release');feed(300);
  assert.equal(wizard.snapshot().phase,'ready');feed(20,[1]);
  assert.equal(wizard.snapshot().contact,true);assert.equal(wizard.snapshot().signalLevel,100);
  assert.equal(wizard.snapshot().phase,'confirming');assert.equal(wizard.step,0);
  feed(40);assert.equal(wizard.snapshot().contact,true,'Brief touch remains visible through a UI refresh');assert.equal(wizard.step,0);
  feed(500);assert.equal(wizard.snapshot().contact,false);
  wizard.feed({ms:wizard.lastMs+20,raw:baseline.map((n,i)=>i===2?n-120:n)});
  assert.equal(wizard.snapshot().contact,true);assert.equal(wizard.snapshot().signalLevel,20);assert.equal(wizard.step,0);
});

test('recognized feedback keeps the just-touched body part until release instead of prematurely requesting the next one',()=>{
  const wizard=new MappingWizard(baseline,DEFAULT_CONFIG,0),feed=stream(wizard);
  feed(300);feed(200,[1]);
  assert.equal(wizard.step,1);assert.equal(wizard.snapshot().phase,'recognized');assert.equal(wizard.snapshot().zone,'head');
  assert.deepEqual(wizard.snapshot().assigned,['head']);feed(2000,[1]);assert.equal(wizard.snapshot().zone,'head');
  feed(300);assert.equal(wizard.snapshot().zone,'back');assert.equal(wizard.snapshot().phase,'ready');assert.equal(wizard.snapshot().contact,false);
});

test('body rules and two-hand combination follow assigned zones, while baselines stay with physical inputs',()=>{
  const detector=new TouchDetector(DEFAULT_CONFIG,baseline,['back','right_hand','left_hand','head']);
  const feed=stream(detector);feed(300);
  const head=feed(1400,[3]);assert.equal(head.find(e=>e.type==='hold').zone,'head');
  feed(300);const hands=feed(6500,[1,2]);
  assert.equal(hands.filter(e=>e.type==='both_hands_long_hold').length,1);
  assert.equal(hands.some(e=>e.zone==='back'),false);
  assert.deepEqual(detector.baseline,baseline);
  assert.throws(()=>new TouchDetector(DEFAULT_CONFIG,baseline,['head','head','back','right_hand']));
});

function fixture(map=null){
  let saved={version:1,deviceId:'LR-1234567890AB',name:'youyou',sessionId:'chat',enabled:true,baseline,channelMap:map};
  let clock=0;const messages=[];const agent={id:'chat',status:'idle',session:{},followup:m=>messages.push(m)};
  const ctx={agents:{roots:()=>[agent],get:()=>agent}};
  const store={load:()=>saved,save:s=>{validateState(s);saved=structuredClone(s);}};
  const controller=new PetController(ctx,DEFAULT_CONFIG,{store,now:()=>clock});
  controller.device={device_id:saved.deviceId,pins:[4,6,7,5],boot_id:'1234567890ABCDEF'};
  controller.connection={stop(){}};controller.chatStatus='ready';
  const feed=(duration,channels=[])=>{for(let t=0;t<duration;t+=20){clock+=20;controller.sample({ms:clock,raw:baseline.map((v,i)=>channels.includes(i)?v-1000:v)});controller.tick();}};
  feed(300);controller.resetDetector();
  return {controller,feed,messages,store,get saved(){return saved;}};
}

test('unpaired four-channel hardware cannot misreport body locations; completing the UI flow persists and resumes correct routing',async()=>{
  const f=fixture(),{controller:c,feed}=f;
  assert.equal(uiSnapshot(c).calibrated,true);assert.equal(uiSnapshot(c).placementReady,false);
  feed(2000,[0]);feed(1000);assert.equal(f.messages.length,0);
  await uiAction(c,{action:'mapping-start'});
  for(const i of [3,0,2,1]){feed(300);feed(180,[i]);}
  assert.equal(uiSnapshot(c).touchZones.every(zone=>zone.pairing==='matched'),true);
  await assert.rejects(()=>uiAction(c,{action:'mapping-save'}));
  feed(300);assert.equal(f.messages.length,0);assert.equal(f.saved.channelMap,null);
  await uiAction(c,{action:'mapping-save'});
  assert.deepEqual(f.saved.channelMap,['back','right_hand','left_hand','head']);
  assert.equal(f.saved.sessionId,'chat');assert.equal(f.saved.name,'youyou');
  feed(300);feed(200,[3]);feed(1400);
  assert.equal(f.messages.length,1);assert.match(f.messages[0].content[0].text,/头部感应区/);
  const reopened=new PetController(c.ctx,DEFAULT_CONFIG,{store:f.store});
  assert.deepEqual(reopened.state.channelMap,f.saved.channelMap);reopened.stop();c.stop();
});

test('cancel, duplicate requests, expiry and disconnect preserve saved placement and suppress calibration touches',async()=>{
  const map=['head','left_hand','back','right_hand'],f=fixture(map),c=f.controller;
  await uiAction(c,{action:'mapping-start'});await assert.rejects(()=>uiAction(c,{action:'mapping-start'}));
  f.feed(300);f.feed(200,[2]);await uiAction(c,{action:'mapping-cancel'});
  assert.deepEqual(f.saved.channelMap,map);f.feed(2000,[2]);assert.equal(f.messages.length,0);
  f.feed(300);await uiAction(c,{action:'mapping-start'});c.mapping.startedAt=-180001;c.tick();
  assert.equal(c.mapping,null);assert.deepEqual(f.saved.channelMap,map);
  await uiAction(c,{action:'mapping-start'});c.device=null;await assert.rejects(()=>uiAction(c,{action:'mapping-save'}));
  assert.deepEqual(f.saved.channelMap,map);c.stop();
});

test('corrupt saved placement fails closed; old three-channel state remains compatible',()=>{
  const f=fixture();assert.equal(validChannelMap(['head','head','back','right_hand']),false);
  assert.throws(()=>validateState({...f.saved,channelMap:['head','head','back','right_hand']}));
  validateState({...f.saved,baseline:[4095,4095,4095],channelMap:undefined});f.controller.stop();
});
