import { expect, test, type Page } from '@playwright/test';

async function openPOS(page: Page, role = 'Admin', stale = false, refreshFailure = false) {
  await page.addInitScript(({ role, stale, refreshFailure }) => {
    const state = window as any;
    let jobs = [
      { jobId: 'queued', orderId: 'order-1', state: 'QUEUED', message: 'Old printer address', createdAt: '2026-10-04T09:00:00Z', updatedAt: 'review-1' },
      { jobId: 'uncertain', orderId: 'PRINTER_TEST', state: 'DELIVERY_UNCERTAIN', message: 'Transport interrupted', createdAt: '2026-10-04T09:01:00Z', updatedAt: 'review-2' },
      { jobId: 'sending', orderId: 'PRINTER_TEST', state: 'SENDING', message: 'Sending', createdAt: '2026-10-04T09:02:00Z', updatedAt: 'review-3' },
    ];
    state.cancelCalls = [];
    let failed = false;
    state.__TAURI_INTERNALS__ = { invoke: async (command: string, args: any) => {
      if (command === 'runtime_status') return { enrolled: true, installationStage: 'LIVE', staff: [{ id: 'staff', name: 'Operator', role }] };
      if (command === 'runtime_login' || command === 'runtime_login_offline') return { token: 'session', staffId: 'staff', name: 'Operator', role };
      if (command === 'runtime_snapshot') return { terminalId: 'test', installationStage: 'LIVE', pendingCount: 0, actor: { id: 'staff', name: 'Operator', role, permissions: ['pos.sell', 'business.view', 'help.view'] }, records: [] };
      if (command === 'runtime_sync') return {};
      if (command === 'runtime_guidance_progress') return [];
      if (command === 'runtime_printer_jobs') { if (failed && refreshFailure) throw new Error('Queue unavailable'); return jobs; }
      if (command === 'runtime_printer_cancel') {
        state.cancelCalls.push(args);
        if (stale && !failed) { failed = true; jobs = jobs.map(job => ({ ...job, updatedAt: 'new-review' })); throw new Error('Stale print job selection'); }
        jobs = jobs.filter(job => !args.jobs.some((selection: any) => selection.jobId === job.jobId));
        return { count: args.jobs.length, cancelledIds: args.jobs.map((job: any) => job.jobId), cancelledAt: 'now', auditReference: 'audit' };
      }
      throw new Error(`Unexpected native command: ${command}`);
    } };
  }, { role, stale, refreshFailure });
  await page.goto('/#/pos');
  await page.getByLabel('PIN').fill('123456');
  await page.getByRole('button', { name: 'Continue with local PIN' }).click();
  const welcome = page.getByRole('region', { name: 'Staff welcome' });
  if (await welcome.isVisible().catch(() => false)) await page.getByRole('button', { name: 'Dismiss welcome' }).click();
  await expect(page.getByRole('region', { name: 'Pending printer jobs' })).toBeVisible();
}

test('Admin reviews one job and then remaining eligible batch, with narrow-screen keyboard controls', async ({ page }) => {
  await openPOS(page);
  await page.getByRole('button', { name: 'Clear obsolete print jobs…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Clear obsolete print jobs' });
  await expect(dialog.getByRole('checkbox', { name: /SENDING/ })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: /Order order-1/ }).check();
  await dialog.getByLabel('Cancellation reason').fill('Obsolete printer address');
  const ack = dialog.getByRole('checkbox', { name: /I understand/ });
  await ack.focus(); await page.keyboard.press('Space');
  await dialog.getByRole('button', { name: 'Review cancellation (1)' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).cancelCalls.length)).toBe(0);
  await dialog.getByRole('button', { name: 'Confirm cancellation of 1 job(s)' }).click();
  await expect(dialog.getByText(/1 obsolete print job\(s\) cancelled/)).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /Order order-1/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Select all displayed eligible jobs' }).click();
  await dialog.getByLabel('Cancellation reason').fill('Obsolete test'); await ack.check();
  await dialog.getByRole('button', { name: 'Review cancellation (1)' }).click();
  await dialog.getByRole('button', { name: 'Confirm cancellation of 1 job(s)' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).cancelCalls.length)).toBe(2);
  await expect(dialog.getByRole('checkbox', { name: /DELIVERY_UNCERTAIN/ })).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
});

for (const role of ['Cashier', 'Manager']) test(`${role} cannot access cancellation`, async ({ page }) => {
  await openPOS(page, role); await expect(page.getByRole('button', { name: 'Clear obsolete print jobs…' })).toHaveCount(0);
});

test('stale selection refreshes and requires a new review and acknowledgement', async ({ page }) => {
  await openPOS(page, 'Admin', true);
  await page.getByRole('button', { name: 'Clear obsolete print jobs…' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Select all displayed eligible jobs' }).click();
  await dialog.getByLabel('Cancellation reason').fill('Obsolete'); await dialog.getByRole('checkbox', { name: /I understand/ }).check();
  await dialog.getByRole('button', { name: 'Review cancellation (2)' }).click();
  await dialog.getByRole('button', { name: 'Confirm cancellation of 2 job(s)' }).click();
  await expect(dialog.getByText(/Stale print job selection/)).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /I understand/ })).not.toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Review cancellation (0)' })).toBeDisabled();
  await expect(dialog.getByText(/new-review/).first()).toBeVisible();
});

test('failed stale-selection refresh is visible and prevents cancellation', async ({ page }) => {
  await openPOS(page, 'Admin', true, true);
  await page.getByRole('button', { name: 'Clear obsolete print jobs…' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Select all displayed eligible jobs' }).click();
  await dialog.getByLabel('Cancellation reason').fill('Obsolete'); await dialog.getByRole('checkbox', { name: /I understand/ }).check();
  await dialog.getByRole('button', { name: 'Review cancellation (2)' }).click();
  await dialog.getByRole('button', { name: 'Confirm cancellation of 2 job(s)' }).click();
  await expect(dialog.getByText(/Queue refresh also failed/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Review cancellation (0)' })).toBeDisabled();
});
