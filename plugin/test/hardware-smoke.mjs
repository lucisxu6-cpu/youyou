import {discover, SerialConnection} from '../src/transport.mjs';
const ports=await discover();
if(ports.length!==1) throw new Error('Expected one known USB adapter');
let count=0, hello, connection;
let rawMin=[],rawMax=[];
await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{connection?.stop();reject(new Error('Hardware smoke timed out'));},15000);
  connection=new SerialConnection(ports[0].port,{
    hello:value=>{hello=value;rawMin=Array(value.pins.length).fill(4095);rawMax=Array(value.pins.length).fill(0);},
    sample:frame=>{
      count++;
      frame.raw.forEach((n,i)=>{rawMin[i]=Math.min(rawMin[i],n);rawMax[i]=Math.max(rawMax[i],n);});
      if(count===200) connection.stop();
    },
    close:message=>{clearTimeout(timeout);if(count>=200)resolve();else reject(new Error(message));},
  });
});
console.log(JSON.stringify({device:hello.device_id,firmware:hello.firmware,protocol:hello.protocol,samples:count,rawMin,rawMax,serialClosed:true}));
