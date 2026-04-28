import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const ACCESS_CODE = 'M2FJ9K4H';
const OUT_DIR = '/Users/yanzihao/Downloads/AP Research Page/public/ap-research-deck/images';

async function assignOnce() {
  const res = await fetch(`${BASE}/api/study/assign`);
  if (!res.ok) throw new Error(`assign failed ${res.status}`);
  return await res.json();
}

async function primeNextArm(targetArms) {
  for (let i = 0; i < 15; i++) {
    const j = await assignOnce();
    const a = Number(j.treatment_arm);
    const next = (a + 1) % 3;
    if (targetArms.includes(next)) return { consumed: a, next };
  }
  throw new Error('Could not prime arm in expected cycles');
}

async function fillPreAssess(page) {
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
    const byName = new Map();
    for (const r of radios) {
      if (!r.name) continue;
      if (!byName.has(r.name)) byName.set(r.name, r);
    }
    for (const r of byName.values()) r.click();

    const textareas = Array.from(document.querySelectorAll('textarea'));
    for (const t of textareas) {
      if (!t.value.trim()) {
        t.value = 'Short response for this item.';
        t.dispatchEvent(new Event('input', { bubbles: true }));
        t.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
}

async function clickContinueLike(page, tries = 8) {
  const labels = [/continue/i, /start/i, /next/i, /begin/i, /practice/i, /advance/i, /submit/i, /post-test/i];
  for (let i = 0; i < tries; i++) {
    for (const rx of labels) {
      const loc = page.getByRole('button', { name: rx });
      const count = await loc.count();
      if (!count) continue;
      for (let n = 0; n < Math.min(count, 5); n++) {
        const btn = loc.nth(n);
        try {
          if (await btn.isEnabled()) {
            await btn.click({ timeout: 1000 });
            await page.waitForTimeout(700);
            return true;
          }
        } catch {}
      }
    }
    await page.waitForTimeout(350);
  }
  return false;
}

async function loginToStudy(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.fill('#access-code-input', ACCESS_CODE);
  const continueBtn = page.getByRole('button', { name: /continue to study/i });
  await continueBtn.waitFor({ state: 'visible' });
  for (let i = 0; i < 20; i++) {
    if (!(await continueBtn.isDisabled())) break;
    await page.fill('#access-code-input', ACCESS_CODE + ' ');
    await page.fill('#access-code-input', ACCESS_CODE);
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(500);
  await continueBtn.click();
  await page.waitForTimeout(1100);
  const cbs = page.locator('input[type="checkbox"]');
  if (await cbs.count()) {
    const cb = cbs.first();
    if (!(await cb.isChecked())) await cb.check();
  }
  await clickContinueLike(page, 10);
}

async function goToControlReadingAndShot(file) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  await loginToStudy(page);

  for (let i = 0; i < 10; i++) {
    const txt = (await page.locator('body').innerText()).toLowerCase();
    if (txt.includes('digital-literacy') || txt.includes('non-instructional') || txt.includes('reading')) break;
    await fillPreAssess(page);
    await clickContinueLike(page, 8);
  }
  await page.waitForTimeout(900);
  await page.screenshot({ path: file, fullPage: false });
  await browser.close();
}

async function submitScenarioAttempt(page, scenarioNum, attemptNum = 1) {
  const boxes = page.locator('textarea');
  const count = await boxes.count();

  if (scenarioNum === 3 && count >= 2) {
    await boxes.nth(0).fill('Wrong year: 1789 not 1781. Wrong method: guillotine not firing squad. Wrong title: Napoleon was emperor, not king.');
    await boxes.nth(1).fill('Verify each claim against reliable history sources, provide corrected statements with dates/titles, and cite source support for each correction.');
  } else if (count >= 1) {
    const prompt = attemptNum === 1
      ? 'Help me with this task using a concise structure and specific criteria so I can produce my own answer.'
      : 'Revise your previous response: give 1 arguable thesis, 2 strongest reasons, and one counterargument in bullet format.';
    await boxes.nth(count - 1).fill(prompt);
  }

  await clickContinueLike(page, 8);
  await page.waitForTimeout(1600);
}

async function goToTreatmentScenariosAndShots(files) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  await loginToStudy(page);

  for (let i = 0; i < 12; i++) {
    const txt = (await page.locator('body').innerText()).toLowerCase();
    if (txt.includes('scenario 1') || txt.includes('ethical use')) break;
    await fillPreAssess(page);
    await clickContinueLike(page, 8);
  }

  await page.waitForTimeout(800);
  await page.screenshot({ path: files.s1, fullPage: false });
  await submitScenarioAttempt(page, 1, 1);
  await clickContinueLike(page, 8);

  await page.waitForTimeout(1000);
  await page.screenshot({ path: files.s2, fullPage: false });
  await submitScenarioAttempt(page, 2, 1);
  await submitScenarioAttempt(page, 2, 2);
  await clickContinueLike(page, 8);

  await page.waitForTimeout(1000);
  await page.screenshot({ path: files.s3, fullPage: false });

  await browser.close();
}

async function main() {
  await primeNextArm([0]);
  await goToControlReadingAndShot(`${OUT_DIR}/experiment-control-reading.png`);

  await primeNextArm([1, 2]);
  await goToTreatmentScenariosAndShots({
    s1: `${OUT_DIR}/experiment-treatment-s1-ethical.png`,
    s2: `${OUT_DIR}/experiment-treatment-s2-iteration.png`,
    s3: `${OUT_DIR}/experiment-treatment-s3-verification.png`,
  });

  console.log('done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
