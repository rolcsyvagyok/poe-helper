// "Wraeclast": a ruined cathedral on a sea cliff at dusk, dead trees and fog, warm ash and amber
function paint(ctx,W,H){
 const N=makeNoise(7), r=rng(11);
 skyPixels(ctx,W,H,[[0,[34,28,26]],[0.28,[78,62,48]],[0.5,[168,128,78]],[0.62,[196,150,88]],[1,[40,30,24]]],(x,y,b)=>{
  const n=N.fbm(x*0.0026,y*0.006,6), m=N.fbm(x*0.0012+40,y*0.004+9,4);
  const dark=Math.max(0,n*1.4+0.15)*(1-y/H*0.9);const lit=Math.max(0,-m)*0.5*(y/H<0.6?1:0);
  return [b[0]*(1-dark*0.85)+lit*90,b[1]*(1-dark*0.88)+lit*55,b[2]*(1-dark*0.9)+lit*25];});
 // low sun glow behind clouds
 let g=ctx.createRadialGradient(W*0.62,H*0.56,10,W*0.62,H*0.56,W*0.35);g.addColorStop(0,'rgba(255,200,120,0.55)');g.addColorStop(0.4,'rgba(220,140,70,0.18)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
 // sea on the left: dark band with glints
 const seaY=H*0.63;const sg=ctx.createLinearGradient(0,seaY,0,H);sg.addColorStop(0,'rgb(92,72,54)');sg.addColorStop(0.15,'rgb(50,42,36)');sg.addColorStop(1,'rgb(18,14,12)');ctx.fillStyle=sg;ctx.fillRect(0,seaY,W,H-seaY);
 for(let i=0;i<900;i++){const x=r()*W*0.75,y=seaY+r()*(H*0.2);const a=0.05+0.25*(1-(y-seaY)/(H*0.2))*Math.max(0,1-Math.abs(x-W*0.6)/(W*0.5));ctx.fillStyle=`rgba(240,190,120,${a})`;ctx.fillRect(x,y,8+r()*30,1);}
 // far headlands
 ridge(ctx,W,H,N,{y0:H*0.57,amp:50,freq:0.003,seed:13,color:'rgba(120,92,66,0.55)',blur:2});
 ridge(ctx,W,H,N,{y0:H*0.61,amp:40,freq:0.004,seed:3,color:'rgba(70,56,46,0.85)',blur:1.5});
 // the cliff on the right, rising
 ctx.save();ctx.beginPath();ctx.moveTo(W*0.33,H);for(let y=H;y>H*0.66;y-=3)ctx.lineTo(W*0.38+N.fbm(y*0.02,77,4)*40-(H-y)*0.15,y);for(let x=W*0.38;x<=W;x+=2){const t=(x-W*0.38)/(W*0.62);const y=H*0.66-Math.pow(Math.min(1,t*1.6),0.6)*H*0.16+N.fbm(x*0.01,5,5)*22;ctx.lineTo(x,y);}ctx.lineTo(W,H);ctx.closePath();ctx.fillStyle='rgb(26,20,18)';ctx.fill();ctx.restore();
 // cathedral ruin on the cliff
 const bx=W*0.7, by=H*0.52, c='rgb(20,15,14)';ctx.fillStyle=c;
 ctx.fillRect(bx-150,by-70,300,80);// nave wall
 ctx.beginPath();ctx.moveTo(bx-200,by+60);for(let x=bx-200;x<=bx+220;x+=4)ctx.lineTo(x,by+2+N.fbm(x*0.03,3,3)*14);ctx.lineTo(bx+220,by+60);ctx.fill();
 // tower with spire
 ctx.fillRect(bx+70,by-230,62,240);ctx.beginPath();ctx.moveTo(bx+64,by-230);ctx.lineTo(bx+101,by-360);ctx.lineTo(bx+138,by-230);ctx.fill();
 for(const k of [-1,1]){ctx.beginPath();ctx.moveTo(bx+101+k*31,by-230);ctx.lineTo(bx+101+k*38,by-262);ctx.lineTo(bx+101+k*25,by-230);ctx.fill();}
 // broken gable at left, jagged
 ctx.beginPath();ctx.moveTo(bx-160,by+10);ctx.lineTo(bx-160,by-120);ctx.lineTo(bx-130,by-160);ctx.lineTo(bx-118,by-140);ctx.lineTo(bx-100,by-175);ctx.lineTo(bx-86,by-120);ctx.lineTo(bx-70,by-100);ctx.lineTo(bx-70,by+10);ctx.fill();
 // buttresses
 for(let i=0;i<4;i++){const x=bx-60+i*36;ctx.beginPath();ctx.moveTo(x,by+10);ctx.lineTo(x,by-110+(i%2)*20);ctx.lineTo(x+10,by-110+(i%2)*20);ctx.lineTo(x+18,by+10);ctx.fill();}
 // lit pointed windows
 const win=(x,y,w,h,a)=>{ctx.beginPath();ctx.moveTo(x,y+h);ctx.lineTo(x,y+w*0.6);ctx.quadraticCurveTo(x,y,x+w/2,y-w*0.3);ctx.quadraticCurveTo(x+w,y,x+w,y+w*0.6);ctx.lineTo(x+w,y+h);ctx.closePath();const gg=ctx.createLinearGradient(0,y,0,y+h);gg.addColorStop(0,`rgba(255,190,110,${a})`);gg.addColorStop(1,`rgba(190,80,40,${a*0.8})`);ctx.fillStyle=gg;ctx.fill();ctx.fillStyle=c;ctx.fillRect(x+w/2-1,y,2,h);};
 win(bx+88,by-190,26,60,0.85);win(bx-138,by-118,18,50,0.55);win(bx-40,by-55,14,34,0.5);win(bx-4,by-55,14,34,0.5);win(bx+32,by-55,14,34,0.5);
 const gw=ctx.createRadialGradient(bx+101,by-160,2,bx+101,by-160,120);gw.addColorStop(0,'rgba(255,170,90,0.25)');gw.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gw;ctx.fillRect(bx-50,by-300,300,300);
 // dead trees, foreground left and right
 const tr=rng(5);tree(ctx,tr,W*0.1,H*1.02,150,-Math.PI/2-0.1,20,10,'rgb(14,11,10)');tree(ctx,tr,W*0.27,H*0.98,80,-Math.PI/2+0.1,10,8,'rgb(18,14,12)');tree(ctx,tr,W*0.93,H*0.98,95,-Math.PI/2-0.15,12,8,'rgb(12,9,8)');
 // fog over the sea and cliff foot
 fog(ctx,W,H,N,{y:H*0.7,h:H*0.12,color:[150,120,95],alpha:0.55,seed:4});
 // foreground ground
 ridge(ctx,W,H,N,{y0:H*0.93,amp:30,freq:0.006,seed:8,color:'rgb(12,9,8)'});
 // crows
 ctx.strokeStyle='rgba(20,14,12,0.9)';ctx.lineWidth=2;for(let i=0;i<7;i++){const x=W*0.36+r()*W*0.25,y=H*0.18+r()*H*0.18,s=6+r()*7;ctx.beginPath();ctx.moveTo(x-s,y-s*0.3);ctx.quadraticCurveTo(x-s*0.4,y-s*0.6,x,y);ctx.quadraticCurveTo(x+s*0.4,y-s*0.6,x+s,y-s*0.3);ctx.stroke();}
 texture(ctx,W,H,N,0.35,0.012);texture(ctx,W,H,makeNoise(99),0.18,0.06);
 wash(ctx,W,H*0.55,H*0.68,[170,130,95],0,0.2);wash(ctx,W,H*0.68,H*0.82,[170,130,95],0.2,0);
 finish(ctx,W,H,3,16,0.8);
}
