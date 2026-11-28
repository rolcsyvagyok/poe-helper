// "Vastiri": a stepped temple-pyramid in the desert under a black eclipse, cold steel sky and bronze sand
function paint(ctx,W,H){
 const N=makeNoise(21), r=rng(31);
 const ex=W*0.84, ey=H*0.2;
 skyPixels(ctx,W,H,[[0,[10,14,22]],[0.35,[28,42,58]],[0.58,[70,88,98]],[0.66,[120,110,92]],[1,[30,24,20]]],(x,y,b)=>{
  const n=N.fbm(x*0.0018,y*0.007,6);const s=Math.max(0,n+0.05);
  const d=Math.hypot(x-ex,(y-ey)*1.1)/W;const halo=Math.max(0,0.22-d)*3.2;
  return [b[0]*(1-s*0.6)+halo*150,b[1]*(1-s*0.55)+halo*175,b[2]*(1-s*0.5)+halo*185];});
 // eclipse: corona rays, black disc, thin bright rim
 ctx.save();ctx.translate(ex,ey);for(let i=0;i<160;i++){const a=r()*Math.PI*2,l=60+r()*170;const gg=ctx.createLinearGradient(0,0,Math.cos(a)*l,Math.sin(a)*l);gg.addColorStop(0.3,'rgba(210,235,240,0.16)');gg.addColorStop(1,'rgba(210,235,240,0)');ctx.strokeStyle=gg;ctx.lineWidth=1+r()*2;ctx.beginPath();ctx.moveTo(Math.cos(a)*48,Math.sin(a)*48);ctx.lineTo(Math.cos(a)*l,Math.sin(a)*l);ctx.stroke();}
 const cg=ctx.createRadialGradient(0,0,44,0,0,120);cg.addColorStop(0,'rgba(230,245,250,0.85)');cg.addColorStop(0.12,'rgba(170,215,230,0.4)');cg.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=cg;ctx.beginPath();ctx.arc(0,0,120,0,7);ctx.fill();
 ctx.fillStyle='rgb(6,8,12)';ctx.beginPath();ctx.arc(-3,2,47,0,7);ctx.fill();ctx.restore();
 // far mesas
 mesas(ctx,W,H,N,{y0:H*0.6,amp:110,freq:0.004,seed:2,color:'rgba(84,92,96,0.7)',blur:2});
 mesas(ctx,W,H,N,{y0:H*0.66,amp:80,freq:0.006,seed:6,color:'rgba(70,70,70,0.85)',blur:1});
 // the stepped pyramid
 const px=W*0.62, base=H*0.83, steps=9, bw=W*0.42, top=H*0.33;
 for(let i=0;i<steps;i++){const t=i/steps;const w=bw*(1-t*0.8);const y1=base-(base-top)*t, y0=base-(base-top)*(i+1)/steps;
  const lg=ctx.createLinearGradient(px-w/2,0,px+w/2,0);lg.addColorStop(0,'rgb(92,74,54)');lg.addColorStop(0.5,'rgb(60,48,38)');lg.addColorStop(1,'rgb(28,24,22)');ctx.fillStyle=lg;ctx.fillRect(px-w/2,y0,w,y1-y0+1);
  ctx.fillStyle='rgba(220,180,120,0.18)';ctx.fillRect(px-w/2,y0,w,2);}
 // central stair and shrine
 ctx.fillStyle='rgb(40,32,26)';ctx.beginPath();ctx.moveTo(px-26,base);ctx.lineTo(px-12,top);ctx.lineTo(px+12,top);ctx.lineTo(px+26,base);ctx.fill();
 for(let y=top;y<base;y+=7){ctx.fillStyle='rgba(200,160,110,0.12)';ctx.fillRect(px-26+(y-top)/(base-top)*0+((base-y)/(base-top))*14,y,52-((base-y)/(base-top))*28,1);}
 ctx.fillStyle='rgb(34,28,24)';ctx.fillRect(px-34,top-46,68,48);ctx.beginPath();ctx.moveTo(px-42,top-46);ctx.lineTo(px,top-70);ctx.lineTo(px+42,top-46);ctx.fill();
 // a cold blue glow in the shrine door (PoE2's runes)
 const dg=ctx.createRadialGradient(px,top-20,2,px,top-20,70);dg.addColorStop(0,'rgba(120,220,255,0.9)');dg.addColorStop(0.25,'rgba(80,170,230,0.35)');dg.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=dg;ctx.fillRect(px-80,top-90,160,140);
 ctx.fillStyle='rgba(170,240,255,0.95)';ctx.fillRect(px-7,top-34,14,30);
 // sand haze at the pyramid foot
 wash(ctx,W,H*0.55,H*0.8,[140,124,100],0,0.45);
 // dunes, layered
 ridge(ctx,W,H,N,{y0:H*0.8,amp:50,freq:0.0025,seed:5,color:'rgb(104,82,58)',oct:3});
 ridge(ctx,W,H,N,{y0:H*0.86,amp:60,freq:0.002,seed:9,color:'rgb(66,50,36)',oct:3});
 // broken pillars and a fallen head-stone in the foreground
 const pil=(x,y,w,h,col)=>{ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-h);ctx.lineTo(x+w*0.3,y-h-8);ctx.lineTo(x+w*0.55,y-h+4);ctx.lineTo(x+w,y-h-3);ctx.lineTo(x+w,y);ctx.fill();ctx.fillStyle='rgba(255,210,150,0.12)';ctx.fillRect(x,y-h,3,h);};
 pil(W*0.12,H*0.95,34,170,'rgb(30,24,20)');pil(W*0.17,H*0.93,26,90,'rgb(34,27,22)');pil(W*0.95,H*0.97,40,230,'rgb(26,21,18)');pil(W*0.4,H*0.94,22,70,'rgb(32,25,20)');
 ridge(ctx,W,H,N,{y0:H*0.96,amp:22,freq:0.004,seed:12,color:'rgb(22,17,14)',oct:3});
 // a lone figure on the dune crest, walking toward the temple
 ctx.fillStyle='rgb(14,12,12)';const fx=W*0.3, fy=H*0.83;ctx.beginPath();ctx.ellipse(fx,fy-34,4,5,0,0,7);ctx.fill();ctx.beginPath();ctx.moveTo(fx-7,fy);ctx.lineTo(fx-4,fy-29);ctx.lineTo(fx+5,fy-29);ctx.lineTo(fx+9,fy);ctx.fill();ctx.strokeStyle='rgb(14,12,12)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(fx+6,fy-26);ctx.lineTo(fx+14,fy+2);ctx.stroke();
 // blowing sand
 for(let i=0;i<2200;i++){const x=r()*W,y=H*0.55+r()*H*0.45;ctx.fillStyle=`rgba(210,180,130,${r()*0.08})`;ctx.fillRect(x,y,4+r()*24,1);}
 texture(ctx,W,H,N,0.3,0.01);texture(ctx,W,H,makeNoise(77),0.16,0.07);
 finish(ctx,W,H,8,14,0.85);
}
