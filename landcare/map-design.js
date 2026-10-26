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
  return {type:'text',text,color:selected?'#005579':'#314956',haloColor:'#ffffff',haloSize:1.5,
    font:{family:'Arial',size:10,weight:selected?'bold':'normal'},horizontalAlignment:'center',verticalAlignment:'middle',yoffset:0};
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
