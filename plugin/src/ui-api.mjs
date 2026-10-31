// Exact Fetch routes use Harness owner authentication and its Origin/Host fence.
// Never expose the local diagnostic pipe token or arbitrary commands to the UI.
import {DISPLAY_ZONES,ZONES,GESTURE_LABELS} from './body.mjs';
export const UI_STATE_PATH = '/api/loveandrobot.pet.state';
export const UI_ACTION_PATH = '/api/loveandrobot.pet.action';
const ACTIONS = new Set(['scan', 'bind', 'name', 'calibrate', 'start', 'pause', 'unbind', 'open-chat', 'restore-chat', 'replace-chat', 'mapping-start', 'mapping-cancel', 'mapping-save']);

export function uiSnapshot(controller) {
  const {state, device, ctx} = controller;
  const mapping=controller.mapping?.snapshot()||null;
  return {
    name: state.name, bound: !!state.deviceId, online: controller.online(),
    boundOnline: controller.boundOnline(), enabled: state.enabled,
    calibrated: controller.hasCalibration?.() ?? (!!state.baseline && !!controller.detector),
    calibrating: !!controller.calibration,
    placementReady: controller.placementReady?.() ?? true,
    mapping,
    canMap: controller.boundOnline() && (device?.pins?.length||controller.lastFrame?.raw.length)===4,
    sessionId: state.sessionId, error: controller.error,
    chatStatus: controller.chatArchived() ? 'archived' : controller.chatStatus,
    chatError: controller.chatError,
    sessions: ctx.agents.roots().map(agent => ({id: agent.id, status: agent.status,
      title: ctx.sessionTitle?.get(agent.session)?.title || '未命名聊天'})),
    device: device ? {id: device.device_id, firmware: device.firmware, port: device.port} : null,
    boundDeviceId: state.deviceId,
    touch: !controller.mapping && controller.boundOnline() && controller.detector ? controller.detector.channels.map(c => c.active) : [false, false, false, false],
    touchZones: DISPLAY_ZONES.map(id=>({id,label:{head:'小脑袋',back:'后背',left_hand:'左爪',right_hand:'右爪'}[id],pairing:mapping?(mapping.assigned.includes(id)?'matched':mapping.zone===id?'current':'pending'):null,available:!!device&&!!controller.detector?.available(id),active:!controller.mapping&&controller.boundOnline()&&!!controller.detector?.channels[ZONES.indexOf(id)]?.active})),
    recentTouch: controller.boundOnline() ? (controller.gestures||[]).filter(e=>controller.now()-e.receivedAt<8000).slice(-1).map(e=>({zones:e.zones,label:GESTURE_LABELS[e.type],count:e.count||0}))[0]||null : null,
  };
}

export async function uiAction(controller, request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) || !ACTIONS.has(request.action)) throw new Error('不支持的操作。');
  if (Object.keys(request).some(key => !['action','argument','sessionId'].includes(key))) throw new Error('操作包含未知字段。');
  if (request.argument !== undefined && (request.action !== 'name' || typeof request.argument !== 'string' || request.argument.length > 40 || /[\r\n]/u.test(request.argument))) throw new Error('名字格式不正确。');
  if (request.sessionId !== undefined && (request.action !== 'start' || typeof request.sessionId !== 'string' || request.sessionId.length > 160)) throw new Error('聊天选择无效。');
  if (controller.calibration) throw new Error('正在校准，请稍候再操作。');
  if(request.action.startsWith('mapping-')){
    if(request.action==='mapping-start')controller.startMapping();
    if(request.action==='mapping-cancel')controller.cancelMapping();
    if(request.action==='mapping-save')controller.saveMapping();
    return {message:request.action==='mapping-save'?'四个位置已保存，换位置时可以重新配对。':request.action==='mapping-cancel'?'已取消，原位置设置未改变。':'按提示逐片触碰，配对期间不会触发聊天。',state:uiSnapshot(controller)};
  }
  if(controller.mapping&&!['pause','open-chat'].includes(request.action))throw new Error('请先保存或取消部位配对。');
  if (['open-chat','restore-chat','replace-chat'].includes(request.action)) {
    const sessionId = await controller.openChat({restore:request.action==='restore-chat',replaceMissing:request.action==='replace-chat'});
    return {message:'陪伴聊天已打开。', sessionId, state:uiSnapshot(controller)};
  }
  if (request.action === 'start' && controller.state.sessionId && request.sessionId !== controller.state.sessionId) throw new Error('请回到小猫已关联的陪伴聊天。');
  if (request.action === 'start') await controller.restoreChat();
  const agent = request.action === 'start' ? controller.ctx.agents.roots().find(a => a.id === request.sessionId) : undefined;
  if (request.action === 'start' && !agent) throw new Error('请先打开要陪伴的聊天，再试一次。');
  const result = await controller.command({agent, rawInput: request.action + (request.argument ? ' ' + request.argument : '')});
  if (result.kind !== 'success') throw new Error(result.text);
  return {message: request.action === 'scan' ? '已重新检测，连接状态会自动更新。' : result.text, state: uiSnapshot(controller)};
}

export function registerPetUi(ctx, controller) {
  const json = (body, status = 200) => Response.json(body, {status, headers:{'cache-control':'no-store'}});
  ctx.connection.fetch.register({path:UI_STATE_PATH, methods:['GET'], requestBody:'buffered',
    fetch:async () => json(uiSnapshot(controller))});
  let busy = false;
  ctx.connection.fetch.register({path:UI_ACTION_PATH, methods:['POST'], requestBody:'buffered',
    fetch:async request => {
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({error:'需要 JSON 请求。'},415);
      if (busy) return json({error:'正在处理上一个操作，请稍候。'},409);
      busy = true;
      try {
        const text = await request.text();
        if (text.length > 4096) return json({error:'请求过长。'},413);
        return json(await uiAction(controller, JSON.parse(text)));
      } catch (error) { return json({error:error instanceof SyntaxError ? '请求格式不正确。' : error.message},400); }
      finally { busy = false; }
    }});
}
