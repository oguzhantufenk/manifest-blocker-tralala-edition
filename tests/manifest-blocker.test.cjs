const {chromium}=require('playwright');
const fs=require('node:fs');const assert=require('node:assert/strict');
const code=fs.readFileSync('manifest-blocker.js','utf8');
const fixture=fs.readFileSync('tests/fixture.html','utf8');
fs.mkdirSync('.test-artifacts',{recursive:true});
const results=[];let browser;
async function setup(cfg={}){
 const context=await browser.newContext({viewport:{width:1280,height:960}});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const request=route.request();
  if(request.isNavigationRequest()){await route.fulfill({body:fixture,contentType:'text/html'});return;}
  if(request.url().includes('/mutes/keywords/create.json')){
    const data=JSON.parse(request.postData());
    if(cfg.hold){await new Promise(r=>cfg.release=r);}
    const status=cfg.rateAt===data.attempt?429:cfg.http||200;
    const body=cfg.response|| (status===429?{errors:[{code:88,message:'Rate limit exceeded'}]}:{muted_keywords:[{keyword:data.word,id:String(data.attempt)}]});
    await route.fulfill({status,headers:{'content-type':'application/json',...(status===429?{'retry-after':String(cfg.retry||120)}:{})},body:cfg.badJson?'broken':JSON.stringify(body)}).catch(()=>{});return;
  }
  await route.abort();
 });
 await page.addInitScript(c=>window.CONFIG=c,cfg);
 await page.goto('https://x.com/settings/muted_keywords');
 await page.clock.install();await page.clock.pauseAt(new Date());
 await page.evaluate(code);
 return {page,context,errors,cfg};
}
const tick=async(p,ms=200)=>{await p.clock.runFor(ms);await new Promise(r=>setTimeout(r,2));};
async function until(p,condition,max=45000){
 for(let t=0;t<max;t+=200){if(await p.evaluate(condition))return;await tick(p);}
 throw new Error('timeout '+JSON.stringify(await p.evaluate(()=>({s:ManifestBlocker?.status(),detail:document.querySelector('#manifest-blocker-panel')?.shadowRoot.querySelector('.detail').textContent,calls:window.calls,trace:window.trace}))));
}
const idle=p=>until(p,()=>!ManifestBlocker.status().busy);
const selected=async(p,words)=>{
 await p.getByRole('button',{name:'seçimi temizle',exact:true}).click();
 for(const w of words)await p.locator('#manifest-blocker-panel .row').filter({has:p.getByText(w,{exact:true})}).getByRole('checkbox').check();
};
async function test(name,fn){if(process.argv[2]&&!name.includes(process.argv[2]))return;const start=Date.now();try{await fn();results.push({name,ok:true,ms:Date.now()-start});console.log('PASS',name);}catch(e){results.push({name,ok:false,error:e.stack});console.error('FAIL',name,e.message);}}
(async()=>{
 browser=await chromium.launch({headless:true});
 await test('Initial scan, exact duplicates, case normalization, no accidental writes',async()=>{
  const f=await setup({existing:['MANİFEST','manifest edit','another word']});await idle(f.page);
  const s=await f.page.evaluate(()=>ManifestBlocker.status());assert.equal(s.existing.length,3);assert.deepEqual(await f.page.evaluate(()=>calls),[]);
  assert.equal(await f.page.locator('#manifest-blocker-panel .stat b').first().textContent(),'2');
  await f.page.evaluate(code);assert.equal(await f.page.locator('#manifest-blocker-panel').count(),1);
  assert.deepEqual(f.errors,[]);await f.context.close();
 });
 await test('Virtualized list covers offscreen rows and restores scroll',async()=>{
  const existing=Array.from({length:80},(_,i)=>'unrelated '+i);existing[0]='manifest';existing[35]='manifest fancam';existing[79]='toz pembe';
  const f=await setup({existing,virtual:true});await idle(f.page);
  assert.equal((await f.page.evaluate(()=>ManifestBlocker.status())).existing.length,80);
  assert.equal(await f.page.locator('#scroll').evaluate(e=>e.scrollTop),0);await f.context.close();
 });
 for(const turkishRows of [false,true])await test('Live X role-link rows without href or testid '+(turkishRows?'TR':'EN'),async()=>{
  const existing=Array.from({length:65},(_,i)=>'word '+i);existing[0]='manifest';existing[31]='manifest grubu';existing[64]='manifest fancam';
  const f=await setup({existing,virtual:true,roleRows:true,turkishRows});await idle(f.page);
  assert.equal((await f.page.evaluate(()=>ManifestBlocker.status())).existing.length,65);
  assert.equal(await f.page.locator('#manifest-blocker-panel .stat b').first().textContent(),'3');
  assert.equal(await f.page.evaluate(()=>window.unmuteCalls||0),0);assert.equal(await f.page.evaluate(()=>calls.length),0);
  await selected(f.page,['manifest edit']);await f.page.getByRole('button',{name:'seçilileri sessize al',exact:true}).click();await idle(f.page);
  assert.deepEqual(await f.page.evaluate(()=>ManifestBlocker.status().verified),['manifest edit']);
  assert.equal(await f.page.evaluate(()=>window.unmuteCalls||0),0);assert.deepEqual(f.errors,[]);await f.context.close();
 });
 await test('Updating old idle panel replaces it; an active panel is not interrupted',async()=>{
  const f=await setup();await idle(f.page);await f.page.evaluate(()=>{const original=ManifestBlocker;window.manifestblocker=window.ManifestBlocker={...original,version:'1.0.0',status:()=>({busy:true})};});
  const alerts=[];f.page.on('dialog',async d=>{alerts.push(d.message());await d.dismiss();});
  await f.page.evaluate(code);assert.equal(await f.page.evaluate(()=>ManifestBlocker.version),'1.0.0');assert.equal(alerts.length,1);
  await f.page.evaluate(()=>{const current=ManifestBlocker;window.manifestblocker=window.ManifestBlocker={...current,status:()=>({busy:false}),dismiss:()=>{current.dismiss();delete window.ManifestBlocker;delete window.manifestblocker;}};});
  await f.page.evaluate(code);await idle(f.page);assert.equal(await f.page.evaluate(()=>ManifestBlocker.version),'2.0.0');
  assert.equal(await f.page.locator('#manifest-blocker-panel').count(),1);assert.deepEqual(f.errors,[]);await f.context.close();
 });
 for(const transport of ['fetch','xhr'])await test(transport+' confirmed save + settings + cleanup',async()=>{
  const f=await setup({existing:[],transport});await idle(f.page);await selected(f.page,['manifest grubu']);
  await f.page.getByRole('button',{name:'seçilileri sessize al',exact:true}).click();await idle(f.page);
  const s=await f.page.evaluate(()=>ManifestBlocker.status());assert.deepEqual(s.verified,['manifest grubu']);
  const calls=await f.page.evaluate(()=>calls);assert.equal(calls.length,1);assert.deepEqual(calls[0].options,['Ana sayfa zaman akışı','Bildirimler','Herkesten','Süresiz']);
  await f.page.evaluate(()=>ManifestBlocker.dismiss());
  assert.equal(await f.page.evaluate(()=>window.fetch===originals.fetch&&XMLHttpRequest.prototype.send===originals.send&&XMLHttpRequest.prototype.open===originals.open&&!window.ManifestBlocker),true);
  assert.deepEqual(f.errors,[]);await f.context.close();
 });
 await test('Fallback selectors with text Save and unique text input',async()=>{
  const f=await setup({existing:[],fallback:true});await idle(f.page);await selected(f.page,['manifest edit']);
  await f.page.getByRole('button',{name:'seçilileri sessize al',exact:true}).click();await idle(f.page);
  assert.deepEqual(await f.page.evaluate(()=>ManifestBlocker.status().verified),['manifest edit']);await f.context.close();
 });
 for(const durationLabel of ['Until you unmute the word','Until you unmute this word','Forever'])await test('English duration: '+durationLabel,async()=>{
  const f=await setup({existing:[],english:true,durationLabel,switchControl:true});await idle(f.page);
  await selected(f.page,['manifest edit']);await f.page.getByRole('button',{name:'seçilileri sessize al',exact:true}).click();await idle(f.page);
  assert.deepEqual(await f.page.evaluate(()=>manifestblocker.status().verified),['manifest edit']);
  const calls=await f.page.evaluate(()=>calls);assert.equal(calls.length,1);assert.deepEqual(calls[0].options,['Home timeline','Notifications','From anyone',durationLabel]);
  assert.deepEqual(f.errors,[]);await f.context.close();
 });
 await test('Unknown duration stops before saving and does not blame the interface language',async()=>{
  const f=await setup({existing:[],english:true,durationLabel:'A different duration'});await idle(f.page);
  await selected(f.page,['manifest edit']);await f.page.getByRole('button',{name:'seçilileri sessize al',exact:true}).click();await idle(f.page);
  assert.equal(await f.page.evaluate(()=>calls.length),0);assert.match(await f.page.locator('#manifest-blocker-panel .detail').textContent(),/etiket veya kontrol yapısı/);
  await f.context.close();
 });
 await test('Lowercase branding, no logo and new palette',async()=>{
  const f=await setup();await idle(f.page);
  const ui=await f.page.locator('#manifest-blocker-panel').innerText();assert.equal(ui,ui.toLocaleLowerCase('tr-TR'));
  assert.equal(await f.page.locator('#manifest-blocker-panel h2').textContent(),'manifest blocker:');
  assert.equal(await f.page.locator('#manifest-blocker-panel .eyebrow').textContent(),'tralala edition');
  assert.equal(await f.page.locator('#manifest-blocker-panel .mark').count(),0);
  assert.equal(await f.page.locator('#manifest-blocker-panel .primary').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 176, 136)');
  assert.equal(await f.page.evaluate(()=>manifestblocker.version),'2.0.0');await f.context.close();
 });
 for(const cfg of [{response:{errors:[{message:'Denied'}]},optimistic:true},{response:{success:true}},{badJson:true},{noDom:true},{http:500}])await test('No false success '+JSON.stringify(cfg),async()=>{
  const f=await setup({existing:[],...cfg});await idle(f.page);await selected(f.page,['manifest grubu','manifest edit']);
  await f.page.getByRole('button',{name:'seçilileri sessize al',exact:true}).click();await idle(f.page);
  assert.equal(await f.page.evaluate(()=>calls.length),1);assert.deepEqual(await f.page.evaluate(()=>ManifestBlocker.status().verified),[]);
  assert.deepEqual(await f.page.evaluate(()=>ManifestBlocker.status().uncertain),['manifest grubu']);await f.context.close();
 });
 for(const transport of ['fetch','xhr'])await test(transport+' 429 stops, respects Retry-After, no automatic retry',async()=>{
  const f=await setup({existing:[],rateAt:1,retry:120,transport});await idle(f.page);await selected(f.page,['manifest grubu','manifest edit']);
  await f.page.getByRole('button',{name:'seçilileri sessize al',exact:true}).click();await idle(f.page);
  assert.equal(await f.page.evaluate(()=>calls.length),1);assert.deepEqual(await f.page.evaluate(()=>ManifestBlocker.status().verified),[]);
  await tick(f.page,59000);assert.equal(await f.page.getByRole('button',{name:'devam et',exact:true}).isDisabled(),true);
  await tick(f.page,62000);assert.equal(await f.page.evaluate(()=>calls.length),1);assert.equal(await f.page.getByRole('button',{name:'devam et',exact:true}).isEnabled(),true);
  await f.page.getByRole('button',{name:'devam et',exact:true}).click();await idle(f.page);
  assert.deepEqual(await f.page.evaluate(()=>ManifestBlocker.status().verified),['manifest grubu','manifest edit']);
  assert.equal(await f.page.evaluate(()=>calls.length),3);
  await f.context.close();
 });
 for(const cfg of [{unknownRows:true},{pagination:true},{missingOption:true}])await test('Fail closed '+JSON.stringify(cfg),async()=>{
  const f=await setup(cfg);await idle(f.page);
  if(cfg.missingOption){await selected(f.page,['manifest edit']);await f.page.getByRole('button',{name:'seçilileri sessize al',exact:true}).click();await idle(f.page);}
  assert.equal(await f.page.evaluate(()=>calls.length),0);assert.equal(await f.page.evaluate(()=>ManifestBlocker.status().phase),'kontrol gerekiyor');await f.context.close();
 });
 await test('Pause before Save makes no request; resume rescans and succeeds',async()=>{
  const f=await setup({existing:[],pauseOnInput:true});await idle(f.page);await selected(f.page,['manifest edit']);
  await f.page.getByRole('button',{name:'seçilileri sessize al',exact:true}).click();await idle(f.page);
  assert.equal(await f.page.evaluate(()=>calls.length),0);
  await f.page.evaluate(()=>CONFIG.pauseOnInput=false);await f.page.getByRole('button',{name:'devam et',exact:true}).click();await idle(f.page);
  assert.deepEqual(await f.page.evaluate(()=>ManifestBlocker.status().verified),['manifest edit']);await f.context.close();
 });
 await test('Stop after dispatch waits for verification and prevents next write',async()=>{
  const f=await setup({existing:[],hold:true});await idle(f.page);await selected(f.page,['manifest grubu','manifest edit']);
  await f.page.getByRole('button',{name:'seçilileri sessize al',exact:true}).click();await until(f.page,()=>calls.length===1);
  await f.page.evaluate(()=>ManifestBlocker.stop());f.cfg.release();await idle(f.page);
  assert.deepEqual(await f.page.evaluate(()=>ManifestBlocker.status().verified),['manifest grubu']);assert.equal(await f.page.evaluate(()=>calls.length),1);await f.context.close();
 });
 await test('Close during dispatched save is graceful and fully removes hooks',async()=>{
  const f=await setup({existing:[],hold:true});await idle(f.page);await selected(f.page,['manifest edit']);
  await f.page.getByRole('button',{name:'seçilileri sessize al',exact:true}).click();await until(f.page,()=>calls.length===1);
  await f.page.evaluate(()=>ManifestBlocker.dismiss());assert.equal(await f.page.locator('#manifest-blocker-panel').count(),1);
  f.cfg.release();await until(f.page,()=>!window.ManifestBlocker);
  assert.equal(await f.page.locator('#manifest-blocker-panel').count(),0);assert.equal(await f.page.evaluate(()=>window.fetch===originals.fetch&&XMLHttpRequest.prototype.send===originals.send),true);await f.context.close();
 });
 await test('10 successes force 60s, stop/resume and reinjection preserve cooldown',async()=>{
  const f=await setup({existing:[]});await idle(f.page);
  const words=['manifest grubu','manifestgirlband','manifestival','manifam','manifamily','big5 türkiye','big5turkiye','esin bahat','hilal yelekçi','lidya pınar','mina solak'];
  await selected(f.page,words);await f.page.getByRole('button',{name:'seçilileri sessize al',exact:true}).click();
  await until(f.page,()=>ManifestBlocker.status().verified.length===10,90000);
  const s=await f.page.evaluate(()=>({until:ManifestBlocker.status().cooldownUntil,now:Date.now()}));assert.ok(s.until-s.now>=59600);
  await f.page.evaluate(()=>ManifestBlocker.stop());await idle(f.page);await f.page.evaluate(()=>ManifestBlocker.dismiss());await f.page.evaluate(code);await idle(f.page);
  await f.page.getByRole('button',{name:'seçilileri sessize al',exact:true}).click();
  await tick(f.page,45000);assert.equal(await f.page.evaluate(()=>calls.length),10);
  await idle(f.page);const calls=await f.page.evaluate(()=>calls);assert.equal(calls.length,11);assert.ok(calls[10].time>=s.until);
  await f.context.close();
 });
 await test('Search, log clear, minimize, narrow viewport and visual capture',async()=>{
  const f=await setup();await idle(f.page);
  await f.page.clock.resume();
  await f.page.locator('#manifest-blocker-panel').screenshot({path:'.test-artifacts/preview.png'});
  await f.page.getByRole('searchbox',{name:'kelimelerde ara'}).fill('fancam');assert.equal(await f.page.locator('#manifest-blocker-panel .row:visible').count(),1);
  await f.page.getByRole('button',{name:'paneli küçült'}).click();assert.equal(await f.page.locator('#manifest-blocker-panel .body').isVisible(),false);
  await f.page.evaluate(code);assert.equal(await f.page.locator('#manifest-blocker-panel .body').isVisible(),true);
  await f.page.setViewportSize({width:375,height:667});const box=await f.page.locator('#manifest-blocker-panel').boundingBox();assert.ok(box.width>300&&box.x>=0&&box.x+box.width<=375);
  await f.page.locator('#manifest-blocker-panel').screenshot({path:'.test-artifacts/narrow.png'});
  assert.deepEqual(f.errors,[]);await f.context.close();
 });
 await test('Earlier 429 does not move the 10-confirmed-success cooldown boundary',async()=>{
  const f=await setup({existing:[],rateAt:1,retry:60});await idle(f.page);
  const words=['manifest grubu','manifestgirlband','manifestival','manifam','manifamily','big5 türkiye','big5turkiye','esin bahat','hilal yelekçi','lidya pınar','mina solak'];
  await selected(f.page,words);await f.page.getByRole('button',{name:'seçilileri sessize al',exact:true}).click();await idle(f.page);
  await tick(f.page,61000);await f.page.getByRole('button',{name:'devam et',exact:true}).click();
  await until(f.page,()=>ManifestBlocker.status().verified.length===10,140000);
  const s=await f.page.evaluate(()=>({until:ManifestBlocker.status().cooldownUntil,now:Date.now(),calls:calls.length}));
  assert.equal(s.calls,11);assert.ok(s.until-s.now>=59600);
  await tick(f.page,59000);assert.equal(await f.page.evaluate(()=>calls.length),11);
  await idle(f.page);assert.equal(await f.page.evaluate(()=>calls.length),12);await f.context.close();
 });
 await test('Copy page copies the exact complete script, no script execution or external requests',async()=>{
  const context=await browser.newContext({viewport:{width:1280,height:1000}}),page=await context.newPage();const unexpected=[];
  await context.route('**/*',r=>{if(r.request().isNavigationRequest())return r.fulfill({body:fs.readFileSync('index.html','utf8'),contentType:'text/html'});unexpected.push(r.request().url());return r.abort();});
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copied=text;}}}));
  await page.goto('https://manifest-blocker.example/');await page.getByRole('button',{name:'kodu kopyala',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.copied),code);assert.equal(await page.evaluate(()=>typeof window.ManifestBlocker),'undefined');assert.deepEqual(unexpected,[]);
  await page.screenshot({path:'.test-artifacts/copy-page.png',fullPage:true});await context.close();
 });
 await browser.close();fs.writeFileSync(process.argv[2]?'.test-artifacts/test-results-focused.json':'.test-artifacts/test-results.json',JSON.stringify(results,null,2));
 console.log(`${results.filter(r=>r.ok).length}/${results.length} passed`);process.exitCode=results.some(r=>!r.ok)?1:0;
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1});
