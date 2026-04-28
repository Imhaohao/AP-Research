import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const ACCESS_CODE = 'M2FJ9K4H';
const OUT = '/Users/yanzihao/Downloads/AP Research Page/public/ap-research-deck/images';

async function clickByPatterns(page, patterns, rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    for (const p of patterns) {
      const loc = page.getByRole('button', { name: p });
      const n = await loc.count();
      for (let j = 0; j < Math.min(n, 6); j++) {
        const b = loc.nth(j);
        try {
          if (await b.isEnabled()) {
            await b.click({ timeout: 800 });
            await page.waitForTimeout(700);
            return true;
          }
        } catch {}
      }
    }
    await page.waitForTimeout(300);
  }
  return false;
}

async function doLogin(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.fill('#access-code-input', ACCESS_CODE);
  await page.evaluate(() => {
    const btn = document.querySelector('button.auth-submit');
    if (btn) btn.removeAttribute('disabled');
  });
  try {
    await page.click('button.auth-submit', { timeout: 1200 });
  } catch {
    await page.waitForTimeout(1200);
    await page.click('button.auth-submit', { timeout: 5000 });
  }

  await page.waitForTimeout(1200);
  const cb = page.locator('input[type="checkbox"]').first();
  if (await cb.count()) {
    try { if (!(await cb.isChecked())) await cb.check(); } catch {}
  }
  await clickByPatterns(page, [/continue/i, /start/i, /begin/i], 10);
}

async function fillAssessment(page) {
  await page.evaluate(() => {
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
    const names = new Set(radios.map(r => r.name).filter(Boolean));
    for (const name of names) {
      const r = document.querySelector(`input[type=\"radio\"][name=\"${name}\"]`);
      if (r) r.click();
    }
    const textareas = Array.from(document.querySelectorAll('textarea'));
    for (const t of textareas) {
      if (!t.value.trim()) {
        t.value = 'Short response.';
        t.dispatchEvent(new Event('input', { bubbles: true }));
        t.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
}

async function captureControl() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await doLogin(page);

  for (let i = 0; i < 10; i++) {
    const txt = (await page.locator('body').innerText()).toLowerCase();
    if (txt.includes('digital-literacy') || txt.includes('non-instructional') || txt.includes('reading')) break;
    await fillAssessment(page);
    await clickByPatterns(page, [/continue/i, /start/i, /next/i, /module/i, /practice/i], 8);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/experiment-control-reading.png`, fullPage: false });
  await browser.close();
}

async function submitScenario(page, s, attempt = 1) {
  const textareas = page.locator('textarea');
  const n = await textareas.count();
  if (s === 3 && n >= 2) {
    await textareas.nth(0).fill('Wrong year (1789 not 1781), wrong execution method (guillotine not firing squad), wrong title (emperor not king).');
    await textareas.nth(1).fill('Verify each claim against reliable sources, correct each factual error, and provide corrected statements with evidence.');
  } else if (n >= 1) {
    const p = attempt === 1
      ? 'Help me with this task in a structured way so I can produce my own answer.'
      : 'Revise: produce one specific thesis, two reasons, and a concise counterargument.';
    await textareas.nth(n - 1).fill(p);
  }
  await clickByPatterns(page, [/submit/i, /continue/i, /feedback/i, /grade/i, /send/i], 10);
  await page.waitForTimeout(1700);
}

async function captureTreatment() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await doLogin(page);

  for (let i = 0; i < 12; i++) {
    const txt = (await page.locator('body').innerText()).toLowerCase();
    if (txt.includes('scenario 1') || txt.includes('ethical use')) break;
    await fillAssessment(page);
    await clickByPatterns(page, [/continue/i, /start/i, /next/i, /practice/i], 8);
  }

  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/experiment-treatment-s1-ethical.png`, fullPage: false });
  await submitScenario(page, 1, 1);
  await clickByPatterns(page, [/advance/i, /continue/i, /next/i], 8);

  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/experiment-treatment-s2-iteration.png`, fullPage: false });
  await submitScenario(page, 2, 1);
  await submitScenario(page, 2, 2);
  await clickByPatterns(page, [/advance/i, /continue/i, /next/i], 8);

  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/experiment-treatment-s3-verification.png`, fullPage: false });
  await browser.close();
}

const mode = process.argv[2];
if (mode === 'control') {
  await captureControl();
} else if (mode === 'treatment') {
  await captureTreatment();
} else {
  throw new Error('usage: node capture_actual_ui.mjs [control|treatment]');
}

console.log('done', mode);
