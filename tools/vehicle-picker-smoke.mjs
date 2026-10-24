// Fast real-browser smoke of the picker. Does not run the 489+106 scenario suites.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium} from 'playwright-core';

const url='http://127.0.0.1:4177/';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4177','--strictPort'],{stdio:'ignore'});
let browser;
async function ready(){
  for(let i=0;i<80;i++){
    if(server.exitCode!==null)throw Error('Vite exited before tests');
    try{const r=await fetch(url);if(r.ok)return;}catch{}
    await sleep(250);
  }
  throw Error('Vite did not start');
}
async function main(){
  await ready();
  browser=await chromium.launch({channel:'chrome',headless:true,args:[
    '--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'
  ]});
  const page=await browser.newPage({viewport:{width:1300,height:850}});
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#vehiclePickerToggle').waitFor({timeout:20000});
  await page.locator('#vehiclePickerToggle').click();
  const panel=page.locator('#vehiclePickerPanel');
  assert.equal(await panel.isVisible(),true);
  assert.equal(await page.locator('#vehiclePickerList button[data-vehicle-id]').count(),19);
  await page.locator('#vehiclePickerSearch').fill('Mercedes');
  assert.equal(await page.locator('#vehiclePickerList button[data-vehicle-id]').count(),2);
  await page.locator('[data-vehicle-id="parked-mercedes-gla-x156"]').click();
  assert.match(await page.locator('#vehiclePickerName').innerText(),/GLA X156/);
  assert.match(await page.locator('#vehiclePickerSeats').innerText(),/Свободно 4 из 4/);
  assert.equal(await page.locator('[data-vehicle-id="parked-mercedes-gla-x156"]').getAttribute('aria-pressed'),'true');
  await page.locator('#vehiclePickerLook').click();
  assert.match(await page.locator('#vehiclePickerLook').innerText(),/Вернуться/);
  await page.waitForTimeout(180);
  assert.equal(await page.locator('#vehiclePickerWorldmark').isVisible(),true);
  await page.keyboard.press('Escape');
  assert.equal(await panel.isVisible(),false);
  await page.locator('#vehiclePickerToggle').click();
  await page.locator('#vehiclePickerClear').click();
  assert.equal(await page.locator('#vehiclePickerSelected').isVisible(),false);
  assert.equal(await page.locator('#vehiclePickerWorldmark').isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('PASS vehicle picker: 19 entries, search, seats, marker, camera peek, close, clear, no page exceptions');
}
try{await main();}catch(error){console.error(error);process.exitCode=1;}
finally{await browser?.close();server.kill('SIGTERM');}
