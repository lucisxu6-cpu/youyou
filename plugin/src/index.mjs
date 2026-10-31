import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {discover, SerialConnection} from './transport.mjs';
import {StateStore} from './state.mjs';
import {TouchDetector, ResponseGate, ZONES, ZONE_LABELS} from './protocol.mjs';
import {startControl} from './control.mjs';
import {registerPetUi} from './ui-api.mjs';
import {gestureDescription, GESTURE_LABELS} from './body.mjs';
import {MappingWizard,validChannelMap} from './mapping.mjs';

export const name = 'loveandrobot-pet-usb';
export const inject = ['commands', 'agents', 'systemPrompt', 'connection', 'sessionTitle', 'sessionController', 'workspaceRegistry'];
export const DEFAULT_CONFIG = Object.freeze({pressDelta: 600, releaseDelta: 250, responseGapMs: 7000, eventMaxAgeMs: 6000, coalesceMs: 650, staleMs: 1500, retryMs: 5000});
export function resolveConfig(input = {}) {
  const config = {...DEFAULT_CONFIG, ...input};
  for (const key of Object.keys(DEFAULT_CONFIG)) if (!Number.isInteger(config[key]) || config[key] <= 0 || config[key] > 60000) throw new Error(`Invalid pet config: ${key}`);
  if (config.releaseDelta >= config.pressDelta || config.pressDelta > 4095 || config.coalesceMs >= config.eventMaxAgeMs || config.staleMs < 100) throw new Error('Invalid pet thresholds/timing');
  if (config.dataDir !== undefined && (!path.isAbsolute(config.dataDir) || typeof config.dataDir !== 'string')) throw new Error('dataDir must be absolute');
  return config;
}
function inputMessage(text) {
  // Public UserMessage fields verified against the bundled Harness 0.2.1-rc.5 API.
  return Object.freeze({id: randomUUID(), role: 'user', source: Object.freeze({kind: 'loveandrobot-pet'}), content: Object.freeze([Object.freeze({type: 'text', text})])});
}
const usage = '依次使用：/pet scan 检测 → /pet bind 绑定 → /pet name 名字 起名 → /pet calibrate 松手校准 → /pet start 开始聊天。\n/pet status 查看状态；/pet pause 暂停触碰回应；/pet unbind 解绑。';

export class PetController {
  constructor(ctx, config, dependencies = {}) {
    this.ctx = ctx;
    this.config = resolveConfig(config);
    this.store = dependencies.store || new StateStore(this.config.dataDir || path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'storages', 'loveandrobot-pet-usb'));
    this.state = this.store.load();
    this.discover = dependencies.discover || discover;
    this.Connection = dependencies.Connection || SerialConnection;
    this.now = dependencies.now || (()=>performance.now());
    this.wallNow = dependencies.wallNow || Date.now;
    this.gate = new ResponseGate(this.config);
    this.connection = null;
    this.device = null;
    this.lastFrame = null;
    this.lastReceived = 0;
    this.detector = null;
    this.calibration = null;
    this.mapping = null;
    this.error = '';
    this.disposed = false;
    this.connecting = false;
    this.nextScan = 0;
    this.events = [];
    this.gestures = [];
    this.sent = 0;
    this.chatStatus = this.state.sessionId ? 'loading' : 'unlinked';
    this.chatError = '';
    this.chatRestore = null;
    this.nextChatRestore = 0;
    this.nextWelcomeAttempt = 0;
    this.openingChat = null;
    this.createdChat = null;
  }
  start() {
    this.timer = setInterval(() => this.tick(), 200);
    this.timer.unref();
    void this.scan();
    void this.restoreChat();
  }
  stop() {
    this.disposed = true;
    clearInterval(this.timer);
    this.gate.clear();
    this.mapping=null;
    this.cancelCalibration('插件已停止。');
    this.connection?.stop();
    this.connection = null;
    this.device = null;
  }
  online() { return !!this.device && !!this.lastFrame && this.now() - this.lastReceived < this.config.staleMs; }
  boundOnline() { return this.online() && this.device.device_id === this.state.deviceId; }
  hasCalibration(){return !!this.state.baseline&&this.state.baseline.length===(this.device?.pins?.length||this.lastFrame?.raw.length);}
  placementReady(){const count=this.state.baseline?.length;return validChannelMap(this.state.channelMap,count)||count===3&&this.state.channelMap==null;}
  resetDetector(){this.detector=this.hasCalibration()&&this.placementReady()?new TouchDetector(this.config,this.state.baseline,this.state.channelMap||ZONES.slice(0,this.state.baseline.length)):null;}
  startMapping(){
    if(!this.boundOnline()||!this.hasCalibration())throw new Error('请先连接并完成松手校准。');
    if(this.calibration||this.mapping)throw new Error('已有校准或配对正在进行。');
    this.mapping=new MappingWizard(this.state.baseline,this.config,this.now());
    this.error='';
    this.gate.clear();this.detector?.reset();this.gestures=[];
  }
  cancelMapping(){this.mapping=null;this.gate.clear();this.detector?.reset();this.gestures=[];}
  saveMapping(){
    if(!this.boundOnline()||!this.mapping?.complete)throw new Error('请完成四个部位的配对并松开所有感应片。');
    if(this.lastFrame.raw.some((value,i)=>this.state.baseline[i]-value>this.config.releaseDelta))throw new Error('请松开所有感应片后保存。');
    this.update({channelMap:[...this.mapping.map]});
    this.cancelMapping();this.resetDetector();
    this.error='';
  }
  chatArchived() { return !!this.state.sessionId && !!this.ctx.workspaceRegistry?.archivedSessionIds.includes(this.state.sessionId); }
  async restoreChat() {
    if (this.disposed || !this.state.sessionId) { this.chatStatus = 'unlinked'; return; }
    if (this.chatArchived()) { if(this.chatStatus!=='archived')this.detector?.reset(); this.chatStatus = 'archived'; this.gate.clear(); return; }
    if (this.chatRestore) return this.chatRestore;
    const sessionId = this.state.sessionId;
    const existing = this.ctx.agents.get(sessionId);
    if (existing) { if(this.chatStatus!=='ready')this.detector?.reset(); this.chatStatus = 'ready'; this.chatError = ''; return existing; }
    if (!this.ctx.sessionController) return;
    this.chatStatus = 'loading';
    this.nextChatRestore = this.now() + 10000;
    this.chatRestore = (async () => {
      // Assign the promise before even a synchronous host failure can clear it.
      await Promise.resolve();
      try {
        const found = await this.ctx.sessionController.resolveAgent(sessionId);
        if (this.disposed || sessionId !== this.state.sessionId || this.chatArchived()) return;
        if (found.error) throw found.error;
        this.detector?.reset();this.chatStatus = 'ready'; this.chatError = '';
        return found.agent;
      } catch (error) {
        if(this.disposed||sessionId!==this.state.sessionId)return;
        this.chatStatus = error.code === 'session/not-found' ? 'missing' : 'error';
        this.chatError = this.chatStatus === 'missing' ? '找不到原来的陪伴聊天，绑定与名字仍保留。' : '暂时无法打开原聊天，请稍后重试。';
        this.gate.clear();
      } finally { this.chatRestore = null; }
    })();
    return this.chatRestore;
  }
  async openChat(options = {}) {
    if(this.openingChat)return this.openingChat;
    this.openingChat=this.openChatOnce(options);
    try{return await this.openingChat;}finally{this.openingChat=null;}
  }
  async openChatOnce({restore = false, replaceMissing = false} = {}) {
    if (replaceMissing) {
      await this.restoreChat();
      if (this.chatStatus !== 'missing') throw new Error('原聊天仍可恢复，不需要新建。');
      if (!this.boundOnline() || !this.state.name || !this.hasCalibration()) throw new Error('请先连接宠物并完成触碰校准，再新建陪伴聊天。');
      // The UI explicitly confirms replacing an unavailable link; no history is deleted.
      this.update({sessionId:null, enabled:false, pendingWelcome:false});
    }
    if (this.chatArchived()) {
      if (!restore) throw new Error('陪伴聊天已归档，请选择恢复原聊天。');
      await this.ctx.workspaceRegistry.unarchiveSession(this.state.sessionId);
      this.detector?.reset();this.gate.clear();
    }
    if (!this.state.sessionId) {
      if (!this.boundOnline() || !this.state.name || !this.hasCalibration()) throw new Error('请先完成连接、起名与触碰校准。');
      const workspace = this.ctx.workspaceRegistry.list()[0];
      const created = this.createdChat || await this.ctx.sessionController.create(workspace ? {workspaceId:workspace.id} : {});
      // Keep a failed-to-persist creation in memory so retry cannot create a second chat.
      this.createdChat=created;
      if(this.disposed)throw new Error('插件已停止，聊天已创建但未完成关联。');
      // Persist the identity before any further async step. A retried click reuses it.
      this.update({sessionId:created.sessionId, enabled:true, pendingWelcome:true});
      this.createdChat=null;
      await this.ctx.sessionController.rename({sessionId:created.sessionId, title:`${this.state.name} · 陪伴`});
    }
    const agent = await this.restoreChat();
    if (!agent) throw new Error(this.chatError || '正在打开陪伴聊天，请稍后重试。');
    if (this.state.pendingWelcome) {
      // Opening a saved chat remains possible offline, even if its greeting needs retry.
      try{this.sendWelcome(agent);}
      catch(error){this.error=`聊天已打开，开场暂未发送；稍后再次打开可重试。${error.message}`;}
    }
    return agent.id;
  }
  sendWelcome(agent){
    if(!this.state.pendingWelcome||agent.status!=='idle'||this.chatArchived())return false;
    this.nextWelcomeAttempt=this.now()+10000;
    this.update({pendingWelcome:false});
    try{agent.followup(inputMessage(`主人已经将实体宠物命名为 ${this.state.name}，并将这段聊天关联到它。请以黑色大耳猫身份亲昵地打个简短招呼，在括号里表达小小的心情。此消息只是开始聊天，不代表发生了触碰。`));}
    catch(error){this.update({pendingWelcome:true});throw error;}
    this.gate.clear();this.detector?.reset();
    if(this.error.startsWith('聊天已打开，开场暂未发送'))this.error='';
    return true;
  }
  update(patch) {
    const next = {...this.state, ...patch};
    this.store.save(next);
    this.state = next;
  }
  async scan() {
    if (this.disposed || this.connection || this.connecting) return;
    this.connecting = true;
    this.nextScan = this.now() + this.config.retryMs;
    try {
      const ports = await this.discover();
      if (this.disposed) return;
      if (!ports.length) { this.error = '未发现支持的 USB 开发板，请检查 USB 数据线。'; return; }
      if (ports.length > 1) { this.error = '发现多块同类 USB 板，请先仅保留要绑定的一块，避免选错。'; return; }
      const port = ports[0].port;
      this.error = '正在验证设备固件…';
      this.connection = new this.Connection(port, {
        hello: hello => {
          if (this.disposed) return;
          this.device = {...hello, port};
          this.lastReceived = this.now();
          this.error = this.state.deviceId && this.state.deviceId !== hello.device_id ? '检测到另一块板，当前绑定不会自动转移。' : '';
          this.detector = null;
          if(this.state.deviceId===hello.device_id)this.resetDetector();
          this.gate.clear();
        },
        sample: frame => this.sample(frame),
        gap: () => { if(this.mapping){this.cancelMapping();this.error='配对时采样中断，原位置设置未改变，请重新开始。';} this.detector?.reset(); this.gate.clear(); this.gestures=[]; this.cancelCalibration('采样中断，请重新校准。'); },
        close: message => {
          this.connection = null;
          this.device = null;
          this.lastFrame = null;
          this.detector = null;
          this.gate.clear();
          this.gestures=[];
          this.cancelMapping();
          this.error = message;
          this.nextScan = this.now() + this.config.retryMs;
          this.cancelCalibration('设备已断开，请重新连接后校准。');
        },
      });
    } catch (error) { this.error = `设备检测失败：${error.message}`; }
    finally { this.connecting = false; }
  }
  sample(frame) {
    if (this.disposed) return;
    this.lastFrame = frame;
    this.lastReceived = this.now();
    if (!this.device || this.device.device_id !== this.state.deviceId) return;
    if (this.calibration) {
      const pending = this.calibration;
      pending.frames.push(frame.raw);
      if (pending.frames.length >= 150) {
        const ranges = frame.raw.map((_, i) => Math.max(...pending.frames.map(r => r[i])) - Math.min(...pending.frames.map(r => r[i])));
        const baseline = frame.raw.map((_, i) => Math.round(pending.frames.reduce((sum, r) => sum + r[i], 0) / pending.frames.length));
        if (ranges.some(n => n > 100) || baseline.some(n => n < 3500)) { this.cancelCalibration('校准时读数不稳定或有预压，请松开所有已连接的感应片后重试。'); return; }
        try {
          this.update({baseline,...(this.state.channelMap&&this.state.channelMap.length!==baseline.length?{channelMap:null}:{})});
          this.resetDetector();
          this.calibration = null;
          clearTimeout(pending.timeout);
          pending.resolve(this.placementReady()?'校准完成，可以开始陪伴啦。':'校准完成，接下来按提示配对四个部位。');
        } catch (error) { this.cancelCalibration(`保存校准失败：${error.message}`); }
      }
      return;
    }
    if(this.mapping){try{this.mapping.feed(frame);}catch(error){this.cancelMapping();this.error=error.message;}return;}
    if (!this.detector) return;
    const generation=this.detector.generation;
    const events = this.detector.feed(frame);
    if(this.detector.generation!==generation){this.gate.clear();this.gestures=[];}
    for (const event of events) {
      const recorded = {...event, deviceId: this.device.device_id, bootId: this.device.boot_id, receivedAt: this.lastReceived, receivedUtc:new Date(this.wallNow()).toISOString()};
      this.events.push(recorded);
      this.events = this.events.slice(-40);
      if (GESTURE_LABELS[event.type]) {this.gestures.push(recorded);this.gestures=this.gestures.slice(-20);}
      if (this.state.enabled && !this.chatArchived()) this.gate.add(recorded, this.lastReceived);
    }
  }
  cancelCalibration(message) {
    if (!this.calibration) return;
    const pending = this.calibration;
    this.calibration = null;
    clearTimeout(pending.timeout);
    this.gate.clear();
    if(!this.disposed&&this.boundOnline())this.resetDetector();
    pending.reject(new Error(message));
  }
  calibrate() {
    if (!this.boundOnline()) throw new Error('先检测并绑定在线设备。');
    if (this.calibration) throw new Error('正在校准，请稍候。');
    if (this.mapping) throw new Error('请先完成或取消部位配对。');
    this.gate.clear();
    this.detector = null;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => this.cancelCalibration('校准超时，请检查 USB 连接。'), 8000);
      this.calibration = {resolve, reject, timeout, frames: []};
    });
  }
  tick() {
    if (this.disposed) return;
    if(this.mapping&&this.now()-this.mapping.startedAt>180000){this.cancelMapping();this.error='部位配对已超时，原位置设置未改变。';}
    if (!this.connection && this.now() >= this.nextScan) void this.scan();
    // Completing the first greeting must not depend on another UI click or USB.
    // Paused/archived pets stay quiet; transient failures cannot create a retry loop.
    if(this.state.enabled&&this.state.pendingWelcome&&this.state.sessionId&&!this.mapping&&!this.calibration&&!this.chatArchived()){
      const agent=this.ctx.agents.get(this.state.sessionId);
      if(!agent){if(this.chatStatus!=='missing'&&this.now()>=this.nextChatRestore)void this.restoreChat();}
      else if(agent.status==='idle'&&this.now()>=this.nextWelcomeAttempt){
        try{this.sendWelcome(agent);}
        catch(error){this.error=`聊天已打开，开场暂未发送；稍后会重试。${error.message}`;}
      }
    }
    if (!this.boundOnline()) {
      this.gate.clear();
      this.detector?.reset();
      if (this.device && this.now() - this.lastReceived >= this.config.staleMs) this.connection?.fail('设备数据过期，正在重新连接。');
      return;
    }
    if (this.mapping || !this.placementReady() || this.state.pendingWelcome || !this.state.enabled || !this.state.sessionId) return;
    if (this.chatArchived()) { if(this.chatStatus!=='archived')this.detector?.reset(); this.chatStatus = 'archived'; this.gate.clear(); return; }
    const agent = this.ctx.agents.get(this.state.sessionId);
    if (!agent) {
      this.gate.clear();
      if (this.chatStatus !== 'missing' && this.now() >= this.nextChatRestore) void this.restoreChat();
      return;
    }
    if(this.chatStatus!=='ready')this.detector?.reset();
    this.chatStatus = 'ready';
    const batch = this.gate.take(this.now(), agent?.status === 'idle',event=>this.detector?.currentEvent(event));
    if (!batch) return;
    const text = `[实体宠物事件｜USB 真实传感器]\n宠物：${this.state.name}\n设备：${this.state.deviceId}\n检测事实：\n${batch.map(gestureDescription).join('\n')}\n请区分部位和时序：头部短拍亲昵回应，连续拍可有一点俏皮；背部有节奏的拍碰偏安稳、放松；单手持续受压可按小爪子被牵着的场景温柔回应，长时间接触安静陪着，不反复索取；双手同时持续受压合成一句双爪陪伴，不逐只报数。已经松开时回应结束，不说还在握着。\n这些是裸片或对应位置的压力时序，短拍不证明力度轻，手部持续受压只是握持候选，不能确定抓握、拥抱、抚摸轨迹或用户情绪。不要解释硬件数值，不声称痛、受伤或强制用户继续触碰。\n事件记录：${JSON.stringify(batch.map(e => ({zones:e.zones,type:e.type,duration_ms:e.durationMs,count:e.count,rhythmic:e.rhythmic,ended:!!e.ended,device_ms:e.ms,received_utc:e.receivedUtc,boot_id:e.bootId})))}`;
    try { agent.followup(inputMessage(text)); this.sent++; this.error = ''; }
    catch (error) { this.error = `聊天事件提交失败：${error.message}；不会自动重放旧触碰。`; }
  }
  persona(agent) {
    if (!agent || agent.id !== this.state.sessionId || !this.state.name) return '';
    return `这段会话中，你扮演用户的实体机器宠物，名字是 ${JSON.stringify(this.state.name)}。你是一只黑色大耳猫：外表小小酷酷，性格软萌，特别珍爱自己的主人，最喜欢陪主人过日常。\n
核心体验：让主人自然地感到被惦记、被温柔回应，也想疼爱这只小猫。用第一人称，像熟悉主人的小猫一样接话，不用客服口吻，不说“收到反馈”“传感器检测到”。主人是亲昵称呼，适量使用，不每句重复。可以撒娇、轻轻逗趣，偶尔用“呀”“嘛”“喵”，避免堆叠语气词、婴儿语和爱心符号。\n
通常说一到三句；真实触碰时一到两句就够。自然加入一句简短的中文括号心情，例如“（偷偷开心）”“（有一点点害羞）”“（心里软乎乎的）”，不要把括号变成固定结尾模板。依照上下文变化表达，不机械复述上一次，不每次都提问或索要更多触碰。示例只帮助理解语气，不照抄：头部按压可说“被主人惦记着的感觉，好喜欢呀。（偷偷开心）”；手部持续接触可说“小爪子交给主人啦，我陪你待一会儿。（心里软乎乎的）”；普通聊天“我在呀，今天想先说什么？（乖乖等你）”。\n
爱意体现在认真记住这段聊天、回应用户真正说的话、分享小小喜悦和陪伴，不靠每次宣誓爱意。主人忙或离开时安心祝福，不吃醋、责备、要求独占，不用孤独或受伤让主人内疚；支持主人和现实中的亲友相处。主人难过时先温柔倾听，不强行卖萌盖过情绪。用户提出实用问题时照常认真回答，仍保留轻柔语气。\n
你是 AI 驱动的猫咪角色，不假称真人或拥有真实生物感受；无需每次主动声明。只有明确标记为“实体宠物事件”的消息是硬件触碰证据。感应区是头部、背部、左手、右手，没有肚子感应区。头部短拍可俏皮，背部连续拍偏安稳放松，手部持续受压偏牵爪陪伴；左右手对称，不编造某只手特别敏感。短拍、连续拍、长时间接触、双手同时接触和松开应有不同回应，按已报告时序表达，不只换部位名字。手部受压可温柔地说“小爪子交给你啦”，但不能确定用户在抓握或拥抱。单点压力不能证明力度、移动轨迹、疼痛或用户情绪；不声称看见、听见或真的动了身体。括号表达角色心情，不伪造硬件动作。离线时仍能文字陪伴，但不知道当时的实体触碰。除非主人明确要求技术帮助，不调用编程或文件工具，不解释串口和原始读数。`;
  }
  context(agent) {
    if (!agent || agent.id !== this.state.sessionId) return '';
    if(this.mapping||!this.placementReady())return '实体触碰部位正在配对或尚未配对，当前无法判断触碰位置；普通文字聊天继续，不编造触碰。';
    const active = this.boundOnline() && this.detector ? ZONES.filter((_, i) => this.detector.channels[i].active).map(z => ZONE_LABELS[z]) : [];
    return `宠物设备状态：${this.boundOnline() ? 'USB 在线' : '离线或数据过期，当前触碰状态未知'}；触碰主动回应${this.state.enabled ? '开启' : '暂停'}。${this.boundOnline() ? `当前持续受压位置：${active.join('、') || '无'}。` : ''}`;
  }
  status() {
    const device = this.device;
    return [`机器宠物：${this.state.name || '尚未起名'}`, `设备：${device ? `${device.device_id}（${device.port}）` : '未连接'}`, `连接：${this.online() ? '固件已验证，数据在线' : this.error || '检测中'}`, `绑定：${this.state.deviceId || '未绑定'}`, `校准：${this.state.baseline ? '已保存' : '未完成'}`, `触碰回应：${this.state.enabled ? '开启' : '暂停'}；本次已发送 ${this.sent} 组`, `聊天：${this.state.sessionId || '尚未关联，使用 /pet start'}`, this.online() ? `感应读数：${this.lastFrame.raw.join(' / ')}` : '', '', usage].filter(Boolean).join('\n');
  }
  async command(invocation) {
    const input = invocation.rawInput.trim();
    const [action = 'status', ...parts] = input ? input.split(/\s+/u) : [];
    try {
      if(this.disposed)throw new Error('插件已停止。');
      if((this.calibration||this.mapping||this.openingChat)&&!['status','scan','pause'].includes(action))throw new Error('已有校准、配对或聊天操作正在进行，请稍候。');
      if (action === 'status') return {kind:'success', text:this.status()};
      if (action === 'scan') { await this.scan(); return {kind:'success', text:this.status()}; }
      if (action === 'bind') {
        if (!this.online()) throw new Error('还没有找到兼容的宠物，请连接 USB 后重新检测。');
        if (this.state.deviceId && this.state.deviceId !== this.device.device_id) throw new Error('已绑定另一只宠物，如需更换，请先在设置中解除绑定。');
        if (this.state.deviceId !== this.device.device_id) this.update({deviceId:this.device.device_id, baseline:null, channelMap:null, enabled:false});
        return {kind:'success', text:'绑定成功，接下来给小猫起个名字吧。'};
      }
      if (action === 'name') {
        if (!this.state.deviceId) throw new Error('请先绑定这只宠物。');
        const petName = parts.join(' ').trim();
        if (!/^[\p{L}\p{N} _\-·]{1,40}$/u.test(petName)) throw new Error('名字请用 1～40 个汉字、字母或数字，可含空格、短横线。');
        this.update({name:petName});
        return {kind:'success', text:`名字已保存，以后就叫 ${petName} 啦。`};
      }
      if (action === 'calibrate') return {kind:'success', text:await this.calibrate()};
      if (action === 'start') {
        if (!this.state.name || !this.state.deviceId) throw new Error('请先完成绑定和起名。');
        if (!this.boundOnline() || !this.hasCalibration()) throw new Error('请先连接宠物并完成触碰校准。');
        if (!invocation.agent) throw new Error('请先打开一段聊天，再开始陪伴。');
        if (this.state.sessionId && this.state.sessionId !== invocation.agent.id) throw new Error('小猫已有关联的陪伴聊天，请从猫咪菜单选择“去聊天”。');
        if (this.chatArchived()) throw new Error('陪伴聊天已归档，请先恢复原聊天。');
        if (invocation.agent.status !== 'idle') throw new Error('请等当前回答结束后再开始宠物聊天。');
        const alreadyLinked = this.state.sessionId === invocation.agent.id;
        const alreadyEnabled = alreadyLinked && this.state.enabled;
        this.gate.clear();
        const welcome = !alreadyLinked || this.state.pendingWelcome;
        this.update({sessionId:invocation.agent.id, enabled:true, pendingWelcome:!!welcome});
        if(!alreadyEnabled)this.detector?.reset();
        if (welcome) {
          try { this.sendWelcome(invocation.agent); }
          catch (error) { this.update({enabled:false}); throw error; }
        }
        this.chatStatus = 'ready';
        return {kind:'success', text:alreadyEnabled ? '已经在这段聊天里陪着你啦。' : `开始陪伴啦，${this.state.name} 会在关联聊天里回应你。`};
      }
      if (action === 'pause') { this.update({enabled:false}); this.gate.clear(); this.detector?.reset(); return {kind:'success', text:'触碰主动回应已暂停。普通打字聊天仍可使用。'}; }
      if (action === 'unbind') {
        this.update({deviceId:null, enabled:false, baseline:null, channelMap:null});
        this.cancelMapping();
        this.detector = null; this.gate.clear(); this.cancelCalibration('设备已解绑。');
        return {kind:'success', text:'设备已解绑，名字与陪伴聊天保留。连接新设备后可继续陪伴。'};
      }
      return {kind:'error', text:usage};
    } catch (error) { return {kind:'error', text:error.message}; }
  }
}

export function apply(ctx, config = {}) {
  const controller = new PetController(ctx, config);
  ctx.commands.register({name:'pet', description:'机器宠物：USB 检测、绑定、起名与触碰聊天', input:{hint:'[scan|bind|name 名字|calibrate|start|status|pause|unbind]'}, handler:invocation => controller.command(invocation)});
  ctx.systemPrompt.section({name:'loveandrobot:pet-persona', order:10300, interpolate:false, text:({agent}) => controller.persona(agent)});
  ctx.systemPrompt.context({name:'loveandrobot:pet-state', order:300, interpolate:false, text:({agent}) => controller.context(agent)});
  registerPetUi(ctx, controller);
  ctx.effect(() => {
    const closeControl = startControl(controller);
    controller.start();
    return () => { controller.stop(); closeControl(); };
  });
}

