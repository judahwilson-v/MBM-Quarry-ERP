// Run only against an isolated synthetic database. The QA runner supplies a
// Playwright Page with a fixture session. No business data or provider login.
module.exports = async function inventoryRefreshRegression(page) {
  const base = process.env.MBM_QA_BASE_URL || 'http://localhost:3015';
  const screenshots = process.env.MBM_QA_SCREENSHOT_DIR || '/tmp';
  const name = 'SYNTHETIC QA STOCK ' + Date.now();
  await page.goto(base + '/inventory', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.getByRole('button', { name: 'Log out', exact: true }).waitFor();
  let navigationRequests = 0;
  const observeNavigation = request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigationRequests++;
  };
  page.on('request', observeNavigation);
  let resolveBlocked;
  const blocked = new Promise(resolve => { resolveBlocked = resolve; });
  let blockedCount = 0;
  const failSave = async route => {
    const request = route.request();
    if (request.method() === 'POST' && request.headers()['next-action'] && request.postData()?.includes(name)) {
      blockedCount++;
      await route.abort('failed');
      resolveBlocked();
    } else {
      await route.continue();
    }
  };
  let timeout;
  try {
    await page.getByRole('button', { name: 'Add Material', exact: true }).click();
    await page.locator('#new-material-name').fill(name);
    await page.getByPlaceholder('Initial Quantity', { exact: true }).fill('40');
    await page.locator('#new-material-unit').fill('CFT');
    await page.route('**/inventory', failSave);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await Promise.race([blocked, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(Error('Expected blocked Save action not sent')), 10000);
    })]);
    clearTimeout(timeout);
    for (const [selector, expected] of [
      ['#new-material-name', name],
      ['input[placeholder="Initial Quantity"]', '40'],
      ['#new-material-unit', 'CFT'],
    ]) {
      if (await page.locator(selector).inputValue() !== expected) throw Error('Failed Save lost field ' + selector);
    }
    if (await page.getByText(name, { exact: true }).count()) throw Error('Blocked Save unexpectedly rendered a stock card');
    console.log('PASS blocked Save retains open form, name, quantity40 and CFT; blocked actions:', blockedCount);
    await page.screenshot({ path: screenshots + '/inventory-failed-save-retained.png', fullPage: true });
    await page.unroute('**/inventory', failSave);
    if (await page.locator('nextjs-portal').count()) await page.keyboard.press('Escape');
    navigationRequests = 0;
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const heading = page.getByText(name, { exact: true });
    await heading.waitFor({ timeout: 20000 });
    if (navigationRequests !== 0) throw Error('Unexpected main-frame navigation during refreshed-props check');
    if (await page.locator('#new-material-name').count()) throw Error('Form not closed after successful Save');
    const card = heading.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " bg-card ")][1]');
    if (!(await card.innerText()).includes('40') || !(await card.innerText()).includes('CFT')) throw Error('Expected40CFT card missing');
    console.log('PASS refreshed props render40CFT card with zero main-frame navigation requests and closed form');
    await page.screenshot({ path: screenshots + '/inventory-refreshed-props-visible.png', fullPage: true });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText(name, { exact: true }).waitFor({ timeout: 20000 });
    console.log('PASS saved card persists after page reload');
  } finally {
    clearTimeout(timeout);
    await page.unroute('**/inventory', failSave);
    page.off('request', observeNavigation);
  }
};
