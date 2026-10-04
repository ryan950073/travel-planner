/* Per-leg controls and local automatic rescheduling; uses the shared trip/save flow. */
'use strict';
function scheduleChanged() { markDirty(); renderItems(); }
function renderScheduleControls(day) {
  const enabled = Boolean(day.schedule?.enabled);
  $('autoSchedule').checked = enabled;
  $('dayStartTime').value = day.schedule?.startTime || TravelSchedule.ordered(day)[0]?.time || '09:00';
  $('dayStartTime').disabled = !enabled;
  const plan = TravelSchedule.apply(day,trip.destination,trip.mapTravelMode);
  const status = $('scheduleStatus'); status.classList.toggle('schedule-warning', enabled && !plan.ok);
  status.textContent = !day.items.length ? '加入景點後，可設定各站停留時間與途中交通。' : enabled ? (plan.ok ? `已自動排程 · ${TravelSchedule.clock(plan.end)} 結束 · 停留 ${plan.stayTotal} 分鐘／交通與緩衝 ${plan.travelTotal} 分鐘` : plan.message) : '手動模式：保留原本景點時間。開啟自動排程後，依目前順序計算抵達與離開時間。';
  return plan;
}
function renderLeg(day, from, to, plan, index) {
  const route = TravelSchedule.leg(day,from,to,trip.destination,trip.mapTravelMode);
  const card = textNode('section','route-leg',''); card.setAttribute('aria-label',`${from.title} 到 ${to.title} 的交通`);
  card.append(textNode('p','route-leg-title',`${from.placeName || from.title} → ${to.placeName || to.title}`));
  const fields = textNode('div','route-leg-fields','');
  const modeLabel = textNode('label','','交通方式'), mode = document.createElement('select');
  for (const [value,label] of [['transit','大眾運輸'],['walking','步行'],['driving','開車'],['bicycling','自行車']]) {
    const option = textNode('option','',label);option.value=value;mode.append(option);
  }
  mode.value=route.mode;modeLabel.append(mode);fields.append(modeLabel);
  const addMinutes = (label,key) => {
    const wrap=textNode('label','',label),input=document.createElement('input');
    input.type='number';input.min='0';input.max='1440';input.step='1';input.inputMode='numeric';input.value=route[key] ?? '';input.placeholder=key==='minutes'?'待填':'0';input.dataset.field=key;
    input.addEventListener('change',()=>{
      if(input.value==='') { if(key==='minutes')route[key]='';else route[key]=0; }
      else { try { route[key]=TravelSchedule.minutes(input.value,label); } catch(error) {notice(error.message);input.focus();return;} }
      TravelSchedule.putLeg(day,route);scheduleChanged();
    }); wrap.append(input);fields.append(wrap);
  };
  addMinutes('交通時間（分）','minutes');addMinutes('緩衝時間（分）','bufferMinutes');card.append(fields);
  mode.addEventListener('change',()=>{
    route.mode=mode.value;route.minutes='';TravelSchedule.putLeg(day,route);scheduleChanged();
    notice('交通方式已更改，請重新查詢並填入這一段的交通時間。');
  });
  const href=TravelPlaces.mapURL('directions',TravelPlaces.placeQuery(to,trip.destination),route.mode,TravelPlaces.placeQuery(from,trip.destination));
  if(href.length<=2048){
    const link=textNode('a','button button-outline route-query','Google 交通查詢 ↗');link.href=href;link.target='_blank';link.rel='noopener noreferrer';link.referrerPolicy='no-referrer';card.append(link);
  } else card.append(textNode('p','schedule-warning','地址太長，請縮短地址或改填座標後查詢。'));
  if(day.schedule?.enabled && plan.ok){
    const previous=plan.rows[index-1],current=plan.rows[index];
    card.append(textNode('p','route-timing',`${TravelSchedule.clock(previous.departure)} 離開上一站 → ${TravelSchedule.clock(current.arrival)} 抵達（含緩衝）`));
  }
  card.append(textNode('p','route-hint',route.invalidated?'地點已更動，請重新查詢並填入交通時間。':'在 Google Maps 查詢後，將所需分鐘填回此處。可在 Google Maps 設定實際出發日期與時間。'));
  return card;
}
function addScheduleActions(actions, day, item, index, count) {
  if(!day.schedule?.enabled)return;
  for(const [label,delta,symbol] of [['往前移',-1,'↑'],['往後移',1,'↓']]){
    const control=textNode('button','icon-button',symbol);control.type='button';control.setAttribute('aria-label',`${label} ${item.title}`);
    control.disabled=index+delta<0 || index+delta>=count;
    control.addEventListener('click',()=>{
      [day.items[index],day.items[index+delta]]=[day.items[index+delta],day.items[index]];scheduleChanged();
    });actions.append(control);
  }
}
document.getElementById('autoSchedule').addEventListener('change',()=>{
  const day=trip.days[activeDay],enabled=$('autoSchedule').checked;
  if(enabled)day.items=TravelSchedule.ordered(day);
  day.schedule={...day.schedule,enabled,startTime:day.schedule?.startTime || day.items[0]?.time || '09:00'};
  scheduleChanged();
});
document.getElementById('dayStartTime').addEventListener('change',()=>{
  try{TravelSchedule.parseTime($('dayStartTime').value);}catch(error){notice(error.message);return;}
  const day=trip.days[activeDay];day.schedule={...day.schedule,startTime:$('dayStartTime').value};scheduleChanged();
});
