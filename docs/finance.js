/* Ledger UI shares the trip document, revision checks and save action in app.js. */
'use strict';
const CURRENCIES = { TWD: '新臺幣', JPY: '日圓', USD: '美元', EUR: '歐元', KRW: '韓元', HKD: '港幣', CNY: '人民幣', GBP: '英鎊', SGD: '新加坡幣', THB: '泰銖', AUD: '澳幣', CAD: '加幣', VND: '越南盾', MYR: '馬來西亞令吉' };
const formatCents = (value, currency = 'TWD') => `${currency === 'TWD' ? 'NT$' : currency} ${(value / 100).toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
let editingExpense = null, expenseRateMeta = { source: 'manual', date: '' }, expenseRequest = 0, fxRequest = 0;
function ensureLedger() {
  // Old trip documents have no ledger fields; preserve all itinerary data.
  for (const key of ['members', 'expenses', 'payments']) {
    if (trip[key] === undefined) trip[key] = [];
    if (!Array.isArray(trip[key])) throw new Error('帳本格式不正確，請先保留原始資料');
  }
}
function memberName(id) { return trip.members.find(m => m.id === id)?.name || '未知旅伴'; }
function button(label, action, className = 'button button-quiet') {
  const el = textNode('button', className, label); el.type = 'button'; el.addEventListener('click', action); return el;
}
function emptyState(target, title, description) {
  const box = textNode('div', 'empty ledger-empty', '');
  box.append(textNode('strong', '', title), textNode('p', '', description)); target.append(box);
}
function ledgerChanged() { markDirty(); renderFinance(); }
function showView(name) {
  document.querySelectorAll('[data-view]').forEach(el => {
    const active = el.dataset.view === name; el.classList.toggle('active', active); el.setAttribute('aria-pressed', String(active));
  });
  for (const view of ['itinerary', 'ledger', 'exchange']) $(`view-${view}`).hidden = view !== name;
}
document.querySelectorAll('[data-view]').forEach(el => el.addEventListener('click', () => showView(el.dataset.view)));
$('dayNav').addEventListener('click', () => showView('itinerary'));
$('addDayBtn').addEventListener('click', () => showView('itinerary'));
for (const id of ['expenseCurrency', 'fxFrom', 'fxTo']) {
  for (const [code, name] of Object.entries(CURRENCIES)) {
    const option = textNode('option', '', `${code} · ${name}`); option.value = code; $(id).append(option);
  }
}
$('fxFrom').value = 'JPY'; $('fxTo').value = 'TWD';
function renderFinance() {
  try {
    ensureLedger();
    const balance = Ledger.balances(trip.members, trip.expenses, trip.payments);
    const transfers = Ledger.settle(balance);
    const total = trip.expenses.reduce((sum, x) => sum + x.totalCents, 0);
    $('actualTotal').textContent = formatCents(total);
    $('expenseCount').textContent = `${trip.expenses.length} 筆消費 · ${trip.members.length} 位旅伴`;
    $('pendingTotal').textContent = formatCents(transfers.reduce((sum, x) => sum + x.cents, 0));
    const budget = Number(trip.budget) || 0, remaining = Math.round(budget * 100) - total;
    $('actualRemaining').textContent = budget > 0 ? (remaining < 0 ? `超支 ${formatCents(-remaining)}` : formatCents(remaining)) : '未設定';
    $('actualRemaining').classList.toggle('negative', remaining < 0 && budget > 0);
    const members = $('memberList'); members.replaceChildren();
    if (!trip.members.length) members.append(textNode('p', 'muted', '先加入自己與同行旅伴，即可開始記帳。'));
    for (const member of trip.members) {
      const chip = textNode('div', 'member-chip', ''); chip.append(textNode('span', 'avatar', member.name.slice(0, 1)), textNode('span', '', member.name));
      const remove = button('×', () => {
        const used = trip.expenses.some(e => e.payerId === member.id || e.splits.some(s => s.memberId === member.id)) || trip.payments.some(p => p.from === member.id || p.to === member.id);
        if (used) { notice('這位旅伴已有消費或還款紀錄，無法刪除。'); return; }
        if (!confirm(`移除旅伴「${member.name}」？`)) return;
        trip.members = trip.members.filter(m => m.id !== member.id); ledgerChanged();
      }, 'icon-button'); remove.setAttribute('aria-label', `移除旅伴 ${member.name}`); chip.append(remove); members.append(chip);
    }
    const expenses = $('expenseList'); expenses.replaceChildren();
    if (!trip.expenses.length) emptyState(expenses, '第一筆旅行，從這裡記起。', '新增消費後，可查看付款人、幣別與分攤明細。');
    for (const expense of [...trip.expenses].sort((a, b) => b.date.localeCompare(a.date))) {
      const row = textNode('article', 'expense-record', '');
      const heading = textNode('div', 'record-heading', '');
      const info = textNode('div', '', ''); info.append(textNode('small', 'muted', `${expense.date} / ${expense.category}`), textNode('h3', '', expense.title));
      const amount = textNode('div', 'record-amount', ''); amount.append(textNode('strong', '', formatCents(expense.totalCents)), textNode('small', 'muted', `${expense.currency} ${expense.amount}`)); heading.append(info, amount); row.append(heading);
      row.append(textNode('p', 'muted small', `${memberName(expense.payerId)} 付款 · 1 ${expense.currency} = ${expense.rate} TWD`));
      const details = document.createElement('details'); details.append(textNode('summary', '', '分攤與匯率明細'));
      expense.splits.forEach(s => details.append(textNode('p', 'split-detail', `${memberName(s.memberId)}：${formatCents(s.cents)}`)));
      details.append(textNode('p', 'muted small', expense.currency === 'TWD' ? '新臺幣原幣入帳' : (expense.rateSource === 'Frankfurter' ? `Frankfurter 每日參考匯率 · ${expense.rateDate}` : '手動入帳匯率')));
      if (expense.note) details.append(textNode('p', 'record-note', expense.note)); row.append(details);
      const actions = textNode('div', 'record-actions', '');
      actions.append(button('編輯', () => openExpense(expense)), button('刪除', () => {
        if (!confirm(`刪除「${expense.title}」？分帳金額會重新計算，已有還款會保留。`)) return;
        trip.expenses = trip.expenses.filter(e => e.id !== expense.id); ledgerChanged();
      })); row.append(actions); expenses.append(row);
    }
    const balances = $('balanceList'); balances.replaceChildren();
    for (const member of trip.members) {
      const value = balance[member.id], row = textNode('div', 'balance-row', '');
      row.append(textNode('span', '', member.name), textNode('strong', value > 0 ? 'positive' : value < 0 ? 'negative' : 'muted', value === 0 ? '已平衡' : `${value > 0 ? '應收' : '應付'} ${formatCents(Math.abs(value))}`)); balances.append(row);
    }
    const settlements = $('settlementList'); settlements.replaceChildren();
    if (!transfers.length) emptyState(settlements, trip.expenses.length ? '目前帳款已平衡' : '等待第一筆消費', '分攤後的還款建議會顯示在這裡。');
    for (const transfer of transfers) {
      const row = textNode('div', 'transfer-card', '');
      row.append(textNode('p', '', `${memberName(transfer.from)} → ${memberName(transfer.to)}`), textNode('strong', '', formatCents(transfer.cents)), button('標記已還款', () => {
        if (!confirm(`確認 ${memberName(transfer.from)} 已還給 ${memberName(transfer.to)} ${formatCents(transfer.cents)}？`)) return;
        trip.payments.push({ id: makeId(), ...transfer, date: today() }); ledgerChanged();
      }, 'button button-outline')); settlements.append(row);
    }
    const payments = $('paymentList'); payments.replaceChildren();
    if (!trip.payments.length) payments.append(textNode('p', 'muted small', '尚無還款紀錄。'));
    for (const payment of [...trip.payments].reverse()) {
      const row = textNode('div', 'payment-record', ''); row.append(textNode('p', '', `${payment.date} · ${memberName(payment.from)} → ${memberName(payment.to)}`), textNode('strong', '', formatCents(payment.cents)), button('撤銷', () => {
        if (!confirm('撤銷這筆還款紀錄？')) return;
        trip.payments = trip.payments.filter(p => p.id !== payment.id); ledgerChanged();
      })); payments.append(row);
    }
  } catch (error) { notice(error.message); }
}
$('memberForm').addEventListener('submit', event => {
  event.preventDefault(); ensureLedger(); const name = $('memberName').value.trim();
  if (!name) return;
  if (trip.members.length >= 30) { notice('最多可加入 30 位旅伴。'); return; }
  if (trip.members.some(m => m.name === name)) { notice('已有同名旅伴，請使用暱稱區分。'); return; }
  trip.members.push({ id: makeId(), name }); $('memberName').value = ''; ledgerChanged();
});
function updateConverted() {
  try { $('expenseConverted').textContent = `換算金額：${formatCents(Ledger.convert($('expenseAmount').value, $('expenseRate').value))}`; }
  catch { $('expenseConverted').textContent = '換算金額：—'; }
}
function toggleSplitInputs() {
  const custom = $('splitMode').value === 'custom';
  $('splitMembers').querySelectorAll('.split-member').forEach(row => {
    const selected = row.querySelector('[type=checkbox]').checked, input = row.querySelector('[type=number]');
    input.hidden = !custom; input.disabled = !custom || !selected; input.required = custom && selected;
  });
}
function openExpense(expense = null) {
  ensureLedger();
  if (!trip.members.length) { showView('ledger'); $('memberName').focus(); notice('請先加入付款人與分攤旅伴。'); return; }
  expenseRequest++; editingExpense = expense?.id || null;
  $('expenseDialogTitle').textContent = expense ? '編輯消費' : '記一筆消費';
  $('expenseDate').value = expense?.date || today(); $('expenseTitle').value = expense?.title || '';
  $('expenseCategory').value = expense?.category || '餐飲'; $('expenseAmount').value = expense?.amount || '';
  $('expenseCurrency').value = expense?.currency || 'TWD'; $('expenseRate').value = expense?.rate || '1';
  $('expenseRate').readOnly = $('expenseCurrency').value === 'TWD';
  $('fetchExpenseRate').disabled = $('expenseCurrency').value === 'TWD';
  expenseRateMeta = { source: expense?.rateSource || 'manual', date: expense?.rateDate || '' };
  $('expenseRateStatus').textContent = $('expenseCurrency').value === 'TWD' ? '新臺幣無須換算。' : (expense?.rateSource === 'Frankfurter' ? `Frankfurter · 資料日期 ${expense.rateDate}（已固定入帳）` : '手動入帳匯率');
  $('expenseNote').value = expense?.note || ''; $('splitMode').value = expense?.splitMode || 'equal'; $('expenseError').textContent = '';
  $('expensePayer').replaceChildren(); $('splitMembers').replaceChildren();
  for (const member of trip.members) {
    const option = textNode('option', '', member.name); option.value = member.id; $('expensePayer').append(option);
    const row = textNode('div', 'split-member', ''), label = document.createElement('label'), checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.value = member.id; checkbox.checked = expense ? expense.splits.some(s => s.memberId === member.id) : true;
    label.append(checkbox, document.createTextNode(member.name));
    const amount = document.createElement('input'); amount.type = 'number'; amount.min = '0'; amount.step = '0.01'; amount.placeholder = '新臺幣金額'; amount.dataset.memberId = member.id; amount.setAttribute('aria-label', `${member.name} 分攤金額（新臺幣）`);
    const split = expense?.splits.find(s => s.memberId === member.id); amount.value = split ? (split.cents / 100).toFixed(2) : '';
    checkbox.addEventListener('change', toggleSplitInputs); row.append(label, amount); $('splitMembers').append(row);
  }
  if (expense) $('expensePayer').value = expense.payerId;
  toggleSplitInputs(); updateConverted(); $('expenseDialog').showModal(); $('expenseTitle').focus();
}
$('addExpenseBtn').addEventListener('click', () => openExpense());
for (const id of ['closeExpense', 'cancelExpense']) $(id).addEventListener('click', () => $('expenseDialog').close());
$('expenseDialog').addEventListener('close', () => { expenseRequest++; });
$('splitMode').addEventListener('change', toggleSplitInputs);
$('expenseAmount').addEventListener('input', updateConverted);
$('expenseRate').addEventListener('input', () => {
  expenseRequest++; $('fetchExpenseRate').disabled = $('expenseCurrency').value === 'TWD';
  expenseRateMeta = { source: 'manual', date: '' }; $('expenseRateStatus').textContent = '手動入帳匯率'; updateConverted();
});
$('expenseCurrency').addEventListener('change', () => {
  expenseRequest++; const domestic = $('expenseCurrency').value === 'TWD';
  $('expenseRate').value = domestic ? '1' : ''; $('expenseRate').readOnly = domestic; $('fetchExpenseRate').disabled = domestic;
  expenseRateMeta = { source: 'manual', date: '' }; $('expenseRateStatus').textContent = domestic ? '新臺幣無須換算。' : '請取得參考匯率或手動輸入入帳匯率。'; updateConverted();
});
async function fetchRate(from, to) {
  if (from === to) return { rate: '1', date: today() };
  const response = await fetch(`https://api.frankfurter.dev/v2/rate/${from}/${to}`, { signal: AbortSignal.timeout(10000), credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error('匯率服務暫時無法使用');
  const data = await response.json();
  if (data.base !== from || data.quote !== to || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !Number.isFinite(data.rate) || data.rate <= 0) throw new Error('收到無效匯率');
  const rate = data.rate.toFixed(8).replace(/\.?0+$/, '');
  if (!(Number(rate) > 0)) throw new Error('匯率低於支援精度，請手動輸入');
  return { rate, date: data.date };
}
$('fetchExpenseRate').addEventListener('click', async () => {
  const request = ++expenseRequest, currency = $('expenseCurrency').value;
  $('fetchExpenseRate').disabled = true; $('expenseRateStatus').textContent = '查詢匯率中…';
  try {
    const data = await fetchRate(currency, 'TWD');
    if (request !== expenseRequest) return;
    $('expenseRate').value = data.rate; expenseRateMeta = { source: 'Frankfurter', date: data.date };
    $('expenseRateStatus').textContent = `Frankfurter · 資料日期 ${data.date} · 每日參考匯率`;
    updateConverted();
  } catch {
    if (request === expenseRequest) $('expenseRateStatus').textContent = '無法取得最新匯率。原有數值保留，可手動輸入入帳匯率。';
  } finally { if (request === expenseRequest) $('fetchExpenseRate').disabled = currency === 'TWD'; }
});
$('expenseForm').addEventListener('submit', event => {
  event.preventDefault(); $('expenseError').textContent = '';
  try {
    const title = $('expenseTitle').value.trim(); if (!title) throw new Error('請填寫消費名稱');
    const amount = $('expenseAmount').value, currency = $('expenseCurrency').value, rate = currency === 'TWD' ? '1' : $('expenseRate').value;
    const totalCents = Ledger.convert(amount, rate);
    const selected = [...$('splitMembers').querySelectorAll('[type=checkbox]:checked')].map(el => el.value);
    const custom = $('splitMode').value === 'custom' ? Object.fromEntries([...$('splitMembers').querySelectorAll('[type=number]')].map(el => [el.dataset.memberId, el.value])) : null;
    const payerId = $('expensePayer').value;
    if (!trip.members.some(m => m.id === payerId)) throw new Error('請選擇付款人');
    const expense = { id: editingExpense || makeId(), title, date: $('expenseDate').value, category: $('expenseCategory').value, amount, currency, rate, rateSource: expenseRateMeta.source, rateDate: expenseRateMeta.date, totalCents, payerId, splitMode: $('splitMode').value, splits: Ledger.allocate(totalCents, selected, custom), note: $('expenseNote').value.trim() };
    if (editingExpense) trip.expenses = trip.expenses.map(e => e.id === editingExpense ? expense : e);
    else trip.expenses.push(expense);
    $('expenseDialog').close(); ledgerChanged();
  } catch (error) { $('expenseError').textContent = error.message; }
});
function resetFx() {
  fxRequest++; const same = $('fxFrom').value === $('fxTo').value;
  $('fxRate').value = same ? '1' : ''; $('fxRate').readOnly = same; $('fetchFxBtn').disabled = same;
  $('fxStatus').textContent = same ? '相同幣別，匯率為 1。' : '幣別已切換，請重新取得或輸入匯率。'; $('fxResult').textContent = '—';
}
$('fxFrom').addEventListener('change', resetFx); $('fxTo').addEventListener('change', resetFx);
$('fxAmount').addEventListener('input', () => { $('fxResult').textContent = '—'; });
$('fxRate').addEventListener('input', () => { fxRequest++; $('fetchFxBtn').disabled = $('fxFrom').value === $('fxTo').value; $('fxStatus').textContent = '使用手動匯率'; $('fxResult').textContent = '—'; });
$('fetchFxBtn').addEventListener('click', async () => {
  const request = ++fxRequest, from = $('fxFrom').value, to = $('fxTo').value;
  $('fetchFxBtn').disabled = true; $('fxStatus').textContent = '查詢匯率中…'; $('fxResult').textContent = '—';
  try {
    const data = await fetchRate(from, to); if (request !== fxRequest) return;
    $('fxRate').value = data.rate; $('fxStatus').textContent = `Frankfurter · 資料日期 ${data.date} · 每日參考匯率`;
  } catch { if (request === fxRequest) $('fxStatus').textContent = '無法取得最新匯率。原有數值保留，可手動輸入。'; }
  finally { if (request === fxRequest) $('fetchFxBtn').disabled = false; }
});
$('exchangeForm').addEventListener('submit', event => {
  event.preventDefault();
  try { $('fxResult').textContent = formatCents(Ledger.convert($('fxAmount').value, $('fxRate').value), $('fxTo').value); }
  catch (error) { $('fxResult').textContent = error.message; }
});
document.addEventListener('triprender', () => { expenseRequest++; renderFinance(); });
$('budget').addEventListener('input', renderFinance);
renderFinance();
