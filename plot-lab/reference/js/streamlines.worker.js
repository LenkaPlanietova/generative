/**
 * Streamline engine (reference implementation, plain JS Web Worker).
 * Extracted from demo/flowline-studio.html. Port to TypeScript for PLOT LAB.
 *
 * Pipeline:  fields()  -> tone + orientation field (structure tensor, double-angle form)
 *            trace()   -> Jobard–Lefer evenly-spaced streamlines with variable separation
 *            rdp()     -> Ramer–Douglas–Peucker simplification
 *            order()   -> greedy nearest-neighbour ordering with path reversal
 *
 * Input message:  {photo:Float32Array, depth:Float32Array|null, W, H, p:params, mmPerPx, job}
 *   photo/depth are 0..1 grayscale on a W×H working grid. Coordinates out are grid px;
 *   multiply by mmPerPx and add the paper offset to get millimetres.
 * See README.md for every parameter.
 */
"use strict";
let lastPost = 0;
function clamp(v,a,b){return v<a?a:v>b?b:v}
function boxes(sigma,n){const wI=Math.sqrt(12*sigma*sigma/n+1);let wl=Math.floor(wI);if(wl%2===0)wl--;const wu=wl+2;
  const m=Math.round((12*sigma*sigma-n*wl*wl-4*n*wl-3*n)/(-4*wl-4));const r=[];for(let i=0;i<n;i++)r.push(((i<m?wl:wu)-1)/2);return r}
function boxH(s,d,W,H,r){r=Math.round(r);if(r<1){d.set(s);return}const k=1/(2*r+1);
  for(let y=0;y<H;y++){const o=y*W;let a=0;for(let i=-r-1;i<=r-1;i++)a+=s[o+clamp(i,0,W-1)];
    for(let x=0;x<W;x++){a+=s[o+Math.min(x+r,W-1)]-s[o+Math.max(x-r-1,0)];d[o+x]=a*k}}}
function boxV(s,d,W,H,r){r=Math.round(r);if(r<1){d.set(s);return}const k=1/(2*r+1);
  for(let x=0;x<W;x++){let a=0;for(let i=-r-1;i<=r-1;i++)a+=s[clamp(i,0,H-1)*W+x];
    for(let y=0;y<H;y++){a+=s[Math.min(y+r,H-1)*W+x]-s[Math.max(y-r-1,0)*W+x];d[y*W+x]=a*k}}}
function blur(src,W,H,sigma){const a=Float32Array.from(src);if(sigma<0.35)return a;const b=new Float32Array(W*H);
  for(const r of boxes(sigma,3)){boxH(a,b,W,H,r);boxV(b,a,W,H,r)}return a}
function rng(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296}}
function valueNoise(W,H,scale,seed){
  const R=rng(seed*7919+13),gw=Math.ceil(W/scale)+2,gh=Math.ceil(H/scale)+2,g=new Float32Array(gw*gh);
  for(let i=0;i<g.length;i++)g[i]=R()*2-1;const out=new Float32Array(W*H);
  for(let y=0;y<H;y++){const fy=y/scale,y0=Math.floor(fy),ty=fy-y0,sy=ty*ty*(3-2*ty);
    for(let x=0;x<W;x++){const fx=x/scale,x0=Math.floor(fx),tx=fx-x0,sx=tx*tx*(3-2*tx);
      const a=g[y0*gw+x0],b=g[y0*gw+x0+1],c=g[(y0+1)*gw+x0],d=g[(y0+1)*gw+x0+1];
      out[y*W+x]=(a+(b-a)*sx)+((c+(d-c)*sx)-(a+(b-a)*sx))*sy}}return out}

function tensor(d,W,H,sigma){
  const b=blur(d,W,H,sigma),n=W*H,xx=new Float32Array(n),yy=new Float32Array(n),xy=new Float32Array(n);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;
    const gx=(b[y*W+Math.min(x+1,W-1)]-b[y*W+Math.max(x-1,0)])*.5;
    const gy=(b[Math.min(y+1,H-1)*W+x]-b[Math.max(y-1,0)*W+x])*.5;
    xx[i]=gx*gx;yy[i]=gy*gy;xy[i]=gx*gy}
  const XX=blur(xx,W,H,sigma),YY=blur(yy,W,H,sigma),XY=blur(xy,W,H,sigma);
  let m=0;for(let i=0;i<n;i++)m+=XX[i]+YY[i];m=m/n+1e-12;
  for(let i=0;i<n;i++){XX[i]/=m;YY[i]/=m;XY[i]/=m}return[XX,YY,XY]}

function fields(photo,depth,W,H,p){
  const n=W*H;
  // tone 0 = black ... 1 = white
  const tb=blur(photo,W,H,p.toneBlur),tone=new Float32Array(n);
  for(let i=0;i<n;i++){let t=(tb[i]-.5)*p.contrast+.5+p.brightness;t=clamp(t,0,1);if(p.invert)t=1-t;tone[i]=t}
  // height used for direction
  let h;
  if(depth){h=new Float32Array(n);const r=p.relief;for(let i=0;i<n;i++)h[i]=depth[i]*(1-r)+photo[i]*r}
  else h=Float32Array.from(photo);
  const A=tensor(h,W,H,p.detail),B=tensor(h,W,H,p.flowSigma),gw=p.globalW;
  const c=new Float32Array(n),s=new Float32Array(n);
  const off=p.angle*Math.PI/90, co=Math.cos(off), so=Math.sin(off); // double-angle rotation
  const noise=p.noise>0?valueNoise(W,H,p.noiseScale,p.seed):null, na=p.noise*Math.PI/90;
  let mean=0;
  for(let i=0;i<n;i++){
    const xx=A[0][i]+gw*B[0][i],yy=A[1][i]+gw*B[1][i],xy=A[2][i]+gw*B[2][i];
    let cc=-(xx-yy),ss=-2*xy;
    let r=cc*co-ss*so;ss=cc*so+ss*co;cc=r;
    if(noise){const a=noise[i]*na,ca=Math.cos(a),sa=Math.sin(a);r=cc*ca-ss*sa;ss=cc*sa+ss*ca;cc=r}
    c[i]=cc;s[i]=ss;mean+=Math.hypot(cc,ss)}
  mean/=n;const eps=mean*0.02;for(let i=0;i<n;i++)c[i]-=eps; // flat areas fall back to vertical lines
  return{tone,c,s}}

function trace(F,W,H,p,mmPerPx,onBatch){
  const{tone,c,s}=F,toPx=1/mmPerPx;
  const dMin=p.minSp*toPx,dMax=Math.max(p.maxSp,p.minSp+0.05)*toPx,gam=p.gamma,ratio=p.testRatio;
  const step=Math.max(0.25,dMin*p.stepQ),minSteps=p.minLen*toPx/step,maxSteps=Math.max(10,p.maxLen*toPx/step);
  const cosTurn=Math.cos(p.maxTurn*Math.PI/180),white=p.whiteCut;
  const cell=dMax,gw=Math.ceil(W/cell)+2,gh=Math.ceil(H/cell)+2;
  const grid=new Array(gw*gh);for(let i=0;i<grid.length;i++)grid[i]=[];
  function S(a,x,y){x=clamp(x,0,W-1.001);y=clamp(y,0,H-1.001);const x0=x|0,y0=y|0,fx=x-x0,fy=y-y0,i=y0*W+x0;
    return(a[i]*(1-fx)+a[i+1]*fx)*(1-fy)+(a[i+W]*(1-fx)+a[i+W+1]*fx)*fy}
  const sep=(x,y)=>dMin+(dMax-dMin)*Math.pow(S(tone,x,y),gam);
  let dirx=0,diry=0;
  function dir(x,y,px,py){const cc=S(c,x,y),ss=S(s,x,y);if(cc*cc+ss*ss<1e-20)return false;
    const th=.5*Math.atan2(ss,cc);let dx=Math.cos(th),dy=Math.sin(th);if(px*dx+py*dy<0){dx=-dx;dy=-dy}dirx=dx;diry=dy;return true}
  const inside=(x,y)=>x>=1&&x<W-2&&y>=1&&y<H-2;
  function hit(g,x,y,r){const gx=(x/cell)|0,gy=(y/cell)|0,r2=r*r;
    for(let j=gy-1;j<=gy+1;j++){if(j<0||j>=gh)continue;for(let i=gx-1;i<=gx+1;i++){if(i<0||i>=gw)continue;
      const a=g[j*gw+i];if(!a)continue;for(let k=0;k<a.length;k+=2){const dx=a[k]-x,dy=a[k+1]-y;if(dx*dx+dy*dy<r2)return true}}}return false}
  function put(g,x,y){const k=((y/cell)|0)*gw+((x/cell)|0);(g[k]||(g[k]=[])).push(x,y)}
  const skip=Math.ceil(2.5*dMax/step)+2;
  function march(x,y,d0x,d0y,own,out){
    let px=d0x,py=d0y;const pend=[];
    for(let it=0;it<maxSteps;it++){
      if(!dir(x,y,px,py))break;const ax=dirx,ay=diry;
      if(!dir(x+ax*step*.5,y+ay*step*.5,ax,ay))break;const bx=dirx,by=diry;
      if(bx*px+by*py<cosTurn)break;
      const nx=x+bx*step,ny=y+by*step;
      if(!inside(nx,ny))break;
      if(S(tone,nx,ny)>white)break;
      const r=sep(nx,ny)*ratio;
      if(hit(grid,nx,ny,r)||hit(own,nx,ny,r))break;
      out.push(nx,ny);pend.push(nx,ny);
      if(pend.length>skip*2){put(own,pend[0],pend[1]);pend.splice(0,2)}
      x=nx;y=ny;px=bx;py=by}
  }
  function line(x,y){
    if(!inside(x,y)||S(tone,x,y)>white)return null;
    if(hit(grid,x,y,sep(x,y)*Math.min(.95,ratio*1.6)))return null;
    if(!dir(x,y,0,0))return null;const d0x=dirx,d0y=diry;
    const own={},f=[],b=[];
    march(x,y,d0x,d0y,own,f);
    for(let k=skip*2;k<f.length;k+=2)put(own,f[k],f[k+1]);
    march(x,y,-d0x,-d0y,own,b);
    const n=(f.length+b.length)/2+1;if(n<minSteps||n<3)return null;
    const pts=new Float32Array(n*2);let o=0;
    for(let k=b.length-2;k>=0;k-=2){pts[o++]=b[k];pts[o++]=b[k+1]}
    pts[o++]=x;pts[o++]=y;for(let k=0;k<f.length;k++)pts[o++]=f[k];
    return pts}
  const lines=[];let batch=[];
  const queue=[];let qh=0;
  function accept(pts){for(let k=0;k<pts.length;k+=2)put(grid,pts[k],pts[k+1]);lines.push(pts);batch.push(pts);
    const stride=Math.max(1,Math.round(dMin/step));
    for(let k=0;k<pts.length-2;k+=2*stride){const x=pts[k],y=pts[k+1],tx=pts[k+2]-x,ty=pts[k+3]-y,l=Math.hypot(tx,ty)||1,nx=-ty/l,ny=tx/l,d=sep(x,y);
      queue.push(x+nx*d,y+ny*d,x-nx*d,y-ny*d)}}
  // fallback seeds over the whole image
  const R=rng(p.seed),g=Math.max(2,dMax*.9),cand=[];
  for(let y=g/2;y<H;y+=g)for(let x=g/2;x<W;x+=g){const jx=x+(R()-.5)*g*.6,jy=y+(R()-.5)*g*.6;
    let key;if(p.seedOrder==="dark")key=S(tone,jx,jy);else if(p.seedOrder==="center")key=Math.hypot(jx-W/2,jy-H/2);else key=R();
    cand.push([key,jx,jy])}
  cand.sort((a,b)=>a[0]-b[0]);let ci=0;
  while(true){
    let made=false;
    if(qh<queue.length){const x=queue[qh++],y=queue[qh++];const L=line(x,y);if(L){accept(L);made=true}}
    else{if(ci>=cand.length)break;const L=line(cand[ci][1],cand[ci][2]);ci++;if(L)accept(L)}
    if(qh>200000){queue.splice(0,qh);qh=0}
    const t=performance.now();if(t-lastPost>140){lastPost=t;onBatch(batch,ci/cand.length);batch=[]}
  }
  onBatch(batch,1);
  return{lines,step}}

function rdp(pts,tol){const n=pts.length/2;if(n<3)return pts;const keep=new Uint8Array(n);keep[0]=keep[n-1]=1;const st=[[0,n-1]],t2=tol*tol;
  while(st.length){const[a,b]=st.pop();const ax=pts[a*2],ay=pts[a*2+1],bx=pts[b*2],by=pts[b*2+1],dx=bx-ax,dy=by-ay,L=dx*dx+dy*dy||1e-12;
    let md=-1,mi=-1;for(let i=a+1;i<b;i++){const px=pts[i*2]-ax,py=pts[i*2+1]-ay,t=clamp((px*dx+py*dy)/L,0,1),ex=px-t*dx,ey=py-t*dy,d=ex*ex+ey*ey;if(d>md){md=d;mi=i}}
    if(md>t2){keep[mi]=1;st.push([a,mi],[mi,b])}}
  let m=0;for(let i=0;i<n;i++)if(keep[i])m++;const out=new Float32Array(m*2);let o=0;for(let i=0;i<n;i++)if(keep[i]){out[o++]=pts[i*2];out[o++]=pts[i*2+1]}return out}

function order(lines){ // greedy nearest neighbour with reversal, to cut pen-up travel
  const n=lines.length,used=new Uint8Array(n),out=[];let cx=0,cy=0,travel=0;
  for(let k=0;k<n;k++){let best=-1,bd=Infinity,rev=false;
    for(let i=0;i<n;i++){if(used[i])continue;const L=lines[i],m=L.length;
      let d=(L[0]-cx)**2+(L[1]-cy)**2;if(d<bd){bd=d;best=i;rev=false}
      d=(L[m-2]-cx)**2+(L[m-1]-cy)**2;if(d<bd){bd=d;best=i;rev=true}}
    used[best]=1;let L=lines[best];
    if(rev){const r=new Float32Array(L.length);for(let j=0;j<L.length;j+=2){r[j]=L[L.length-2-j];r[j+1]=L[L.length-1-j]}L=r}
    travel+=Math.sqrt(bd);out.push(L);cx=L[L.length-2];cy=L[L.length-1]}
  return{lines:out,travel}}

self.onmessage=e=>{
  const{photo,depth,W,H,p,mmPerPx,job}=e.data;
  const t0=performance.now();
  self.postMessage({type:"status",job,text:"Building flow field…"});
  const F=fields(photo,depth,W,H,p);
  self.postMessage({type:"fields",job,tone:F.tone,c:F.c,s:F.s});
  const{lines}=trace(F,W,H,p,mmPerPx,(b,frac)=>{self.postMessage({type:"batch",job,lines:b,frac})});
  self.postMessage({type:"status",job,text:"Optimising pen path…"});
  const simple=lines.map(L=>rdp(L,0.08/mmPerPx));
  const o=order(simple);
  let ink=0;for(const L of o.lines)for(let j=2;j<L.length;j+=2)ink+=Math.hypot(L[j]-L[j-2],L[j+1]-L[j-1]);
  self.postMessage({type:"done",job,lines:o.lines,ink:ink*mmPerPx,travel:o.travel*mmPerPx,ms:performance.now()-t0});
};
