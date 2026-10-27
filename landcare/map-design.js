// Shared cartography for the two contractor maps.
export function parcelSymbol(status, selected=false, requestOnly=false) {
  const styles={
    fulfilled:{fill:[85,157,105,0.58],edge:'#39734b'},
    'follow-up':{fill:[232,181,112,0.48],edge:'#a77836'},
    unreported:{fill:[230,237,240,0.40],edge:'#7a8b94'},
    unknown:{fill:[230,237,240,0.28],edge:'#7a8b94'}
  };
  const style=styles[status]||styles.unknown;
  const quietRequest=requestOnly && !['fulfilled','follow-up'].includes(status);
  return {type:'simple-fill',color:selected?[0,139,194,0.26]:quietRequest?[156,149,174,0.28]:style.fill,
    outline:{color:selected?'#006a96':quietRequest?'#756789':style.edge,width:selected?2.5:1,style:requestOnly?'dash':'solid'}};
}

export function labelSymbol(text,selected=false) {
  return {type:'text',text,color:selected?'#005579':'#314956',haloColor:'#ffffff',haloSize:0.9,
    font:{family:'Arial',size:9,weight:'bold'},horizontalAlignment:'center',verticalAlignment:'middle',yoffset:0};
}

export function nonOverlappingLabels(candidates,{width,height,scale,maxScale=1800,focusedId=''}) {
  const placed=[];
  const visible=new Set();
  const ordered=[...candidates].sort((a,b)=>Number(b.id===focusedId)-Number(a.id===focusedId)||Number(b.selected)-Number(a.selected)||String(a.id).localeCompare(String(b.id),undefined,{numeric:true}));
  for(const label of ordered) {
    if(scale>maxScale && label.id!==focusedId) continue;
    if(!Number.isFinite(label.x)||!Number.isFinite(label.y)) continue;
    const half=Math.max(30,label.text.length*3.7)+7;
    const rect={left:label.x-half,right:label.x+half,top:label.y-12,bottom:label.y+12};
    if(rect.left<8||rect.right>width-8||rect.top<8||rect.bottom>height-8) continue;
    if(placed.some(p=>rect.left<p.right&&rect.right>p.left&&rect.top<p.bottom&&rect.bottom>p.top)) continue;
    placed.push(rect);visible.add(label.id);
  }
  return visible;
}

export function declutterMapLabels(view,graphics,{focusedId='',selectedIds=new Set()}={}) {
  if(!view?.ready) return;
  const labels=Array.from(graphics).filter(g=>g.attributes?.parcelLabel||g.attributes?.label);
  const candidates=labels.map(graphic=>{
    const id=String(graphic.attributes.assignmentObjectId);
    const point=view.toScreen(graphic.geometry);
    return {id,text:graphic.symbol.text,x:point?.x,y:point?.y,selected:selectedIds.has(id)};
  });
  const visible=nonOverlappingLabels(candidates,{width:view.width,height:view.height,scale:view.scale,focusedId:String(focusedId)});
  for(const graphic of labels) {
    const id=String(graphic.attributes.assignmentObjectId);
    graphic.visible=visible.has(id);
    graphic.symbol=labelSymbol(graphic.symbol.text,selectedIds.has(id)||id===String(focusedId));
  }
}

// Choose the widest interior span near the parcel's middle. Scanline
// parity respects holes and disconnected rings without depending on ring order.
export function parcelLabelPoint(geometry) {
  const rings=(geometry?.rings||[]).map(r=>r.filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]))).filter(r=>r.length>=3);
  if(!rings.length) return null;
  const points=rings.flat();
  const minY=Math.min(...points.map(p=>p[1])), maxY=Math.max(...points.map(p=>p[1]));
  let best=null;
  for(let step=0;step<21;step++) {
    const y=minY+(maxY-minY)*(step+0.5)/21;
    const crossings=[];
    for(const ring of rings) for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
      const a=ring[j],b=ring[i];
      if((a[1]>y)!==(b[1]>y)) crossings.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
    }
    crossings.sort((a,b)=>a-b);
    for(let i=0;i+1<crossings.length;i+=2) {
      const span=crossings[i+1]-crossings[i];
      // Favor central rows when spans are equal; never place in a hole.
      const score=span*(1-0.2*Math.abs((y-minY)/(maxY-minY||1)-0.5));
      if(!best||score>best.score) best={score,point:[(crossings[i]+crossings[i+1])/2,y]};
    }
  }
  return best?.point||null;
}
