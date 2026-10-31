import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {startControl} from '../src/control.mjs';
import {TouchDetector, ResponseGate, validateHello, validateSample} from '../src/protocol.mjs';
import {PetController, DEFAULT_CONFIG, resolveConfig} from '../src/index.mjs';
import {StateStore} from '../src/state.mjs';
import {uiAction, uiSnapshot, registerPetUi, UI_ACTION_PATH, UI_STATE_PATH} from '../src/ui-api.mjs';

test('identity requires the expected protocol, nonce, board and channel mapping', () => {
  const hello = {type:'hello',product:'loveandrobot.pet',protocol:1,firmware:'1.0.0',board:'esp32s3-n8r8',device_id:'LR-1234567890AB',boot_id:'1234567890ABCDEF',nonce:'ab'.repeat(16),pins:[4,6,7],adc_bits:12,sample_ms:20};
  assert.equal(validateHello(hello,hello.nonce),hello);
  for (const override of [{protocol:2},{product:'other'},{pins:[4,7,6]},{device_id:'COM4'},{firmware:'99.0.0'},{nonce:'00'.repeat(16)}]) assert.throws(()=>validateHello({...hello,...override},hello.nonce));
  assert.throws(()=>validateSample({type:'sample',seq:1,ms:20,raw:[4096,0,0]}));
  assert.throws(()=>validateSample({type:'sample',seq:-1,ms:20,raw:[0,0,0]}));
});
test('held contact produces one hold and one release interpretation; a noise spike produces none', () => {
  const detector = new TouchDetector(DEFAULT_CONFIG,[4095,4095,4095]);
  const events = [];
  for(let ms=0;ms<3000;ms+=20) {
    const raw = ms===40 || (ms>=200 && ms<2200) ? [1000,4095,4095] : [4095,4095,4095];
    events.push(...detector.feed({ms,raw}));
  }
  assert.deepEqual(events.map(e=>[e.type,e.zone]),[['press_start','head'],['hold','head'],['press_end','head'],['hold_release','head']]);
  assert.deepEqual(detector.baseline,[4095,4095,4095]);
});
test('simultaneous inputs remain independent; missing samples discard partial debounce', () => {
  const detector = new TouchDetector(DEFAULT_CONFIG,[4095,4095,4095]);
  const events=[];
  for(let ms=0;ms<=200;ms+=20) detector.feed({ms,raw:[4095,4095,4095]});
  for(let ms=300;ms<=400;ms+=20) events.push(...detector.feed({ms,raw:[1000,4095,900]}));
  assert.deepEqual(events.map(e=>e.zone),['head','back']);
  detector.reset();
  detector.feed({ms:200,raw:[500,4095,4095]});
  assert.equal(detector.feed({ms:1000,raw:[500,4095,4095]}).length,0);
});
test('one short event batch waits for idle, coalesces zones, expires, and ignores raw transitions', () => {
  const gate=new ResponseGate(DEFAULT_CONFIG);
  gate.add({type:'tap',zone:'head',zones:['head'],contactIds:[1],count:1,ended:true},0);
  gate.add({type:'tap',zone:'back',zones:['back'],contactIds:[2],count:1,ended:true},100);
  gate.add({type:'press_start',zone:'head'},300);
  assert.equal(gate.take(800,false),null);
  assert.equal(gate.take(800,true).length,2);
  gate.add({type:'tap',zone:'left_hand',zones:['left_hand'],contactIds:[3],count:1,ended:true},900);
  assert.equal(gate.take(1000,true),null);
  assert.equal(gate.take(7800,true),null);
  gate.add({type:'tap',zone:'head',zones:['head'],contactIds:[4],count:1,ended:true},7900); gate.clear();
  assert.equal(gate.take(8000,true),null);
});
test('state survives restart; corrupt state fails closed', () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pet-test-'));
  try {
    const store=new StateStore(directory); const state=store.load();
    store.save({...state,deviceId:'LR-1234567890AB',name:'youyou',baseline:[4095,4095,4095]});
    assert.equal(new StateStore(directory).load().name,'youyou');
    fs.writeFileSync(store.file,'{}');
    assert.throws(()=>store.load());
  } finally {
    if (!path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep) || !path.basename(directory).startsWith('pet-test-')) throw new Error('Unsafe test cleanup path');
    fs.rmSync(directory,{recursive:true});
  }
});
test('binding, naming, calibration and start target only the selected chat; pause stops wakeups', async () => {
  let saved={version:1,deviceId:null,name:'',sessionId:null,enabled:false,baseline:null};
  let clock=0;
  const messages=[];
  const agent={id:'chat-1',status:'idle',followup:message=>messages.push(message)};
  const controller=new PetController({agents:{get:id=>id===agent.id?agent:undefined}},DEFAULT_CONFIG,{store:{load:()=>saved,save:s=>{saved=s;}},now:()=>clock});
  controller.device={device_id:'LR-1234567890AB',boot_id:'ABCDEF1234567890',port:'COM4'};
  controller.sample({seq:0,ms:0,raw:[4095,4095,4095]});
  const command=rawInput=>controller.command({agent,rawInput});
  assert.equal((await command('start')).kind,'error');
  assert.equal((await command('bind')).kind,'success');
  assert.equal((await command('name youyou')).kind,'success');
  const calibration=command('calibrate');
  for(let i=1;i<=150;i++) {clock=i*20;controller.sample({seq:i,ms:clock,raw:[4095,4095,4095]});}
  assert.equal((await calibration).kind,'success');
  assert.equal((await command('start')).kind,'success');
  assert.equal(messages.length,1);
  assert.equal((await command('start')).kind,'success');
  assert.equal(messages.length,1, 'Repeated start must not spam a greeting');
  for(let i=151;i<=250;i++){clock=i*20;controller.sample({seq:i,ms:clock,raw:clock>=3400&&clock<3640?[900,4095,4095]:[4095,4095,4095]});}
  controller.tick();
  assert.equal(messages.length,2);
  assert.match(messages[1].content[0].text,/头部感应区/);
  assert.equal(controller.persona({id:'other'}),'');
  await command('pause');
  assert.equal(saved.enabled,false);
  controller.gate.add({type:'tap',zone:'back',zones:['back'],contactIds:[999],count:1,ended:true},clock);
  clock+=500;controller.tick();
  assert.equal(messages.length,2);
  await command('start');
  assert.equal(messages.length,2, 'Resuming must not repeat the first greeting');
  assert.match(controller.persona(agent),/黑色大耳猫/);
  controller.stop();
});

test('UI rejects arbitrary commands and subagents; status excludes handshake secrets',async()=>{
  const saved={version:1,deviceId:'LR-1234567890AB',name:'youyou',sessionId:'chat-1',enabled:true,baseline:[4095,4095,4095]};
  const root={id:'chat-1',status:'idle',session:{},followup:()=>{}};
  const controller=new PetController({agents:{roots:()=>[root],get:id=>id===root.id?root:{id,status:'idle'}},sessionTitle:{get:()=>({title:'和小猫聊天'})}},DEFAULT_CONFIG,{store:{load:()=>saved,save:()=>{}},now:()=>0});
  controller.device={device_id:saved.deviceId,nonce:'secret',boot_id:'private',port:'COM4',firmware:'1.0.0'};
  controller.sample({ms:0,seq:0,raw:[4095,4095,4095]});
  assert.equal(uiSnapshot(controller).sessions[0].title,'和小猫聊天');
  assert.equal(JSON.stringify(uiSnapshot(controller)).includes('secret'),false);
  for(const request of [{action:'exec'},{action:'name',argument:'youyou\npause'},{action:'pause',responseGapMs:1},{action:'start',sessionId:'subagent'},{action:'name',argument:'x'.repeat(41)}]) await assert.rejects(()=>uiAction(controller,request));
  await uiAction(controller,{action:'pause'});
  assert.equal(controller.state.enabled,false);
  controller.stop();
});

test('authenticated UI routes enforce content type and serialize state changes',async()=>{
  const routes=new Map();let release;let executions=0;
  const controller={state:{name:'youyou',deviceId:null,sessionId:null},device:null,ctx:{agents:{roots:()=>[]}},online:()=>false,boundOnline:()=>false,chatArchived:()=>false,command:()=>{executions++;return new Promise(resolve=>{release=()=>resolve({kind:'success',text:'done'});});}};
  registerPetUi({connection:{fetch:{register:route=>routes.set(route.path,route)}}},controller);
  assert.deepEqual(routes.get(UI_STATE_PATH).methods,['GET']);
  assert.deepEqual(routes.get(UI_ACTION_PATH).methods,['POST']);
  const handler=routes.get(UI_ACTION_PATH).fetch;
  const request=body=>new Request('http://localhost'+UI_ACTION_PATH,{method:'POST',headers:{'content-type':'application/json'},body});
  assert.equal((await handler(new Request('http://localhost'+UI_ACTION_PATH,{method:'POST',body:'plain'}))).status,415);
  assert.equal((await handler(request('invalid json'))).status,400);
  assert.equal((await handler(request('x'.repeat(4097)))).status,413);
  const first=handler(request('{"action":"pause"}'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await handler(request('{"action":"unbind"}'))).status,409);
  assert.equal(executions,1);
  release();assert.equal((await first).status,200);
});

function lifecycleFixture() {
  let saved={version:1,name:'youyou',deviceId:'LR-1234567890AB',sessionId:null,enabled:false,baseline:[4095,4095,4095]};
  const messages=[], live=new Map(), persisted=new Map(), archived=[];
  let creates=0;
  const ctx={agents:{get:id=>live.get(id),roots:()=>[...live.values()]},sessionTitle:{get:session=>({title:session.title})},
    workspaceRegistry:{archivedSessionIds:archived,list:()=>[{id:'home'}],unarchiveSession:async id=>{archived.splice(archived.indexOf(id),1);}},
    sessionController:{create:async()=>{const id='pet-chat-'+(++creates);const agent={id,status:'idle',session:{},followup:m=>messages.push(m)};live.set(id,agent);persisted.set(id,agent);return {sessionId:id};},rename:async({sessionId,title})=>{persisted.get(sessionId).session.title=title;},resolveAgent:async id=>{const agent=persisted.get(id);if(!agent)return {error:Object.assign(new Error('missing'),{code:'session/not-found'})};live.set(id,agent);return {agent};}}};
  const store={load:()=>({...saved}),save:state=>{saved={...state};}};
  const make=()=>{
    const controller=new PetController(ctx,DEFAULT_CONFIG,{store,now:()=>1000});
    controller.device={device_id:saved.deviceId};controller.lastReceived=1000;
    controller.lastFrame={ms:1000,seq:50,raw:[4095,4095,4095]};
    controller.detector=saved.baseline ? new TouchDetector(DEFAULT_CONFIG,saved.baseline) : null;
    return controller;
  };
  return {make,ctx,live,persisted,archived,messages,created:()=>creates,saved:()=>saved};
}

test('first meeting creates exactly one dedicated chat; reopens and board replacement retain it',async()=>{
  const f=lifecycleFixture();const pet=f.make();
  const opened=await uiAction(pet,{action:'open-chat'});
  assert.equal(opened.sessionId,'pet-chat-1');assert.equal(f.created(),1);assert.equal(f.messages.length,1);
  assert.equal(f.persisted.get(opened.sessionId).session.title,'youyou · 陪伴');
  await uiAction(pet,{action:'open-chat'});assert.equal(f.created(),1);assert.equal(f.messages.length,1);
  const other={id:'work-chat',status:'idle',session:{},followup:()=>assert.fail('Must never deliver to another chat')};f.live.set(other.id,other);
  assert.equal((await pet.command({agent:other,rawInput:'start'})).kind,'error');
  await uiAction(pet,{action:'pause'});await uiAction(pet,{action:'open-chat'});assert.equal(pet.state.enabled,false);
  await uiAction(pet,{action:'unbind'});assert.equal(pet.state.sessionId,opened.sessionId);assert.equal(pet.state.name,'youyou');
  await uiAction(pet,{action:'open-chat'});assert.equal(f.created(),1,'Text chat remains usable without USB');
  pet.stop();f.live.clear();const reopened=f.make();await reopened.restoreChat();
  assert.equal(reopened.chatStatus,'ready');assert.equal(reopened.state.sessionId,opened.sessionId);assert.equal(f.messages.length,1);
  reopened.stop();
});

test('archive pauses sensor delivery; restoring is explicit; a missing chat is never silently replaced',async()=>{
  const f=lifecycleFixture(),pet=f.make();const id=await pet.openChat();
  f.archived.push(id);pet.gate.add({type:'tap',zone:'head',zones:['head'],contactIds:[1],count:1,ended:true},0);pet.tick();
  assert.equal(f.messages.length,1);assert.equal(pet.chatStatus,'archived');
  await assert.rejects(()=>pet.openChat(),/归档/);assert.equal(f.archived.length,1);
  await uiAction(pet,{action:'restore-chat'});assert.equal(f.archived.length,0);assert.equal(f.created(),1);
  f.live.delete(id);f.persisted.delete(id);await pet.restoreChat();
  assert.equal(pet.chatStatus,'missing');await assert.rejects(()=>pet.openChat(),/找不到/);assert.equal(pet.state.sessionId,id);assert.equal(f.created(),1);
  const replacement=await uiAction(pet,{action:'replace-chat'});assert.equal(replacement.sessionId,'pet-chat-2');assert.equal(f.created(),2);
  await assert.rejects(()=>uiAction(pet,{action:'replace-chat'}),/仍可恢复/);
  pet.stop();
});
test('malformed timing and thresholds are rejected',()=>{
  assert.throws(()=>resolveConfig({releaseDelta:900,pressDelta:300}));
  assert.throws(()=>resolveConfig({responseGapMs:0}));
});
test('local control refuses an invalid token and unknown operations, and removes its descriptor', {skip:process.platform!=='win32'},async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pet-control-test-'));
  const controller={store:{directory},ctx:{agents:{roots:()=>[]}},state:{name:'youyou'},online:()=>true,command:()=>{throw new Error('Must not call command');}};
  const close=startControl(controller);
  const descriptorFile=path.join(directory,'control.json');
  try {
    for(let i=0;i<100&&!fs.existsSync(descriptorFile);i++)await new Promise(r=>setTimeout(r,10));
    const descriptor=JSON.parse(fs.readFileSync(descriptorFile,'utf8'));
    const send=request=>new Promise((resolve,reject)=>{
      const socket=net.createConnection(descriptor.endpoint);let text='';socket.setEncoding('utf8');socket.on('error',reject);
      socket.on('connect',()=>socket.write(JSON.stringify(request)+'\n'));
      socket.on('data',s=>{text+=s;});socket.on('end',()=>resolve(JSON.parse(text)));
    });
    assert.equal((await send({token:'0'.repeat(64),action:'bind'})).ok,false);
    assert.equal((await send({token:descriptor.token,action:'exec',argument:'anything'})).ok,false);
    const inspected=await send({token:descriptor.token,action:'inspect'});
    assert.equal(inspected.ok,true);assert.equal(inspected.result.state.name,'youyou');
    close();assert.equal(fs.existsSync(descriptorFile),false);
  } finally {
    close();
    if(!path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(directory).startsWith('pet-control-test-'))throw new Error('Unsafe test cleanup path');
    fs.rmSync(directory,{recursive:true});
  }
});

test('an unwritable diagnostic descriptor does not crash the host or alter pet configuration', {skip:process.platform!=='win32'},async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pet-control-test-'));
  fs.mkdirSync(path.join(directory,'control.json'));
  const warnings=[],state={name:'youyou'};
  const controller={store:{directory},state,ctx:{logger:{warn:message=>warnings.push(message)}}};
  let close;
  try {
    close=startControl(controller);
    for(let i=0;i<100&&!warnings.length;i++)await new Promise(r=>setTimeout(r,10));
    assert.equal(warnings.length,1);assert.match(warnings[0],/诊断/);assert.deepEqual(controller.state,state);
  } finally {
    close?.();
    if(!path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(directory).startsWith('pet-control-test-'))throw new Error('Unsafe test cleanup path');
    fs.rmSync(directory,{recursive:true});
  }
});
