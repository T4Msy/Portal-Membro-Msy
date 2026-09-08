// Browser integration with a deterministic RPC fixture, never production data.
// Usage: node tests/commission-browser.cjs <playwright-core directory> <browser exe>
const { createServer } = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(path.resolve(process.argv[2] || 'node_modules/playwright-core'));
const browserExe = process.argv[3];
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const people = ['Tales','Xitter','Pepeu','João'].map((name,i)=>({id:uid(i+1),name,status:'ativo'}));
let projects=[], payments=[], history=[], revisions=[], members=[];
let browser, server;

(async()=>{
  const { calculateCommission } = await import(pathToFileURL(path.resolve('js/lib/commission-calculator.mjs')));
  const bridge = `
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const own = sessionStorage.getItem('commission_test_own') === '1';
    window.MSY = {
      db: { rpc: async (name,args) => { const response = await fetch('/__rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args,own})});return response.json(); } },
      Utils: { escapeHtml, formatDate: v => v || '—', formatDateTime: v => v || '—', showToast: (message,type) => { window.__lastToast={message,type}; } },
      ViewMode: { isActive: () => false },
      renderSidebar: async () => { document.getElementById('sidebar').innerHTML='<nav><a href="dashboard.html">Dashboard</a><a href="comissionamento.html">Comissionamento</a></nav>';return {id:'${uid(1)}',tier:own?'membro':'diretoria'}; },
      renderTopBar: async () => { document.getElementById('topbar').textContent='Portal MSY'; }
    };
    const MSYPerms={check:async(id,tier)=>tier==='diretoria'};
    window.MSYConfirm={show:async()=>true};
  `;
  server=createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/__rpc') {
        let raw='';for await(const chunk of req) raw+=chunk;
        const {name,args,own}=JSON.parse(raw);
        let data;
        if(name==='commission_read') {
          if(args.p_own) data={own:projects.filter(p=>p.approved_at).map(p=>({id:p.id,project_name:p.input.project_name,project_date:p.input.project_date,status:p.status,settled_at:p.settled_at,execution:members.find(m=>m.user_id===uid(1)),referral_cents:0,payments:payments.filter(pay=>pay.user_id===uid(1))}))};
          else if(own) throw new Error('Acesso negado.');
          else if(args.p_id) data={project:projects.find(p=>p.id===args.p_id),members,payments,history,revisions};
          else data={projects,payments,history,profiles:people,linked_projects:[],role_options:[]};
        } else if(name==='commission_command') {
          const {p_action:action,p_id:id,p_payload:payload}=args;
          let p=projects.find(p=>p.id===id);
          if(action==='create') {
            p={id,input:payload.input,result:calculateCommission(payload.input),status:'draft',version:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};projects.push(p);
          } else {if(p.version!==args.p_version) throw new Error('Conflito de versão.');p.version++;}
          if(action==='save') {p.input=payload.input;p.result=calculateCommission(payload.input);p.status='draft';p.approved_at=null;}
          if(['save','create'].includes(action)) members=p.result.members.map(m=>({...m,project_id:id,member_key:m.user_id,name_snapshot:people.find(person=>person.id===m.user_id).name}));
          if(action==='review') p.status='review';
          if(action==='approve') {calculateCommission(p.input,true);p.status='approved';p.approved_at=new Date().toISOString();p.approved_by=uid(1);revisions.push({version:p.version,approved_at:p.approved_at,snapshot:{project:p.input}});}
          if(action==='settle') {p.status='pending';p.settled_at=payload.date;p.settled_by=uid(1);}
          if(action==='pay') {const amount=payload.payment_type==='execution'?members.find(m=>m.user_id===payload.user_id).final_cents:p.result.referral_cents;payments.push({project_id:id,beneficiary_key:payload.user_id,user_id:payload.user_id,payment_type:payload.payment_type,amount_cents:amount,paid_at:payload.date,registered_by:uid(1),name_snapshot:people.find(person=>person.id===payload.user_id).name});if(payments.length===5)p.status='paid';}
          history.unshift({id:history.length+1,project_id:id,action,actor_name:'Tales',created_at:new Date().toISOString()});data=p;
        }
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error:null}));return;
      }
      if(url.pathname==='/js/app.js') {res.setHeader('Content-Type','text/javascript');res.end(bridge);return;}
      if(url.pathname.startsWith('/js/')&&!['/js/pages/comissionamento.js','/js/lib/commission-calculator.mjs','/js/lib/commission-service.mjs'].includes(url.pathname)) {res.setHeader('Content-Type','text/javascript');res.end('');return;}
      const local=path.resolve('.'+url.pathname);
      if(!local.startsWith(path.resolve('.')+path.sep)||!/^\/(?:comissionamento\.html|css\/[^/]+\.css|js\/(?:pages|lib)\/[^/]+\.(?:js|mjs)|manifest\.json|icons\/[^/]+)$/.test(url.pathname)) {res.writeHead(404);res.end();return;}
      res.setHeader('Content-Type',local.endsWith('.html')?'text/html; charset=utf-8':local.endsWith('.css')?'text/css':/\.m?js$/.test(local)?'text/javascript':'application/json');
      res.end(await fs.readFile(local));
    } catch(error) {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:null,error:{message:error.message}}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({executablePath:browserExe,headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.fulfill({status:200,contentType:route.request().resourceType()==='script'?'text/javascript':'text/css',body:route.request().resourceType()==='script'?'window.supabase={};':''}));
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const base=`http://127.0.0.1:${server.address().port}/comissionamento.html`;
  await page.goto(base+'#new');
  await page.getByText('Informações gerais',{exact:true}).waitFor();
  await page.locator('[name="project_name"]').fill('Site Cliente X');
  await page.locator('[name="client_name"]').fill('Cliente X');
  await page.locator('[name="gross_cents"]').fill('1.200,00');
  await page.locator('[name="referral_user_id"]').selectOption(uid(4));
  const weights=['35','30','20','15'];
  for(let i=0;i<4;i++) {
    await page.getByRole('button',{name:'+ Adicionar participante',exact:true}).click();
    await page.locator('[name="member_user"]').nth(i).selectOption(uid(i+1));
    assert.equal(await page.locator('[name="member_weight"]').nth(i).inputValue(),`${weights[i].replace('.',',')}${weights[i].includes('.')?'':' ,00'}`.replace(' ',''));
  }
  await page.locator('[name="member_participation"]').nth(0).selectOption('100');
  await page.locator('[name="member_participation"]').nth(1).selectOption('75');
  await page.locator('[name="member_participation"]').nth(2).selectOption('100');
  await page.locator('[name="member_participation"]').nth(3).selectOption('100');
  assert.match(await page.locator('#commissionSummary').innerText(),/358,50/);
  assert.match(await page.locator('[data-member-result="1"]').innerText(),/175,50/);
  assert.match(await page.locator('#commissionSummary').innerText(),/Cálculo fechado corretamente/);
  await fs.mkdir('.commission-test',{recursive:true});
  await page.screenshot({path:'.commission-test/editor-desktop.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'.commission-test/editor-mobile.png',fullPage:true,animations:'disabled'});
  await page.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));
  await page.screenshot({path:'.commission-test/editor-light.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();
  await page.getByRole('button',{name:'Aprovar distribuição',exact:true}).waitFor();
  assert.equal(projects.length,1);assert.equal(projects[0].result.company_total_cents,35850);
  await page.getByRole('button',{name:'Aprovar distribuição',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar quitação integral',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Marcar pago',exact:true}).count(),0);
  await page.getByRole('button',{name:'Confirmar quitação integral',exact:true}).click();
  await page.getByRole('button',{name:'Marcar pago',exact:true}).first().waitFor();
  await page.getByRole('button',{name:'Marcar pago',exact:true}).first().click();
  await page.getByText('Os valores financeiros estão bloqueados.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Editar cálculo',exact:true}).count(),0);
  for(let i=0;i<4;i++) {await page.getByRole('button',{name:'Marcar pago',exact:true}).first().click();await page.waitForFunction(expected=>document.querySelectorAll('[data-action="pay"]').length===expected,3-i);}
  assert.equal(payments.length,5);assert.equal(projects[0].status,'paid');
  await page.locator('.commission-tabs a[href="#dashboard"]').click();
  await page.getByText('Visão do período',{exact:true}).waitFor();
  assert.match(await page.locator('#commissionResults').innerText(),/358,50/);
  await page.locator('.commission-tabs a[href="#projects"]').click();
  await page.getByText('Projetos (1)',{exact:true}).waitFor();
  await page.getByRole('link',{name:/Abrir projeto Site Cliente X/}).click();
  await page.getByText('Distribuição da execução',{exact:true}).waitFor();
  await page.goBack();
  await page.getByText('Projetos (1)',{exact:true}).waitFor();
  await page.locator('[name="search"]').fill('inexistente');
  await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();
  await page.getByText('Projetos (0)',{exact:true}).waitFor();
  await page.locator('.commission-tabs a[href="#history"]').click();
  await page.getByText('Últimas alterações',{exact:true}).waitFor();
  await page.evaluate(()=>sessionStorage.setItem('commission_test_own','1'));
  await page.goto(base+'#own');
  await page.reload(); // New authenticated fixture session, not just a hash route.
  await page.getByText('Total recebido',{exact:true}).waitFor();
  assert.equal(await page.getByText('Xitter',{exact:true}).count(),0);
  assert.equal(await page.getByText('Novo cálculo',{exact:true}).count(),0);
  assert.match(await page.locator('#commissionContent').innerText(),/273,00/);
  assert.equal(await page.evaluate(()=>document.getElementById('commissionContent').getBoundingClientRect().right<=innerWidth),true);
  await page.screenshot({path:'.commission-test/own-mobile.png',fullPage:true,animations:'disabled'});
  assert.deepEqual(errors,[]);
  console.log('PASS: real UI + mocked RPC: live arithmetic, desktop/mobile/light, create/approve/settle/pay, own-only rendering.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server?.close();});
