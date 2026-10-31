import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {validChannelMap} from './mapping.mjs';

export function validateState(state) {
  if(state?.channelMap!=null&&(!Array.isArray(state.baseline)||!validChannelMap(state.channelMap,state.baseline.length)))throw new Error('感应片部位设置无效，请保留配置文件并排查。');
  if (state?.pendingWelcome !== undefined && typeof state.pendingWelcome !== 'boolean') throw new Error('宠物聊天初始化状态无效。');
  if (state?.version !== 1 || (state.deviceId !== null && !/^LR-[A-F0-9]{12}$/.test(state.deviceId)) || typeof state.name !== 'string' || state.name.length > 40 || (state.sessionId !== null && typeof state.sessionId !== 'string') || typeof state.enabled !== 'boolean' || (state.baseline !== null && (!Array.isArray(state.baseline) || ![3,4].includes(state.baseline.length) || !state.baseline.every(n => Number.isFinite(n) && n >= 0 && n <= 4095)))) throw new Error('宠物配置文件无效；已停止自动连接，请保留文件并排查。');
  return state;
}
export class StateStore {
  constructor(directory) {
    this.directory = directory;
    this.file = path.join(directory, 'state.json');
    fs.mkdirSync(directory, {recursive: true});
  }
  load() {
    try { return validateState(JSON.parse(fs.readFileSync(this.file, 'utf8'))); }
    catch (error) {
      if (error.code === 'ENOENT') return {version: 1, deviceId: null, name: '', sessionId: null, enabled: false, baseline: null};
      throw error;
    }
  }
  save(state) {
    validateState(state);
    const temporary = this.file + '.' + randomUUID() + '.tmp';
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try {
      try { fs.writeFileSync(fd, JSON.stringify(state, null, 2) + '\n'); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      fs.renameSync(temporary, this.file);
    } catch(error) {
      try { fs.unlinkSync(temporary); } catch { /* Preserve the original write error. */ }
      throw error;
    }
  }
}
