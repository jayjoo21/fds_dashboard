'use strict';
// UI only. No writes to financial inputs and no automatic approval of CSV values.
const dupont = {metric:'OpROA', receipt:null, epoch:0, data:null};
const DUPONT_TERMS = {
 OpROA:{label:'영업수익성',formula:'PM × ATO',why:'이익률과 순영업자산 회전율을 곱해 영업수익성을 살펴봅니다.',inputs:['PM','ATO'],columns:['PM','ATO','OpROA']},
 PM:{label:'영업이익률',formula:'영업이익 TTM ÷ 매출액 TTM',why:'최근 4분기 매출 중 영업이익으로 남은 비율입니다.',inputs:['operating_profit_ttm','sales_ttm'],columns:['operating_profit_ttm','sales_ttm','PM']},
 ATO:{label:'순영업자산 회전율',formula:'매출액 TTM ÷ 평균 NOA',why:'평균 순영업자산에 비해 매출이 얼마나 발생했는지 봅니다.',inputs:['sales_ttm','avg_noa'],columns:['sales_ttm','avg_noa','ATO']},
 avg_noa:{label:'평균 순영업자산',formula:'(NOA_t + NOA_t_4q) ÷ 2',why:'당기와 전년 동분기의 순영업자산을 평균합니다.',inputs:['NOA_t','NOA_t_4q'],columns:['NOA_t','NOA_t_4q']},
 NOA_t:{label:'당기 순영업자산',formula:'assets_t − current_liabilities_t',why:'프로젝트에서 확정한 총자산 − 유동부채 정의를 사용합니다.',inputs:['assets_t','current_liabilities_t'],columns:['NOA_t']},
 NOA_t_4q:{label:'전년 동분기 순영업자산',formula:'assets_t_4q − current_liabilities_t_4q',why:'4분기 전의 동일한 정의를 적용합니다.',inputs:['assets_t_4q','current_liabilities_t_4q'],columns:['NOA_t_4q']},
 sales_ttm:{label:'매출액 TTM',formula:'전년 연간 + 당해 누적 − 전년 동기 누적',why:'4분기는 당해 연간값을 사용합니다. 원천 fact_id와 공시 버전을 확인해야 합니다.',inputs:[],columns:['sales_ttm','sales_ttm_source_receipts']},
 operating_profit_ttm:{label:'영업이익 TTM',formula:'전년 연간 + 당해 누적 − 전년 동기 누적',why:'최근 4분기의 영업이익입니다. 누적·단독분기와 원천 공시 버전을 구분합니다.',inputs:[],columns:['operating_profit_ttm','operating_profit_ttm_source_receipts']}
};
const dupontPage=el('section',null,'tabpage dupont-story');
dupontPage.id='dupont';dupontPage.hidden=true;$('#analysis').before(dupontPage);
const dupontNav=el('button',null,'tab');dupontNav.dataset.tab='dupont';dupontNav.append(el('span','수정 DuPont 분석'));$('.sidebar nav').prepend(dupontNav);

// Six destinations, wrapped mobile menu, and the existing page routing.
const topbar=el('div',null,'fds-topbar');topbar.dataset.noGloss='';
const brand=el('a',null,'fds-wordmark');brand.href='/';brand.append(el('b','FDS'),el('span','기업가치 훼손위험 탐지 및 검증 시스템'));topbar.append(brand);
const menuToggle=el('button','메뉴','fds-menu-toggle');menuToggle.setAttribute('aria-expanded','false');menuToggle.setAttribute('aria-controls','fds-navigation');topbar.append(menuToggle);
const topnav=el('nav',null,'fds-topnav');topnav.id='fds-navigation';topnav.setAttribute('aria-label','주요 메뉴');
for(const [id,label] of [['overview','프로젝트 개요'],['dupont','금융모형'],['analysis','실제 기업 분석'],['explorer','공시 근거'],['pipeline','데이터 수집·처리'],['progress','개발 현황']]){
 const b=el('button',label);b.dataset.destination=id;b.onclick=()=>{switchTab(id);topnav.classList.remove('open');menuToggle.setAttribute('aria-expanded','false');};topnav.append(b);
}
menuToggle.onclick=()=>{const open=topnav.classList.toggle('open');menuToggle.setAttribute('aria-expanded',String(open));};
topbar.append(topnav);$('header').append(topbar);
const routeBeforeDupont=switchTab;
switchTab=function(id){routeBeforeDupont(id);topnav.querySelectorAll('button').forEach(b=>{const active=b.dataset.destination===(id==='model'?'dupont':id);b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});};
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));

// Replaces only the two reference screens. Legacy DOM is retained for existing helpers.
const legacyOverview=el('div');legacyOverview.hidden=true;
while($('#overview').firstChild)legacyOverview.append($('#overview').firstChild);
$('#overview').append(legacyOverview);$('#overview').dataset.noGloss='';
const overviewExperience=el('div',null,'fds-experience overview-experience');$('#overview').append(overviewExperience);
dupontPage.className='tabpage fds-experience dupont-experience';dupontPage.dataset.noGloss='';
story.observer?.disconnect();setupStoryObserver=()=>{};renderStoryScene=()=>{};
const experience={stage:'data',scene:0,metric:'OpROA',depth:0,catalog:null,series:[],lineage:null,stock:'',fs:'CFS',from:'2015-01-01',asof:'2019-12-31',receipt:null,epoch:0,observers:[],reduced:false,showReference:false};
const WORKFLOW=[
 {id:'data',label:'입력 데이터',tag:'MARKET + FILINGS',icon:'M-12,-8 L12,-8 M-12,0 L12,0 M-12,8 L12,8',at:[70,168],title:'서로 다른 데이터를 같은 시점에 맞춥니다.',text:'주가·시장·업종 자료는 하락 탐지에, 재무·공시는 원인 검토에 사용합니다. 공시 이용 가능일을 기준으로 과거에 알 수 있었던 정보를 구분합니다.',input:['KRX 종가·거래량','OpenDART 원천 계정','공시 버전·이용 가능일'],output:'기업·기간별 분석 입력',status:'원본 연결 · 원천 의미 REVIEW'},
 {id:'detect',label:'이상 하락 탐지',tag:'DETECTION',icon:'M-15,4 L-7,-4 L0,3 L8,-11 L15,-8',at:[245,168],title:'시장·업종을 고려해 하락 구간을 구분합니다.',text:'가격 하락 자체와 시장·업종 대비 이상 하락은 다릅니다. CUSUM 누적 신호와 사건 구간 분석은 실제 탐지 결과를 생성하기 전 검증이 필요합니다.',input:['시장·업종 수익률','비정상수익률','거래량·관측일'],output:'서서히 하락 / 급락 검토 구간',status:'탐지 모형 연구·개발 예정'},
 {id:'slow',label:'서서히 하락',tag:'FUNDAMENTALS',icon:'M-14,-9 L-5,-6 L4,2 L14,10',at:[455,76],title:'재무 변화의 계산 구조를 확인합니다.',text:'수정 DuPont으로 영업수익성을 이익률과 회전율로 나눕니다. Ohlson·F-Score는 필요한 입력과 모형의 적용 범위를 먼저 검토합니다.',input:['매출·영업이익 TTM','NOA·평균 NOA','귀속 자본·이익'],output:'재무 변화와 공시 근거',status:'DuPont 계보 연결 · 금액 검증 대기'},
 {id:'fast',label:'급락',tag:'EVENT STUDY',icon:'M-10,-12 L2,-2 L-3,2 L10,13',at:[455,260],title:'급락 전후의 사건과 최초 공개시점을 대조합니다.',text:'사건이 언제 처음 알려졌는지 확인하고 시장·업종 조정 수익률과 거래량을 비교합니다. 동시 발생을 인과관계로 확정하지 않습니다.',input:['사건 최초 공개시각','사건 전후 수익률','공시·뉴스 근거'],output:'사건과 가격 변화의 검토 근거',status:'사건 정렬·수익률 검증 예정'},
 {id:'integrate',label:'통합 판단',tag:'SYNTHESIS',icon:'M-12,-7 L0,-13 L12,-7 L0,0 Z M-12,1 L0,8 L12,1 M-12,8 L0,15 L12,8',at:[665,168],title:'두 분석의 근거와 한계를 함께 검토합니다.',text:'재무 변화와 사건 분석의 결과를 나란히 검토하고 서로 맞지 않는 근거와 미확인 항목을 남깁니다. 현재 자동 통합 판정은 미구현입니다.',input:['재무·공시 근거','사건 분석 근거','상충·미확인 항목'],output:'근거가 연결된 잠정 검토',status:'통합 판정 기준 연구 예정'},
 {id:'opinion',label:'사용자 의견',tag:'HUMAN INPUT',icon:'M-12,-10 L12,-10 L12,6 L-2,6 L-10,13 L-10,6 L-12,6 Z',at:[835,168],title:'사용자의 주장과 근거를 구분해 기록합니다.',text:'성장성·경쟁력 전망과 보유 이유를 주장, 근거, 성립 조건으로 나누어 봅니다. 기존 메모는 브라우저 메모리에서만 유지됩니다.',input:['사용자 주장','성장성·경쟁력 근거','경제적 전제'],output:'검토할 주장·가정',status:'기존 임시 메모 · 모델 연계 예정'},
 {id:'rebuttal',label:'반박 모델',tag:'COUNTER EVIDENCE',icon:'M-13,-10 L-5,-10 M-13,-10 L-13,10 L-5,10 M13,-10 L5,-10 M13,-10 L13,10 L5,10 M-4,0 L4,0',at:[1000,168],title:'주장이 성립하려면 필요한 조건을 점검합니다.',text:'주장과 실제 공시를 연결하고 경제적 전제와 반대 증거를 대조하는 단계입니다. 현재 자동 반박 결과를 생성하지 않습니다.',input:['사용자 주장·전제','재무·공시 근거','반대 증거'],output:'성립 조건·반대 근거·판단 보류',status:'반박 모델 연구·개발 예정'},
 {id:'result',label:'결과',tag:'REVIEW OUTPUT',icon:'M-12,0 L-3,9 L13,-9',at:[1150,168],title:'확인한 사실과 판단을 구분해 제시합니다.',text:'관측 사실, 불일치, 검증 대기와 판단 보류를 구분합니다. 최종 분류와 자동 투자 판단은 아직 구현하지 않았습니다.',input:['확인된 관측','검증 상태','분석의 한계'],output:'근거·상태가 함께 있는 검토 결과',status:'최종 분류 기준 미확정'}
];
const WORK_EDGES=[['data','detect'],['detect','slow'],['detect','fast'],['slow','integrate'],['fast','integrate'],['integrate','opinion'],['opinion','rebuttal'],['rebuttal','result']];
function xButton(text,fn,cls=''){const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;}
function xSection(label,title){const s=el('section',null,'x-section');s.append(el('p',label,'x-label'),el('h2',title));return s;}
function xMotion(){return experience.reduced||systemReduced.matches;}
function xScroll(node){node.scrollIntoView({behavior:xMotion()?'instant':'smooth',block:'center'});}
function setWorkStage(id,preview=false){
 const meta=WORKFLOW.find(n=>n.id===id);if(!meta)return;
 const related=new Set([id]);let changed=true;while(changed){changed=false;for(const [a,b]of WORK_EDGES)if(related.has(b)&&!related.has(a)){related.add(a);changed=true;}}
 overviewExperience.querySelectorAll('[data-flow-node]').forEach(b=>{b.dataset.focus=String(b.dataset.flowNode===id);b.dataset.related=String(related.has(b.dataset.flowNode));if(!preview)b.setAttribute('aria-pressed',String(b.dataset.flowNode===id));});
 overviewExperience.querySelectorAll('[data-flow-from]').forEach(p=>p.dataset.active=String(related.has(p.dataset.flowFrom)&&related.has(p.dataset.flowTo)));
 if(preview)return;experience.stage=id;const root=$('#x-flow-detail');root.replaceChildren();root.append(el('p','선택 단계 / '+meta.label,'x-label'),el('h2',meta.title));
 const calculations={data:'기업·공시 이용 가능일 기준 정렬',detect:'시장·업종 조정 → 누적 하락 신호',slow:'PM × ATO → 재무 변화 검토',fast:'사건 시점 정렬 → 사건 전후 비교',integrate:'근거 통합 → 상충 항목 점검',opinion:'주장·근거·성립 조건 분리',rebuttal:'경제적 전제와 반대 증거 대조',result:'관측·판단·미확인 항목 구분'};
 const facts=el('div',null,'x-stage-facts');for(const [label,items]of [['핵심 입력',meta.input],['계산·처리',[calculations[id]]],['산출물',[meta.output]],['검증 범위',[meta.status]]]){const part=el('div');part.append(el('small',label));for(const text of items)part.append(el('span',text));facts.append(part);}root.append(facts);
 if(id==='slow')root.append(xButton('수정 DuPont의 계산 구조 열기 ↗',()=>switchTab('dupont'),'x-text-link'));
 const company=experience.catalog?.companies.find(c=>c.stock_code===experience.stock);if(company)root.append(el('p','현재 탐색 기업: '+company.stock_name+' · '+experience.fs+' · '+experience.asof+' 기준. 금액·모형 출력은 REVIEW 상태입니다.','x-context-line'));
 overviewExperience.querySelectorAll('[data-work-chapter]').forEach(s=>s.dataset.current=String(s.dataset.workChapter===id));
}
function buildOverview(){
 const root=overviewExperience;root.replaceChildren();const intro=el('div',null,'x-intro');intro.append(el('p','FDS RESEARCH / SYSTEM MAP','x-label'),el('h1','하락 신호를 탐지하고,\n재무·공시로 검토합니다.'),el('p','분석 경로를 선택해 사용 데이터와 검증 범위를 확인하세요. 서서히 하락과 급락은 서로 다른 분석 분기입니다.','x-deck'));root.append(intro);
 const stage=el('div',null,'x-flow-stage');const head=el('div',null,'x-graphic-heading');head.append(el('span','ANALYSIS WORKFLOW'),el('span','선택 · 분기 탐색 / 스크롤 · 단계 이동'));stage.append(head);
 const diagram=el('div',null,'x-system-map');diagram.setAttribute('aria-label','입력과 탐지에서 서서히 하락 및 급락으로 분기한 뒤 통합 판단으로 합류하는 분석 흐름');
 const svg=svgNode('svg',{viewBox:'0 0 1220 350',class:'x-system-edges',preserveAspectRatio:'none','aria-hidden':'true'});
 for(const [from,to]of WORK_EDGES){const a=WORKFLOW.find(n=>n.id===from).at,b=WORKFLOW.find(n=>n.id===to).at;const p=svgNode('path',{d:`M${a[0]+32},${a[1]} C${(a[0]+b[0])/2},${a[1]} ${(a[0]+b[0])/2},${b[1]} ${b[0]-32},${b[1]}`});p.dataset.flowFrom=from;p.dataset.flowTo=to;svg.append(p);}diagram.append(svg);
 const mobilePositions={data:[28,98],detect:[112,98],slow:[206,40],fast:[206,155],integrate:[301,98],opinion:[301,213],rebuttal:[206,213],result:[112,213]};
 const mobile=svgNode('svg',{viewBox:'0 0 350 250',class:'x-system-edges x-mobile-edges',preserveAspectRatio:'none','aria-hidden':'true'});
 for(const [from,to]of WORK_EDGES){const a=mobilePositions[from],b=mobilePositions[to],leftward=b[0]<a[0],vertical=b[0]===a[0];const x=a[0]+(vertical?0:leftward?-18:18),xx=b[0]+(vertical?0:leftward?18:-18),y=a[1]+(vertical?18:0),yy=b[1]-(vertical?18:0);const path=svgNode('path',{d:vertical?`M${x},${y} L${xx},${yy}`:`M${x},${y} C${(x+xx)/2},${y} ${(x+xx)/2},${yy} ${xx},${yy}`});path.dataset.flowFrom=from;path.dataset.flowTo=to;mobile.append(path);}diagram.append(mobile);
 for(const m of WORKFLOW){const b=xButton('',()=>setWorkStage(m.id),'x-flow-node');b.dataset.flowNode=m.id;b.style.left=m.at[0]/1220*100+'%';b.style.top=m.at[1]/350*100+'%';b.setAttribute('aria-label',m.label+'의 사용 데이터 보기');b.setAttribute('aria-pressed','false');const icon=svgNode('svg',{viewBox:'-23 -23 46 46','aria-hidden':'true'});icon.append(svgNode('path',{d:m.icon}));const ring=el('span',null,'x-flow-ring');ring.append(icon);b.append(ring,el('strong',m.label),el('small',m.tag));b.onmouseenter=b.onfocus=()=>setWorkStage(m.id,true);b.onmouseleave=b.onblur=()=>setWorkStage(experience.stage,true);diagram.append(b);}
 stage.append(diagram);const detail=el('div',null,'x-flow-detail');detail.id='x-flow-detail';detail.setAttribute('aria-live','polite');stage.append(detail);root.append(stage);
 const chapters=el('div',null,'x-work-chapters');
 for(const [i,id]of ['data','detect','slow','fast','integrate','opinion','rebuttal','result'].entries()){const m=WORKFLOW.find(n=>n.id===id),s=el('section',null,'x-work-chapter');s.dataset.workChapter=id;s.append(el('span',['01','02','03A','03B','04','05','06','07'][i],'x-chapter-index'));const copy=el('div');copy.append(el('p',m.label,'x-label'),el('h3',m.title),el('p',m.text));s.append(copy);const inputs=el('div',null,'x-chapter-inputs');for(const text of m.input)inputs.append(el('span',text));s.append(inputs);s.append(xButton('흐름에서 확인 ↑',()=>{setWorkStage(id);xScroll(stage);},'x-text-link'));chapters.append(s);}root.append(chapters);
 const observer=new IntersectionObserver(entries=>{if($('#overview').hidden)return;const visible=entries.filter(e=>e.isIntersecting);if(visible.length)setWorkStage(visible.at(-1).target.dataset.workChapter);},{rootMargin:'-65% 0px -8% 0px',threshold:0});chapters.querySelectorAll('section').forEach(s=>observer.observe(s));experience.observers.push(observer);setWorkStage(experience.stage);
}
function xVariable(key,kind='main'){
 const meta=DUPONT_TERMS[key],b=xButton('',()=>{const frame=$('#x-equation-graphic');if(frame)frame.dataset.depth=String(({OpROA:0,PM:1,ATO:2,avg_noa:3,NOA_t:3,NOA_t_4q:3})[key]??1);chooseMetric(key);requestAnimationFrame(drawDuEdges);},'x-variable x-variable-'+kind);b.dataset.variable=key;b.setAttribute('aria-label',key+' 계산 경로 선택');b.setAttribute('aria-pressed','false');b.append(el('b',kind==='operand'?(meta?.label||key):key),el('small',kind==='operand'?key:(meta?.label||({'assets_t':'총자산','current_liabilities_t':'유동부채'}[key]||key))));
 b.onmouseenter=b.onfocus=()=>highlightDu(key,true);b.onmouseleave=b.onblur=()=>highlightDu(experience.metric,false);return b;
}
function highlightDu(key,preview=false){
 const ancestor={OpROA:['PM','ATO','operating_profit_ttm','sales_ttm','avg_noa','NOA_t','NOA_t_4q','assets_t','current_liabilities_t'],PM:['operating_profit_ttm','sales_ttm'],ATO:['sales_ttm','avg_noa','NOA_t','NOA_t_4q','assets_t','current_liabilities_t'],avg_noa:['NOA_t','NOA_t_4q','assets_t','current_liabilities_t'],NOA_t:['assets_t','current_liabilities_t']};const relevant=new Set([key,'OpROA',...(ancestor[key]||[])]);
 dupontPage.querySelectorAll('[data-variable]').forEach(b=>{b.dataset.focus=String(b.dataset.variable===key);b.dataset.related=String(relevant.has(b.dataset.variable));if(!preview)b.setAttribute('aria-pressed',String(b.dataset.variable===key));});
 dupontPage.querySelectorAll('[data-du-from]').forEach(p=>p.dataset.active=String(relevant.has(p.dataset.duFrom)&&relevant.has(p.dataset.duTo)));
 dupontPage.querySelectorAll('[data-path]').forEach(p=>p.dataset.relevant=String(relevant.has(p.dataset.path==='margin'?'PM':'ATO')));const text=$('#x-du-hover');if(text)text.textContent=(DUPONT_TERMS[key]?.why||'원천 재무상태표 계정. 선택한 기업·공시·회계기간을 확인해야 합니다.');
}
function chooseMetric(key){
 if(!DUPONT_TERMS[key])key='NOA_t';experience.metric=key;highlightDu(key);dupontPage.querySelectorAll('.x-timeline-label').forEach(n=>n.dataset.active=String(n.dataset.metric===key));const meta=DUPONT_TERMS[key],live=$('#x-du-reading');live.replaceChildren(el('span',key+' / '+meta.label,'x-label'),el('strong',meta.formula),el('p',meta.why));renderXSource();renderXReference();
}
function drawDuEdges(){
 const frame=$('#x-equation-graphic'),svg=$('#x-du-edges');if(!frame||!svg)return;svg.replaceChildren();const r=frame.getBoundingClientRect();svg.setAttribute('viewBox',`0 0 ${r.width} ${r.height}`);
 for(const [from,to]of [['operating_profit_ttm','PM'],['sales_ttm','PM'],['sales_ttm','ATO'],['avg_noa','ATO'],['PM','OpROA'],['ATO','OpROA'],['NOA_t','avg_noa'],['NOA_t_4q','avg_noa'],['assets_t','NOA_t'],['current_liabilities_t','NOA_t']]){
 const targets=[...frame.querySelectorAll('[data-variable]')];const b=targets.find(n=>n.dataset.variable===to);const bx=b?.getBoundingClientRect().left||0;const a=targets.filter(n=>n.dataset.variable===from).sort((a,c)=>Math.abs(a.getBoundingClientRect().left-bx)-Math.abs(c.getBoundingClientRect().left-bx))[0];if(!a||!b||!a.getClientRects().length||!b.getClientRects().length)continue;
 const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect(),x=ar.left+ar.width/2-r.left,y=(to==='OpROA'?ar.bottom:ar.top)-r.top,xx=br.left+br.width/2-r.left,yy=br.bottom-r.top;const bend=to==='OpROA'?Math.max(y,yy)+20:(y+yy)/2;const p=svgNode('path',{d:`M${x},${y} C${x},${bend} ${xx},${bend} ${xx},${yy}`});p.dataset.duFrom=from;p.dataset.duTo=to;svg.append(p);
 }highlightDu(experience.metric);
}
function setDuScene(index){
 experience.scene=index;const frame=$('#x-equation-graphic');if(!frame)return;frame.dataset.depth=String(index);dupontPage.querySelectorAll('[data-du-chapter]').forEach(s=>s.dataset.current=String(+s.dataset.duChapter===index));chooseMetric(['OpROA','PM','ATO','NOA_t'][index]);requestAnimationFrame(drawDuEdges);
}
function buildDuPont(){
 const root=dupontPage;root.replaceChildren();const intro=el('div',null,'x-intro x-du-intro');intro.append(el('p','FINANCIAL MODEL / MODIFIED DUPONT','x-label'),el('h1','하나의 수익성,\n두 개의 계산 경로.'),el('p','수정 DuPont 분석 · 이익률과 순영업자산 회전율을 나누고, 같은 시점의 공시로 연결합니다.','x-deck'));root.append(intro);
 const shortcuts=el('nav',null,'x-shortcuts');shortcuts.setAttribute('aria-label','DuPont 탐색');for(const [hash,text]of [['x-history','공시 시점 비교 ↓'],['x-source','원천 계정·보고서 ↓']]){const a=el('a',text);a.href='#'+hash;shortcuts.append(a);}root.append(shortcuts);const context=el('form',null,'x-context');context.id='x-context';context.setAttribute('aria-label','DuPont 분석 조건');root.append(context);renderXControls();
 const model=el('div',null,'x-du-stage');const headline=el('div',null,'x-graphic-heading');headline.append(el('span','THE EQUATION'),el('span','변수 선택 · 계산 경로 / 스크롤 · 분해 깊이'));model.append(headline);
 const frame=el('div',null,'x-equation-graphic');frame.id='x-equation-graphic';frame.dataset.depth='0';const svg=svgNode('svg',{class:'x-du-edges',id:'x-du-edges','aria-hidden':'true'});frame.append(svg);
 const equation=el('div',null,'x-big-equation');equation.append(xVariable('OpROA'),el('span','=','x-equals'),xVariable('PM'),el('span','×','x-equals'),xVariable('ATO'));frame.append(equation);
 const operands=el('div',null,'x-operand-paths');
 for(const [id,keys]of [['margin',['operating_profit_ttm','sales_ttm']],['turnover',['sales_ttm','avg_noa']]]){const path=el('div',null,'x-fraction-path x-'+id);const numerator=xVariable(keys[0],'operand'),denominator=xVariable(keys[1],'operand');numerator.prepend(el('em','분자','x-operand-role'));denominator.prepend(el('em','분모','x-operand-role'));path.append(numerator,el('span','÷'),denominator);path.dataset.path=id;path.prepend(el('span',id==='margin'?'PM / 이익률 경로':'ATO / 회전율 경로','x-path-label'));operands.append(path);}frame.append(operands);
 const noa=el('div',null,'x-noa-path');noa.append(el('span','평균 NOA = ('),xVariable('NOA_t','small'),el('span','+'),xVariable('NOA_t_4q','small'),el('span',') ÷ 2'));frame.append(noa);
 const accounts=el('div',null,'x-account-path');accounts.append(el('span','NOA_t ='),xVariable('assets_t','small'),el('span','−'),xVariable('current_liabilities_t','small'));frame.append(accounts);model.append(frame);
 const hover=el('p',null,'x-hover-explanation');hover.id='x-du-hover';hover.setAttribute('aria-live','off');model.append(hover);
 const reading=el('div',null,'x-du-reading');reading.id='x-du-reading';reading.setAttribute('aria-live','polite');model.append(reading);const lens=el('div',null,'x-data-lens');const lensTools=el('div',null,'x-lens-tools');const toggle=el('input');toggle.type='checkbox';toggle.id='x-reference-toggle';toggle.setAttribute('aria-label','검토 중 CSV 참고값 보기');toggle.checked=experience.showReference;toggle.onchange=()=>{experience.showReference=toggle.checked;renderXReference();renderXSource();};const toggleLabel=el('label','검토 중 CSV 참고값 보기');toggleLabel.prepend(toggle);lensTools.append(toggleLabel);for(const [hash,label]of [['x-history','같은 시점 비교 →'],['x-source','선택 변수의 근거 →']]){const a=el('a',label);a.href='#'+hash;lensTools.append(a);}const reference=el('div');reference.id='x-reference';reference.setAttribute('aria-live','polite');reference.setAttribute('aria-label','검토 중 CSV 참고값과 검사 범위');reference.tabIndex=0;lens.append(lensTools,reference);model.append(lens);const scrolly=el('div',null,'x-du-scrolly');scrolly.append(model);root.append(scrolly);
 const chapters=el('div',null,'x-du-chapters');const steps=[['전체 관계','OpROA = PM × ATO','이익률과 회전율이 같은 영업수익성에 연결됩니다. 분해 관계이며 변화의 경제적 원인을 확정하지 않습니다.'],['이익률 경로','PM = 영업이익 TTM ÷ 매출액 TTM','매출에서 영업이익으로 남은 비중입니다. TTM은 최근 4분기이며 누적 금액과 단독 분기를 구분합니다.'],['회전율 경로','ATO = 매출액 TTM ÷ 평균 NOA','매출액을 평균 순영업자산으로 나눕니다. 당기와 전년 동분기의 NOA를 같은 기준으로 연결합니다.'],['자산 입력','NOA_t = assets_t − current_liabilities_t','프로젝트에서 확정한 총자산 − 유동부채 정의를 유지합니다. 평균 NOA는 (NOA_t + NOA_t_4q) ÷ 2입니다.']];
 steps.forEach(([label,title,text],i)=>{const s=el('section',null,'x-du-chapter');s.dataset.duChapter=String(i);s.append(el('span','0'+(i+1),'x-chapter-index'));const body=el('div');body.append(el('p',label,'x-label'),el('h3',title),el('p',text));s.append(body,xButton('경로 펼치기 ↑',()=>{setDuScene(i);xScroll(model);},'x-text-link'));chapters.append(s);});scrolly.append(chapters);
 const history=xSection('SAME DATE / THREE METRICS','같은 공시 시점에서 세 지표를 확인합니다.');history.id='x-history';const timeline=el('div');timeline.id='x-timeline';history.append(timeline,el('p','속이 빈 점은 실제 공시 관측 시점입니다. 세로 위치·점 크기에 금액을 부여하지 않았으며 금액 그래프는 원천 의미 검증 전까지 미표시합니다. 선택한 CSV 참고값은 별도 보기에서 확인할 수 있습니다.','x-method-note'));root.append(history);
 const source=xSection('FROM FORMULA TO FILING','수식에서 원문 공시까지.');source.id='x-source';const detail=el('div');detail.id='x-source-detail';detail.setAttribute('aria-live','polite');source.append(detail);root.append(source);
 const end=el('p','REVIEW · 금액·회계 의미 전수 검증 미완료. 원본 CSV·XML은 읽기 전용입니다.','x-method-note');end.id='x-data-status';root.append(end);
 const observer=new IntersectionObserver(entries=>{if(root.hidden)return;const visible=entries.filter(e=>e.isIntersecting);if(visible.length)setDuScene(+visible.at(-1).target.dataset.duChapter);},{rootMargin:'-63% 0px -10% 0px',threshold:0});chapters.querySelectorAll('section').forEach(s=>observer.observe(s));experience.observers.push(observer);
 new ResizeObserver(()=>requestAnimationFrame(drawDuEdges)).observe(frame);chooseMetric(experience.metric);renderXTimeline();
}
async function xApi(path,extra={}){const q=new URLSearchParams({stock:experience.stock,fs:experience.fs,asof:experience.asof,...extra});const r=await fetch('/api/'+path+'?'+q);const d=await r.json();if(!r.ok)throw Error(d.error||'조회 실패');return d;}
function renderXControls(){
 const form=$('#x-context');if(!form)return;form.replaceChildren();const label=(text,input)=>{const l=el('label',text);l.append(input);return l;};
 const company=el('select');company.setAttribute('aria-label','DuPont 기업');if(experience.catalog){for(const c of experience.catalog.companies){const o=el('option',c.stock_name+' · '+c.stock_code);o.value=c.stock_code;company.append(o);}company.value=experience.stock;}else{company.append(el('option','데이터 연결 대기'));company.disabled=true;}
 const fs=el('select');fs.setAttribute('aria-label','DuPont 재무제표');for(const [key,text]of [['CFS','연결 · CFS'],['OFS','별도 · OFS']]){const o=el('option',text);o.value=key;fs.append(o);}fs.value=experience.fs;
 const from=el('input');from.type='date';from.value=experience.from;from.setAttribute('aria-label','DuPont 시작일');const asof=el('input');asof.type='date';asof.value=experience.asof;asof.setAttribute('aria-label','DuPont 분석 기준일');const applyButton=el('button','분석 조건 적용 →');applyButton.type='submit';applyButton.disabled=!experience.catalog;
 form.append(label('기업',company),label('재무제표',fs),label('시작일',from),label('분석 기준일 · PIT',asof),applyButton);
 form.onsubmit=event=>{event.preventDefault();if(!from.value||!asof.value||from.value>asof.value){$('#x-data-status').textContent='시작일과 분석 기준일을 확인하세요.';return;}Object.assign(experience,{stock:company.value,fs:fs.value,from:from.value,asof:asof.value,receipt:null});loadXSeries();};
}
async function loadXSeries(){
 const epoch=++experience.epoch;experience.lineage=null;experience.series=[];renderXSource();renderXReference();renderXTimeline();$('#x-data-status').textContent='실제 공시 시점을 조회하는 중…';
 try{const points=await xApi('series');if(epoch!==experience.epoch)return;experience.series=points.filter(p=>p.date>=experience.from);experience.receipt=experience.series.at(-1)?.id||null;renderXTimeline();setWorkStage(experience.stage);$('#x-data-status').textContent=experience.series.length+'개 실제 공시 시점 · 원천 의미 REVIEW / 금액 그래프 미표시 · '+experience.asof+'까지 이용 가능일 제한';await loadXLineage(epoch);}catch(e){if(epoch===experience.epoch)$('#x-data-status').textContent=e.message;}
}
async function loadXLineage(epoch=experience.epoch){
 if(!experience.receipt)return;const receipt=experience.receipt;experience.lineage=null;renderXSource();renderXReference();
 try{const d=await xApi('lineage',{receipt,metric:'OpROA'});if(epoch!==experience.epoch||receipt!==experience.receipt)return;experience.lineage=d;renderXSource();renderXReference();}catch(e){if(epoch===experience.epoch&&receipt===experience.receipt)$('#x-source-detail').replaceChildren(el('p',e.message,'x-method-note'));}
}
function selectXPoint(id){experience.receipt=id;renderXTimeline();loadXLineage();}
function renderXTimeline(){
 const root=$('#x-timeline');if(!root)return;root.replaceChildren();const points=experience.series;
 if(!points.length){const route=el('div',null,'x-no-series');for(const key of ['PM','ATO','OpROA']){const lane=el('div');lane.append(el('b',key),el('span','공시 시점 연결 대기'),el('em','REVIEW'));route.append(lane);}root.append(route);return;}
 const selected=points.find(p=>p.id===experience.receipt)||points.at(-1);const selection=el('p',`${experience.catalog.companies.find(c=>c.stock_code===experience.stock)?.stock_name} · ${selected.year} Q${selected.quarter} · 이용 가능일 ${selected.date}`,'x-selected-date');root.append(selection);
 const graphic=svgNode('svg',{viewBox:'0 0 1080 245',role:'group','aria-label':'PM ATO OpROA의 실제 공시 관측 시점. 금액은 검토 중으로 미표시'}),start=Date.parse(points[0].date),end=Date.parse(points.at(-1).date),x=p=>110+(Date.parse(p.date)-start)/(end-start||1)*920;
 for(const [i,key]of ['PM','ATO','OpROA'].entries()){const y=45+i*70;const label=svgNode('text',{x:0,y:y+5,class:'x-timeline-label'});label.textContent=key;label.dataset.metric=key;label.dataset.active=String(experience.metric===key);graphic.append(label,svgNode('line',{x1:110,x2:1030,y1:y,y2:y,class:'x-timeline-rail'}));const cursor=svgNode('line',{x1:x(selected),x2:x(selected),y1:15,y2:210,class:'x-time-cursor'});if(!i)graphic.append(cursor);
 for(const [j,p]of points.entries()){const dot=svgNode('circle',{cx:x(p),cy:y,r:6,class:'x-event-point',role:'button',tabindex:0,'aria-label':key+' '+p.date+' '+p.id+' 공시 선택','aria-pressed':String(p.id===experience.receipt)});dot.dataset.receipt=p.id;dot.dataset.selected=String(p.id===experience.receipt);const show=()=>{root.querySelectorAll('[data-receipt]').forEach(d=>d.dataset.hover=String(d.dataset.receipt===p.id));selection.textContent=p.year+' Q'+p.quarter+' · 이용 가능일 '+p.date+' · '+p.id+' · REVIEW';};dot.onmouseenter=dot.onfocus=show;dot.onmouseleave=dot.onblur=()=>root.querySelectorAll('[data-receipt]').forEach(d=>d.dataset.hover='false');dot.onclick=()=>selectXPoint(p.id);dot.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectXPoint(p.id);}};const title=svgNode('title');title.textContent=key+' · '+p.date+' · REVIEW · 금액 미표시';dot.append(title);graphic.append(dot);}}
 for(const p of [points[0],points.at(-1)]){const t=svgNode('text',{x:x(p),y:240,'text-anchor':p===points[0]?'start':'end',class:'x-timeline-date'});t.textContent=p.date;graphic.append(t);}root.append(graphic);
 const picker=el('select');picker.setAttribute('aria-label','DuPont 관측 공시');for(const p of points){const o=el('option',p.date+' · '+p.year+' Q'+p.quarter+' · '+p.id);o.value=p.id;picker.append(o);}picker.value=experience.receipt;picker.onchange=()=>selectXPoint(picker.value);root.append(picker);
}
function renderXSource(){
 const root=$('#x-source-detail');if(!root)return;root.replaceChildren();const d=experience.lineage,meta=DUPONT_TERMS[experience.metric];
 const path=el('div',null,'x-provenance-path');const labels=[experience.metric,meta.formula,'25번 CSV · 계산 컬럼','02번 CSV · 원천 계정','공시 보고서'];labels.forEach((text,i)=>{if(i)path.append(el('span','→'));path.append(el('strong',text));});root.append(path);
 if(!d){root.append(el('p',experience.receipt?'선택한 공시의 계보를 읽는 중입니다.':'실제 관측 시점을 선택하면 원천 계정과 보고서가 이 경로에 연결됩니다. 금융값이 없어도 위 수식의 계산 경로를 탐색할 수 있습니다.','x-method-note'));return;}
 const node=d.nodes.find(n=>n.id===experience.metric);if(!node)return;const reachable=new Set([node.id]);let changed=true;while(changed){changed=false;for(const edge of d.edges)if(reachable.has(edge.target)&&!reachable.has(edge.source)){reachable.add(edge.source);changed=true;}}
 const sources=d.nodes.filter(n=>reachable.has(n.id)&&n.kind==='fact');const layout=el('div',null,'x-evidence-layout'),accounts=el('div'),reports=el('div');layout.append(accounts,reports);root.append(layout);
 accounts.append(el('p',d.company_name+' · '+d.context.fs_div+' · '+d.context.fiscal_year+' Q'+d.context.quarter,'x-label'),el('h3',node.label+'의 원천 연결'),el('p',node.file+' / '+node.column,'x-monospace'),el('p',node.status,'x-method-note'));
 if(!sources.length)accounts.append(el('p','확정된 원천 행이 없습니다. 계정 후보와 회계 의미의 추가 검토가 필요합니다.','x-method-note'));
 for(const fact of sources){const row=el('details',null,'x-source-account');row.append(el('summary',fact.label+' · '+fact.row.fiscal_year+' Q'+fact.row.quarter));const dl=el('dl');for(const [k,v]of [['fact_id',fact.id],['원천 계정',fact.account?.account_nm],['CSV 컬럼',fact.file+' / '+fact.column],['기간 구분',fact.account?.period_kind],['제표·계정 ID',fact.sj_div&&fact.account_id?fact.sj_div+' / '+fact.account_id:'미확인'],['접수번호',fact.row.source_receipt],['이용 가능일',fact.row.available_from],['원천 금액',experience.showReference&&referencePolicy(node,d).kind!=='blocked'&&referencePolicy(fact,d).kind!=='blocked'&&fact.value!=null?String(fact.value)+' 원 · CSV 참고값 / 원천 의미 REVIEW':'— · 미표시 또는 검사 불일치 / 의미 검증 대기']])dl.append(el('dt',k),el('dd',v||'미확인'));row.append(dl);accounts.append(row);}
 reports.append(el('h3','계산에 사용된 보고서'));for(const f of node.filings||[]){const r=el('div',null,'x-report');const a=el('a',f.report_nm||f.rcept_no);a.href='https://dart.fss.or.kr/dsaf001/main.do?rcpNo='+encodeURIComponent(f.rcept_no);a.target='_blank';a.rel='noopener noreferrer';r.append(el('small',f.report_type||'보고서 종류 미확인'),a,el('code',f.rcept_no));const dl=el('dl');for(const [k,v]of [['회계기간',f.report_period_start&&f.report_period_end?f.report_period_start+' ~ '+f.report_period_end:'원문 기간 미확인'],['공시 접수일',f.receipt_date||f.publication_date||'미확인'],['이용 가능일',f.available_from||'미확인'],['원문 상태',f.xml_available?'로컬 사본 있음 · 의미 검증 별도':'로컬 사본 없음 · 공식 DART 이용']])dl.append(el('dt',k),el('dd',v));r.append(dl);reports.append(r);}
}
// Display classification only: no accounting meaning or replacement amount is inferred.
function referencePolicy(node,data){
 if(!node||node.value==null)return {kind:'missing',label:'미확인 · 값 또는 원천 연결 없음'};
 const ids=new Set([node.id]);let changed=true;while(changed){changed=false;for(const edge of data.edges||[])if(ids.has(edge.target)&&!ids.has(edge.source)){ids.add(edge.source);changed=true;}}
 const upstream=data.nodes.filter(n=>ids.has(n.id));
 if(upstream.some(n=>n.audit_issues?.length||n.formula_matches===false||data.traces?.[n.id]?.matches_csv===false))return {kind:'blocked',label:'불일치·오류 영향 또는 합산 경로 미확정 · 금액 미표시'};
 const checked=node.formula_matches===true||data.traces?.[node.id]?.matches_csv===true;
 return {kind:checked?'checked':'review',label:checked?'연결·산식 대조 확인 / 원천 의미 REVIEW':'CSV 원값 기록 / 원천 의미·계산 범위 추가 검토'};
}
function renderXReference(){
 const root=$('#x-reference');if(!root)return;root.replaceChildren();root.hidden=!experience.showReference;if(root.hidden)return;
 root.append(el('p','검토용 참고자료 · 승인된 공식 결과가 아닙니다.','x-reference-warning'));
 const data=experience.lineage,selected=data?.nodes.find(n=>n.id===experience.metric);if(!selected){root.append(el('p','선택 시점의 연결된 값이 없습니다. 임의의 금액을 채우지 않습니다.','x-method-note'));return;}
 root.append(el('p',data.company_name+' · '+data.context.fs_div+' · '+data.context.fiscal_year+' Q'+data.context.quarter+' · 이용 가능일 '+data.cutoff,'x-reference-context'));const mainPolicy=referencePolicy(selected,data),keys=[experience.metric,...(DUPONT_TERMS[experience.metric]?.inputs||[])];
 for(const key of keys){const node=data.nodes.find(n=>n.id===key);const policy=mainPolicy.kind==='blocked'?mainPolicy:referencePolicy(node,data);const row=el('div',null,'x-reference-row');row.dataset.policy=policy.kind;row.append(el('span',node?.label||key));
 const permitted=policy.kind==='checked'||policy.kind==='review';const value=el('strong',permitted?nodeValue(node):'—');row.append(value,el('small',policy.label));if(permitted)row.append(el('code','CSV 원값 '+String(node.value)+' · '+node.unit));root.append(row);}
 root.append(el('p','산식 확인은 회계적 의미 인증이 아닙니다. 확인된 오류 영향값·산식/합산 불일치·결측은 제외합니다. 검사 근거: 전체_데이터_재검증_종합보고서.md §4·§8, 스키마_키_판정기준.md.','x-reference-basis'));
}
const motionToggle=xButton('동작 줄이기',()=>{experience.reduced=!experience.reduced;document.body.dataset.xMotion=experience.reduced?'reduced':'full';motionToggle.setAttribute('aria-pressed',String(experience.reduced));},'x-motion-toggle');motionToggle.setAttribute('aria-pressed','false');topbar.append(motionToggle);
buildOverview();buildDuPont();
const xRouteBefore=switchTab;switchTab=function(id){xRouteBefore(id);document.body.dataset.experience=(id==='overview'||id==='dupont')?id:'';if(id==='dupont')requestAnimationFrame(drawDuEdges);};
switchTab('overview');
(async()=>{try{experience.catalog=await xApi('catalog');experience.stock=experience.catalog.default;renderXControls();await loadXSeries();}catch(e){$('#x-data-status').textContent=e.message;}})();
