import fs from 'node:fs'; import path from 'node:path';
import { PNG } from 'pngjs'; import jpeg from 'jpeg-js';
const files = [...fs.readdirSync('brand').map(f=>'brand/'+f), ...fs.readdirSync('reference').map(f=>'reference/'+f)];
const CT = {0:'gray',2:'rgb',3:'indexed',4:'gray+alpha',6:'rgba'};
for (const f of files) {
  const buf = fs.readFileSync(f); let w,h,data,info='';
  if (buf[0]===0x89) { const ct=buf[25]; info=`PNG IHDR bitdepth=${buf[24]} colourtype=${ct}(${CT[ct]}) `; const p=PNG.sync.read(buf); w=p.width;h=p.height;data=p.data; }
  else { info='JPEG '; const j=jpeg.decode(buf,{useTArray:true}); w=j.width;h=j.height;data=j.data; }
  const ah=new Array(8).fill(0); let pureBlackTransp=0, n=w*h; const q=new Map();
  for (let i=0;i<n;i++){ const a=data[i*4+3]; ah[a>>5]++; if(a<255&&data[i*4]+data[i*4+1]+data[i*4+2]===0) pureBlackTransp++;
    if(i%7===0){const k=((data[i*4]>>4)<<8)|((data[i*4+1]>>4)<<4)|(data[i*4+2]>>4); q.set(k,(q.get(k)||0)+1);} }
  const top=[...q].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,c])=>`#${(k>>8&15).toString(16)}${(k>>4&15).toString(16)}${(k&15).toString(16)}(~${(c*700/n).toFixed(1)}%)`);
  console.log(`${f} ${w}x${h} ${info}\n  alpha hist(8 bins)=${ah.join(',')} pureBlackTransparent=${pureBlackTransp}\n  dominant(4bit)=${top.join(' ')}`);
}
