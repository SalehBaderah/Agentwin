import { launchBrowser } from "./browser.mjs";
import { expect } from "@playwright/test";
import fs from 'node:fs';
const browser=await launchBrowser();
const page=await browser.newPage({viewport:{width:1900,height:1100}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const writes=[];page.on('request',r=>{if(r.url().includes('/api/')&&r.method()!=='GET')writes.push(r.method()+' '+r.url());});
fs.mkdirSync('../artifacts/physical-workspace',{recursive:true});
try {
 await page.addInitScript(()=>localStorage.setItem('agentwin-collapsed','true'));
 const states=await(await page.request.get('http://127.0.0.1:8000/api/projects')).json();
 for(const [i,state] of states.entries()){
  await page.goto('http://127.0.0.1:8000/projects/'+state.project.id+'?tab=twin');
  await page.getByRole('tab',{name:'Physical 2D',exact:true}).click();
  await expect(page.getByRole('complementary',{name:'Live instrument panel'})).toBeVisible();
  await page.getByRole('combobox',{name:'Artwork profile',exact:true}).click();
  await page.getByRole('option',{name:i?'Arduino UNO R4 WiFi':'Arduino UNO R3',exact:true}).click();
  await expect(page.locator('[data-static-artwork]').first()).toHaveAttribute('data-static-artwork',i?'arduino-uno-r4-wifi':'arduino-uno-r3');
  await page.reload();
  await expect(page.getByRole('combobox',{name:'Artwork profile',exact:true})).toContainText(i?'Arduino UNO R4 WiFi':'Arduino UNO R3');
  expect(await page.locator('[data-provenance=inferred]').count()).toBe(0);
  await page.setViewportSize({width:1600,height:1100});
  const beforeWin=await page.locator('.physical-workspace').evaluate(el=>el.clientWidth);
  await page.getByRole('button',{name:'Open Win assistant',exact:true}).click();
  await expect(page.getByRole('button',{name:'Collapse Win assistant',exact:true})).toBeVisible();
  await expect.poll(()=>page.locator('.physical-workspace').evaluate(el=>el.clientWidth)).toBeLessThan(beforeWin);
  const withWin=await page.locator('.physical-workspace').evaluate(el=>({width:el.clientWidth,columns:getComputedStyle(el.querySelector('.physical-workbench')).gridTemplateColumns.split(' ').length}));
  expect(withWin.columns).toBe(withWin.width>=960?2:1);
  await page.getByRole('button',{name:'Collapse Win assistant',exact:true}).click();
  const category=Object.entries(state.project.graph.fields).find(([key,m])=>m.data_type==='categorical'&&!key.includes('command_id')&&state.readings.some(r=>typeof r.readings[key]==='string'));
  if(category){
   const component=state.project.graph.components.find(c=>c.id===category[1].component_id);
   await page.getByRole('button',{name:'Select '+(component.name||component.label),exact:true}).click();
   await expect(page.getByRole('heading',{name:'State timeline',exact:true})).toBeVisible();
   await page.locator('.state-history [tabindex="0"]').first().focus();
   await expect(page.locator('.state-history p[aria-live]')).not.toContainText('Hover or focus');
   await page.getByRole('button',{name:'Time share',exact:true}).click();
   await expect(page.getByRole('heading',{name:'Time share',exact:true})).toBeVisible();
   await expect(page.getByText('Unknown / gaps',{exact:true})).toBeVisible();
   await page.getByRole('button',{name:'Show timeline',exact:true}).click();
  }
  for(const theme of ['dark','light']){
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   for(const width of [1900,1100,390]){
    await page.setViewportSize({width,height:1100});
    await expect(page.locator('.physical-workspace')).toBeVisible();
    const layout=await page.locator('.physical-workspace').evaluate(el=>({width:el.getBoundingClientRect().width,columns:getComputedStyle(el.querySelector('.physical-workbench')).gridTemplateColumns.split(' ').length}));
    expect(layout.columns).toBe(layout.width>=960?2:1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    await page.locator('.physical-workspace').screenshot({path:'../artifacts/physical-workspace/'+i+'-'+theme+'-'+width+'.png'});
   }
  }
  await page.getByRole('button',{name:'Open component details',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Open component details',exact:true})).toBeFocused();
  await page.setViewportSize({width:1900,height:1100});
  await page.getByRole('tab',{name:'Topology',exact:true}).click();
  await expect(page.locator('.react-flow')).toBeVisible();
  await page.getByRole('tab',{name:'Data Flow',exact:true}).click();
  await expect(page.locator('.flow-svg')).toBeVisible();
 }
 expect(writes).toEqual([]);expect(errors).toEqual([]);
 console.log('Both projects: profile persistence, Win open/closed, three container widths, themes, mobile focus, alternate views; no API writes.');
}finally{await browser.close();}
