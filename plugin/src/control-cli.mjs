import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dataDir=path.join(process.env.DSH_HOME||path.join(os.homedir(),'.dsh'),'storages','loveandrobot-pet-usb');
const descriptor=JSON.parse(fs.readFileSync(path.join(dataDir,'control.json'),'utf8'));
if(descriptor.version!==1 || !/^\\\\\.\\pipe\\loveandrobot-pet-[a-f0-9]{24}$/.test(descriptor.endpoint)) throw new Error('Invalid pet control descriptor');
const [action='inspect',argument,sessionId]=process.argv.slice(2);
const response=await new Promise((resolve,reject)=>{
  const socket=net.createConnection(descriptor.endpoint);
  socket.setTimeout(12000,()=>socket.destroy(new Error('Pet control timed out')));
  socket.setEncoding('utf8'); let buffer='';
  socket.on('connect',()=>socket.write(JSON.stringify({token:descriptor.token,action,argument,sessionId})+'\n'));
  socket.on('data',chunk=>{buffer+=chunk;if(buffer.length>65536)socket.destroy(new Error('Response too large'));});
  socket.on('error',reject);
  socket.on('end',()=>{try{resolve(JSON.parse(buffer));}catch(error){reject(error);}});
});
console.log(JSON.stringify(response,null,2));
if(!response.ok || response.result?.kind==='error') process.exitCode=1;
