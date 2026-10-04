// Run against a local HTTP server: TEST_URL=http://127.0.0.1:8765 node tests/browser.cjs
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.TEST_URL || 'http://127.0.0.1:8765';
(async () => {
 const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH || undefined, args:['--no-sandbox','--disable-dev-shm-usage']});
 const page = await browser.newPage({viewport:{width:1440,height:1080}});
 const errors = []; page.on('pageerror', e=>errors.push(e.message)); page.on('dialog', d=>d.accept());
 const oldTrip = {title:'東京・城市漫遊',destination:'東京 TOKYO / JAPAN',startDate:'2026-11-05',budget:'30000',transport:'羽田機場 → 東京市區',stay:'東京車站周邊・3 晚',transportCost:'2000',stayCost:'12000',days:[{id:'d1',items:[{id:'i1',time:'09:00',title:'淺草寺與仲見世通',type:'景點',amount:'500',note:'從雷門出發，散步到隅田川。'}]}]};
 let stored=structuredClone(oldTrip), revision=1, conflict=false, holdSave=null;
 await page.route('**/rest/v1/rpc/*', async route=>{
  const method=route.request().url().split('/').pop(), body=route.request().postDataJSON();
  let response;
  if(method==='trip_get') response={trip:stored,revision};
  if(method==='trip_update') {
   if(conflict) response={status:'conflict'};
   else {stored=structuredClone(body.p_data); revision++; response={status:'updated',revision};}
   if(holdSave) await holdSave;
  }
  if(method==='trip_create') {stored=structuredClone(body.p_data);response={id:'test-id',token:'test-token',revision:1};}
  await route.fulfill({json:response});
 });
 let fxMode='success';
 await page.route('https://api.frankfurter.dev/**', async route=>{
  const [from,to]=route.request().url().split('/').slice(-2);
  if(fxMode==='failure') return route.fulfill({status:503,json:{}});
  if(fxMode==='delay') await new Promise(r=>setTimeout(r,250));
  await route.fulfill({json:{base:from,quote:to,rate:0.215,date:'2026-10-02'}});
 });
 await page.goto(`${base}/?trip=old#key=test`);
 await page.waitForFunction(()=>document.getElementById('saveState').textContent==='已載入共用行程');
 assert.equal(await page.locator('#tripTitle').inputValue(),oldTrip.title);
 assert.match(await page.locator('#items').innerText(),/淺草寺/);
 await page.screenshot({path:'/tmp/travel-itinerary-desktop.png',fullPage:true});
 await page.locator('[data-view=ledger]').click();
 await page.locator('#addExpenseBtn').click();
 assert.equal(await page.locator('#expenseDialog').evaluate(e=>e.open),false);
 for(const name of ['明諺','小宇','阿哲']){await page.locator('#memberName').fill(name);await page.locator('#memberForm [type=submit]').click();}
 await page.locator('#addExpenseBtn').click();
 await page.locator('#expenseTitle').fill('東京車站晚餐');await page.locator('#expenseAmount').fill('1000');
 await page.locator('#expenseCurrency').selectOption('JPY');await page.locator('#fetchExpenseRate').click();
 await page.waitForFunction(()=>document.getElementById('expenseRate').value==='0.215');
 await page.locator('#expenseForm [type=submit]').click();
 assert.equal(await page.locator('#actualTotal').innerText(),'NT$ 215.00');
 assert.equal(await page.locator('#pendingTotal').innerText(),'NT$ 143.33');
 await page.locator('#expenseList summary').click();
 assert.match(await page.locator('#expenseList').innerText(),/71.67/);
 await page.locator('#expenseList').getByRole('button',{name:'編輯',exact:true}).click();
 await page.locator('#splitMode').selectOption('custom');
 const custom=page.locator('#splitMembers input[type=number]');
 await custom.nth(0).fill('100');await custom.nth(1).fill('50');await custom.nth(2).fill('50');
 await page.locator('#expenseForm [type=submit]').click();
 assert.match(await page.locator('#expenseError').innerText(),/加總必須等於/);
 await custom.nth(2).fill('65');await page.locator('#expenseForm [type=submit]').click();
 assert.equal(await page.locator('#pendingTotal').innerText(),'NT$ 115.00');
 await page.locator('#settlementList').getByRole('button',{name:'標記已還款'}).first().click();
 assert.equal(await page.locator('#pendingTotal').innerText(),'NT$ 65.00');
 await page.locator('#paymentList').getByRole('button',{name:'撤銷'}).click();
 assert.equal(await page.locator('#pendingTotal').innerText(),'NT$ 115.00');
 // More expenses demonstrate multi-payer and selected participant allocations.
 await page.locator('#addExpenseBtn').click();await page.locator('#expenseTitle').fill('機場接駁車');await page.locator('#expenseAmount').fill('600');
 await page.locator('#expenseCategory').selectOption('交通');await page.locator('#expensePayer').selectOption({label:'小宇'});
 await page.locator('#splitMembers input[type=checkbox]').nth(2).uncheck();
 await page.locator('#expenseForm [type=submit]').click();
 assert.equal(await page.locator('#actualTotal').innerText(),'NT$ 815.00');
 await page.locator('#memberList [aria-label="移除旅伴 明諺"]').click();
 assert.equal(await page.locator('.member-chip').count(),3);
 await page.locator('#saveBtn').click();await page.waitForFunction(()=>document.getElementById('saveState').textContent==='已儲存');
 assert.equal(stored.expenses.length,2);assert.equal(stored.days[0].items[0].title,oldTrip.days[0].items[0].title);
 await page.reload();await page.waitForFunction(()=>document.getElementById('saveState').textContent==='已載入共用行程');
 await page.locator('[data-view=ledger]').click();assert.equal(await page.locator('#actualTotal').innerText(),'NT$ 815.00');
 assert.equal(stored.expenses[0].rate,'0.215');
 await page.screenshot({path:'/tmp/travel-ledger-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'/tmp/travel-ledger-mobile.png',fullPage:true});
 await page.locator('#addExpenseBtn').click();
 assert.ok(await page.locator('#expenseDialog').evaluate(e=>e.scrollWidth<=e.clientWidth));
 await page.screenshot({path:'/tmp/travel-expense-mobile.png'});
 await page.locator('#cancelExpense').click();
 // A save conflict must retain the unsaved local edits.
 await page.locator('#tripTitle').fill('東京・更新內容');conflict=true;
 await page.locator('#saveBtn').click();await page.waitForFunction(()=>document.getElementById('saveState').textContent==='有新的共同編輯內容');
 assert.equal(await page.locator('#tripTitle').inputValue(),'東京・更新內容');conflict=false;
 // Changes made while saving must remain dirty and not be falsely marked saved.
 let release;holdSave=new Promise(r=>release=r);
 await page.locator('#saveBtn').click();await page.locator('#tripTitle').fill('儲存期間新增的修改');release();holdSave=null;
 await page.waitForFunction(()=>document.getElementById('saveState').textContent==='尚未儲存的變更');
 assert.equal(stored.title,'東京・更新內容');
 await page.locator('[data-view=exchange]').click();
 await page.locator('#fetchFxBtn').click();await page.waitForFunction(()=>document.getElementById('fxRate').value==='0.215');
 await page.locator('#exchangeForm [type=submit]').click();assert.equal(await page.locator('#fxResult').innerText(),'NT$ 215.00');
 fxMode='failure';await page.locator('#fetchFxBtn').click();await page.waitForFunction(()=>document.getElementById('fxStatus').textContent.includes('無法取得'));
 await page.locator('#fxRate').fill('0.2');await page.locator('#exchangeForm [type=submit]').click();assert.equal(await page.locator('#fxResult').innerText(),'NT$ 200.00');
 // Late requests cannot overwrite a newly selected currency or a manual rate.
 fxMode='delay';await page.locator('#fetchFxBtn').click();await page.locator('#fxFrom').selectOption('USD');
 await page.waitForTimeout(400);assert.equal(await page.locator('#fxRate').inputValue(),'');
 await page.locator('#fxFrom').selectOption('TWD');assert.equal(await page.locator('#fxRate').inputValue(),'1');
 await page.locator('#exchangeForm [type=submit]').click();assert.equal(await page.locator('#fxResult').innerText(),'NT$ 1,000.00');
 await page.setViewportSize({width:320,height:740});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('[data-view=itinerary]').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('#addItemBtn').click();await page.locator('#itemTitle').fill('新增行程測試');await page.locator('#itemForm [type=submit]').click();
 assert.match(await page.locator('#items').innerText(),/新增行程測試/);
 await page.locator('[data-view=ledger]').click();
 await page.locator('#expenseList').getByRole('button',{name:'刪除',exact:true}).first().click();
 assert.equal(await page.locator('#actualTotal').innerText(),'NT$ 600.00');
 await page.locator('#memberName').fill('尚未分攤的旅伴');await page.locator('#memberForm [type=submit]').click();
 await page.locator('#memberList [aria-label="移除旅伴 尚未分攤的旅伴"]').click();
 assert.equal(await page.locator('.member-chip').count(),3);
 assert.deepEqual(errors,[]);
 console.log('Browser checks passed: legacy trips, CRUD, custom split validation, repayments, persistence, conflicts, save race, exchange fallback/race, mobile layouts and itinerary.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
