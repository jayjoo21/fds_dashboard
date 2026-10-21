import React,{useState,useMemo} from 'react';
import {createRoot} from 'react-dom/client';
import {ReactFlow,Handle,Position,Controls,Background,MarkerType} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

function DataNode({data}){
 return <div className={'fds-react-node '+(data.active?'active':'')+(data.related?' related':'')} title={data.description}>
  {['Left','Right','Top','Bottom'].map(p=><React.Fragment key={p}><Handle type="target" position={Position[p]} id={'in-'+p}/><Handle type="source" position={Position[p]} id={'out-'+p}/></React.Fragment>)}
  <button onClick={()=>data.select(data.id)} data-flow-node={data.id} aria-label={data.label+' 단계·출처 상세'} aria-pressed={data.active}>
   <small>{data.subtitle}</small><strong>{data.label}</strong><span>{data.value||data.description}</span>
  </button>
 </div>;
}
const nodeTypes={data:DataNode};
const roots=new WeakMap();
window.fdsMountFlow=function(root,config){
 const reactRoot=roots.get(root)||createRoot(root);roots.set(root,reactRoot);let externalSelect,instance;
 function View(){const [selected,setSelected]=useState(config.selected||config.nodes[0]?.id),[hover,setHover]=useState(null),[edge,setEdge]=useState(null);externalSelect=setSelected;
 const relevant=useMemo(()=>{const up=new Set([hover||selected]),down=new Set([hover||selected]);let changed=true;while(changed){changed=false;for(const e of config.edges){if(up.has(e.target)&&!up.has(e.source)){up.add(e.source);changed=true;}if(down.has(e.source)&&!down.has(e.target)){down.add(e.target);changed=true;}}}return {up,down};},[selected,hover]);
 const select=id=>{setSelected(id);config.onSelect?.(id);};
 const nodes=config.nodes.map(n=>({...n,type:'data',data:{...n.data,id:n.id,select,active:n.id===selected,related:relevant.up.has(n.id)||relevant.down.has(n.id)}}));
 const edges=config.edges.map(e=>({...e,id:e.id||e.source+'-'+e.target,type:'smoothstep',markerEnd:{type:MarkerType.ArrowClosed,color:'#8195af'},className:(relevant.up.has(e.target)&&relevant.up.has(e.source)||relevant.down.has(e.source)&&relevant.down.has(e.target))?'fds-edge-active':'',data:e.data||{}}));
 return <><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{padding:.12,maxZoom:1,minZoom:innerWidth<600?.85:.55,...(config.focusSelected?{nodes:[{id:selected},...config.edges.filter(e=>e.target===selected||e.source===selected).flatMap(e=>[{id:e.source},{id:e.target}])]}:{})}} onInit={flow=>{instance=flow;}} minZoom={.25} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} onNodeMouseEnter={(_,n)=>setHover(n.id)} onNodeMouseLeave={()=>setHover(null)} onEdgeMouseEnter={(_,e)=>setEdge(e.data.description||'연결된 원천 값·식별자 전달')} onEdgeMouseLeave={()=>setEdge(null)} onEdgeClick={(_,e)=>{setEdge(e.data.description||'연결된 원천 값·식별자 전달');config.onSelect?.(e.target);}} ariaLabelConfig={{'controls.zoomIn.ariaLabel':'확대','controls.zoomOut.ariaLabel':'축소','controls.fitView.ariaLabel':'전체 흐름 보기','controls.interactive.ariaLabel':'상호작용 전환'}}><Controls showInteractive={false}/><Background color="#dbe3eb" gap={22}/></ReactFlow>{edge&&<div className="flow-edge-tooltip" role="status">{edge}</div>}</>;
 }
 reactRoot.render(<View/>);return {select:id=>{externalSelect?.(id);if(config.focusSelected||innerWidth<600)instance?.fitView({nodes:[{id}],padding:1,minZoom:innerWidth<600?.85:.75,maxZoom:1,duration:document.body.dataset.motion==='reduced'?0:180});},unmount:()=>{reactRoot.unmount();roots.delete(root);}};
};
