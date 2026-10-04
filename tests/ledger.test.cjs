const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../docs/ledger-core.js');
test('decimal conversion rounds once, with no binary float loss', () => {
  assert.equal(L.convert('1000', '0.215'), 21500);
  assert.equal(L.convert('1.00', '1.005'), 101);
  assert.equal(L.convert('0.29', '1'), 29);
  for (const args of [['1','0'],['-1','1'],['Infinity','1'],['1','NaN'],['1','1e3'],['1.001','1'],['0.01','0.001']]) assert.throws(() => L.convert(...args));
});
test('equal allocation preserves every cent, including when total is smaller than crew', () => {
  assert.deepEqual(L.allocate(10000, ['a','b','c']).map(x => x.cents), [3334,3333,3333]);
  assert.deepEqual(L.allocate(1, ['a','b','c']).map(x => x.cents), [1,0,0]);
  assert.throws(() => L.allocate(100, []));
});
test('custom allocation validates exact total', () => {
  assert.deepEqual(L.allocate(10000, ['a','b'], { a:'30.25',b:'69.75' }).map(x => x.cents), [3025,6975]);
  assert.throws(() => L.allocate(10000, ['a','b'], { a:'30',b:'60' }));
  assert.throws(() => L.allocate(10000, ['a','b'], { a:'-1',b:'101' }));
});
test('multiple payers, selected members, repayments and undo conserve balance', () => {
  const members = ['a','b','c'].map(id => ({id}));
  const expenses = [{payerId:'a',totalCents:10000,splits:L.allocate(10000,['a','b','c'])},{payerId:'b',totalCents:3000,splits:L.allocate(3000,['b','c'])}];
  const balance = L.balances(members, expenses, []);
  assert.deepEqual(balance, {a:6666,b:-1833,c:-4833});
  const transfers = L.settle(balance);
  assert.deepEqual(L.balances(members, expenses, transfers), {a:0,b:0,c:0});
  assert.deepEqual(L.balances(members, expenses, []), balance);
  assert.equal(Object.values(balance).reduce((a,b)=>a+b),0);
});
test('removing an expense after settlement produces a refund suggestion', () => {
  const members = [{id:'a'},{id:'b'}];
  const balance = L.balances(members, [], [{from:'b',to:'a',cents:5000}]);
  assert.deepEqual(L.settle(balance), [{from:'a',to:'b',cents:5000}]);
});
test('invalid stored splits and unknown members cannot silently corrupt balances', () => {
  assert.throws(() => L.balances([{id:'a'}], [{payerId:'a',totalCents:100,splits:[{memberId:'a',cents:99}]}], []));
  assert.throws(() => L.balances([{id:'a'}], [{payerId:'b',totalCents:100,splits:[{memberId:'a',cents:100}]}], []));
});
