import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const ACCESS_CODE = 'M2FJ9K4H';
const OUT = '/Users/yanzihao/Downloads/AP Research Page/public/ap-research-deck/images';

async function api(path, opts={}) {
  const r = await fetch(`${BASE}${path}`, opts);
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

async function nextArm() {
  const j = await api('/api/study/assign');
  return Number(j.treatment_arm);
}

async function seedOne(id) {
  await api('/api/study/submit', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ client_submission_id: id, study_group: 'control', data: {} })
  });
}

async function ensureNextArm(target) {
  for (let i=0;i<8;i++) {
    const arm = await nextArm();
    if (arm === target) return arm;
    await seedOne(`seed-${target}-${Date.now()}-${i}`);
  }
  throw new Error(`Could not rotate to arm ${target}`);
}

async function clickEnabledByName(page, re, timeout=15000) {
  const start = Date.now();
  while (Date.now()-start < timeout) {
    const btns = page.getByRole('button', { name: re });
    const n = await btns.count();
    for (let i=0;i<n;i++) {
      const b = btns.nth(i);
      try {
        if (await b.isVisible() && await b.isEnabled()) {
          await b.click({timeout: 1000});
          return true;
        }
      } catch {}
    }
    await page.waitForTimeout(250);
  }
  return false;
}

async function login(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#access-code-input', { timeout: 15000 });

  for (let i=0;i<6;i++) {
    await page.fill('#access-code-input', ACCESS_CODE);
    const val = await page.inputValue('#access-code-input');
    if (val.trim() === ACCESS_CODE) break;
    await page.waitForTimeout(200);
  }

  const clicked = await clickEnabledByName(page, /continue to study/i, 20000);
  if (!clicked) throw new Error('Could not click Continue to study');

  // Must leave auth page
  await page.waitForTimeout(1200);
  const body = (await page.locator('body').innerText()).toLowerCase();
  if (body.includes('enter your access code')) {
    throw new Error('Still on access-code page after submit');
  }
}

async function consentAndAdvance(page) {
  const cb = page.locator('input[type="checkbox"]').first();
  if (await cb.count()) {
    if (!(await cb.isChecked())) await cb.check();
  }

  for (let i=0;i<10;i++) {
    const moved = await clickEnabledByName(page, /continue|start|begin/i, 2000);
    if (moved) break;
    await page.waitForTimeout(250);
  }
}

async function fillPreAssessment(page) {
  await page.evaluate(() => {
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
    const names = [...new Set(radios.map(r => r.getAttribute('name')).filter(Boolean))];
    for (const name of names) {
      const r = document.querySelector(`input[type=\"radio\"][name=\"${name}\"]`);
      if (r) r.click();
    }
    for (const t of Array.from(document.querySelectorAll('textarea'))) {
      if (!t.value.trim()) {
        t.value = 'Short response for this item.';
        t.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });
}

async function advanceTo(page, keyword, maxSteps=14) {
  for (let i=0;i<maxSteps;i++) {
    const txt = (await page.locator('body').innerText()).toLowerCase();
    if (txt.includes(keyword)) return true;
    await fillPreAssessment(page);
    await clickEnabledByName(page, /continue|next|start|begin|practice|module|advance|post-test|submit/i, 3000);
    await page.waitForTimeout(700);
  }
  return false;
}

async function captureControl() {
  await ensureNextArm(0);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  await login(page);
  await consentAndAdvance(page);

  const ok = await advanceTo(page, 'digital-literacy', 16);
  if (!ok) throw new Error('Could not reach control reading screen');

  await page.screenshot({ path: `${OUT}/experiment-control-reading.png` });
  await browser.close();
}

async function submitPrompt(page, text) {
  const areas = page.locator('textarea');
  const n = await areas.count();
  if (n > 0) {
    await areas.nth(n-1).fill(text);
  }
  await clickEnabledByName(page, /submit|continue|get feedback|grade|send/i, 5000);
  await page.waitForTimeout(1400);
}

async function captureTreatment() {
  await ensureNextArm(1);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  await login(page);
  await consentAndAdvance(page);

  let ok = await advanceTo(page, 'scenario 1', 18);
  if (!ok) ok = await advanceTo(page, 'ethical use', 6);
  if (!ok) throw new Error('Could not reach scenario 1');

  await page.screenshot({ path: `${OUT}/experiment-treatment-s1-ethical.png` });
  await submitPrompt(page, 'Help me study tone step-by-step so I can answer on my own. Ask me checks as we go.');
  await clickEnabledByName(page, /advance|continue|next/i, 5000);

  ok = await advanceTo(page, 'scenario 2', 10);
  if (!ok) ok = await advanceTo(page, 'iteration', 6);
  if (!ok) throw new Error('Could not reach scenario 2');

  await page.screenshot({ path: `${OUT}/experiment-treatment-s2-iteration.png` });
  await submitPrompt(page, 'Give one arguable thesis with two reasons in bullet points.');
  await submitPrompt(page, 'Revise to make the thesis more specific and include one counterargument.');
  await clickEnabledByName(page, /advance|continue|next/i, 5000);

  ok = await advanceTo(page, 'scenario 3', 10);
  if (!ok) ok = await advanceTo(page, 'verification', 6);
  if (!ok) throw new Error('Could not reach scenario 3');

  const areas = page.locator('textarea');
  if (await areas.count() >= 2) {
    await areas.nth(0).fill('Wrong start year (1781), wrong execution method (firing squad), wrong title for Napoleon (king).');
    await areas.nth(1).fill('Verify each claim with reliable sources, correct each factual error, and cite the source for every correction.');
  }
  await page.screenshot({ path: `${OUT}/experiment-treatment-s3-verification.png` });
  await browser.close();
}

await captureControl();
await captureTreatment();
console.log('captured-real-experiment');
