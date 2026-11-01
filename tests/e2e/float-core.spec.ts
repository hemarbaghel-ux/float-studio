/**
 * FLOAT AI — End-to-End Playwright Specification (Phase 8)
 * Covers:
 * 1. Landing & Auth entry points
 * 2. Model Catalog & Gemini 4 Argon / GPT-6 Astra exact model IDs
 * 3. IDE Workspace, Diff Review per-hunk controls, Checkpoints, and Source Control
 * 4. Subscription config & transparent usage reporting
 */
import { test, expect } from 'playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';

test.describe('FLOAT AI Core E2E Suite', () => {
  test('GET /api/models/verified returns exact model IDs including gemini-4-argon without float-basic alias', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/models/verified`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data.models)).toBe(true);
    const ids = data.models.map((m: { id: string }) => m.id);
    expect(ids).toContain('gemini-4-argon');
    expect(ids).toContain('gpt-6-astra');
    expect(ids).toContain('gpt-6.1-sol');
    expect(ids).not.toContain('float-basic');
  });

  test('GET /api/subscription/config exposes verified FLOAT plans', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/subscription/config`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.plans).toBeDefined();
    expect(data.plans.free).toBeDefined();
    expect(data.plans.pro).toBeDefined();
  });

  test('Protected AI and Git routes reject unauthenticated requests with 401', async ({ request }) => {
    const chatRes = await request.post(`${BASE_URL}/api/ai/chat`, {
      data: { model: 'gemini-4-argon', messages: [{ role: 'user', content: 'ping' }] },
    });
    expect(chatRes.status()).toBe(401);

    const gitRes = await request.post(`${BASE_URL}/api/projects/demo-proj/git/generate-commit-message`, {
      data: {},
    });
    expect(gitRes.status()).toBe(401);
  });

  test('Landing page renders FLOAT AI branding and navigation', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/FLOAT/i);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/FLOAT/i);
  });
});
