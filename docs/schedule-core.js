/* Local schedule arithmetic. Travel durations are explicitly entered, never invented. */
(function(root) {
  'use strict';
  const MODES = ['transit','walking','driving','bicycling'];
  function minutes(value, label = '時間') {
    if (value === '' || value === null || value === undefined || !/^\d+$/.test(String(value))) throw new Error(`${label}請填入 0–1440 的整數分鐘`);
    const n = Number(value); if (!Number.isSafeInteger(n) || n > 1440) throw new Error(`${label}請填入 0–1440 的整數分鐘`); return n;
  }
  function parseTime(value) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || '')) throw new Error('請設定有效的首站抵達時間');
    const [h,m] = value.split(':').map(Number); return h * 60 + m;
  }
  function clock(total) { return `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`; }
  function stay(item) { return minutes(item.durationMinutes ?? 60, '停留時間'); }
  function ordered(day) { return day.schedule?.enabled ? [...day.items] : [...day.items].sort((a,b) => (a.time || '').localeCompare(b.time || '')); }
  function signature(from, to, destination) {
    const place = item => item.address?.trim() || [destination?.trim(), item.placeName?.trim() || item.title?.trim()].filter(Boolean).join(' ');
    return JSON.stringify([place(from),place(to)]);
  }
  function leg(day, from, to, destination, defaultMode = 'transit') {
    const stored = day.legs?.find(x => x.fromId === from.id && x.toId === to.id);
    const stamp = signature(from, to, destination);
    const mode = MODES.includes(stored?.mode) ? stored.mode : MODES.includes(defaultMode) ? defaultMode : 'transit';
    if (stored?.signature === stamp) return {...stored, mode};
    return {fromId:from.id,toId:to.id,mode,minutes:'',bufferMinutes:stored?.bufferMinutes ?? 0,signature:stamp,invalidated:Boolean(stored)};
  }
  function putLeg(day, value) {
    day.legs = (day.legs || []).filter(x => !(x.fromId === value.fromId && x.toId === value.toId));
    const {invalidated,...clean} = value; day.legs.push(clean);
  }
  function calculate(day, destination, mode) {
    const items = ordered(day), rows = []; let cursor;
    try {
      cursor = parseTime(day.schedule?.startTime || items[0]?.time || '09:00');
      let missing = 0;
      for (let i = 1; i < items.length; i++) {
        const route = leg(day, items[i-1],items[i],destination,mode);
        if (route.minutes === '' || route.minutes === null || route.minutes === undefined) missing++;
      }
      if (missing) return {ok:false,missing,message:`尚有 ${missing} 段交通時間未填；填齊後會自動重排，現有時間暫時保留。`};
      let travelTotal = 0, stayTotal = 0;
      for (let i = 0; i < items.length; i++) {
        let travel = 0, buffer = 0;
        if (i) {
          const route = leg(day, items[i-1],items[i],destination,mode);
          travel = minutes(route.minutes,'交通時間'); buffer = minutes(route.bufferMinutes ?? 0,'緩衝時間');
          cursor += travel + buffer; travelTotal += travel + buffer;
        }
        const duration = stay(items[i]);
        if (cursor >= 1440 || cursor + duration > 1440) return {ok:false,message:'排程將跨過午夜，請提前首站時間、縮短停留，或將部分景點移至隔日；現有時間尚未變更。'};
        rows.push({id:items[i].id,arrival:cursor,departure:cursor+duration,travel,buffer,duration});
        cursor += duration; stayTotal += duration;
      }
      return {ok:true,rows,end:cursor,travelTotal,stayTotal};
    } catch(error) { return {ok:false,message:error.message}; }
  }
  function apply(day, destination, mode) {
    const plan = calculate(day,destination,mode);
    if (day.schedule?.enabled && plan.ok) {
      const times = new Map(plan.rows.map(x=>[x.id,clock(x.arrival)]));
      day.items.forEach(item=>{item.time=times.get(item.id);});
    }
    return plan;
  }
  const api = {MODES,minutes,parseTime,clock,stay,ordered,leg,putLeg,calculate,apply};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TravelSchedule = api;
})(globalThis);
