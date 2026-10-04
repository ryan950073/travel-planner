/* Pure money calculations. All balances and allocations use integer TWD cents. */
(function (root) {
  'use strict';
  const MAX_CENTS = 100000000000;
  function decimal(value, places) {
    const text = String(value).trim();
    if (!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(text)) throw new Error(`請輸入有效數字（最多 ${places} 位小數）`);
    const [whole, fraction = ''] = text.split('.');
    return BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0'));
  }
  function cents(value) {
    const result = Number(decimal(value, 2));
    if (!Number.isSafeInteger(result) || result > MAX_CENTS) throw new Error('金額過大');
    return result;
  }
  function convert(amount, rate) {
    const a = decimal(amount, 2), r = decimal(rate, 8);
    if (a <= 0n || r <= 0n) throw new Error('金額與匯率必須大於 0');
    const result = Number((a * r + 50000000n) / 100000000n);
    if (!Number.isSafeInteger(result) || result > MAX_CENTS) throw new Error('換算金額過大');
    if (result < 1) throw new Error('換算金額不足 NT$ 0.01');
    return result;
  }
  function allocate(total, memberIds, custom) {
    if (!Number.isSafeInteger(total) || total <= 0) throw new Error('無效的分攤金額');
    if (!memberIds.length || new Set(memberIds).size !== memberIds.length) throw new Error('請選擇至少一位分攤旅伴');
    if (custom) {
      const splits = memberIds.map(memberId => ({ memberId, cents: cents(custom[memberId] || '0') }));
      if (splits.reduce((s, x) => s + x.cents, 0) !== total) throw new Error('自訂分攤加總必須等於換算後的新臺幣金額');
      return splits;
    }
    const share = Math.floor(total / memberIds.length), extra = total % memberIds.length;
    return memberIds.map((memberId, index) => ({ memberId, cents: share + (index < extra ? 1 : 0) }));
  }
  function balances(members, expenses, payments) {
    const result = Object.fromEntries(members.map(m => [m.id, 0]));
    function add(id, amount) {
      if (!Object.hasOwn(result, id)) throw new Error('帳本包含不存在的旅伴，請檢查資料');
      result[id] += amount;
      if (!Number.isSafeInteger(result[id])) throw new Error('帳本金額超過計算上限');
    }
    for (const expense of expenses) {
      if (!Number.isSafeInteger(expense.totalCents) || expense.totalCents <= 0 ||
          !Array.isArray(expense.splits) || expense.splits.some(x => !Number.isSafeInteger(x.cents) || x.cents < 0) ||
          expense.splits.reduce((sum, x) => sum + x.cents, 0) !== expense.totalCents) throw new Error('消費分攤資料不完整');
      add(expense.payerId, expense.totalCents);
      expense.splits.forEach(split => add(split.memberId, -split.cents));
    }
    for (const payment of payments) {
      if (!Number.isSafeInteger(payment.cents) || payment.cents <= 0) throw new Error('還款資料不完整');
      add(payment.from, payment.cents);
      add(payment.to, -payment.cents);
    }
    return result;
  }
  function settle(balance) {
    const debtors = [], creditors = [], result = [];
    Object.entries(balance).forEach(([id, value]) => {
      if (value < 0) debtors.push({ id, amount: -value });
      if (value > 0) creditors.push({ id, amount: value });
    });
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const amount = Math.min(debtors[i].amount, creditors[j].amount);
      result.push({ from: debtors[i].id, to: creditors[j].id, cents: amount });
      debtors[i].amount -= amount; creditors[j].amount -= amount;
      if (!debtors[i].amount) i++;
      if (!creditors[j].amount) j++;
    }
    return result;
  }
  const api = { cents, convert, allocate, balances, settle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Ledger = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
