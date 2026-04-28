import { chromium } from 'playwright';
const BASE='http://localhost:3000';
const ACCESS='M2FJ9K4H';
const OUT='/Users/yanzihao/Downloads/AP Research Page/public/ap-research-deck/images';

async function api(path, opts={}){const r=await fetch(BASE+path,opts); if(!r.ok) throw new Error(path+':'+r.status); return r.json();}
async function seed(tag){await api('/api/study/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_submission_id:`seed-${tag}-${Date.now()}-${Math.random()}`,study_group:'control',data:{}})});}
async function nextArm(){const j=await api('/api/study/assign'); return Number(j.treatment_arm);} 
async function ensureArm(target){for(let i=0;i<8;i++){if(await nextArm()===target) return; await seed(target);} throw new Error('arm rotate failed '+target);} 

async function loginAndBegin(page){
 await page.goto(BASE,{waitUntil:'networkidle'});
 await page.fill('#access-code-input',ACCESS);
 await page.click('button.auth-submit');
 await page.waitForTimeout(1200);
 const cb=page.locator('input[type="checkbox"]').first(); if(await cb.count()) await cb.check();
 await page.getByRole('button',{name:/begin study/i}).click();
}

async function fillAny(page){
 await page.evaluate(()=>{
  const done=new Set();
  for(const r of Array.from(document.querySelectorAll('input[type="radio"]'))){
   if(r instanceof HTMLInputElement && r.name && !done.has(r.name)){done.add(r.name); r.click();}
  }
  for(const t of Array.from(document.querySelectorAll('textarea'))){
   if(t instanceof HTMLTextAreaElement && !t.value.trim()){
     t.value='Short response.'; t.dispatchEvent(new Event('input',{bubbles:true}));
   }
  }
 });
}

async function clickEnabled(page, re){
 const b=page.getByRole('button',{name:re}).first();
 for(let i=0;i<20;i++){
  if(await b.count() && await b.isEnabled()){await b.click(); return true;}
  await page.waitForTimeout(250);
 }
 return false;
}

async function captureControl(){
 await ensureArm(0);
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 await loginAndBegin(page);
 // Complete pre-assessment then stop at reading screen
 for(let i=0;i<14;i++){
  const txt=(await page.locator('body').innerText()).toLowerCase();
  if(txt.includes('continue to reading')) break;
  await fillAny(page);
  await clickEnabled(page,/continue|interactive module|reading|next/i);
  await page.waitForTimeout(600);
 }
 await page.screenshot({path:`${OUT}/experiment-control-reading.png`});
 await browser.close();
}

async function enterTreatmentModule(page){
 for(let i=0;i<16;i++){
  const txt=(await page.locator('body').innerText()).toLowerCase();
  if(txt.includes('scenario 1') || txt.includes('ethical use')) return;
  await fillAny(page);
  await clickEnabled(page,/interactive module|continue|next|start/i);
  await page.waitForTimeout(700);
 }
 throw new Error('could not reach scenario1');
}

async function setPrompt(page, text){
 const ta=page.locator('textarea');
 const n=await ta.count();
 if(!n) throw new Error('no textarea found');
 for(let i=0;i<n;i++){
  try{ await ta.nth(i).fill(text);}catch{}
 }
}

async function submitAndWait(page){
 if(!await clickEnabled(page,/submit/i)) throw new Error('submit button not enabled');
 await page.waitForTimeout(1600);
}

async function advance(page){
 for(let i=0;i<40;i++){
  if(await clickEnabled(page,/advance to next scenario/i)){
    await page.waitForTimeout(1000);
    return;
  }
  await page.waitForTimeout(500);
 }
 throw new Error('advance not enabled');
}

async function captureTreatment(){
 await ensureArm(1);
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 await loginAndBegin(page);
 await enterTreatmentModule(page);

 // S1
 await page.screenshot({path:`${OUT}/experiment-treatment-s1-ethical.png`});
 await setPrompt(page,'Help me understand the poem\'s tone step-by-step so I can answer on my own. Quiz me briefly after.');
 await submitAndWait(page);
 await advance(page);

 // S2
 await page.screenshot({path:`${OUT}/experiment-treatment-s2-iteration.png`});
 await setPrompt(page,'Generate one specific arguable thesis with two concrete reasons in bullet format.');
 await submitAndWait(page);
 await setPrompt(page,'Revise that thesis to be narrower and include one counterargument to address.');
 await submitAndWait(page);
 await advance(page);

 // S3
 await page.screenshot({path:`${OUT}/experiment-treatment-s3-verification.png`});
 await browser.close();
}

await captureControl();
await captureTreatment();
console.log('ok-captured');
