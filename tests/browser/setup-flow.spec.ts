import {test,expect} from '@playwright/test';

test('protected first-admin setup validates the form and keeps the setup key out of browser storage',async({page})=>{
 let captured:{headers:Record<string,string>;body:Record<string,unknown>}|undefined;
 await page.route('https://servos-api.test/v1/setup/status',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({available:true})}));
 await page.route('https://servos-api.test/v1/setup/initial-admin',async route=>{
  captured={headers:route.request().headers(),body:JSON.parse(route.request().postData()||'{}')};
  await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({created:true})});
 });
 await page.goto('/');
 await page.getByRole('button',{name:'Set up a new business',exact:true}).click();
 await page.getByLabel('Business name',{exact:true}).fill('Demo Hotel');
 await page.getByLabel('Administrator name',{exact:true}).fill('Hotel Owner');
 await page.getByLabel('Login name',{exact:true}).fill('owner@example.invalid');
 await page.getByLabel('One-time setup key',{exact:true}).fill('setup-key-that-is-not-saved');
 await page.getByLabel('Administrator password',{exact:true}).fill('A-unique-password-for-the-owner');
 await page.getByLabel('Confirm administrator password',{exact:true}).fill('A-different-password-for-the-owner');
 await page.getByRole('button',{name:'Create administrator',exact:true}).click();
 await expect(page.getByRole('alert')).toHaveText('The passwords do not match.');
 expect(captured).toBeUndefined();
 await page.getByLabel('Confirm administrator password',{exact:true}).fill('A-unique-password-for-the-owner');
 await page.getByRole('button',{name:'Create administrator',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('The initial administrator was created.');
 expect(captured?.headers['x-serveos-setup-secret']).toBe('setup-key-that-is-not-saved');
 expect(captured?.body).toMatchObject({businessName:'Demo Hotel',displayName:'Hotel Owner',loginName:'owner@example.invalid',password:'A-unique-password-for-the-owner'});
 expect(captured?.body.businessId).toMatch(/^[0-9a-f-]{36}$/i);
 expect(captured?.body.staffId).toMatch(/^[0-9a-f-]{36}$/i);
 expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('setup-key-that-is-not-saved');
});

test('first-admin setup is hidden after the one-time setup window closes',async({page})=>{
 await page.route('https://servos-api.test/v1/setup/status',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({available:false})}));
 await page.goto('/');
 await expect(page.getByRole('button',{name:'Set up a new business',exact:true})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Sign in',exact:true})).toBeVisible();
});
