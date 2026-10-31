/* Harness lazy-CJS client face. React is shared with the host; no second runtime. */
window.__ModuleLoader__.load({
  id: '@loveandrobot/dsh-pet-usb',
  factory: require => {
    const React = require('react');
    const {createElement:h, useState, useEffect, useRef} = React;
    const css = `
.lr-pet{font-family:Inter,"Microsoft YaHei",system-ui,sans-serif;color:#302d35;font-size:14px;line-height:1.5;--pet-pink:#f2d9dd;--pet-ink:#302d35;color-scheme:light}
.lr-pet *{box-sizing:border-box}.lr-pet button,.lr-pet input,.lr-pet select{font:inherit}.lr-pet button{cursor:pointer;transition:background .16s,transform .16s;border:0}.lr-pet button:disabled{opacity:.48;cursor:default}.lr-pet button:focus-visible,.lr-pet input:focus-visible,.lr-pet select:focus-visible,.lr-pet summary:focus-visible{outline:3px solid #b08092;outline-offset:3px}
.lr-pet .lr-anchor{position:fixed;z-index:1000;pointer-events:auto;width:64px;height:64px;touch-action:none}.lr-pet .lr-orb{display:grid;place-items:center;width:64px;height:64px;border:1px solid #e7dbd8;border-radius:24px;background:#fffaf6;box-shadow:0 5px 22px #302d351c;position:relative;user-select:none;-webkit-app-region:no-drag}.lr-pet .lr-orb:hover{background:#faeee8;transform:translateY(-2px)}.lr-pet .lr-orb svg{width:53px;height:53px}.lr-pet .lr-dot{position:absolute;bottom:4px;right:3px;width:12px;height:12px;background:#aaa0a0;border:3px solid #fffaf6;border-radius:50%}.lr-pet .lr-dot.online{background:#77a58e}.lr-pet .lr-dot.paused{background:#c6a66b}
.lr-pet .lr-cat-eyes{transform-origin:48px 54px;animation:lr-blink 8s infinite}.lr-pet .lr-touched svg{transform:rotate(-6deg);transition:transform .2s}.lr-pet .lr-touched:after{content:'♥';position:absolute;top:-10px;right:1px;color:#b4798d;font-size:17px}.lr-pet .lr-pop{position:fixed;z-index:1001;width:264px;padding:18px;border:1px solid #e8ded9;background:#fffbf8;border-radius:22px;box-shadow:0 12px 38px #312a321b;pointer-events:auto;touch-action:auto}.lr-pet .lr-pop strong{font-size:18px;display:block;overflow-wrap:anywhere}.lr-pet .lr-muted{color:#82787c;font-size:12px}.lr-pet .lr-pop p{margin:8px 0 16px;font-size:13px;color:#6c6067}.lr-pet .lr-pop-actions{display:flex;gap:8px;flex-wrap:wrap}.lr-pet .lr-primary{background:#37333d;color:#fff9f6;border-radius:13px;padding:10px 16px;font-weight:600}.lr-pet .lr-primary:hover:not(:disabled){background:#524854}.lr-pet .lr-secondary{background:#f0e9e5;color:#4f444c;border-radius:12px;padding:10px 13px}.lr-pet .lr-secondary:hover:not(:disabled){background:#e8dcd8}.lr-pet .lr-text-button{background:transparent;color:#87717c;padding:7px 0;text-align:left;font-size:12px}.lr-pet .lr-wide{width:100%}
.lr-pet .lr-dialog{position:fixed;inset:72px 22px auto auto;margin:0;width:400px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 94px);padding:0;border:1px solid #e4d9d3;border-radius:26px;background:#fffbf7;color:#302d35;box-shadow:0 20px 80px #201b3530;overflow:auto;overscroll-behavior:contain}.lr-pet .lr-dialog::backdrop{background:#25212a32;backdrop-filter:blur(2px)}.lr-pet .lr-top{display:flex;align-items:center;justify-content:space-between;padding:18px 22px 0}.lr-pet .lr-kicker{font-size:10px;letter-spacing:2px;font-weight:700;color:#a18791}.lr-pet .lr-close{display:grid;place-items:center;background:#f1e9e4;color:#796d74;border-radius:50%;width:30px;height:30px;font-size:21px}.lr-pet .lr-hero{display:flex;gap:18px;align-items:center;padding:16px 24px 20px}.lr-pet .lr-avatar{width:78px;height:84px;background:#f1e4df;border-radius:27px;display:grid;place-items:center;flex-shrink:0}.lr-pet .lr-avatar svg{width:73px;height:73px}.lr-pet h2{font-size:25px;line-height:1.2;margin:0 0 7px;letter-spacing:-.6px;overflow-wrap:anywhere}.lr-pet .lr-hero p{margin:0;color:#8b727c;font-size:12px}.lr-pet .lr-content{padding:0 22px 22px}.lr-pet .lr-status{display:flex;align-items:center;gap:8px;color:#60806f;font-size:12px;margin-bottom:16px}.lr-pet .lr-status i{width:7px;height:7px;border-radius:50%;background:currentColor}.lr-pet .lr-status.off{color:#9c8577}.lr-pet .lr-card{padding:16px;background:#fff;border:1px solid #eee5de;border-radius:17px;margin-top:12px}.lr-pet .lr-card h3{font-size:13px;margin:0 0 12px;display:flex;align-items:center;gap:8px}.lr-pet .lr-card h3 span{color:#a9989e;font-weight:400;font-size:11px;margin-left:auto}.lr-pet .lr-row{display:flex;align-items:center;gap:8px}.lr-pet .lr-row>*:first-child{flex:1;min-width:0}.lr-pet input,.lr-pet select{background:#fcf8f5;color:#302d35;border:1px solid #e7dcd6;border-radius:11px;padding:10px 11px;width:100%;min-width:0}.lr-pet .lr-help{font-size:12px;color:#91858b;margin:9px 0 0;line-height:1.65}.lr-pet .lr-zones{display:flex;gap:7px;margin:12px 0}.lr-pet .lr-zone{flex:1;text-align:center;background:#f8f4f1;border:1px solid transparent;border-radius:10px;padding:8px 0;font-size:12px;color:#9b8c93}.lr-pet .lr-zone.unavailable{opacity:.55}.lr-pet .lr-zone.active{color:#9b5d74;background:#f8e4e9;border-color:#e9c6d1}.lr-pet .lr-note{padding:11px 13px;background:#f3e9e5;color:#86636f;border-radius:12px;font-size:12px;margin:0 0 12px;overflow-wrap:anywhere}.lr-pet .lr-note.error{background:#fbece8;color:#9b594a}.lr-pet .lr-footer{margin-top:16px;text-align:center;color:#ae959e;font-size:11px}.lr-pet details{margin-top:16px;font-size:11px;color:#97858d}.lr-pet summary{cursor:pointer}.lr-pet dl{display:grid;grid-template-columns:70px 1fr;gap:5px;margin:12px 0}.lr-pet dd{margin:0;overflow-wrap:anywhere}.lr-pet .lr-danger{color:#a35d60}.lr-pet .lr-confirm{border-top:1px solid #eee3dd;margin-top:10px;padding-top:10px}.lr-pet .lr-confirm p{font-size:12px;color:#886e75}.lr-pet .lr-progress{display:flex;gap:5px;margin:4px 0 14px}.lr-pet .lr-progress span{flex:1;padding-top:7px;border-top:3px solid #eee3df;color:#a8949c;font-size:10px}.lr-pet .lr-progress span.done{border-color:#b495a1;color:#6f5764}
.lr-pet .lr-feedback{background:#f8f4f1;border:1px solid #e7ddd8;border-radius:13px;padding:13px;margin:12px 0}.lr-pet .lr-feedback.detected{background:#edf5ef;border-color:#bbd6c4}.lr-pet .lr-signal{height:7px;border-radius:8px;background:#e9e1dc;overflow:hidden;margin-top:10px}.lr-pet .lr-signal i{display:block;height:100%;background:#79a38c;transition:width .08s linear}.lr-pet .lr-feedback strong{display:block;font-size:17px;line-height:1.55}.lr-pet .lr-feedback p{margin:5px 0 0;font-size:12px;color:#7d7477}
@keyframes lr-blink{0%,43%,46%,100%{transform:scaleY(1)}44%,45%{transform:scaleY(.12)}}@media(prefers-reduced-motion:reduce){.lr-pet *{animation:none!important;transition:none!important}}@media(max-width:480px){.lr-pet .lr-dialog{inset:16px 12px auto auto;max-height:calc(100dvh - 32px)}.lr-pet .lr-content{padding:0 16px 18px}}
`;
    function pairingTitle(m) {
      const label=({head:'头部',back:'背部',left_hand:'左爪',right_hand:'右爪'})[m.zone]||'';
      if(m.phase==='complete')return '✓ 四个位置都记住啦';
      if(m.phase==='recognized')return '✓ 记住啦，请松开';
      if(m.phase==='release')return '请先松开所有感应片';
      if(m.phase==='confirming')return '感应到了…';
      return '轻按'+label+'的感应片';
    }
    function pairingHelp(m) {
      if(m.complete)return '保存后，就可以摸摸小猫了。';
      if(m.phase==='recognized')return '松开后会自动进入下一步。';
      if(m.phase==='release')return m.hint.includes('配对过')?'这片已经选过了，换一片试试。':m.hint.includes('一次只按')?'一次只按一片就好。':'';
      if(m.phase==='confirming'||m.contact)return '再按住一小会儿。';
      return '按住片刻，再松开。';
    }
    function Cat() {
      return h('svg',{viewBox:'0 0 96 96',fill:'none','aria-hidden':true},
        h('path',{d:'M18 42C15 34 11 19 16 13C21 8 31 19 38 29Q48 26 58 29C65 19 75 8 80 13C85 19 81 34 78 42C88 58 86 73 71 81Q48 93 25 81C10 73 8 58 18 42Z',fill:'#35303b',stroke:'#35303b',strokeWidth:2,strokeLinejoin:'round'}),
        h('path',{d:'M21 21Q19 19 20 25L25 39 33 32Q27 24 21 21ZM75 21Q77 19 76 25L71 39 63 32Q69 24 75 21Z',fill:'#d4a6b4'}),
        h('ellipse',{cx:27,cy:64,rx:7,ry:4,fill:'#b57d91',opacity:.63}),h('ellipse',{cx:69,cy:64,rx:7,ry:4,fill:'#b57d91',opacity:.63}),
        h('g',{className:'lr-cat-eyes'},
          h('ellipse',{cx:34,cy:54,rx:9,ry:10.5,fill:'#f5dfbd'}),
          h('ellipse',{cx:35,cy:54,rx:6.3,ry:8,fill:'#302b39'}),
          h('circle',{cx:32.8,cy:50.8,r:2.5,fill:'#fffaf4'}),
          h('circle',{cx:37.2,cy:57.4,r:1.2,fill:'#fffaf4',opacity:.9}),
          h('ellipse',{cx:62,cy:54,rx:9,ry:10.5,fill:'#f5dfbd'}),
          h('ellipse',{cx:61,cy:54,rx:6.3,ry:8,fill:'#302b39'}),
          h('circle',{cx:58.8,cy:50.8,r:2.5,fill:'#fffaf4'}),
          h('circle',{cx:63.2,cy:57.4,r:1.2,fill:'#fffaf4',opacity:.9})),
        h('path',{d:'M44 61Q44 58 48 60Q52 58 52 61Q52 63 48 65Q44 63 44 61Z',fill:'#efc0cd'}),
        h('path',{d:'M48 65v2m0 0q-4 6-8 1m8-1q4 6 8 1',stroke:'#f0ced6',strokeWidth:1.8,strokeLinecap:'round'}),
        h('path',{d:'m17 60 10 2m-10 6 10-1m52-7-10 2m10 6-10-1',stroke:'#d3c6d2',strokeWidth:1.3,strokeLinecap:'round'}));
    }
    const clampPosition = pos => ({x:Math.max(12,Math.min(Number.isFinite(pos?.x)?pos.x:window.innerWidth-88,window.innerWidth-76)),y:Math.max(48,Math.min(Number.isFinite(pos?.y)?pos.y:window.innerHeight-220,window.innerHeight-80))});
    function initialPosition() {try{return clampPosition(JSON.parse(localStorage.getItem('loveandrobot.pet.position')));}catch{return clampPosition(null);}}
    async function api(path, options = {}) {
      const response = await fetch('api/loveandrobot.pet.'+path,{credentials:'same-origin',cache:'no-store',...options});
      const data = await response.json().catch(()=>{throw new Error('暂时连不上宠物服务，请稍后重试。');});
      if(!response.ok) throw new Error(data.error || '操作没有完成，请稍后重试。');
      return data;
    }
    function PetOverlay({workspace}) {
      const [state,setState]=useState(null), [network,setNetwork]=useState(''), [menu,setMenu]=useState(false), [open,setOpen]=useState(false);
      const [busy,setBusy]=useState(''), [notice,setNotice]=useState(null), [petName,setPetName]=useState(''), [confirm,setConfirm]=useState(false), [replaceConfirm,setReplaceConfirm]=useState(false), [pos,setPos]=useState(initialPosition);
      const dialog=useRef(null), anchor=useRef(null), drag=useRef(null), hide=useRef(null), alive=useRef(false), inFlight=useRef(false), draftDirty=useRef(false), currentState=useRef(null), refresh=useRef(null), actionRevision=useRef(0), mappingPanel=useRef(null);
      const ready=state?.boundOnline && state?.calibrated && !!state?.name;
      const touchReady=ready && state?.placementReady && !state?.mapping;
      const title=state?.name || '小黑猫';
      const live=state?.boundOnline && !network;
      const status=network?'暂时连不上服务':!state?'正在寻找小猫…':!state.online?'等待 USB 连接':!state.bound?'发现一只小猫':!state.boundOnline?'请连接已绑定的宠物':state.calibrating?'正在校准触碰':!state.calibrated?'等待触碰校准':state.mapping?'正在认识四个部位':!state.placementReady?'等待部位配对':!state.sessionId?'等待开始陪伴':state.chatStatus==='archived'?'陪伴聊天已归档':state.chatStatus==='missing'?'陪伴聊天需要恢复':state.chatStatus==='loading'?'正在恢复陪伴聊天':state.chatStatus==='error'?'陪伴聊天暂时不可用':state.enabled?'正在陪着你':'安静陪伴中';
      function accept(next){currentState.current=next;setState(next);if(!draftDirty.current)setPetName(next.name);}
      useEffect(()=>{
        alive.current=true;let timer;let abort;let generation=0;
        async function poll(){
          const own=++generation,revision=actionRevision.current;abort?.abort();abort=new AbortController();
          try{const next=await api('state',{signal:abort.signal});if(alive.current&&own===generation&&revision===actionRevision.current){accept(next);setNetwork('');}}
          catch(error){if(alive.current&&own===generation&&error.name!=='AbortError')setNetwork(error.message);}
          finally{if(alive.current&&own===generation)timer=setTimeout(poll,currentState.current?.mapping?100:document.hidden?5000:1000);}
        }
        refresh.current=()=>{clearTimeout(timer);void poll();};
        void poll();
        const resized=()=>setPos(previous=>clampPosition(previous));
        window.addEventListener('resize',resized);
        return()=>{alive.current=false;generation++;refresh.current=null;abort?.abort();clearTimeout(timer);clearTimeout(hide.current);window.removeEventListener('resize',resized);};
      },[]);
      useEffect(()=>{if(open&&state?.mapping)mappingPanel.current?.scrollIntoView({block:'nearest'});},[open,!!state?.mapping]);
      useEffect(()=>{const node=dialog.current;if(open&&!node.open)node.showModal();else if(!open&&node.open)node.close();},[open]);
      useEffect(()=>{if(!open){setConfirm(false);setReplaceConfirm(false);}},[open]);
      async function act(action,extra={}){
        if(inFlight.current)return false;
        inFlight.current=true;actionRevision.current++;setBusy(action);setNotice(null);
        try{const result=await api('action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(12000)});
          if(alive.current){if(action==='name')draftDirty.current=false;accept(result.state);setNetwork('');setNotice(['mapping-start','mapping-cancel'].includes(action)?null:{text:action==='mapping-save'?'位置已保存。':result.message});}return result;
        }catch(error){if(alive.current)setNotice({error:true,text:error.name==='TimeoutError'?'操作等待超时，请查看连接状态后重试。':error.message});return false;}
        finally{inFlight.current=false;if(alive.current){setBusy('');refresh.current?.();}}
      }
      async function closeSettings(){if(currentState.current?.mapping&&!(await act('mapping-cancel')))return;setOpen(false);}
      function settings(){clearTimeout(hide.current);setMenu(false);setOpen(true);}
      function delayHide(){clearTimeout(hide.current);hide.current=setTimeout(()=>{if(!anchor.current?.contains(document.activeElement))setMenu(false);},240);}
      async function talk(action='open-chat'){
        if(currentState.current?.mapping&&!(await act('mapping-cancel')))return;
        if(action==='open-chat'&&(!currentState.current?.sessionId&&!ready||['archived','missing'].includes(currentState.current?.chatStatus))){settings();return;}
        const result=await act(action);
        if(!result){settings();return;}
        try{workspace.openSession(result.sessionId);setMenu(false);setOpen(false);}catch{setNotice({error:true,text:'聊天关联已保存，暂时无法显示，请稍后再点“去聊天”。'});settings();}
      }
      function pointerDown(event){if(event.button!==0)return;drag.current={x:event.clientX,y:event.clientY,origin:pos,moved:false};event.currentTarget.setPointerCapture(event.pointerId);}
      function pointerMove(event){const d=drag.current;if(!d)return;if(Math.abs(event.clientX-d.x)+Math.abs(event.clientY-d.y)>6)d.moved=true;if(d.moved){setMenu(false);setPos(clampPosition({x:d.origin.x+event.clientX-d.x,y:d.origin.y+event.clientY-d.y}));}}
      function pointerUp(event){const d=drag.current;if(!d)return;if(d.moved){event.currentTarget.dataset.dragged='true';try{localStorage.setItem('loveandrobot.pet.position',JSON.stringify(clampPosition({x:d.origin.x+event.clientX-d.x,y:d.origin.y+event.clientY-d.y})));}catch{}}drag.current=null;}
      const button=(label,onClick,kind='lr-secondary',disabled=false)=>h('button',{type:'button',className:kind,onClick,disabled:!!busy||disabled},label);
      const linkedTitle=state?.sessions.find(s=>s.id===state.sessionId)?.title;
      const popLeft=Math.max(12,Math.min(pos.x>288?pos.x-278:pos.x+78,window.innerWidth-276));
      const popTop=Math.max(12,Math.min(pos.y-45,window.innerHeight-240));
      return h('div',{className:'lr-pet'},h('style',null,css),
        h('div',{ref:anchor,className:'lr-anchor',style:{left:pos.x,top:pos.y},onPointerEnter:()=>{clearTimeout(hide.current);if(!drag.current)setMenu(true);},onPointerLeave:delayHide,onFocus:()=>{clearTimeout(hide.current);setMenu(true);},onBlur:event=>{if(!event.currentTarget.contains(event.relatedTarget))delayHide();},onKeyDown:event=>{if(event.key==='Escape'){setMenu(false);event.stopPropagation();}}},
          h('button',{type:'button',className:'lr-orb'+(state?.touch.some(Boolean)&&live?' lr-touched':''),'aria-label':`${title}，打开陪伴菜单`,'aria-expanded':menu,'aria-controls':'lr-pet-menu',title:'拖动可移动 · 点击打开菜单',onPointerDown:pointerDown,onPointerMove:pointerMove,onPointerUp:pointerUp,onPointerCancel:()=>{drag.current=null;},onClick:event=>{if(event.currentTarget.dataset.dragged){delete event.currentTarget.dataset.dragged;return;}setMenu(true);}},h(Cat),h('i',{className:'lr-dot '+(live?(state.enabled?'online':'paused'):''),'aria-hidden':true})),
          menu&&!open&&h('div',{id:'lr-pet-menu',className:'lr-pop',style:{left:popLeft,top:popTop},role:'region','aria-label':'陪伴菜单'},h('strong',null,title),h('span',{className:'lr-muted'},status),h('p',null,live?'我就在这里，陪你慢慢过今天。':'接好 USB，小猫就能感受到触碰啦。'),h('div',{className:'lr-pop-actions'},button(state?.sessionId?'去找小猫聊天':'开始认识小猫',()=>talk(),'lr-primary'),button('陪伴设置',settings)),state?.sessionId&&button(state.enabled?'暂停触碰回应':'恢复触碰回应',async()=>{settings();await act(state.enabled?'pause':'start',state.enabled?{}:{sessionId:state.sessionId});},'lr-text-button',!state.enabled&&(!touchReady||state.chatStatus!=='ready')))),
        h('dialog',{ref:dialog,className:'lr-dialog','aria-labelledby':'lr-pet-heading',onCancel:event=>{event.preventDefault();void closeSettings();},onClose:()=>{setOpen(false);anchor.current?.querySelector('button')?.focus();},onClick:event=>{if(event.target===dialog.current){const r=dialog.current.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)void closeSettings();}}},
          h('div',{className:'lr-top'},h('span',{className:'lr-kicker'},'A LITTLE LOVE, EVERY DAY'),h('button',{type:'button',className:'lr-close','aria-label':'关闭陪伴设置',onClick:closeSettings},'×')),
          h('div',{className:'lr-hero'},h('div',{className:'lr-avatar'},h(Cat)),h('div',null,h('h2',{id:'lr-pet-heading'},title))),
          h('div',{className:'lr-content'},
            h('div',{className:'lr-status'+(!live?' off':''),role:'status'},h('i',{'aria-hidden':true}),status),
            !state?.sessionId&&!state?.mapping&&h('div',{className:'lr-progress','aria-label':'初次相遇步骤'},...['连接','起名','校准','配对','陪伴'].map((text,i)=>h('span',{key:text,className:[state?.bound,!!state?.name,state?.calibrated,state?.placementReady,!!state?.sessionId][i]?'done':''},`${i+1} ${text}`))),
            (notice||network||state?.error)&&h('div',{className:'lr-note'+(notice?.error||network||state?.error?' error':''),role:notice?.error||network||state?.error?'alert':'status'},network||state?.error||notice?.text),
            !state?.boundOnline&&h('section',{className:'lr-card'},h('h3',null,'和小猫连接'),h('p',{className:'lr-help'},state?.online?(state.bound?'检测到另一只宠物。要更换，请先在设备详情中解除原有绑定。':'找到兼容的小猫了，绑定后就能一起玩。'):'把宠物用 USB 数据线连接电脑，会自动寻找它。'),h('div',{className:'lr-pop-actions',style:{marginTop:12}},button('重新检测',()=>act('scan')),!state?.bound&&button('绑定这只小猫',()=>act('bind'),'lr-primary',!state?.online))),
            !state?.mapping&&h('section',{className:'lr-card'},h('h3',null,'小猫的名字'),h('form',{onSubmit:event=>{event.preventDefault();void act('name',{argument:petName.trim()});}},h('div',{className:'lr-row'},h('input',{'aria-label':'小猫的名字',value:petName,maxLength:40,placeholder:'给小猫起个名字',disabled:!state?.bound||!!busy,onChange:event=>{draftDirty.current=true;setPetName(event.target.value);}}),h('button',{type:'submit',className:'lr-secondary',disabled:!state?.bound||!!busy||!petName.trim()||petName.trim()===state?.name},'保存'))),h('p',{className:'lr-help'},'它会带着这个名字，慢慢认识你。')),
            h('section',{className:'lr-card',ref:mappingPanel,'aria-label':'触碰设置'},
              h('h3',null,state?.mapping?'部位配对':'触碰设置',h('span',null,state?.mapping?(state.mapping.complete?'已完成':'第 '+Math.min(4,state.mapping.step+(state.mapping.phase==='recognized'?0:1))+' / 4 步'):state?.calibrated&&state?.placementReady?'已设置':'')),
              state?.mapping ? h('div',null,
                h('div',{className:'lr-feedback'+(state.mapping.contact||state.mapping.phase==='recognized'||state.mapping.complete?' detected':'')},
                  h('strong',{role:'status'},pairingTitle(state.mapping)),
                  pairingHelp(state.mapping)&&h('p',null,pairingHelp(state.mapping)),
                  !state.mapping.complete&&h('div',{className:'lr-signal','aria-hidden':true},h('i',{style:{width:(state.mapping.phase==='recognized'?100:Math.max(state.mapping.contact?12:0,state.mapping.signalLevel||0))+'%'}}))),
                h('div',{className:'lr-pop-actions'},button('取消配对',()=>act('mapping-cancel')),state.mapping.complete&&button('保存位置',()=>act('mapping-save'),'lr-primary')))
              : !state?.calibrated ? h('div',null,
                h('p',{className:'lr-help',role:busy==='calibrate'?'status':undefined},busy==='calibrate'?'请保持松手，约 3 秒就好。':state?.boundOnline?'先松开所有感应片，再点下方按钮。':'连接小猫后，就可以设置触碰。'),
                h('div',{style:{marginTop:12}},button(busy==='calibrate'?'校准中…':'开始校准',()=>act('calibrate'),'lr-secondary lr-wide',!state?.boundOnline)))
              : h('div',null,
                state?.placementReady ? h('div',{className:'lr-zones'},...(state.touchZones||[]).map(zone=>h('div',{key:zone.id,className:'lr-zone'+(live&&zone.active?' active':'')+(!zone.available?' unavailable':''),'aria-label':zone.label+(!zone.available?' 未接入':live&&zone.active?' 正在触碰':'')},zone.label)))
                  : h('p',{className:'lr-help'},'让小猫认识头、背和两只爪子。'),
                state?.recentTouch&&h('p',{className:'lr-help',role:'status'},'刚刚：'+state.recentTouch.zones.map(id=>({head:'头部',back:'背部',left_hand:'左爪',right_hand:'右爪'}[id])).join('、')+' · '+state.recentTouch.label),
                (state?.canMap||!state?.placementReady)&&h('div',{style:{marginTop:12}},button(state?.placementReady?'重新配对':'开始配对',()=>act('mapping-start'),'lr-secondary lr-wide',!state?.canMap)),
                h('details',null,h('summary',null,'感应不灵？'),
                  h('p',{className:'lr-help'},busy==='calibrate'?'请保持松手，约 3 秒就好。':'松开所有感应片，再重新校准。'),
                  button(busy==='calibrate'?'校准中…':'重新校准',()=>act('calibrate'),'lr-text-button',!state?.boundOnline)))),
            !state?.mapping&&h('section',{className:'lr-card'},h('h3',null,'一起聊天',h('span',null,state?.mapping?'配对时暂停触碰':!state?.placementReady?'配对后感受触碰':state?.enabled?'触碰回应已开启':'触碰回应已暂停')),
              h('p',{className:'lr-help'},state?.chatStatus==='archived'?'原聊天已归档，触碰回应已停止。恢复后继续原来的陪伴。':state?.chatStatus==='missing'?state.chatError:state?.sessionId?`小猫在「${linkedTitle||'原来的陪伴聊天'}」等你。`:'开始后会为小猫建立一段专属聊天，以后每次都回到这里。'),
              h('div',{className:'lr-pop-actions',style:{marginTop:12}},state?.sessionId&&state.chatStatus!=='missing'&&button(state.chatStatus==='archived'?'恢复原聊天':'去聊天',()=>talk(state.chatStatus==='archived'?'restore-chat':'open-chat'),'lr-primary'),state?.sessionId&&state.chatStatus==='ready'&&button(state.enabled?'安静陪一会儿':'恢复触碰回应',()=>act(state.enabled?'pause':'start',state.enabled?{}:{sessionId:state.sessionId}),'lr-secondary',!state.enabled&&!touchReady),
                !state?.sessionId&&button('开始陪伴',()=>talk(),'lr-primary',!ready),state?.chatStatus==='missing'&&button('新建陪伴聊天',()=>setReplaceConfirm(true),'lr-secondary',!ready)),
              state?.chatStatus==='error'&&h('p',{className:'lr-help'},state.chatError),
              replaceConfirm&&h('div',{className:'lr-confirm'},h('p',null,'原聊天目前找不到。新建后只关联新的陪伴聊天，保留小猫的名字和设备绑定；不会删除任何历史记录。'),h('div',{className:'lr-pop-actions'},button('暂时保留',()=>setReplaceConfirm(false)),button('确认新建',()=>talk('replace-chat'),'lr-primary'))),
              h('p',{className:'lr-help'},'始终只关联这一段聊天，切换其他聊天不会改变。安静陪伴只暂停触碰回应，仍可打字聊天。')),
            !state?.mapping&&h('details',null,h('summary',null,'设备详情'),h('dl',null,h('dt',null,'连接方式'),h('dd',null,'USB'),h('dt',null,'设备编号'),h('dd',null,state?.boundDeviceId||state?.device?.id||'尚未绑定'),h('dt',null,'固件'),h('dd',null,state?.device?.firmware||'—'),h('dt',null,'连接端口'),h('dd',null,state?.device?.port||'—'),h('dt',null,'插件版本'),h('dd',null,'0.3.6')),state?.error&&h('p',null,state.error),button('重新检测设备',()=>act('scan'),'lr-text-button'),h('br'),state?.bound&&button('解除设备绑定',()=>setConfirm(true),'lr-text-button lr-danger'),confirm&&h('div',{className:'lr-confirm'},h('p',null,'解除后需要重新连接和校准。名字和原来的陪伴聊天都保留，换设备也能接着聊。'),h('div',{className:'lr-pop-actions'},button('保留绑定',()=>setConfirm(false)),button('确认解除',async()=>{if(await act('unbind'))setConfirm(false);},'lr-secondary lr-danger')))),
            h('div',{className:'lr-footer'},'（把一点点偏爱，留给每一天。）'))));
    }
    return {
      inject:['slots','uiWorkspace'],
      apply(ctx){ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'loveandrobot.pet'},()=>h(PetOverlay,{workspace:ctx.uiWorkspace})));},
    };
  },
});


