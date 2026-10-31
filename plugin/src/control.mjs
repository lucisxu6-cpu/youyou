import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes, timingSafeEqual} from 'node:crypto';

/** Local diagnostic channel: named pipe only, random secret, fixed operation list. */
export function startControl(controller) {
  const token = randomBytes(32).toString('hex');
  const endpoint = '\\\\.\\pipe\\loveandrobot-pet-' + randomBytes(12).toString('hex');
  const descriptor = path.join(controller.store.directory, 'control.json');
  const sockets = new Set();
  let stopped = false;
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => { /* Response delivery is best-effort after peer disconnect. */ });
    socket.setTimeout(12000, () => socket.destroy());
    let buffer = '';
    let handled = false;
    socket.setEncoding('utf8');
    socket.on('data', async chunk => {
      if (handled) return;
      buffer += chunk;
      if (buffer.length > 4096) { socket.destroy(); return; }
      if (!buffer.includes('\n')) return;
      handled = true;
      try {
        const request = JSON.parse(buffer.slice(0, buffer.indexOf('\n')));
        if (!/^[a-f0-9]{64}$/.test(request.token || '') || !timingSafeEqual(Buffer.from(request.token),Buffer.from(token))) throw new Error('Unauthorized local client');
        let result;
        if (request.action === 'inspect') {
          result = {state:controller.state, online:controller.online(), device:controller.device, raw:controller.lastFrame?.raw, error:controller.error, sent:controller.sent, events:controller.events, gestures:controller.gestures, mapping:controller.mapping?.snapshot()||null, sessions:controller.ctx.agents.roots().map(a=>({id:a.id,status:a.status}))};
        } else if (['scan','bind','name','calibrate','start','status','pause','unbind'].includes(request.action)) {
          if (request.argument !== undefined && (typeof request.argument !== 'string' || request.argument.length > 80 || /[\r\n]/u.test(request.argument))) throw new Error('Invalid argument');
          const agent = request.sessionId ? controller.ctx.agents.get(request.sessionId) : undefined;
          if (request.action === 'start' && !agent) throw new Error('Choose a live Harness session before starting');
          result = await controller.command({agent,rawInput:request.action+(request.argument ? ' '+request.argument : '')});
        } else throw new Error('Unknown local operation');
        socket.end(JSON.stringify({ok:true,result})+'\n');
      } catch(error) { socket.end(JSON.stringify({ok:false,error:error.message})+'\n'); }
    });
  });
  server.on('error', error => { controller.error = `本地诊断通道不可用：${error.message}`; });
  server.listen(endpoint, () => {
    if (stopped) { server.close(); return; }
    try {
      fs.writeFileSync(descriptor, JSON.stringify({version:1,endpoint,token,pid:process.pid})+'\n',{mode:0o600});
    } catch(error) {
      // Diagnostics are optional. A full/read-only disk must not crash Harness.
      controller.ctx.logger?.warn(`本地诊断通道无法保存：${error.message}`);
      server.close();
    }
  });
  server.unref();
  return () => {
    stopped = true;
    for (const socket of sockets) socket.destroy();
    server.close();
    try {
      const saved = JSON.parse(fs.readFileSync(descriptor,'utf8'));
      if (saved.token === token) fs.unlinkSync(descriptor);
    } catch(error) { if (error.code !== 'ENOENT') controller.ctx.logger?.warn(`Pet control cleanup: ${error.message}`); }
  };
}
