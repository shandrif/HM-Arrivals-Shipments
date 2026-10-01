import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root='/home/user/HM-Arrivals-Shipments';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(root,p);
 if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}
 const t={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.mp4':'video/mp4','.webm':'video/webm'}[path.extname(f)]||'application/octet-stream';
 r.writeHead(200,{'content-type':t});fs.createReadStream(f).pipe(r);}).listen(8123);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const pg=await b.newPage({viewport:{width:1440,height:810},deviceScaleFactor:1.5});
pg.on('pageerror',e=>console.log('ERR',e.message));
await pg.route('**/rest/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
await pg.addInitScript(()=>{Object.defineProperty(window,'matchMedia',{value:q=>({matches:/reduce/.test(q),addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}})})});
await pg.goto('http://localhost:8123/');
await pg.waitForTimeout(1500);
await pg.evaluate(()=>{document.body.classList.remove('locked');document.getElementById('gate').hidden=true;document.getElementById('splash')?.remove();});
await pg.evaluate(()=>{document.getElementById('emptyTitle').textContent='No data yet';document.getElementById('emptyText').textContent='Upload a waste report to get started.';const st=document.createElement('style');st.textContent='#tblStores td:nth-child(2),#tblStores th:nth-child(2){visibility:hidden}';document.head.appendChild(st);});
const dim=await pg.evaluate(()=>document.fonts.ready.then(()=>[...document.fonts].map(f=>f.family+f.status).join()));console.log(dim);
await pg.screenshot({path:'s0-empty.png'});await pg.click('details.more summary');await pg.waitForTimeout(700);await pg.screenshot({path:'s0b-menu-empty.png'});const boxes={};boxes.summary=await pg.evaluate(()=>{const b=document.querySelector('details.more summary').getBoundingClientRect();return[b.x,b.y,b.width,b.height]});boxes.upload=await pg.evaluate(()=>{const b=document.querySelector('.menu label.btn.primary').getBoundingClientRect();return[b.x,b.y,b.width,b.height]});await pg.click('details.more summary');await pg.waitForTimeout(300);
await pg.evaluate(async()=>{
 let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
 const M=window.DEFAULT_MAPPING.filter((m,i)=>m.code&&m.branch&&i%4===0).slice(0,16);
 const prods=[['WP01030088','Pudding Dates Cake','pcs',4.88,'Pastries & Sweets'],['WP01020033','Candied Pecan Ice Cream','kg',41.9,'Mixes'],['WP01010011','Saffron Croissant','pcs',3.2,'Bakery'],['WP01010024','Pistachio Danish','pcs',4.1,'Bakery'],['WP01040007','Cardamom Brioche','pcs',2.9,'Bakery'],['WP01030102','Caramel Éclair','pcs',5.5,'Pastries & Sweets'],['WP01030131','Date Tart','pcs',3.7,'Pastries & Sweets'],['WP01020048','Vanilla Gelato Base','kg',28.4,'Mixes'],['WP01050003','Cold Brew Bottle','pcs',6.8,'Beverages'],['WP01050019','Mango Smoothie Mix','L',12.2,'Beverages'],['WP01010040','Sourdough Loaf','pcs',7.5,'Bakery'],['WP01030150','Chocolate Tart','pcs',6.1,'Pastries & Sweets']];
 const rec=[['Code','Stock list','U/M','Quantity in meas. units','Unit Pr','Wastage Value','Document date','Document type','Write-off storage','Category']];
 const sal=[['Store','Write-off storage','Net Sales']];
 M.forEach((m,i)=>{const sales=110000+Math.round(rnd()*90000);const target=(0.7+rnd()*1.5)/100*sales;const stg=m.branch+' Main Storage';
  sal.push([m.code+' '+m.branch,stg,sales]);let acc=0;const n=60;
  for(let k=0;k<n;k++){const p=prods[Math.floor(rnd()*prods.length)];const q=p[2]==='pcs'?1+Math.floor(rnd()*14):Math.round((.3+rnd()*3)*10)/10;const v=Math.round(q*p[3]*100)/100;acc+=v;
   rec.push([p[0],p[1],p[2],q,p[3],v,'2026-09-'+String(20+Math.floor(rnd()*7)),'Write-off record',stg,p[4]]);}
  const scale=target/acc;for(let r=rec.length-n;r<rec.length;r++){rec[r][5]=Math.round(rec[r][5]*scale*100)/100;rec[r][3]=Math.round(rec[r][3]*scale*10)/10||0.1;}});
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rec),'Waste Records');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(sal),'Net Sales');
 const buf=XLSX.write(wb,{type:'array',bookType:'xlsx'});
 await window.__wasteApp.handleWasteFiles([new File([buf],'Waste_Report_W39.xlsx')]);
});
await pg.waitForTimeout(2500);
await pg.screenshot({path:'s1-overview.png'});
await pg.evaluate(()=>{const n=document.getElementById('publishBar');if(n)n.hidden=true;});await pg.screenshot({path:'s1-overview.png'});boxes.kpis=await pg.evaluate(()=>[...document.querySelectorAll('#kpis .kpi')].map(e=>{const b=e.getBoundingClientRect();return[b.x,b.y,b.width,b.height]}));await pg.click('#tabbtn-stores');await pg.waitForTimeout(1200);await pg.screenshot({path:'s2-stores.png'});

boxes.table=await pg.evaluate(()=>{const b=document.querySelector('#tblStores').getBoundingClientRect();return[b.x,b.y,b.width,b.height]});boxes.wasteTh=await pg.evaluate(()=>{const b=document.querySelector('#tblStores th.sorted').getBoundingClientRect();return[b.x,b.y,b.width,b.height]});fs.writeFileSync('boxes.json',JSON.stringify(boxes));await b.close();srv.close();
