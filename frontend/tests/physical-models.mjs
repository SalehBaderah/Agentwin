import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
const load = async relative => {
 const source=fs.readFileSync(new URL(relative,import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
};
const {stateHistory}=await load('../src/features/workspace/stateHistory.ts');
const {resolveProfile,boardProfiles,readProfilePreference,profilePreferenceKey}=await load('../src/features/digital-twin/physical/profiles.ts');
const {assemblyModel}=await load('../src/features/digital-twin/physical/assemblyModel.ts');
const readings=values=>values.map(([received,value],id)=>({id,received,device:'a',readings:{state:value}}));
test('boolean timeline clips its window and never fills stale gaps or accepts numeric states',()=>{
 const h=stateHistory(readings([[0,false],[900,true],[902,false],[910,false],[920,1]]),'state',4,'a',{boolean:true,windowSeconds:30});
 assert.equal(h.start,890);assert.equal(h.covered,10);assert.equal(h.unknown,20);
 assert.deepEqual(h.shares.map(s=>[s.label,s.seconds]),[['Off',8],['On',2]]);
 assert.deepEqual(h.intervals[0],{start:890,end:900,label:null});
});
test('time share respects irregular intervals, invalid values and freshness caps',()=>{
 const h=stateHistory(readings([[0,'normal'],[2,'normal'],[5,'attack'],[20,null],[25,'normal']]),'state',4,'a');
 assert.equal(h.duration,25);assert.equal(h.covered,9);assert.equal(h.unknown,16);
 assert.equal(h.shares.find(s=>s.label==='normal').seconds,5);
 assert.equal(h.shares.find(s=>s.label==='attack').seconds,4);
 assert.equal(h.shares.reduce((sum,s)=>sum+s.percent,0),36);
 assert.deepEqual(h.intervals[0],{start:0,end:5,label:'normal'});
});
test('empty, one-sample and duplicate timestamps have no invented duration',()=>{
 assert.equal(stateHistory([],'state',5).duration,0);
 assert.equal(stateHistory(readings([[1,'on']]),'state',5).covered,0);
 const h=stateHistory(readings([[1,'a'],[1,'b'],[3,'b']]),'state',5);
 assert.equal(h.covered,2);assert.equal(h.shares[0].label,'b');
 assert.equal(stateHistory(readings([[1,'on'],[3,'off']]),'state',5,'other').covered,0);
});
test('profile resolution is extensible and safe for unknown or malformed preferences',()=>{
 assert.equal(resolveProfile(undefined,'uno-r4').profile.id,'arduino-uno-r4-wifi');
 assert.equal(resolveProfile('generic','uno-r4').profile.id,'generic');
 for(const key of ['future-board','__proto__','constructor']) assert.equal(resolveProfile(key,undefined).unknown,true);
 boardProfiles['future-board']={...boardProfiles.generic,id:'future-board'};
 assert.equal(resolveProfile('future-board',undefined).unknown,false);
 for(const value of ['{bad','42','{}','null']) assert.equal(readProfilePreference({getItem:()=>value},'key'),undefined);
 assert.notEqual(profilePreferenceKey('p','a'),profilePreferenceKey('p','b'));
});
const component=(id,type,pin)=>({id,type,pin,label:id,deviceId:'a'});
const components=[component('board','controller'),component('led','actuator','D13'),component('sensor','sensor','UNKNOWN')];
const twin={edges:[{id:'wire',source:'board',target:'led',category:'physical',label:'Connected'}]};
test('configured connections default; inference explains its provenance',()=>{
 const model=assemblyModel(twin,components,boardProfiles['arduino-uno-r3'],false);
 assert.equal(model.wires.length,1);assert.equal(model.wires[0].inferred,false);assert.equal(model.wires[0].precise,true);
 const expanded=assemblyModel(twin,components,boardProfiles['arduino-uno-r3'],true);
 assert.equal(expanded.wires.length,2);assert.ok(expanded.wires[1].reason.includes('no relationship'));
 assert.equal(expanded.wires[1].precise,false);
 assert.equal(assemblyModel(twin,components,boardProfiles.generic,false).wires[0].precise,false);
 assert.equal(assemblyModel({edges:[]},components.map(c=>({...c,deviceId:undefined})),boardProfiles.generic,true).wires.length,0);
});
