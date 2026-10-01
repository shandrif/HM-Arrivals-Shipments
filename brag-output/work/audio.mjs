import fs from 'fs';
const SR=44100,D=20,N=SR*D;const L=new Float32Array(N),R=new Float32Array(N);
const bpm=104,beat=60/bpm,bar=beat*4;
const mtof=m=>440*Math.pow(2,(m-69)/12);
let seed=11;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647*2-1;
function add(t0,dur,gen,gain,pan=0){const s=Math.floor(t0*SR),n=Math.floor(dur*SR);const gl=gain*Math.cos((pan+1)*Math.PI/4),gr=gain*Math.sin((pan+1)*Math.PI/4);
 for(let i=0;i<n&&s+i<N;i++){const v=gen(i/SR,i/n);L[s+i]+=v*gl;R[s+i]+=v*gr;}}
// chords: C, Am, F, G  (voicings midi)
const chords=[[48,55,60,64,67],[45,52,57,60,64],[41,48,53,57,60],[43,50,55,59,62]];
const bass=[36,33,29,31];
const pent=[[72,76,79,76,84,79,76,79],[69,72,76,72,81,76,72,76],[65,69,72,69,77,72,69,72],[67,71,74,71,79,74,71,74]];
const bars=Math.ceil(D/bar);
for(let b=0;b<bars;b++){const t=b*bar,c=b%4;
 // pad
 for(const m of chords[c]){const f=mtof(m);add(t,bar+.4,(x,p)=>{const env=Math.min(1,x/.35)*Math.min(1,(bar+.4-x)/.5);return env*(Math.sin(2*Math.PI*f*x)+.5*Math.sin(2*Math.PI*f*1.003*x))*.5},.035,(m%5-2)/4)}
 // bass
 for(const o of [0,1.5,2,3.5]){add(t+o*beat,beat*1.2,(x,p)=>Math.sin(2*Math.PI*mtof(bass[c])*x)*Math.exp(-x*3.2),.18)}
 // pluck arp 8ths from bar 1
 if(b>=1)pent[c].forEach((m,i)=>{const f=mtof(m);add(t+i*beat/2,.9,(x)=>{const e=Math.exp(-x*6);return e*(Math.sin(2*Math.PI*f*x)+.35*Math.sin(4*Math.PI*f*x)+.12*Math.sin(6*Math.PI*f*x))},.07,(i%2?.35:-.35))});
 // kick + hats
 if(b>=1){for(let k=0;k<4;k++){add(t+k*beat,.3,(x)=>Math.sin(2*Math.PI*(52+60*Math.exp(-x*28))*x)*Math.exp(-x*9),.30);}
  for(let k=0;k<8;k++){let y=0,yp=0;add(t+k*beat/2+beat/4*(k%2),.06,(x)=>{const n=rnd();const o=n-yp;yp=n;return o*Math.exp(-x*70)},.045,.2)}}
}
// sfx
function whoosh(t0,dur,f0,f1,g){let lp=0;add(t0,dur,(x,p)=>{const f=f0+(f1-f0)*p;const a=Math.exp(-Math.pow((p-.5)*2.4,2));const n=rnd();lp+=(n-lp)*Math.min(.9,2*Math.PI*f/SR);return lp*a},g)}
whoosh(2.0,.7,400,3000,.22);whoosh(3.2,.9,300,2500,.2);whoosh(11.3,.7,500,3000,.17);whoosh(15.7,.8,400,2400,.18);
function ping(t0,m,g){const f=mtof(m);add(t0,.9,(x)=>Math.exp(-x*5)*(Math.sin(2*Math.PI*f*x)+.3*Math.sin(2*Math.PI*f*2*x)),g,.1)}
ping(5.0,84,.08); // click
add(5.0,.05,(x)=>rnd()*Math.exp(-x*160),.05);
ping(5.65,91,.06);ping(8.3,88,.05);ping(13.3,91,.05);
ping(16.5,79,.09);ping(16.62,84,.08);ping(16.74,88,.08);ping(16.86,91,.07);
ping(18.5,96,.05);
// duck music slightly? simple: global envelope
const fadeIn=.3,fadeOut=1.4;let peak=0;
for(let i=0;i<N;i++){const t=i/SR;const e=Math.min(1,t/fadeIn)*Math.min(1,(D-t)/fadeOut);L[i]*=e;R[i]*=e;peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i]));}
// simple stereo delay/room
const dl=Math.floor(SR*.18);for(let i=N-1;i>=dl;i--){L[i]+=R[i-dl]*.12;R[i]+=L[i-dl]*.12}
const g=.85/peak;
const buf=Buffer.alloc(N*4+44);buf.write('RIFF',0);buf.writeUInt32LE(36+N*4,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(2,22);buf.writeUInt32LE(SR,24);buf.writeUInt32LE(SR*4,28);buf.writeUInt16LE(4,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(N*4,40);
for(let i=0;i<N;i++){buf.writeInt16LE(Math.round(Math.max(-1,Math.min(1,L[i]*g))*32767),44+i*4);buf.writeInt16LE(Math.round(Math.max(-1,Math.min(1,R[i]*g))*32767),46+i*4);}
fs.writeFileSync('audio.wav',buf);console.log('peak',peak);
