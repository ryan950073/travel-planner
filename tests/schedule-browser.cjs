const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
let stored={title:'東京旅行',destination:'東京',startDate:'2026-10-05',days:[{id:'d1',items:[{id:'a',title:'淺草寺',time:'09:00',showPhoto:false},{id:'b',title:'東京晴空塔',time:'14:00',showPhoto:false},{id:'c',title:'上野公園',time:'17:00',showPhoto:false}]}]},revision=1;
await page.route('**/rest/v1/rpc/*',async r=>{if(r.request().url().endsWith('trip_get'))return r.fulfill({json:{trip:stored,revision}});stored=r.request().postDataJSON().p_data;await r.fulfill({json:{status:'updated',revision:++revision}});});
await page.goto((process.env.TEST_URL||'http://127.0.0.1:8765')+'/?trip=test#key=test-key');
await page.waitForSelector('.route-leg');
const times=()=>page.locator('.item-time').allTextContents();
assert.deepEqual(await times(),['09:00','14:00','17:00']);assert.equal(await page.locator('#autoSchedule').isChecked(),false);
await page.locator('#autoSchedule').check();assert.match(await page.locator('#scheduleStatus').innerText(),/2 段/);
async function minutes(i,key,value){const input=page.locator('.route-leg').nth(i).locator(`[data-field="${key}"]`);await input.fill(value);await input.dispatchEvent('change');}
await minutes(0,'minutes','20');await minutes(0,'bufferMinutes','10');await minutes(1,'minutes','15');
assert.deepEqual(await times(),['09:00','10:30','11:45']);
await page.locator('[aria-label="編輯 淺草寺"]').click();assert.equal(await page.locator('#itemTime').getAttribute('readonly'),'');await page.locator('#itemDuration').fill('90');await page.locator('#itemForm [type=submit]').click();
assert.deepEqual(await times(),['09:00','11:00','12:15']);
await page.locator('#dayStartTime').fill('08:00');await page.locator('#dayStartTime').dispatchEvent('change');assert.deepEqual(await times(),['08:00','10:00','11:15']);
await page.locator('.route-leg select').first().selectOption('walking');assert.match(await page.locator('#scheduleStatus').innerText(),/1 段/);assert.equal(await page.locator('.route-leg [data-field="minutes"]').first().inputValue(),'');
const url=new URL(await page.locator('.route-query').first().getAttribute('href'));assert.equal(url.searchParams.get('origin'),'東京 淺草寺');assert.equal(url.searchParams.get('destination'),'東京 東京晴空塔');assert.equal(url.searchParams.get('travelmode'),'walking');assert.equal(url.hash,'');
await minutes(0,'minutes','30');assert.deepEqual(await times(),['08:00','10:10','11:25']);
await page.locator('#saveBtn').click();await page.waitForFunction(()=>document.getElementById('saveState').textContent==='已儲存');await page.reload();await page.waitForSelector('.route-leg');assert.equal(await page.locator('#autoSchedule').isChecked(),true);assert.deepEqual(await times(),['08:00','10:10','11:25']);assert.equal(stored.days[0].items[0].durationMinutes,90);
await page.locator('#dayStartTime').fill('23:00');await page.locator('#dayStartTime').dispatchEvent('change');assert.match(await page.locator('#scheduleStatus').innerText(),/跨過午夜/);assert.deepEqual(await times(),['08:00待重排','10:10待重排','11:25待重排']);
await page.locator('#dayStartTime').fill('08:00');await page.locator('#dayStartTime').dispatchEvent('change');
await page.locator('[aria-label="往前移 上野公園"]').click();assert.match(await page.locator('#scheduleStatus').innerText(),/2 段/);assert.deepEqual(await page.locator('.item-content > strong').allTextContents(),['淺草寺','上野公園','東京晴空塔']);
await minutes(0,'minutes','10');await minutes(1,'minutes','25');assert.deepEqual(await times(),['08:00','09:40','11:05']);
await page.locator('[aria-label="編輯 上野公園"]').click();await page.locator('#itemAddress').fill('東京都台東区上野公園');await page.locator('#itemForm [type=submit]').click();assert.match(await page.locator('#scheduleStatus').innerText(),/2 段/);
await minutes(0,'minutes','15');await minutes(1,'minutes','20');await page.locator('[aria-label="刪除 上野公園"]').click();assert.equal(await page.locator('.route-leg').count(),1);assert.deepEqual(await times(),['08:00','10:10']);
for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);}
await page.locator('#autoSchedule').uncheck();await page.locator('[aria-label="編輯 東京晴空塔"]').click();assert.equal(await page.locator('#itemTime').getAttribute('readonly'),null);await page.locator('#cancelItem').click();assert.deepEqual(errors,[]);
await browser.close();console.log('Schedule browser checks passed: per-leg URLs, rescheduling, editing, missing durations, midnight, reorder/delete, location invalidation, save/reload, manual mode and responsive layout.');
})().catch(e=>{console.error(e);process.exit(1);});
