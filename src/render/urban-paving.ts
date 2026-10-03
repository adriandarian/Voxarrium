import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import type { PreparationResources } from './preparation-cache';

export type UrbanPavingKind='setts'|'flags'|'service'|'timber';

/** Project-authored pigment: broken joints, several stone sizes and local repairs.
 * Cached independently of district ownership and generated only inside preparation jobs. */
export function* urbanPavingTexture(kind:UrbanPavingKind,scope:PreparationResources){
  const key=`urban.paving.${kind}.512`,cached=scope.cache?.get<CanvasTexture>(key);
  if(cached)return scope.own(cached);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Urban paving pigment canvas unavailable');
  let seed=kind==='setts'?1409:kind==='flags'?6011:kind==='service'?3119:9059;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  ctx.fillStyle=kind==='timber'?'#797165':kind==='service'?'#b7b2a5':kind==='flags'?'#b1afa5':'#9b998e';ctx.fillRect(0,0,512,512);
  if(kind==='timber'){
    for(let row=0;row<10;row++){
      ctx.fillStyle=`rgb(${190+row%3*8},${186+row%3*8},${173+row%3*8})`;
      ctx.fillRect(0,row*52+2,512,48);
      for(let n=0;n<28;n++){ctx.strokeStyle='#a8a09244';ctx.beginPath();ctx.moveTo(rand()*512,row*52+rand()*48);ctx.lineTo(rand()*512,row*52+rand()*48);ctx.stroke();}
      yield 'urban.paving-timber';
    }
  }else if(kind!=='service'){
    const rowHeight=kind==='flags'?86:43;
    for(let row=-1;row<Math.ceil(512/rowHeight)+1;row++){
      let x=-(row%2)*38-90;
      while(x<512){
        const width=kind==='flags'?64+rand()*75:35+rand()*25,y=row*rowHeight;
        const value=186+Math.floor(rand()*42);
        ctx.fillStyle=`rgb(${value},${value-2},${value-8})`;
        const gap=kind==='flags'?.7:1.25;
        ctx.beginPath();ctx.moveTo(x+gap+rand()*3,y+gap+rand()*3);
        ctx.lineTo(x+width-gap-rand()*2,y+gap+rand()*3);
        ctx.lineTo(x+width-gap-rand()*2,y+rowHeight-gap-rand()*4);
        ctx.lineTo(x+gap+rand()*3,y+rowHeight-gap-rand()*3);ctx.closePath();ctx.fill();
        // Infrequent weathered replacement, rather than identical grid cells.
        if(rand()<.09){ctx.strokeStyle='#8b887544';ctx.beginPath();ctx.moveTo(x+width*.3,y+gap);ctx.lineTo(x+width*.55,y+rowHeight*.65);ctx.stroke();}
        x+=width;
      }yield 'urban.paving-stones';
    }
  }
  for(let n=0;n<1800;n++){
    if(n%128===0)yield 'urban.paving-grain';
    ctx.fillStyle=n%3?'#706e6219':'#fff9e41c';
    ctx.fillRect(rand()*512,rand()*512,.5+rand()*2.3,.5+rand()*1.8);
  }
  const texture=scope.own(new CanvasTexture(canvas));texture.name=key;texture.wrapS=texture.wrapT=RepeatWrapping;
  texture.colorSpace=SRGBColorSpace;texture.anisotropy=4;scope.cache?.retain(key,texture,[texture]);
  return texture;
}
