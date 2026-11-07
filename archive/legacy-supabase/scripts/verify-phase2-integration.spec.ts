import { test, expect } from '@playwright/test';

test.describe('Phase 2 Integration Tests', () => {

  test('Session Binding & URL Tampering (Table 1 to Table 2)', async ({ request }) => {
    // 1. Scan Table 1
    const scanRes = await request.post('/api/qr/scan', { data: { token: process.env.TEST_T1_QR_TOKEN } });
    expect(scanRes.ok()).toBeTruthy();
    const cookies = scanRes.headers()['set-cookie'];
    
    // 2. Attempt to fetch Table 2 page using Table 1 cookie
    // The server component must validate the cookie hash against the table slug 'table-2'
    const t2Res = await request.get('/table/table-2', { headers: { cookie: cookies } });
    
    // 3. Must redirect to table-invalid
    expect(t2Res.url()).toContain('/table-invalid?reason=table_mismatch');
  });

  test('Atomic Concurrency: Order Placement vs Session Closure', async ({ request }) => {
    // 1. Scan Table 1
    const scanRes = await request.post('/api/qr/scan', { data: { token: process.env.TEST_T1_QR_TOKEN } });
    const cookies = scanRes.headers()['set-cookie'];
    
    // 2. Create concurrent promises for order placement and admin closure
    const orderPromise = request.post('/api/orders', {
      headers: { cookie: cookies },
      data: { items: [{ menu_item_id: 'test-item-id', quantity: 1, customization: '' }] }
    });
    
    const closePromise = request.post('/api/admin/tables/close-session', {
      headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` },
      data: { tableId: 'test-t1-id' }
    });

    const [orderRes, closeRes] = await Promise.all([orderPromise, closePromise]);
    
    // 3. Due to FOR UPDATE locks, one will succeed and one will fail gracefully.
    // If order processes first, close fails due to unpaid order.
    // If close processes first, order fails due to inactive session.
    const isOrderSuccess = orderRes.ok();
    const isCloseSuccess = closeRes.ok();
    
    expect(isOrderSuccess !== isCloseSuccess).toBeTruthy(); // Exactly one succeeds
    
    if (isCloseSuccess) {
      expect(orderRes.status()).toBe(403); // Or 400
      const body = await orderRes.json();
      expect(body.error).toContain('Invalid, expired, or closed session');
    } else {
      expect(closeRes.status()).toBe(400);
      const body = await closeRes.json();
      expect(body.error).toContain('Cannot close session with unpaid orders');
    }
  });

  test('Unpaid Bill Protection during Closure', async ({ request }) => {
    const scanRes = await request.post('/api/qr/scan', { data: { token: process.env.TEST_T1_QR_TOKEN } });
    const cookies = scanRes.headers()['set-cookie'];
    
    // Place order
    await request.post('/api/orders', {
      headers: { cookie: cookies },
      data: { items: [{ menu_item_id: 'test-item-id', quantity: 1 }] }
    });

    // Admin attempts to close
    const closeRes = await request.post('/api/admin/tables/close-session', {
      headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` },
      data: { tableId: 'test-t1-id' }
    });

    expect(closeRes.status()).toBe(400);
    const body = await closeRes.json();
    expect(body.error).toContain('Cannot close session with unpaid orders');
  });

});
