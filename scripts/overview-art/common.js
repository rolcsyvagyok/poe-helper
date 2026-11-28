// small painting kit: seeded random, value noise, fbm, helpers
function rng(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
function makeNoise(seed){const r=rng(seed);const P=new Uint8Array(512);const p=[...Array(256).keys()];for(let i=255;i>0;i--){const j=Math.floor(r()*(i+1));[p[i],p[j]]=[p[j],p[i]];}for(let i=0;i<512;i++)P[i]=p[i&255];
 const g=(h)=>((h*0.00390625)*2-1);const f=(t)=>t*t*(3-2*t);
 function n2(x,y){const X=Math.floor(x),Y=Math.floor(y);const xf=x-X,yf=y-Y;const a=P[(X&255)+P[Y&255]],b=P[((X+1)&255)+P[Y&255]],c=P[(X&255)+P[(Y+1)&255]],d=P[((X+1)&255)+P[(Y+1)&255]];const u=f(xf),v=f(yf);return (g(a)*(1-u)+g(b)*u)*(1-v)+(g(c)*(1-u)+g(d)*u)*v;}
 function fbm(x,y,o=5){let s=0,a=0.5,fr=1;for(let i=0;i<o;i++){s+=a*n2(x*fr,y*fr);fr*=2.03;a*=0.5;}return s;}
 return {n2,fbm};}
function mix(a,b,t){return a.map((v,i)=>v+(b[i]-v)*t);}
function rgba(c,a=1){return `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;}
// paint a sky gradient + cloud texture per pixel
function skyPixels(ctx,W,H,stops,cloud){const img=ctx.createImageData(W,H);const d=img.data;
 for(let y=0;y<H;y++){const t=y/H;let i=0;while(i<stops.length-2&&t>stops[i+1][0])i++;const [t0,c0]=stops[i],[t1,c1]=stops[i+1];const base=mix(c0,c1,Math.min(1,Math.max(0,(t-t0)/(t1-t0))));
  for(let x=0;x<W;x++){const c=cloud?cloud(x,y,base):base;const k=(y*W+x)*4;d[k]=c[0];d[k+1]=c[1];d[k+2]=c[2];d[k+3]=255;}}
 ctx.putImageData(img,0,0);}
// grain + vignette over everything
function finish(ctx,W,H,seed,grain=14,vig=0.75){const r=rng(seed);const img=ctx.getImageData(0,0,W,H);const d=img.data;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const k=(y*W+x)*4;const dx=(x/W-0.5)*1.25,dy=(y/H-0.5)*1.6;const v=1-vig*Math.min(1,(dx*dx+dy*dy)*0.9);const n=(r()-0.5)*grain;
  d[k]=Math.max(0,Math.min(255,d[k]*v+n));d[k+1]=Math.max(0,Math.min(255,d[k+1]*v+n));d[k+2]=Math.max(0,Math.min(255,d[k+2]*v+n));}
 ctx.putImageData(img,0,0);}
// a ridge line by noise -> filled silhouette
function ridge(ctx,W,H,N,{y0,amp,freq,seed=0,color,oct=5,blur=0}){ctx.save();if(blur)ctx.filter=`blur(${blur}px)`;ctx.beginPath();ctx.moveTo(0,H);for(let x=0;x<=W;x+=2){const y=y0+N.fbm(x*freq+seed,seed*0.37,oct)*amp;ctx.lineTo(x,y);}ctx.lineTo(W,H);ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.restore();}
// fog band
function fog(ctx,W,H,N,{y,h,color,alpha,seed=1,freq=0.004}){const img=ctx.getImageData(0,0,W,H);const d=img.data;
 for(let yy=Math.max(0,y-h);yy<Math.min(H,y+h);yy++){const fall=1-Math.abs(yy-y)/h;for(let x=0;x<W;x++){const n=(N.fbm(x*freq+seed,yy*freq*2.5+seed,4)+0.6)/1.2;const a=Math.max(0,Math.min(1,alpha*fall*fall*n));const k=(yy*W+x)*4;d[k]+=(color[0]-d[k])*a;d[k+1]+=(color[1]-d[k+1])*a;d[k+2]+=(color[2]-d[k+2])*a;}}
 ctx.putImageData(img,0,0);}
// a dead tree by recursion
function tree(ctx,r,x,y,len,ang,w,depth,color){if(depth<=0||len<2)return;const x2=x+Math.cos(ang)*len,y2=y+Math.sin(ang)*len;ctx.strokeStyle=color;ctx.lineCap='round';ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x,y);const cx=(x+x2)/2+(r()-0.5)*len*0.3,cy=(y+y2)/2+(r()-0.5)*len*0.3;ctx.quadraticCurveTo(cx,cy,x2,y2);ctx.stroke();
 const n=depth>5?2:2+(r()<0.5?1:0);for(let i=0;i<n;i++){const a=ang+(r()-0.5)*1.3+(i-(n-1)/2)*0.35;tree(ctx,r,x2,y2,len*(0.62+r()*0.18),a,w*0.66,depth-1,color);}}
// painterly grunge: brightness varies with small-scale noise, more in the darks (stone, bark)
function texture(ctx,W,H,N,amount=0.25,freq=0.02){const img=ctx.getImageData(0,0,W,H);const d=img.data;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const k=(y*W+x)*4;const lum=(d[k]+d[k+1]+d[k+2])/765;const m=1+N.fbm(x*freq,y*freq,4)*amount*(1.2-lum);d[k]*=m;d[k+1]*=m;d[k+2]*=m;}
 ctx.putImageData(img,0,0);}
// a soft vertical gradient wash (haze) from y0 to y1
function wash(ctx,W,y0,y1,c,a0,a1){const g=ctx.createLinearGradient(0,y0,0,y1);g.addColorStop(0,rgba(c,a0));g.addColorStop(1,rgba(c,a1));ctx.fillStyle=g;ctx.fillRect(0,y0,W,y1-y0);}
// fbm-shaped flat-topped mesas
function mesas(ctx,W,H,N,{y0,amp,freq,seed,color,blur=0}){ctx.save();if(blur)ctx.filter=`blur(${blur}px)`;ctx.beginPath();ctx.moveTo(0,H);for(let x=0;x<=W;x+=2){let v=N.fbm(x*freq+seed,seed,3);v=Math.max(0,v+0.05);v=Math.round(v*5)/5;const y=y0-v*amp+N.fbm(x*0.05,seed,2)*3;ctx.lineTo(x,y);}ctx.lineTo(W,H);ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.restore();}
