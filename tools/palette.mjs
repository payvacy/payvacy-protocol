import fs from 'node:fs'; import jpeg from 'jpeg-js';
const src = ['reference/SAMPUL PAYVACY PNG.jpg.jpeg','reference/PAYVACY 1.jpg.jpeg'];
const px=[]; // [r,g,b,file,x,y]
src.forEach((f,fi)=>{const j=jpeg.decode(fs.readFileSync(f),{useTArray:true});
 for(let y=0;y<j.height;y+=3)for(let x=0;x<j.width;x+=3){const i=(y*j.width+x)*4;px.push([j.data[i],j.data[i+1],j.data[i+2],fi,x,y]);}});
let seed=7;const rnd=()=>(seed=(seed*1664525+1013904223)>>>0)/2**32;
const K=9;let C=Array.from({length:K},()=>px[Math.floor(rnd()*px.length)].slice(0,3));
for(let it=0;it<25;it++){const s=C.map(()=>[0,0,0,0]);
 for(const p of px){let b=0,bd=1e9;C.forEach((c,k)=>{const d=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2;if(d<bd){bd=d;b=k}});s[b][0]+=p[0];s[b][1]+=p[1];s[b][2]+=p[2];s[b][3]++;}
 C=s.map((a,k)=>a[3]?[a[0]/a[3],a[1]/a[3],a[2]/a[3]]:C[k]);}
const hex=c=>'#'+c.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const out=C.map(c=>{let b=null,bd=1e9;for(const p of px){const d=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2;if(d<bd){bd=d;b=p}}
 const cnt=px.filter(p=>Math.abs(p[0]-c[0])<40&&Math.abs(p[1]-c[1])<40&&Math.abs(p[2]-c[2])<40).length;
 return {centroid:hex(c),snapped:hex(b),file:src[b[3]],x:b[4],y:b[5],share:+(cnt/px.length*100).toFixed(1)}}).sort((a,b)=>b.share-a.share);
console.log(JSON.stringify(out,null,1));
// white text pixel snap
