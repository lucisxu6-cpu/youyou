// Wire order preserves the three existing cables; GPIO5 adds the right hand.
export const ZONES = Object.freeze(['head', 'left_hand', 'back', 'right_hand']);
export const ZONE_LABELS = Object.freeze({head:'头部感应区', left_hand:'左手感应区', back:'背部感应区', right_hand:'右手感应区'});
export const DISPLAY_ZONES = Object.freeze(['head','back','left_hand','right_hand']);
// Timing is product policy, not a force calibration. Hands are deliberately symmetric.
const hand = Object.freeze({pressMs:40,releaseMs:80,tapMaxMs:500,tapGapMs:450,holdMs:1500,longHoldMs:5000});
export const BODY_PROFILES = Object.freeze({
  head:Object.freeze({pressMs:40,releaseMs:60,tapMaxMs:450,tapGapMs:450,holdMs:1200,longHoldMs:4000}),
  back:Object.freeze({pressMs:60,releaseMs:80,tapMaxMs:650,tapGapMs:850,holdMs:1800,longHoldMs:6000}),
  left_hand:hand, right_hand:hand,
});
export const GESTURE_LABELS = Object.freeze({tap:'拍一下', repeated_tap:'连续拍碰', press:'短按', hold:'持续接触', long_hold:'长时间接触', hold_release:'持续接触后松开', both_hands_hold:'双手同时持续接触', both_hands_long_hold:'双手长时间持续接触', both_hands_release:'双手同时接触结束'});

export function gestureDescription(event) {
  const area=event.zones.map(z=>ZONE_LABELS[z]).join('、');
  const seconds=(event.durationMs/1000).toFixed(1);
  if(event.type==='tap')return `${area}短暂接触一次后松开（${event.durationMs} 毫秒；短拍候选，不代表力度轻）。`;
  if(event.type==='repeated_tap')return `${area}连续短拍 ${event.count} 次${event.rhythmic?'，间隔较均匀':''}；每次都检测到释放。`;
  if(event.type==='press')return `${area}接触 ${seconds} 秒后松开。`;
  if(event.type==='hold_release')return `${area}持续接触 ${seconds} 秒后已经松开。`;
  if(event.type==='both_hands_release')return `双手曾同时持续受压 ${seconds} 秒，${event.releasedZones.map(z=>ZONE_LABELS[z]).join('、')}已松开，双手同时接触已结束。`;
  return `${area}${event.type.includes('long_hold')?'长时间':'持续'}受压，${event.zones.length===2?'同时受压':'本次接触'}已达 ${seconds} 秒。`;
}
