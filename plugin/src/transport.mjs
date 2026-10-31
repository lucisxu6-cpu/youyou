import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {validateHello, validateSample} from './protocol.mjs';
const run = promisify(execFile);
const bridge = fileURLToPath(new URL('../bridge/serial.ps1', import.meta.url));
const powershell = () => path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', bridge];

export async function discover() {
  const {stdout} = await run(powershell(), [...args, '-Mode', 'Discover'], {windowsHide: true, timeout: 8000, maxBuffer: 65536});
  const value = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
  if (value.type !== 'ports' || !Array.isArray(value.ports) || value.ports.some(p => !/^COM[1-9][0-9]{0,3}$/.test(p.port))) throw new Error('串口枚举结果无效。');
  return value.ports;
}

export class SerialConnection {
  constructor(port, handlers, processFactory=spawn) {
    this.port = port;
    this.handlers = handlers;
    this.nonce = randomBytes(16).toString('hex');
    this.hello = null;
    this.buffer = '';
    this.closed = false;
    this.stopping = false;
    this.lastSequence = null;
    this.child = processFactory(powershell(), [...args, '-Mode', 'Connect', '-Port', port, '-Nonce', this.nonce], {windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
    this.child.stdin.on('error', () => { /* Child exit is reported through close/error. */ });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => this.read(chunk));
    this.child.stderr.on('data', chunk => { this.lastError = chunk.toString().slice(-800); });
    this.child.on('error', error => this.finish(error.message));
    this.child.on('close', code => this.finish(this.lastError || (code ? `串口连接结束 (${code})` : '串口已关闭')));
    this.timeout = setTimeout(() => this.fail('固件握手超时。'), 6000);
  }
  read(chunk) {
    if (this.closed || this.stopping) return;
    this.buffer += chunk;
    if (this.buffer.length > 65536) return this.fail('串口缓冲区超过限制。');
    let end;
    while (!this.closed && !this.stopping && (end = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, end).trim().replace(/^\uFEFF/, '');
      this.buffer = this.buffer.slice(end + 1);
      if (!line) continue;
      try {
        if (line.length > 1024) throw new Error('设备帧过长。');
        const value = JSON.parse(line);
        if (value.type === 'transport_error') throw new Error(value.message);
        if (!this.hello) {
          this.hello = validateHello(value, this.nonce);
          clearTimeout(this.timeout);
          this.handlers.hello(this.hello);
        } else {
          validateSample(value, this.hello.pins.length);
          if (this.lastSequence !== null) {
            const gap = (value.seq - this.lastSequence) >>> 0;
            if (!gap || gap > 0x7FFFFFFF) continue;
            if (gap > 1) this.handlers.gap?.();
          }
          this.lastSequence = value.seq;
          this.handlers.sample(value);
        }
      } catch (error) { this.fail(error.message); return; }
    }
    if(this.buffer.length>1024)this.fail('设备帧过长或缺少换行。');
  }
  fail(message) { this.lastError = message; this.stop(); this.finish(message); }
  finish(message) {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timeout);
    this.handlers.close(message);
  }
  stop() {
    if(this.stopping)return;
    this.stopping=true;
    clearTimeout(this.timeout);
    if (!this.child.killed) {
      this.child.stdin.end('stop\n');
      const child = this.child;
      const killTimer = setTimeout(() => child.kill(), 1000);
      killTimer.unref();
      child.once('close', () => clearTimeout(killTimer));
    }
  }
}
