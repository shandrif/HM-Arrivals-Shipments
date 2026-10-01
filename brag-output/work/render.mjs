import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const only=process.argv[2]?process.argv[2].split(',').map(Number):null;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const pg=await b.newPage({viewport:{width:1920,height:1080}});
pg.on('pageerror',e=>console.log('ERR',e.message));
await pg.goto('file://'+process.cwd()+'/stage_b.html');
await pg.waitForFunction('window.READY');await pg.waitForTimeout(500);
fs.mkdirSync('frames',{recursive:true});fs.mkdirSync('stills',{recursive:true});
if(only){for(const t of only){await pg.evaluate(t=>setT(t),t);await pg.screenshot({path:`stills/t${t}.png`});}}
else{for(let f=0;f<600;f++){await pg.evaluate(t=>setT(t),f/30);await pg.screenshot({path:`frames/f${String(f).padStart(4,'0')}.jpg`,type:'jpeg',quality:94});}}
await b.close();
