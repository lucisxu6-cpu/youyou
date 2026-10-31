// Read-only monitor. Run while Harness owns the serial port, then unplug/replug USB.
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const directory=path.join(process.env.DSH_HOME||path.join(os.homedir(),'.dsh'),'storages','loveandrobot-pet-usb');
async function inspect(){
  const descriptor=JSON.parse(fs.readFileSync(path.join(directory,'control.json'),'utf8'));
  if(!/^\\\\\.\\pipe\\loveandrobot-pet-[a-f0-9]{24}$/.test(descriptor.endpoint))throw new Error('Invalid diagnostic endpoint');
  return new Promise((resolve,reject)=>{
    const socket=net.createConnection(descriptor.endpoint);let text='';socket.setEncoding('utf8');socket.setTimeout(2000,()=>socket.destroy(new Error('Diagnostic timeout')));
    socket.on('connect',()=>socket.end(JSON.stringify({token:descriptor.token,action:'inspect'})+'\n'));
    socket.on('data',data=>{text+=data;if(text.length>65536)socket.destroy(new Error('Oversized diagnostic response'));});
    socket.on('error',reject);socket.on('end',()=>{try{const r=JSON.parse(text);if(!r.ok)throw new Error(r.error);resolve(r.result);}catch(error){reject(error);}});
  });
}
const first=await inspect();assert.equal(first.online,true,'Start with USB online');
let offline=false,lastOnline=true;
const started=performance.now();
console.log(JSON.stringify({event:'ready',at:new Date().toISOString(),firmware:first.device.firmware}));
while(performance.now()-started<180000){
  await new Promise(resolve=>setTimeout(resolve,500));const current=await inspect();
  if(current.online!==lastOnline){console.log(JSON.stringify({event:current.online?'online':'offline',at:new Date().toISOString()}));lastOnline=current.online;}
  if(!current.online)offline=true;
  if(offline&&current.online){
    assert.deepEqual(current.state,first.state,'Disconnect must preserve the complete saved state');
    assert.equal(current.device.device_id,first.device.device_id);assert.equal(current.raw.length,4);
    assert.equal(current.sent,first.sent,'No old or unpaired touch should be replayed');
    console.log(JSON.stringify({event:'passed',statePreserved:true,sameDevice:true,firmware:current.device.firmware,raw:current.raw,bootChanged:first.device.boot_id!==current.device.boot_id}));process.exit(0);
  }
}
throw new Error('No complete physical unplug/replug cycle observed within three minutes');
