export {ZONES, ZONE_LABELS} from './body.mjs';
export {TouchDetector, ResponseGate} from './touch.mjs';

/** Explicit layouts: reject unknown firmware, pin order, width and identity. */
export function validateHello(value, nonce) {
  const legacy=value?.firmware==='1.0.0' && JSON.stringify(value.pins)==='[4,6,7]';
  const four=['1.1.0','1.1.1'].includes(value?.firmware) && JSON.stringify(value.pins)==='[4,6,7,5]' && JSON.stringify(value.zones)==='["head","left_hand","back","right_hand"]';
  if (!value || value.type!=='hello' || value.product!=='loveandrobot.pet' || value.protocol!==1 || value.nonce!==nonce || value.board!=='esp32s3-n8r8' || !legacy&&!four || value.adc_bits!==12 || value.sample_ms!==20 || !/^LR-[A-F0-9]{12}$/.test(value.device_id) || !/^[A-F0-9]{16}$/.test(value.boot_id)) throw new Error('设备固件或协议不兼容，未绑定。');
  return value;
}
const uint32=value=>Number.isInteger(value)&&value>=0&&value<=0xFFFFFFFF;
export function validateSample(value, count=3) {
  if (![3,4].includes(count) || !value || value.type!=='sample' || !uint32(value.seq) || !uint32(value.ms) || !Array.isArray(value.raw) || value.raw.length!==count || !value.raw.every(n=>Number.isInteger(n)&&n>=0&&n<=4095)) throw new Error('传感器数据格式无效。');
  return value;
}
