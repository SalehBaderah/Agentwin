import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
const browser = await chromium.launch({ channel:'msedge', headless:true });
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
fs.mkdirSync('../artifacts/twin-enhancements',{recursive:true});
try {
 const states=await (await page.request.get('http://127.0.0.1:8000/api/projects')).json();
 for (const [i,state] of states.entries()) {
  await page.goto('http://127.0.0.1:8000/projects/'+state.project.id+'?tab=twin');
  await page.getByRole('tab',{name:'Physical 2D',exact:true}).click();
  await expect(page.locator('.physical-svg')).toBeVisible();
  await page.getByRole('button',{name:'Focus selected',exact:true}).click();
  await page.getByRole('button',{name:'Fit view',exact:true}).click();
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  const zoomed = await page.locator('.physical-svg').getAttribute('viewBox');
  await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('agentwin-viewport:')).length)).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.locator('.physical-svg')).toHaveAttribute('viewBox',zoomed);
  await page.getByRole('button',{name:'Fit view',exact:true}).click();
  await page.locator('.instrument-browser summary').click();
  await page.getByRole('textbox',{name:'Find component'}).fill('no-such-component');
  await expect(page.getByText('No matching components',{exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Find component'}).fill('');
  for (const theme of ['light','dark']) {
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   for (const view of ['Physical 2D','Topology','Data Flow']) {
    await page.getByRole('tab',{name:view,exact:true}).click();
    await expect(page.locator(view==='Physical 2D'?'.physical-svg':view==='Topology'?'.react-flow':'.flow-svg')).toBeVisible();
    await page.screenshot({path:'../artifacts/twin-enhancements/'+i+'-'+theme+'-'+view.replaceAll(' ','-')+'.png',fullPage:true});
   }
  }
  await page.setViewportSize({width:390,height:1000});
  await page.getByRole('tab',{name:'Data Flow',exact:true}).click();
  await page.locator('.flow-node[role="button"]').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button',{name:'Close component inspector'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.flow-node[role="button"]').first()).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.screenshot({path:'../artifacts/twin-enhancements/'+i+'-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
 }
 expect(errors).toEqual([]);
 console.log('Two projects, three 2D views, both themes, search, focus, and mobile drawer checks passed.');
} finally {await browser.close();}
