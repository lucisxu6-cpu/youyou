import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {PetController,DEFAULT_CONFIG} from '../src/index.mjs';
import {SerialConnection} from '../src/transport.mjs';
import {uiSnapshot} from '../src/ui-api.mjs';

const id='LR-1234567890AB',otherId='LR-1234567890AC';
const hello={type:'hello',protocol:1,product:'loveandrobot.pet',firmware:'1.1.1',board:'esp32s3-n8r8',device_id:id,boot_id:'1234567890ABCDEF',pins:[4,6,7,5],zones:['head','left_hand','back','right_hand'],adc_bits:12,sample_ms:20};
function fixture(patch={}){
  let clock=1000,wall=1790000000000,creates=0,saveFails=0,resolveHook=null;
  let saved={version:1,deviceId:id,name:'youyou',sessionId:'chat',enabled:true,baseline:[4095,4095,4095,4095],channelMap:['back','head','right_hand','left_hand'],...patch};
  const messages=[],live=new Map(),persisted=new Map(),connections=[],archived=[];
  function agent(key){return {id:key,status:'idle',session:{},followup:m=>messages.push(m)};}
  const original=agent('chat');live.set('chat',original);persisted.set('chat',original);
  const ctx={agents:{get:key=>live.get(key),roots:()=>[...live.values()]},sessionTitle:{get:session=>({title:session.title})},workspaceRegistry:{archivedSessionIds:archived,list:()=>[],unarchiveSession:async key=>{archived.splice(archived.indexOf(key),1);}},sessionController:{
    create:async()=>{await Promise.resolve();const key='created-'+(++creates),a=agent(key);live.set(key,a);persisted.set(key,a);return {sessionId:key};},
    rename:async({sessionId,title})=>{persisted.get(sessionId).session.title=title;},
    resolveAgent:async key=>{if(resolveHook)return resolveHook(key);const a=persisted.get(key);if(!a)return {error:Object.assign(new Error('missing'),{code:'session/not-found'})};live.set(key,a);return {agent:a};}
  }};
  class Connection{
    constructor(port,handlers){this.handlers=handlers;this.port=port;this.closed=false;connections.push(this);}
    stop(){if(!this.closed){this.closed=true;this.handlers.close('断开');}}
    fail(message){this.stop();}
    connect(deviceId=id){this.handlers.hello({...hello,device_id:deviceId});}
  }
  const store={load:()=>structuredClone(saved),save:next=>{if(saveFails){saveFails--;throw new Error('disk unavailable');}saved=structuredClone(next);}};
  const c=new PetController(ctx,DEFAULT_CONFIG,{store,now:()=>clock,wallNow:()=>wall,discover:async()=>[{port:'COM4'}],Connection});
  c.device={...hello,port:'COM4'};c.lastFrame={ms:clock,seq:0,raw:[4095,4095,4095,4095]};c.lastReceived=clock;c.resetDetector();c.chatStatus='ready';
  const feed=(duration,channels=[],rawValue=1000)=>{for(let n=0;n<duration;n+=20){clock+=20;c.sample({ms:clock,raw:[0,1,2,3].map(i=>channels.includes(i)?rawValue:4095)});c.tick();}};
  return {c,feed,ctx,store,messages,connections,live,persisted,archived,agent:original,get saved(){return saved;},get creates(){return creates;},advance:n=>{clock+=n;},setWall:v=>{wall=v;},failSave:()=>{saveFails++;},resolveWith:fn=>{resolveHook=fn;}};
}

test('failed recalibration restores old usable detector and does not save a loaded baseline',async()=>{
  const f=fixture(),c=f.c;const old=[...f.saved.baseline];
  const operation=c.calibrate();const rejected=assert.rejects(operation,/不稳定或有预压/);
  f.feed(3000,[0]);await rejected;
  assert.deepEqual(f.saved.baseline,old);assert.ok(c.detector);assert.equal(uiSnapshot(c).calibrated,true);
  f.feed(300);f.feed(180,[1]);f.feed(1600);assert.equal(f.messages.length,1);assert.match(f.messages[0].content[0].text,/头部感应区/);c.stop();
});

test('saving recalibration failure restores prior calibration; disconnect rejects in-flight calibration',async()=>{
  const f=fixture(),c=f.c;f.failSave();let done=c.calibrate(),rejected=assert.rejects(done,/保存校准失败/);f.feed(3000);await rejected;assert.ok(c.detector);
  await c.scan();f.connections[0].connect();done=c.calibrate();rejected=assert.rejects(done,/断开/);f.connections[0].stop();await rejected;
  assert.equal(c.detector,null);assert.equal(c.online(),false);assert.equal(f.saved.sessionId,'chat');c.stop();
});

test('stale stream reconnects, preserves placement and session, and ignores a pad already held on reconnect',async()=>{
  const f=fixture(),c=f.c;await c.scan();const first=f.connections[0];first.connect();f.feed(300);
  c.gate.add({type:'tap',zone:'head',zones:['head'],contactIds:[9],count:1,ended:true},1000);
  f.advance(1600);c.tick();assert.equal(first.closed,true);assert.equal(c.online(),false);assert.equal(c.gate.pending.length,0);
  await c.scan();f.connections[1].connect();f.feed(6500,[1]);assert.equal(f.messages.length,0);
  f.feed(300);f.feed(200,[1]);f.feed(1500);assert.equal(f.messages.length,1);
  assert.deepEqual(f.saved.channelMap,['back','head','right_hand','left_hand']);assert.equal(f.saved.sessionId,'chat');c.stop();
});

test('a different board never inherits binding, calibration or touch routing',async()=>{
  const f=fixture(),c=f.c;await c.scan();f.connections[0].connect(otherId);f.feed(4000,[1]);
  assert.equal(c.boundOnline(),false);assert.equal(c.detector,null);assert.equal(f.messages.length,0);assert.equal(f.saved.deviceId,id);
  assert.equal((await c.command({rawInput:'bind'})).kind,'error');c.stop();
});

test('gap during mapping discards only draft; disconnect and paused cold start retain durable settings',async()=>{
  const f=fixture(),c=f.c;await c.scan();f.connections[0].connect();f.feed(300);c.startMapping();f.feed(300);f.feed(200,[0]);
  f.connections[0].handlers.gap();assert.equal(c.mapping,null);assert.deepEqual(f.saved.channelMap,['back','head','right_hand','left_hand']);
  await c.command({rawInput:'pause'});c.stop();const reopened=new PetController(f.ctx,DEFAULT_CONFIG,{store:f.store});
  assert.equal(reopened.state.enabled,false);assert.equal(reopened.state.sessionId,'chat');assert.deepEqual(reopened.state.channelMap,f.saved.channelMap);reopened.stop();
});

test('concurrent first opening and retry after persistence failure create only one chat in the live process',async()=>{
  const f=fixture({sessionId:null,pendingWelcome:false}),c=f.c;f.failSave();
  await assert.rejects(()=>c.openChat(),/disk unavailable/);assert.equal(f.creates,1);
  const ids=await Promise.all([c.openChat(),c.openChat()]);assert.deepEqual(ids,['created-1','created-1']);assert.equal(f.creates,1);assert.equal(f.messages.length,1);c.stop();
});

test('first four-channel text chat works before placement; a pending greeting can recover offline without duplicate greetings',async()=>{
  const fresh=fixture({sessionId:null,channelMap:null});assert.equal(await fresh.c.openChat(),'created-1');assert.equal(fresh.messages.length,1);fresh.c.stop();
  const f=fixture({pendingWelcome:true}),c=f.c;c.device=null;c.lastFrame=null;f.agent.status='running';
  assert.equal(await c.openChat(),'chat');assert.equal(f.messages.length,0);f.agent.status='idle';
  assert.equal(await c.openChat(),'chat');assert.equal(f.messages.length,1);await c.openChat();assert.equal(f.messages.length,1);c.stop();
});

test('archival during asynchronous chat restore cannot reopen the conversation or deliver touches',async()=>{
  const f=fixture();f.live.clear();let finish;f.resolveWith(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=f.c.restoreChat();await Promise.resolve();f.archived.push('chat');finish({agent:f.agent});assert.equal(await pending,undefined);
  f.c.tick();assert.equal(f.c.chatStatus,'archived');assert.equal(f.messages.length,0);f.c.stop();
});

test('greeting submission failure preserves the chat and retries without losing its pending state',async()=>{
  const f=fixture({pendingWelcome:true});const send=f.agent.followup;
  await f.c.scan();f.connections[0].connect();
  f.agent.followup=()=>{throw new Error('temporary host failure');};
  assert.equal(await f.c.openChat(),'chat');assert.equal(f.saved.pendingWelcome,true);
  f.feed(300);f.feed(200,[1]);f.feed(1500);assert.equal(f.messages.length,0);
  f.agent.followup=send;assert.equal(await f.c.openChat(),'chat');assert.equal(f.saved.pendingWelcome,false);assert.equal(f.messages.length,1);assert.equal(f.c.error,'');f.c.stop();
});

test('a busy first greeting completes when the chat becomes idle, even offline, without another click or duplicate greeting',async()=>{
  const f=fixture({pendingWelcome:true}),c=f.c;c.device=null;c.lastFrame=null;f.agent.status='running';
  await c.openChat();c.tick();assert.equal(f.messages.length,0);
  f.agent.status='idle';c.tick();assert.equal(f.messages.length,1);assert.equal(f.saved.pendingWelcome,false);
  for(let i=0;i<100;i++)c.tick();assert.equal(f.messages.length,1);assert.equal(f.creates,0);c.stop();
});

test('deferred greeting respects pause and archive; transient submission errors retry at a bounded rate',()=>{
  const f=fixture({pendingWelcome:true,enabled:false}),c=f.c;let attempts=0;
  const send=f.agent.followup;f.agent.followup=message=>{attempts++;if(attempts===1)throw new Error('temporary');send(message);};
  c.tick();assert.equal(attempts,0);c.state.enabled=true;f.archived.push('chat');c.tick();assert.equal(attempts,0);
  f.archived.length=0;c.tick();assert.equal(attempts,1);assert.equal(f.saved.pendingWelcome,true);
  for(let i=0;i<100;i++)c.tick();assert.equal(attempts,1);
  f.advance(10001);c.tick();assert.equal(attempts,2);assert.equal(f.messages.length,1);assert.equal(f.saved.pendingWelcome,false);c.stop();
});

test('synchronous host restore failure releases the pending operation and can be retried',async()=>{
  const f=fixture();f.live.clear();const resolve=f.ctx.sessionController.resolveAgent;
  f.ctx.sessionController.resolveAgent=()=>{throw new Error('host unavailable');};
  await f.c.restoreChat();assert.equal(f.c.chatStatus,'error');assert.equal(f.c.chatRestore,null);
  f.ctx.sessionController.resolveAgent=resolve;assert.equal((await f.c.restoreChat()).id,'chat');assert.equal(f.c.chatStatus,'ready');f.c.stop();
});

test('wall clock changes do not affect freshness, gesture timing or rate limiting',()=>{
  const f=fixture();f.feed(300);f.setWall(1000);f.feed(200,[1]);f.feed(1500);
  assert.equal(f.messages.length,1);assert.equal(f.c.online(),true);
  assert.equal(f.c.gestures[0].receivedUtc,'1970-01-01T00:00:01.000Z');
  f.advance(1600);assert.equal(f.c.online(),false);f.c.stop();
});

function fakeTransport(){
  const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.killed=false;child.kill=()=>{child.killed=true;child.emit('close',0);};
  const samples=[],closed=[],gaps=[];const c=new SerialConnection('COM4',{hello:()=>{},sample:f=>samples.push(f),gap:()=>gaps.push(1),close:m=>closed.push(m)},()=>child);
  const line=value=>JSON.stringify(value)+'\n';
  c.read(line({...hello,nonce:c.nonce}));
  return {c,child,samples,closed,gaps,line,frame:(seq,ms=seq*20)=>({type:'sample',seq,ms:ms>>>0,raw:[4095,4095,4095,4095]}),end(){c.stop();child.emit('close',0);}};
}
test('transport accepts split frames and sequence rollover, rejects backwards/duplicate frames and reports gaps',()=>{
  const f=fakeTransport(),part=f.line(f.frame(0xFFFFFFFE));f.c.read(part.slice(0,14));f.c.read(part.slice(14));
  for(const seq of [0xFFFFFFFF,0,0,0xFFFFFFFF,2])f.c.read(f.line(f.frame(seq)));
  assert.deepEqual(f.samples.map(x=>x.seq),[0xFFFFFFFE,0xFFFFFFFF,0,2]);assert.equal(f.gaps.length,1);f.end();
});
test('malformed and unterminated serial data close once; stopping during a batch drops remaining frames',()=>{
  for(const input of ['x'.repeat(1025),'null\n','{"type":"sample","seq":0,"ms":0,"raw":[0]}\n']){
    const f=fakeTransport();f.c.read(input);assert.equal(f.closed.length,1);f.child.emit('close',1);assert.equal(f.closed.length,1);
  }
  const f=fakeTransport();f.c.handlers.sample=frame=>{f.samples.push(frame);f.c.stop();};
  f.c.read(f.line(f.frame(1))+f.line(f.frame(2)));assert.equal(f.samples.length,1);f.end();
});
