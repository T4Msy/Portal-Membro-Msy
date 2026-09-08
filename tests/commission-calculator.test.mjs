import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCommission, parseDecimal } from '../js/lib/commission-calculator.mjs';

const fixture = () => ({ project_name:'Site Cliente X',client_name:'Cliente X',project_date:'2026-09-08',gross_cents:120000,
  costs:[],referral_source:'Indicação direta',referral_user_id:'joao',members:[
    {user_id:'tales',roles:['Tech Lead'],weight_bp:3500,participation:100},
    {user_id:'xitter',roles:['Backend'],weight_bp:3000,participation:75},
    {user_id:'pepeu',roles:['Frontend'],weight_bp:2000,participation:100},
    {user_id:'joao',roles:['Gestão'],weight_bp:1500,participation:100}] });

test('confirmed example: all reductions stay with MSY',()=>{
  const r=calculateCommission(fixture(),true);
  assert.deepEqual(r.members.map(m=>m.final_cents),[27300,17550,15600,11700]);
  assert.equal(r.company_cents,30000);assert.equal(r.retained_cents,5850);
  assert.equal(r.company_total_cents,35850);assert.equal(r.referral_cents,12000);
  assert.equal(r.effective_execution_cents,72150);assert.equal(r.execution_cents,78000);
});

test('multiple reductions do not reward other participants',()=>{
  const data=fixture();data.members[2].participation=50;
  const r=calculateCommission(data,true);
  assert.deepEqual(r.members.map(m=>m.final_cents),[27300,17550,7800,11700]);
  assert.equal(r.retained_cents,13650);
});

test('all zero participation and institutional referral',()=>{
  const data=fixture();data.referral_user_id=null;data.members.forEach(m=>m.participation=0);
  const r=calculateCommission(data,true);
  assert.equal(r.company_total_cents,120000);assert.equal(r.effective_execution_cents,0);
});

test('costs precede percentages; one participant; zero distribution',()=>{
  const data=fixture();data.gross_cents=200000;data.costs=[{description:'Hospedagem',amount_cents:20000}];
  data.members=[{user_id:'a',roles:[],weight_bp:10000,participation:50}];
  const r=calculateCommission(data,true);
  assert.equal(r.distribution_cents,180000);assert.equal(r.members[0].final_cents,58500);
  data.costs[0].amount_cents=200000;
  assert.equal(calculateCommission(data,true).company_total_cents,0);
});

test('draft accepts incomplete weights but approval rejects them',()=>{
  const data=fixture();data.members[0].weight_bp=2000;
  assert.equal(calculateCommission(data).valid,false);
  assert.throws(()=>calculateCommission(data,true),/100%/);
  data.members[0].weight_bp=5000;assert.throws(()=>calculateCommission(data,true),/100%/);
});

test('invalid inputs cannot enter arithmetic',()=>{
  for(const bad of [-1,1.1,NaN,Infinity,100000000001]) {
    assert.throws(()=>calculateCommission({...fixture(),gross_cents:bad}));
  }
  const data=fixture();data.costs=[{description:'Custo',amount_cents:120001}];
  assert.throws(()=>calculateCommission(data),/custos/);
  data.costs=[];data.members[1].user_id='tales';assert.throws(()=>calculateCommission(data),/uma vez/);
  data.members[1].user_id='xitter';data.members[1].participation=80;assert.throws(()=>calculateCommission(data),/Participação/);
});

test('Brazilian decimals do not use binary float rounding',()=>{
  assert.equal(parseDecimal('1.200,01'),120001);assert.equal(parseDecimal('0,29'),29);
  assert.equal(parseDecimal('33.33'),3333);assert.equal(parseDecimal('100'),10000);
  for(const value of ['1e5','-1','12,345','abc','Infinity']) assert.throws(()=>parseDecimal(value));
});

test('cent allocation closes exactly for 10,000 varied projects',()=>{
  let seed=3129;
  const random=max=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%max;};
  for(let trial=0;trial<10000;trial++) {
    const data=fixture();data.gross_cents=1+random(1000000000);
    data.referral_user_id=trial%2?'joao':null;
    data.costs=[{description:'Custo',amount_cents:random(data.gross_cents+1)}];
    let remaining=10000;
    data.members=Array.from({length:1+random(40)},(_,i)=>{const weight=random(remaining+1);remaining-=weight;return {user_id:String(i),roles:[],weight_bp:weight,participation:[0,50,75,100][random(4)]};});
    data.members.at(-1).weight_bp+=remaining;
    const r=calculateCommission(data,true);
    assert.equal(r.members.reduce((s,m)=>s+m.base_cents,0),r.execution_cents);
    assert.equal(r.effective_execution_cents+r.retained_cents,r.execution_cents);
    assert.equal(r.company_total_cents+(data.referral_user_id?r.referral_cents:0)+r.effective_execution_cents,r.distribution_cents);
    r.members.forEach(m=>{assert.ok(Number.isInteger(m.final_cents));assert.ok(m.final_cents>=0&&m.final_cents<=m.base_cents);});
  }
});
