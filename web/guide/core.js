/* FDS 가이드 · 공용: 데이터, 가격 차트, 애니메이션 장면(F-Score·DuPont·Ohlson·가격 탐지), 찾아보기 */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('ko-KR');
const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
const won = v => { if (v == null) return '–'; const a = Math.abs(v); if (a >= 1e12) return (v / 1e12).toFixed(2) + '조'; if (a >= 1e8) return nf.format(Math.round(v / 1e8)) + '억'; if (a >= 1e4) return nf.format(Math.round(v / 1e4)) + '만'; return nf.format(Math.round(v)); };
const pctf = (v, d = 1) => v == null ? '–' : (v * 100).toFixed(d) + '%';
const sgn = (v, d = 1, u = '') => v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + u;
const fsize = b => b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b >= 1e3 ? Math.round(b / 1e3) + ' KB' : b + ' B';
const dartUrl = r => `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${r}`;
const rcept = r => r ? `<a class="rcept" href="${dartUrl(r)}" target="_blank" rel="noopener" data-tip="DART 원문 열기">${esc(r)}</a>` : '';
const ease = t => 1 - Math.pow(1 - t, 3);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const niceStep = raw => { const p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; };

/* ───── 상태 */
const S = { stock: '083650', buy: '2017-06-30', now: '2019-12-30' };
try { Object.assign(S, JSON.parse(localStorage.getItem('fds-guide-case2') || '{}')); } catch (e) { }
const saveS = () => { try { localStorage.setItem('fds-guide-case2', JSON.stringify(S)); } catch (e) { } };
let D = null;
async function loadData() {
  const r = await fetch('/guide/data.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('data.json ' + r.status);
  D = await r.json();
  D.byCode = Object.fromEntries(D.stocks.map(s => [s.code, s]));
  if (!D.byCode[S.stock]) S.stock = D.stocks[0].code;
  if (!D.dates.includes(S.buy)) S.buy = D.dates[4];
  if (!D.dates.includes(S.now)) S.now = D.dates[D.dates.length - 1];
  fixNow(); return D;
}
const dayDiff = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;
const nowOptions = () => D.dates.filter(d => dayDiff(S.buy, d) >= 120);
const buyOptions = () => D.dates.filter(d => dayDiff(d, S.now) >= 120);
function fixNow() { const o = nowOptions(); if (!o.includes(S.now)) S.now = o[o.length - 1]; }
const snap = (code, date) => D.snaps[code]?.[date];
const gridOf = () => D.grid[S.stock]?.[`${S.buy}|${S.now}`];
const stockName = c => D.byCode[c]?.name || c;

/* ───── 등장·카운트·트윈 */
const io = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  const el = e.target; io.unobserve(el); el.classList.add('in');
  $$('[data-count]', el).forEach(countUp); if (el.dataset.count) countUp(el);
  el.dispatchEvent(new CustomEvent('seen'));
}), { threshold: .14, rootMargin: '0px 0px -6% 0px' });
const observe = (root = document) => $$('.rv,.step', root).forEach(el => io.observe(el));
function countUp(el) {
  if (el.dataset.done) return; el.dataset.done = 1;
  const to = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0), suf = el.dataset.suf || '';
  const fmt = v => (dec ? v.toFixed(dec) : nf.format(Math.round(v))) + suf;
  if (reduced) { el.textContent = fmt(to); return; }
  const t0 = performance.now(); const f = t => { const k = ease(Math.min(1, (t - t0) / 1400)); el.textContent = fmt(to * k); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f);
}
/* st 의 숫자 필드를 to 로 부드럽게 옮기며 매 프레임 render(st) */
function animTo(st, to, dur, render) {
  cancelAnimationFrame(st._r);
  if (reduced) { Object.assign(st, to); render(st); return; }
  const from = {}; for (const k in to) from[k] = st[k] ?? to[k]; const t0 = performance.now();
  const f = t => { const k = ease(Math.min(1, (t - t0) / dur)); for (const q in to) st[q] = from[q] + (to[q] - from[q]) * k; render(st); if (k < 1) st._r = requestAnimationFrame(f); };
  st._r = requestAnimationFrame(f);
}
/* 숫자 롤링: 자릿수마다 0~9 기둥이 굴러서 값이 바뀐다 */
function odo(el) {
  let mask = null;
  return {
    set(v) {
      const s = String(v), m = [...s].map(ch => /\d/.test(ch) ? 'd' : ch).join('');
      if (mask !== m) {
        mask = m; el.setAttribute('aria-label', s);
        el.innerHTML = [...s].map(ch => /\d/.test(ch) ? `<span class="od"><span class="odc" style="--d:0">${'0123456789'.split('').map(x => `<i>${x}</i>`).join('')}</span></span>` : `<span class="os">${esc(ch)}</span>`).join('');
        requestAnimationFrame(() => requestAnimationFrame(() => [...s].forEach((ch, i) => { if (/\d/.test(ch)) el.children[i].firstChild.style.setProperty('--d', ch); })));
      } else [...s].forEach((ch, i) => { if (/\d/.test(ch)) el.children[i].firstChild.style.setProperty('--d', ch); });
    }
  };
}
/* 툴팁 */
const tipEl = () => $('#tip');
document.addEventListener('pointerover', e => { const t = e.target.closest?.('[data-tip]'); if (!t) return; const el = tipEl(); el.textContent = t.dataset.tip; el.hidden = false; moveTip(e); });
document.addEventListener('pointermove', e => { if (!tipEl().hidden) moveTip(e); });
document.addEventListener('pointerout', e => { if (e.target.closest?.('[data-tip]')) tipEl().hidden = true; });
function moveTip(e) { const el = tipEl(), w = el.offsetWidth; el.style.left = Math.min(innerWidth - w - 12, e.clientX + 14) + 'px'; el.style.top = (e.clientY + 18) + 'px'; }

/* ───── 가격 도우미 */
const ymdNum = s => +(s.slice(2, 4) + s.slice(5, 7) + s.slice(8, 10));
const numDay = d => Date.UTC(2000 + Math.floor(d / 10000), Math.floor(d / 100) % 100 - 1, d % 100) / 864e5;
const numLabel = d => `${2000 + Math.floor(d / 10000)}.${String(Math.floor(d / 100) % 100).padStart(2, '0')}.${String(d % 100).padStart(2, '0')}`;
function idxAt(code, dateStr) { const a = D.prices[code].d, t = ymdNum(dateStr); let lo = 0, hi = a.length - 1, r = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (a[m] <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; }
/* 가격만 크게 뛰고 시가총액은 그대로인 날 = 액면분할·병합 등 가격 단위 변경 */
function priceJumps(code) { const P = D.prices[code], j = []; for (let i = 1; i < P.c.length; i++) { const dc = P.c[i] / P.c[i - 1] - 1, dm = P.m[i - 1] ? P.m[i] / P.m[i - 1] - 1 : 0; if (Math.abs(dc) > .35 && Math.abs(dm) < Math.abs(dc) * .4) j.push(i); } return j; }
const adjNote = (r) => r.adj ? `<div class="note-line"><span class="chip amber">주의</span>이 구간에 액면분할·병합으로 보이는 가격 점프가 있다. 조정 전 종가 기준 ${sgn(r.ret * 100, 1, '%')}, 시가총액 기준 ${sgn(r.mret * 100, 1, '%')}.</div>` : '';
function returnsOf(code, buy, now) { const P = D.prices[code], bi = idxAt(code, buy), ni = idxAt(code, now), j = priceJumps(code); return { buyP: P.c[bi], nowP: P.c[ni], ret: P.c[ni] / P.c[bi] - 1, mret: P.m[bi] ? P.m[ni] / P.m[bi] - 1 : null, adj: j.some(i => i > bi && i <= ni), bi, ni }; }

/* ───── 정적 가격 차트 */
let chartSeq = 0;
function lineChart(host, o = {}) {
  const code = o.code || S.stock, P = D.prices[code], W = 1000, H = o.h || 360, L = 58, R = 14, T = 20, B = 34;
  const n = P.d.length, bi = idxAt(code, o.buy || S.buy), ni = idxAt(code, o.now || S.now), xs = P.d.map(numDay), x0 = xs[0], x1 = xs[n - 1];
  let lo = Math.min(...P.c), hi = Math.max(...P.c); const pad = (hi - lo) * .08; lo = Math.max(0, lo - pad); hi += pad;
  const X = i => L + (xs[i] - x0) / (x1 - x0) * (W - L - R), Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const seg = (a, b) => { let d = ''; for (let i = a; i <= b; i++) d += (i === a ? 'M' : 'L') + X(i).toFixed(1) + ' ' + Y(P.c[i]).toFixed(1); return d; };
  const rt = returnsOf(code, o.buy || S.buy, o.now || S.now), col = rt.ret < 0 ? 'var(--red)' : 'var(--green)', id = 'g' + (++chartSeq);
  const step = niceStep((hi - lo) / 4), yt = []; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) yt.push(v);
  const yrs = []; for (let y = 2015; y <= 2019; y++) { const d = Date.UTC(y, 0, 1) / 864e5; if (d >= x0 && d <= x1) yrs.push([y, L + (d - x0) / (x1 - x0) * (W - L - R)]); }
  const jumps = priceJumps(code);
  const lab = (i, t) => { const x = X(i), y = Y(P.c[i]), up = y > H / 2, a = x > W - 130 ? 'end' : x < 110 ? 'start' : 'middle'; return `<g class="mk"><circle cx="${x}" cy="${y}" r="6" fill="#fff" stroke="${t === 'buy' ? 'var(--ink)' : col}" stroke-width="3"/><text x="${x}" y="${y + (up ? -16 : 26)}" text-anchor="${a}" font-size="14" font-weight="800" fill="${t === 'buy' ? 'var(--ink)' : col}">${t === 'buy' ? '산 날' : '지금'} ${nf.format(P.c[i])}원</text></g>`; };
  host.innerHTML = `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(stockName(code))} 종가">
    <defs><linearGradient id="${id}a" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".2"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    ${yt.map(v => `<line class="grid-l" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${L - 10}" y="${Y(v) + 4}" text-anchor="end">${nf.format(v)}</text>`).join('')}
    ${yrs.map(([y, x]) => `<line class="grid-l" x1="${x}" x2="${x}" y1="${T}" y2="${H - B}" stroke-dasharray="2 5"/><text class="ax" x="${x + 6}" y="${H - 10}">${y}</text>`).join('')}
    <path d="${seg(0, bi)}" fill="none" stroke="#C3CCDA" stroke-width="2"/><path d="${seg(ni, n - 1)}" fill="none" stroke="#C3CCDA" stroke-width="2" stroke-dasharray="4 4"/>
    <path class="area" d="${seg(bi, ni)} L${X(ni)} ${H - B} L${X(bi)} ${H - B}Z" fill="url(#${id}a)"/>
    <path class="main" d="${seg(bi, ni)}" fill="none" stroke="${col}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>
    ${jumps.map(i => `<line x1="${X(i)}" x2="${X(i)}" y1="${T}" y2="${H - B}" stroke="var(--amber)" stroke-width="2" stroke-dasharray="3 4"/><text x="${X(i) + 6}" y="${T + 12}" font-size="12" font-weight="700" fill="var(--amber)">${numLabel(P.d[i]).slice(2)} 가격 단위 변경</text>`).join('')}
    <line x1="${X(bi)}" x2="${X(bi)}" y1="${T}" y2="${H - B}" class="cross"/>${lab(bi, 'buy')}${ni !== bi ? lab(ni, 'now') : ''}
    <line class="cross hov" y1="${T}" y2="${H - B}" style="opacity:0"/><circle class="hdot" r="5" fill="${col}" stroke="#fff" stroke-width="2" style="opacity:0"/>
    <rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>${annoSvg(code, X, Y, T, L, W - R)}</svg><div class="tipbox"></div></div>`;
  const svg = $('svg', host), main = $('.main', svg), area = $('.area', svg);
  if (!reduced && o.anim !== false) {
    const len = main.getTotalLength(); main.style.strokeDasharray = len; main.style.strokeDashoffset = len; area.style.opacity = 0; $$('.mk', svg).forEach(m => m.style.opacity = 0); main.getBoundingClientRect();
    main.style.transition = 'stroke-dashoffset 1.8s cubic-bezier(.2,.8,.2,1)'; main.style.strokeDashoffset = 0; area.style.transition = 'opacity 1s .9s'; area.style.opacity = 1;
    $$('.mk', svg).forEach((m, k) => { m.style.transition = `opacity .5s ${.3 + k * 1.2}s`; m.style.opacity = 1; });
  }
  const tb = $('.tipbox', host), hov = $('.hov', svg), hd = $('.hdot', svg);
  const move = e => { const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * W, t = x0 + (px - L) / (W - L - R) * (x1 - x0); let a = 0, b = n - 1; while (a < b) { const m = (a + b) >> 1; if (xs[m] < t) a = m + 1; else b = m; } const i = a;
    hov.setAttribute('x1', X(i)); hov.setAttribute('x2', X(i)); hov.style.opacity = 1; hd.setAttribute('cx', X(i)); hd.setAttribute('cy', Y(P.c[i])); hd.style.opacity = 1;
    tb.innerHTML = `${numLabel(P.d[i])}<br><b>${nf.format(P.c[i])}원</b> · 시총 ${nf.format(P.m[i])}억<br><span style="opacity:.75">산 날 대비 ${sgn((P.c[i] / P.c[bi] - 1) * 100, 1, '%')}</span>`; tb.style.left = X(i) / W * 100 + '%'; tb.style.top = Y(P.c[i]) / H * r.height + 'px'; tb.classList.add('on'); };
  $('.hit', svg).addEventListener('pointermove', move); $('.hit', svg).addEventListener('pointerleave', () => { hov.style.opacity = 0; hd.style.opacity = 0; tb.classList.remove('on'); });
  return rt;
}

/* ───── 첫 화면 무대: 산 날 손잡이를 끌면 재무 계산이 바로 바뀐다 */
function stageChart(host, onChange) {
  const code = S.stock, P = D.prices[code], n = P.d.length, W = 1000, H = 430, L = 6, R = 26, T = 28, B = 86;
  const xs = P.d.map(numDay), x0 = xs[0], x1 = xs[n - 1];
  let lo = Math.min(...P.c), hi = Math.max(...P.c); const pad = (hi - lo) * .1; lo = Math.max(0, lo - pad); hi += pad;
  const X = i => L + (xs[i] - x0) / (x1 - x0) * (W - L - R), Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = (a, b) => { let d = ''; for (let i = a; i <= b; i++) d += (i === a ? 'M' : 'L') + X(i).toFixed(1) + ' ' + Y(P.c[i]).toFixed(1); return d; };
  const ni = idxAt(code, S.now), id = 'sg' + (++chartSeq);
  const yrs = []; for (let y = 2015; y <= 2019; y++) { const d = Date.UTC(y, 0, 1) / 864e5; if (d >= x0 && d <= x1) yrs.push([y, L + (d - x0) / (x1 - x0) * (W - L - R)]); }
  const opts = buyOptions(), vcol = { Yes: 'var(--red)', watch: '#E8A23B', No: 'var(--green)', hold: '#9AA7BA' };
  const dayX = d => L + (Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8)) / 864e5 - x0) / (x1 - x0) * (W - L - R);
  const sweepStrip = () => `<text class="ax" x="${L}" y="${H - B + 52}" font-size="12" font-weight="700">산 날에 따른 판정</text>` + opts.map((d, i) => { const g = D.grid[code]?.[`${d}|${S.now}`], vc = g ? verdictClass(g.verdict) : 'hold', xa = dayX(d), xb = i < opts.length - 1 ? dayX(opts[i + 1]) : dayX(S.now); return `<rect class="sw" data-d="${d}" x="${xa + 1}" y="${H - B + 58}" width="${Math.max(2, xb - xa - 2)}" height="16" rx="4" fill="${vcol[vc]}" data-tip="${d} 산 날 · ${g ? verdictText[vc] : '계산 없음'}"/>`; }).join('');
  host.innerHTML = `<div class="chart stage-chart"><svg viewBox="0 0 ${W} ${H}" role="slider" tabindex="0" aria-label="산 날 선택. 좌우 방향키로 바꿀 수 있다" aria-valuetext="${S.buy}">
    <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="gs" stop-opacity=".22"/><stop offset="1" class="gs" stop-opacity="0"/></linearGradient></defs>
    ${yrs.map(([y, x]) => `<line class="grid-l" x1="${x}" x2="${x}" y1="${T}" y2="${H - B}" stroke-dasharray="2 6"/><text class="ax" x="${x + 6}" y="${H - B + 22}">${y}</text>`).join('')}
    ${sweepStrip()}
    <path d="${path(0, n - 1)}" fill="none" stroke="#C9D1DE" stroke-width="2"/>
    <path class="sa" fill="url(#${id})"/><path class="sm" fill="none" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>
    <g class="hd" style="cursor:ew-resize"><line class="hl" y1="${T - 6}" y2="${H - B}" stroke="var(--ink)" stroke-width="2"/><circle class="hg" r="13" fill="var(--ink)"/><path class="ha" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><text class="hp" font-size="14" font-weight="800" fill="var(--ink)" text-anchor="middle">산 날</text></g>
    <circle class="pg" cx="${X(ni)}" cy="${Y(P.c[ni])}" r="5" fill="var(--blue)"/><circle class="pg ping" cx="${X(ni)}" cy="${Y(P.c[ni])}" r="5"/>
    <rect class="hit" x="0" y="0" width="${W}" height="${H}" fill="transparent" style="cursor:ew-resize"/>${annoSvg(code, X, Y, T, L, W - R)}</svg></div>`;
  const svg = $('svg', host), st = { bx: X(idxAt(code, S.buy)) };
  const draw = (animate) => {
    const bi = idxAt(code, S.buy), r = returnsOf(code, S.buy, S.now), col = r.ret < 0 ? 'var(--red)' : 'var(--green)';
    $$('.gs', svg).forEach(s => s.setAttribute('stop-color', r.ret < 0 ? '#E8432F' : '#0C9A70'));
    $('.sm', svg).setAttribute('d', path(bi, ni)); $('.sm', svg).setAttribute('stroke', col); $('.sa', svg).setAttribute('d', path(bi, ni) + ` L${X(ni)} ${H - B} L${X(bi)} ${H - B}Z`);
    $('.pg', svg).setAttribute('fill', col); $$('.ping', svg).forEach(p => p.setAttribute('stroke', col));
    $$('.sw', svg).forEach(r => r.setAttribute('stroke', r.dataset.d === S.buy ? 'var(--ink)' : 'none')); $$('.sw', svg).forEach(r => r.setAttribute('stroke-width', 3)); const set = x => { const y = Y(P.c[bi]); $('.hl', svg).setAttribute('x1', x); $('.hl', svg).setAttribute('x2', x); $('.hg', svg).setAttribute('cx', x); $('.hg', svg).setAttribute('cy', y); $('.ha', svg).setAttribute('d', `M${x - 4} ${y - 3}L${x - 7} ${y}L${x - 4} ${y + 3}M${x + 4} ${y - 3}L${x + 7} ${y}L${x + 4} ${y + 3}`); $('.hp', svg).setAttribute('x', x); $('.hp', svg).setAttribute('y', y - 22); };
    animTo(st, { bx: X(bi) }, animate ? 260 : 0, s => set(s.bx)); svg.setAttribute('aria-valuetext', S.buy); return r;
  };
  const pick = e => {
    const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * W, t = x0 + (px - L) / (W - L - R) * (x1 - x0);
    let best = null, bd = 1e9; buyOptions().forEach(d => { const dd = Math.abs(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8)) / 864e5 - t); if (dd < bd) { bd = dd; best = d; } });
    if (best && best !== S.buy) { S.buy = best; saveS(); onChange(draw(true)); }
  };
  let drag = false;
  svg.addEventListener('pointerdown', e => { drag = true; svg.setPointerCapture(e.pointerId); pick(e); });
  svg.addEventListener('pointermove', e => { if (drag) pick(e); });
  svg.addEventListener('pointerup', () => drag = false); svg.addEventListener('pointercancel', () => drag = false);
  svg.addEventListener('keydown', e => { const o = buyOptions(), i = o.indexOf(S.buy); if (e.key === 'ArrowLeft' && i > 0) { S.buy = o[i - 1]; } else if (e.key === 'ArrowRight' && i < o.length - 1) { S.buy = o[i + 1]; } else return; e.preventDefault(); saveS(); onChange(draw(true)); });
  const main = $('.sm', svg); const r0 = draw(false);
  if (!reduced) { const len = main.getTotalLength(); main.style.strokeDasharray = len; main.style.strokeDashoffset = len; main.getBoundingClientRect(); main.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(.2,.8,.2,1)'; main.style.strokeDashoffset = 0; setTimeout(() => { main.style.strokeDasharray = ''; main.style.transition = ''; }, 1800); }
  return r0;
}

/* ═════════ 작은 계기판 (첫 화면) ═════════ */
function verdictClass(v) { return v?.startsWith('Yes') ? 'Yes' : v === '주의' ? 'watch' : v === 'No' ? 'No' : 'hold'; }
const verdictText = { Yes: '훼손 우려', watch: '주의', No: '뚜렷한 악화 없음', hold: '판단 유보' };
const arcPath = (cx, cy, r, a0, a1) => { const p = a => [cx + r * Math.sin(a), cy - r * Math.cos(a)], [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`; };
function heroDials(host) {
  host.innerHTML = `<div class="dials">
    <div class="dial"><svg viewBox="0 0 140 130"><circle cx="70" cy="68" r="46" fill="none" stroke="var(--bg3)" stroke-width="12"/><path class="fa" fill="none" stroke-width="12" stroke-linecap="round"/><line class="fn" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/><text class="fs" x="70" y="76" text-anchor="middle" font-size="30" font-weight="800"></text></svg><b>F-Score</b><span class="dv f-v"></span></div>
    <div class="dial"><svg viewBox="0 0 140 130"><line x1="10" x2="130" y1="100" y2="100" stroke="var(--line2)"/><rect class="db" fill="none" stroke="var(--mute)" stroke-dasharray="4 4" stroke-width="2"/><rect class="dn" rx="2"/></svg><b>DuPont</b><span class="dv d-v"></span></div>
    <div class="dial"><svg viewBox="0 0 140 130"><path class="oa" fill="none" stroke="var(--bg3)" stroke-width="12" stroke-linecap="round"/><path class="og" fill="none" stroke="var(--green-s)" stroke-width="12"/><line class="ob" stroke="var(--mute)" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 5"/><line class="on" stroke-width="4" stroke-linecap="round"/><circle cx="70" cy="100" r="6" fill="var(--ink)"/></svg><b>Ohlson</b><span class="dv o-v"></span></div>
    <div class="dial verd"><div class="vbox"><small>서서히 모델 판정</small><strong class="vt"></strong></div></div></div>`;
  const st = { f: 0, fb: 0, bato: 0, bpm: 0, ato: 0, pm: 0, ob: 0, on: 0 }, ctx = {};
  const R = () => {
    const sv = $('.fs', host); sv.textContent = ctx.fnull ? '–' : Math.round(st.f);
    const ang = a => (clamp(a, 0, 9) / 9) * Math.PI * 2 - 1e-3; $('.fa', host).setAttribute('d', st.f > .05 ? arcPath(70, 68, 46, 0, ang(st.f)) : ''); $('.fa', host).setAttribute('stroke', ctx.fcol || 'var(--blue)');
    const a = ang(st.fb); const fn = $('.fn', host); fn.setAttribute('x1', 70 + 38 * Math.sin(a)); fn.setAttribute('y1', 68 - 38 * Math.cos(a)); fn.setAttribute('x2', 70 + 56 * Math.sin(a)); fn.setAttribute('y2', 68 - 56 * Math.cos(a));
    const sx = 110 / (ctx.xm || 1), sy = 78 / (ctx.ym || 1), rc = (el, ato, pm) => { const w = Math.max(0, ato) * sx, h = Math.abs(pm) * sy; el.setAttribute('x', 15); el.setAttribute('width', w); el.setAttribute('height', h); el.setAttribute('y', pm >= 0 ? 100 - h : 100); };
    rc($('.db', host), st.bato, st.bpm); rc($('.dn', host), st.ato, st.pm); $('.dn', host).setAttribute('fill', st.pm * st.ato >= (st.bpm * st.bato) ? 'var(--green)' : 'var(--red)'); $('.dn', host).style.opacity = ctx.dnull ? 0 : .88; $('.db', host).style.opacity = ctx.dnull ? 0 : 1;
    const oa = v => (clamp(v, -.5, 1.5) + .5) / 2 * Math.PI - Math.PI / 2, nd = (el, v) => { const t = oa(v); el.setAttribute('x1', 70); el.setAttribute('y1', 100); el.setAttribute('x2', 70 + 46 * Math.sin(t)); el.setAttribute('y2', 100 - 46 * Math.cos(t)); };
    nd($('.on', host), st.on); nd($('.ob', host), st.ob); $('.on', host).setAttribute('stroke', ctx.ocol || 'var(--blue)'); $('.on', host).style.opacity = ctx.onull ? 0 : 1; $('.ob', host).style.opacity = ctx.onull ? 0 : 1;
  };
  const arcs = () => { const a0 = oaA(-.5), a1 = oaA(1.5); $('.oa', host).setAttribute('d', arcPath(70, 100, 46, a0, a1)); $('.og', host).setAttribute('d', arcPath(70, 100, 46, oaA(0), oaA(1))); }; const oaA = v => (clamp(v, -.5, 1.5) + .5) / 2 * Math.PI - Math.PI / 2; arcs();
  return {
    update() {
      const sb = snap(S.stock, S.buy), sn = snap(S.stock, S.now), g = gridOf();
      const fb = sb?.f?.score, fn = sn?.f?.score; ctx.fnull = fn == null; ctx.fcol = g?.score_F >= 2 ? 'var(--red)' : g?.score_F === 1 ? 'var(--amber)' : 'var(--green)';
      const db = sb?.d, dn = sn?.d; ctx.dnull = db?.PM_pct == null || dn?.PM_pct == null;
      if (!ctx.dnull) { ctx.xm = Math.max(db.ATO, dn.ATO) * 1.1; ctx.ym = Math.max(Math.abs(db.PM_pct), Math.abs(dn.PM_pct), 1) * 1.1; }
      const ob = sb?.o, on = sn?.o; ctx.onull = ob?.omega == null || on?.omega == null; ctx.ocol = g?.OH_held ? 'var(--violet)' : 'var(--blue)';
      animTo(st, { f: fn ?? 0, fb: fb ?? 0, bato: db?.ATO ?? 0, bpm: db?.PM_pct ?? 0, ato: dn?.ATO ?? 0, pm: dn?.PM_pct ?? 0, ob: ob?.omega ?? 0, on: on?.omega ?? 0 }, 700, R);
      $('.f-v', host).innerHTML = fb != null && fn != null ? `<b class="${fn < fb ? 'hl-r' : fn > fb ? 'hl-g' : ''}">${fb} → ${fn}</b>` : '–';
      $('.d-v', host).innerHTML = ctx.dnull ? '–' : `OpROA <b class="${dn.PM_pct * dn.ATO < db.PM_pct * db.ATO ? 'hl-r' : 'hl-g'}">${(db.PM_pct * db.ATO).toFixed(1)} → ${(dn.PM_pct * dn.ATO).toFixed(1)}%</b>`;
      $('.o-v', host).innerHTML = ctx.onull ? '–' : `ω <b>${ob.omega.toFixed(2)} → ${on.omega.toFixed(2)}</b>${g?.OH_held ? ' <em class="held">유보</em>' : ''}`;
      const vb = $('.verd', host), vt = $('.vt', host); const vc = g ? verdictClass(g.verdict) : 'hold'; vb.className = 'dial verd ' + vc; vt.textContent = g ? verdictText[vc] : '–';
    }
  };
}

/* ═════════ 시간 스크러버: 날짜를 움직이면 그날 알 수 있던 값으로 장면이 바뀐다 ═════════ */
function scrubber(host, { value, onInput, buyMark = true }) {
  const n = D.dates.length; let idx = value, timer = null;
  host.innerHTML = `<div class="scrub"><button class="play" type="button" aria-label="재생">▶</button><div class="scrub-mid"><div class="scrub-date"><b class="mono" id="sd"></b><span class="small">그날 공개돼 있던 값</span></div>
    <div class="scrub-track"><input type="range" min="0" max="${n - 1}" step="1" value="${idx}" aria-label="날짜">${buyMark ? `<i class="bmark" style="left:${D.dates.indexOf(S.buy) / (n - 1) * 100}%"><em>산 날</em></i>` : ''}</div>
    <div class="scrub-ticks">${D.dates.map((d, i) => /-(06|12)-/.test(d) ? `<span style="left:${i / (n - 1) * 100}%">${d.slice(2, 7).replace('-', '.')}</span>` : '').join('')}</div></div></div>`;
  const rng = $('input', host), btn = $('.play', host), lab = $('#sd', host);
  const set = (i, fire = true) => { idx = i; rng.value = i; lab.textContent = D.dates[i]; const p = i / (n - 1) * 100; rng.style.setProperty('--p', p + '%'); if (fire) onInput(i); };
  rng.oninput = () => { stop(); set(+rng.value); };
  const stop = () => { clearInterval(timer); timer = null; btn.textContent = '▶'; };
  const play = () => { if (idx >= n - 1) set(0); btn.textContent = '❚❚'; timer = setInterval(() => { if (idx >= n - 1) { stop(); return; } set(idx + 1); }, 1100); };
  btn.onclick = () => timer ? stop() : play();
  set(idx, false); return { set, stop, get idx() { return idx; } };
}

/* ═════════ 장면 1: F-Score 아홉 칸이 뒤집힌다 ═════════ */
const FT = [['이익', 'F1 · 순이익이 플러스'], ['현금', 'F2 · 영업현금이 플러스'], ['개선', 'F3 · ROA가 작년보다 상승'], ['질', 'F4 · 이익보다 현금이 더 많음'], ['부채', 'F5 · 장기부채 비중 감소'], ['유동', 'F6 · 유동비율 상승'], ['증자', 'F7 · 신주 발행 없음'], ['마진', 'F8 · 매출총이익률 상승'], ['회전', 'F9 · 자산회전율 상승']];
const FGROUP = [['수익성', [0, 1, 2, 3]], ['안정성', [4, 5, 6]], ['효율', [7, 8]]];
function fVals(f, i) {
  const c = f.cur, p = f.prev, pc = v => pctf(v);
  return [() => 'ROA ' + pc(c.ROA), () => '영업현금/자산 ' + pc(c.CFO_ratio), () => p ? `ROA ${pc(p.ROA)} → ${pc(c.ROA)}` : 'ROA ' + pc(c.ROA), () => '발생액/자산 ' + pc(c.ACCRUAL), () => `부채비중 ${pc(f.prev_lever_from_cur ?? p?.LEVER)} → ${pc(c.LEVER)}`, () => p ? `유동비율 ${pctf(p.CURRENT_RATIO, 0)} → ${pctf(c.CURRENT_RATIO, 0)}` : '유동비율 ' + pctf(c.CURRENT_RATIO, 0), () => f.offer_dates ? '신주 발행 ' + f.offer_dates.split(';').length + '건' : '발행 없음', () => p ? `마진 ${pc(p.GROSS_MARGIN)} → ${pc(c.GROSS_MARGIN)}` : '마진 ' + pc(c.GROSS_MARGIN), () => p ? `회전 ${p.ASSET_TURN.toFixed(2)} → ${c.ASSET_TURN.toFixed(2)}` : '회전 ' + c.ASSET_TURN.toFixed(2)][i]();
}
function sceneF(host) {
  host.innerHTML = `<div class="sf"><div class="sf-ring"><svg viewBox="0 0 220 220"><circle cx="110" cy="110" r="90" fill="none" stroke="var(--bg3)" stroke-width="16"/><circle class="arc" cx="110" cy="110" r="90" fill="none" stroke-width="16" stroke-linecap="round" transform="rotate(-90 110 110)" stroke-dasharray="565.5" stroke-dashoffset="565.5"/></svg><div class="sf-num"><span class="sfn mono"></span><small>/ 9</small></div></div>
    <div class="sf-groups">${FGROUP.map(([nm, ids]) => `<div class="sf-g"><b>${nm}</b><div class="sf-row">${ids.map(i => `<div class="tl3" data-i="${i}"><div class="in"><div class="fr"><span>F${i + 1}</span><small>${FT[i][0]}</small></div><div class="bk"><span>F${i + 1}</span><small>${FT[i][0]}</small></div></div><i class="bdot"></i></div>`).join('')}</div></div>`).join('')}</div></div><div class="src small" id="fsrc"></div>`;
  const sfn = odo($('.sfn', host)), arc = $('.arc', host);
  return {
    set(date) {
      const f = snap(S.stock, date)?.f, b = snap(S.stock, S.buy)?.f; const ok = !!f?.signals;
      $$('.tl3', host).forEach((t, k) => { const i = +t.dataset.i, v = ok ? f.signals[i] : null; t.style.setProperty('--d', (k * 70) + 'ms'); t.dataset.s = v == null ? 'na' : v ? 'on' : 'off'; t.dataset.tip = FT[i][1] + (ok ? ' · ' + fVals(f, i) : ' · 자료 없음'); const bd = $('.bdot', t), bs = b?.signals?.[i]; bd.className = 'bdot ' + (bs == null ? '' : bs ? 'on' : 'off'); bd.dataset.tip = '산 날 기준: ' + (bs == null ? '–' : bs ? '통과' : '미통과'); });
      const score = ok ? f.score : 0; arc.style.transition = reduced ? 'none' : 'stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1), stroke .5s'; arc.style.strokeDashoffset = 565.5 * (1 - score / 9); arc.style.stroke = score >= 7 ? 'var(--green)' : score >= 4 ? 'var(--blue)' : 'var(--red)';
      sfn.set(ok ? score : '–');
      $('#fsrc', host).innerHTML = ok ? `${f.year}년 사업보고서 · ${f.disclosed} 공개 ${rcept(f.rcept_no)}` : '이 날짜 기준 공개된 사업보고서 없음';
    }
  };
}

/* ═════════ 장면 2: DuPont 직사각형 (가로 ATO × 세로 PM = 넓이 OpROA) ═════════ */
function dupontPoints(code) { const seen = new Map(); D.dates.forEach(d => { const x = snap(code, d)?.d; if (x?.PM_pct != null && x.ATO != null && !seen.has(x.period)) seen.set(x.period, { ...x, date: d }); }); return [...seen.values()]; }
function sceneD(host) {
  const pts = dupontPoints(S.stock), W = 760, H = 420, L = 56, R = 24, T = 24, B = 46, bd = snap(S.stock, S.buy)?.d;
  if (!pts.length) { host.innerHTML = '<div class="empty">이 종목은 분기 TTM 자료가 없다.</div>'; return { set() { } }; }
  const pm = [...pts.map(p => p.PM_pct), ...pts.map(p => p.ind_PM_median), 0], at = [...pts.map(p => p.ATO), ...pts.map(p => p.ind_ATO_median)];
  let ymin = Math.min(...pm), ymax = Math.max(...pm); const yp = (ymax - ymin) * .14 + 1; ymin -= yp; ymax += yp; const xmax = Math.max(...at) * 1.18;
  const X = a => L + a / xmax * (W - L - R), Y = p => T + (1 - (p - ymin) / (ymax - ymin)) * (H - T - B);
  const iso = [2, 5, 10, 20].map(k => { let d = ''; for (let a = Math.max(.04, k / ymax); a <= xmax; a += xmax / 90) { const p = k / a; if (p > ymax) continue; d += (d ? 'L' : 'M') + X(a).toFixed(1) + ' ' + Y(p).toFixed(1); } return d ? `<path d="${d}" fill="none" stroke="var(--line)" stroke-dasharray="5 6"/>` : ''; }).join('');
  const yt = []; const ys = niceStep((ymax - ymin) / 5); for (let p = Math.ceil(ymin / ys) * ys; p <= ymax; p += ys) yt.push(p); const xt = []; for (let a = 0; a <= xmax; a += niceStep(xmax / 5)) xt.push(a);
  host.innerHTML = `<div class="sd"><div class="sd-plot"><svg viewBox="0 0 ${W} ${H}">
    ${yt.map(p => `<line class="grid-l" x1="${L}" x2="${W - R}" y1="${Y(p)}" y2="${Y(p)}" ${Math.abs(p) < 1e-9 ? 'stroke="var(--ink)"' : ''}/><text class="ax" x="${L - 8}" y="${Y(p) + 4}" text-anchor="end">${p.toFixed(0)}%</text>`).join('')}${xt.map(a => `<text class="ax" x="${X(a)}" y="${H - 22}" text-anchor="middle">${a.toFixed(1)}</text>`).join('')}
    <text class="ax" x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">ATO 자산회전율</text><text class="ax" x="${L}" y="14">PM 영업이익률</text>${iso}
    <line class="mx" y1="${T}" y2="${H - B}" stroke="var(--violet)" stroke-dasharray="3 5" opacity=".7"/><line class="my" x1="${L}" x2="${W - R}" stroke="var(--violet)" stroke-dasharray="3 5" opacity=".7"/>
    <path class="traj" fill="none" stroke="#C3CCDA" stroke-width="1.6"/>
    <rect class="gb" fill="none" stroke="var(--ink)" stroke-width="2" stroke-dasharray="6 5"/><rect class="rc" rx="3"/>
    <g class="dots">${pts.map(p => `<circle class="dp" data-date="${p.date}" cx="${X(p.ATO)}" cy="${Y(p.PM_pct)}" r="4.5" fill="#fff" stroke="#9FB0C9" stroke-width="2" data-tip="${p.period} · PM ${p.PM_pct.toFixed(1)}% × ATO ${p.ATO.toFixed(2)}"/>`).join('')}</g>
    <circle class="pt" r="9" stroke="#fff" stroke-width="3"/><text class="lt" font-size="14" font-weight="800" text-anchor="middle"></text></svg></div>
    <div class="sd-read"><div class="rd"><small>PM</small><b class="r-pm">–</b></div><div class="rd x">×</div><div class="rd"><small>ATO</small><b class="r-at">–</b></div><div class="rd x">=</div><div class="rd big"><small>OpROA</small><b class="r-op">–</b></div></div>
    <div class="legend"><span><i style="border:2px dashed var(--ink);background:none"></i>산 날 (${bd?.period || '–'})</span><span><i style="background:var(--blue)"></i>그날의 PM × ATO (넓이)</span><span><i style="background:var(--violet)"></i>비교집단 중위수</span></div><div class="src small" id="dsrc"></div></div>`;
  $('.traj', host).setAttribute('d', pts.map((p, i) => (i ? 'L' : 'M') + X(p.ATO) + ' ' + Y(p.PM_pct)).join(''));
  const gb = $('.gb', host); if (bd?.PM_pct != null) { const h = Math.abs(bd.PM_pct) * 0 + Math.abs(Y(0) - Y(bd.PM_pct)); gb.setAttribute('x', X(0)); gb.setAttribute('width', X(bd.ATO) - X(0)); gb.setAttribute('y', Math.min(Y(0), Y(bd.PM_pct))); gb.setAttribute('height', h); } else gb.style.display = 'none';
  const st = { ato: 0, pm: 0, mato: 0, mpm: 0, a: 0 }, ctx = { ok: false }, rc = $('.rc', host), pt = $('.pt', host), lt = $('.lt', host), oPM = odo($('.r-pm', host)), oAT = odo($('.r-at', host)), oOP = odo($('.r-op', host));
  const R_ = s => { const y0 = Y(0), y1 = Y(s.pm); rc.setAttribute('x', X(0)); rc.setAttribute('width', Math.max(0, X(s.ato) - X(0))); rc.setAttribute('y', Math.min(y0, y1)); rc.setAttribute('height', Math.abs(y1 - y0)); const col = s.pm >= 0 ? 'var(--blue)' : 'var(--red)'; rc.setAttribute('fill', col); rc.setAttribute('fill-opacity', '.78'); pt.setAttribute('cx', X(s.ato)); pt.setAttribute('cy', Y(s.pm)); pt.setAttribute('fill', col); lt.setAttribute('x', X(s.ato)); lt.setAttribute('y', Y(s.pm) - 16); lt.setAttribute('fill', col);
    $('.mx', host).setAttribute('x1', X(s.mato)); $('.mx', host).setAttribute('x2', X(s.mato)); $('.my', host).setAttribute('y1', Y(s.mpm)); $('.my', host).setAttribute('y2', Y(s.mpm));
    };
  return {
    set(date) {
      const d = snap(S.stock, date)?.d, ok = d?.PM_pct != null; $$('.dp', host).forEach(c => c.style.opacity = c.dataset.date <= date ? 1 : .18);
      rc.style.opacity = pt.style.opacity = lt.style.opacity = ok ? 1 : 0; if (!ok) { $('#dsrc', host).textContent = '이 날짜 기준 공개된 분기 자료 없음'; return; }
      lt.textContent = d.period; oPM.set(d.PM_pct.toFixed(1) + '%'); oAT.set(d.ATO.toFixed(2)); oOP.set((d.PM_pct * d.ATO).toFixed(1) + '%'); $('.r-op', host).className = 'r-op ' + (d.PM_pct * d.ATO < 0 ? 'hl-r' : 'hl-b'); animTo(st, { ato: d.ATO, pm: d.PM_pct, mato: d.ind_ATO_median, mpm: d.ind_PM_median }, 800, R_);
      $('#dsrc', host).innerHTML = `${d.period} TTM · ${d.available_date} 공개 ${rcept(d.rcept_no)}${d.peer_fallback ? ' · 비교집단: 전체 표본 중위수(임시)' : ''}`;
    }
  };
}

/* ═════════ 장면 3: Ohlson 탱크 (장부 위에 얹힌 웃돈) + ω 바늘 ═════════ */
function sceneO(host) {
  const vals = D.dates.map(d => snap(S.stock, d)?.o).filter(o => o?.MKTCAP != null); const W = 760, H = 400;
  if (!vals.length) { host.innerHTML = '<div class="empty">이 종목은 Ohlson 입력이 없다.</div>'; return { set() { } }; }
  const mx = Math.max(...vals.map(o => Math.max(o.MKTCAP, o.BV))) * 1.12, ri = Math.max(...vals.map(o => Math.abs(o.RI))) * 1.1 || 1;
  const bY = 330, th = 270, Yv = v => bY - clamp(v, 0, mx) / mx * th;
  host.innerHTML = `<div class="so"><svg viewBox="0 0 ${W} ${H}"><line x1="30" x2="${W - 30}" y1="${bY}" y2="${bY}" stroke="var(--line2)"/>
    <rect x="70" y="${bY - th}" width="110" height="${th}" rx="8" fill="var(--bg2)"/><rect class="bv" x="70" width="110" rx="8" fill="var(--blue)"/><text x="125" y="${bY + 26}" text-anchor="middle" class="ax">장부자본</text><text class="bvt" x="125" font-size="15" font-weight="800" text-anchor="middle" fill="#fff"></text>
    <rect x="230" y="${bY - th}" width="110" height="${th}" rx="8" fill="var(--bg2)"/><rect class="pm" x="230" width="110" fill="var(--violet)" opacity=".85"/><rect class="pd" x="230" width="110" fill="var(--red-s)" stroke="var(--red)" stroke-dasharray="4 4"/><rect class="mc" x="230" width="110" fill="none" stroke="var(--ink)" stroke-width="3" rx="4"/><text x="285" y="${bY + 26}" text-anchor="middle" class="ax">시가총액</text><text class="pmt" x="285" font-size="14" font-weight="800" text-anchor="middle" fill="#fff"></text>
    <g transform="translate(560 230)"><path class="ga" fill="none" stroke="var(--bg3)" stroke-width="18" stroke-linecap="round"/><path class="gg" fill="none" stroke="var(--green-s)" stroke-width="18"/><line class="nd" stroke-width="5" stroke-linecap="round"/><circle r="8" fill="var(--ink)"/><text x="-120" y="22" class="ax" text-anchor="middle">0</text><text x="120" y="22" class="ax" text-anchor="middle">1</text><text class="ot" y="64" text-anchor="middle" font-size="34" font-weight="800">–</text><text y="88" text-anchor="middle" class="ax">ω</text></g>
    <g transform="translate(450 352)"><text x="0" y="-8" class="ax">초과이익 RI</text><line x1="0" x2="220" y1="12" y2="12" stroke="var(--line2)"/><rect class="rib" y="2" height="20" rx="4"/><text class="rit" x="110" y="42" text-anchor="middle" class="ax" font-size="13" font-weight="700"></text></g></svg><div class="legend"><span><i style="background:var(--blue)"></i>장부자본</span><span><i style="background:var(--violet)"></i>웃돈(시총−장부)</span><span><i style="background:var(--red-s);border:1px dashed var(--red)"></i>장부보다 낮은 시총</span></div><div class="src small" id="osrc"></div></div>`;
  const ang = v => (clamp(v, -.5, 1.5) + .5) / 2 * Math.PI - Math.PI / 2, ar = (a0, a1) => { const r = 120, p = a => [r * Math.sin(a), -r * Math.cos(a)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}`; };
  $('.ga', host).setAttribute('d', ar(ang(-.5), ang(1.5))); $('.gg', host).setAttribute('d', ar(ang(0), ang(1)));
  const st = { bv: 0, mc: 0, om: 0, ri: 0 }, ctx = { ok: false, held: false };
  const R_ = s => { const bv = $('.bv', host); bv.setAttribute('y', Yv(s.bv)); bv.setAttribute('height', bY - Yv(s.bv)); const t = $('.bvt', host); t.setAttribute('x', 125); t.setAttribute('y', Math.min(bY - 10, Yv(s.bv) + 24)); t.textContent = ctx.ok ? won(ctx.bv) : '';
    const pm = $('.pm', host), pd = $('.pd', host), mc = $('.mc', host), top = Yv(s.mc), btm = Yv(s.bv);
    if (s.mc >= s.bv) { pm.setAttribute('y', top); pm.setAttribute('height', Math.max(0, btm - top)); pd.setAttribute('height', 0); } else { pm.setAttribute('height', 0); pd.setAttribute('y', btm); pd.setAttribute('height', top - btm); pd.setAttribute('y', Math.min(top, btm)); pd.setAttribute('height', Math.abs(top - btm)); }
    mc.setAttribute('y', top); mc.setAttribute('height', bY - top); const pt = $('.pmt', host); pt.setAttribute('x', 285); pt.setAttribute('y', Math.max(top - 10, 20)); pt.setAttribute('fill', 'var(--ink)'); pt.textContent = ctx.ok ? '시총 ' + won(ctx.mc) : '';
    const nd = $('.nd', host), a = ang(s.om); nd.setAttribute('x1', 0); nd.setAttribute('y1', 0); nd.setAttribute('x2', 100 * Math.sin(a)); nd.setAttribute('y2', -100 * Math.cos(a)); nd.setAttribute('stroke', ctx.held ? 'var(--violet)' : 'var(--blue)'); nd.style.opacity = ctx.ok ? 1 : 0; $('.ot', host).textContent = ctx.ok ? s.om.toFixed(2) : '–'; $('.ot', host).setAttribute('fill', ctx.held ? 'var(--violet)' : 'var(--ink)');
    const rb = $('.rib', host), w = Math.abs(s.ri) / ri * 110; rb.setAttribute('x', s.ri >= 0 ? 110 : 110 - w); rb.setAttribute('width', w); rb.setAttribute('fill', s.ri >= 0 ? 'var(--green)' : 'var(--red)'); $('.rit', host).textContent = ctx.ok ? won(ctx.ri) + (ctx.held ? ' · 해석 유보' : '') : ''; };
  return {
    set(date) {
      const o = snap(S.stock, date)?.o; ctx.ok = o?.MKTCAP != null; if (!ctx.ok) { $('#osrc', host).textContent = '이 날짜 기준 Ohlson 입력 없음'; animTo(st, { bv: 0, mc: 0, om: 0, ri: 0 }, 500, R_); return; }
      ctx.held = !!o.unstable; ctx.bv = o.BV; ctx.mc = o.MKTCAP; ctx.ri = o.RI; animTo(st, { bv: o.BV, mc: o.MKTCAP, om: o.omega ?? 0, ri: o.RI }, 850, R_);
      $('#osrc', host).innerHTML = `FY${o.bsns_year} 사업보고서 + ${o.mktcap_date} 시가총액 ${rcept(o.rcept_no)}`;
    }
  };
}

/* ═════════ 장면 4: 가격 탐지 재생 (CUSUM 통이 차오르고 경보가 울린다) ═════════ */
function zSeries(code) {
  const P = D.prices[code], c = P.c, m = P.m, n = c.length, r = [0]; for (let i = 1; i < n; i++) { const dc = c[i] / c[i - 1] - 1, dm = m[i - 1] ? m[i] / m[i - 1] - 1 : 0; r.push(Math.abs(dc) > .35 && Math.abs(dm) < Math.abs(dc) * .4 ? 0 : Math.log(c[i] / c[i - 1])); }
  const z = new Array(n).fill(null); for (let i = 180; i < n; i++) { const a = Math.max(1, i - 252), seg = r.slice(a, i), mu = seg.reduce((s, x) => s + x, 0) / seg.length, sd = Math.sqrt(seg.reduce((s, x) => s + (x - mu) ** 2, 0) / (seg.length - 1)); z[i] = sd > 0 ? (r[i] - mu) / sd : 0; }
  return { r, z };
}
const DET = { mode: 'slow', k: .25, h: 5, th: 3 };
function sceneP(host) {
  const code = S.stock, P = D.prices[code], { r, z } = zSeries(code), n = P.c.length, W = 1000, H = 440, L = 20, Rr = 150, T = 16, mid = 250, B = 30;
  const xs = P.d.map(numDay), x0 = xs[0], x1 = xs[n - 1], X = i => L + (xs[i] - x0) / (x1 - x0) * (W - L - Rr);
  const lo = Math.min(...P.c) * .95, hi = Math.max(...P.c) * 1.05, Yp = v => T + (1 - (v - lo) / (hi - lo)) * (mid - T - 30);
  const C = new Array(n).fill(null), alarms = []; let c = 0; for (let i = 0; i < n; i++) { if (z[i] == null) continue; c = Math.max(0, c - z[i] - DET.k); if (c > DET.h) { alarms.push(i); C[i] = c; c = 0; } else C[i] = c; }
  const crashes = []; z.forEach((v, i) => { if (v != null && v <= -DET.th) crashes.push(i); });
  const cmax = Math.max(DET.h * 1.3, ...C.filter(v => v != null)), Yc = v => mid + 30 + (1 - v / cmax) * (H - B - mid - 30);
  const line = (arr, Y, upTo) => { let d = '', pen = false; for (let i = 0; i <= upTo; i++) { const v = arr[i]; if (v == null) { pen = false; continue; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; } return d; };
  const marks = DET.mode === 'slow' ? alarms : crashes, jmp = priceJumps(code);
  host.innerHTML = `<div class="sp"><div class="seg2"><button class="pill" data-mode="slow" aria-pressed="${DET.mode === 'slow'}">서서히 하락 · CUSUM</button></div>
    <div class="sp-main"><svg viewBox="0 0 ${W} ${H}"><path d="${line(P.c, Yp, n - 1)}" fill="none" stroke="#E1E6EE" stroke-width="2"/><path class="pp" fill="none" stroke="var(--ink)" stroke-width="2.4"/><g class="al"></g>
      ${DET.mode === 'slow' ? `<line x1="${L}" x2="${W - Rr}" y1="${Yc(DET.h)}" y2="${Yc(DET.h)}" stroke="var(--red)" stroke-dasharray="6 5"/><text class="ax" x="${W - Rr - 4}" y="${Yc(DET.h) - 6}" text-anchor="end" fill="var(--red)">h = ${DET.h}</text><path class="cp" fill="none" stroke="var(--blue)" stroke-width="2.4"/>` : `<line x1="${L}" x2="${W - Rr}" y1="${Yc(DET.th * cmax / 8)}" y2="${Yc(DET.th * cmax / 8)}" stroke="var(--red)" stroke-dasharray="6 5"/><text class="ax" x="${W - Rr - 4}" y="${Yc(DET.th * cmax / 8) - 6}" text-anchor="end" fill="var(--red)">−θ = −${DET.th}</text><path class="cp" fill="none" stroke="var(--blue)" stroke-width="1.6"/>`}
      <line class="ph" y1="${T}" y2="${H - B}" stroke="var(--ink)" stroke-dasharray="3 4" opacity=".5"/>
      <g transform="translate(${W - 100} ${mid + 30})"><rect x="0" y="0" width="64" height="${H - B - mid - 30}" rx="10" fill="var(--bg2)"/><rect class="bk" x="0" width="64" rx="10"/><text x="32" y="-10" text-anchor="middle" class="ax">${DET.mode === 'slow' ? 'C⁻' : '하락 z'}</text></g></svg>
      <div class="sp-hud"><div><small>경보</small><b class="al-n">0</b></div><div><small>날짜</small><b class="mono al-d">–</b></div></div></div>
    <div class="sp-ctl"><button class="play" type="button" aria-label="재생">▶</button><input type="range" min="0" max="${n - 1}" value="0" aria-label="재생 위치">
      ${DET.mode === 'slow' ? `<label class="fld">k<input type="range" id="dk" min="0" max="1" step=".05" value="${DET.k}"><b class="mono">${DET.k.toFixed(2)}</b></label><label class="fld">h<input type="range" id="dh" min="2" max="10" step=".5" value="${DET.h}"><b class="mono">${DET.h}</b></label>` : `<label class="fld">θ<input type="range" id="dth" min="2" max="5" step=".5" value="${DET.th}"><b class="mono">${DET.th}</b></label>`}</div>
    <div class="note-line"><span class="chip amber">시연</span>시장·업종 조정 없이 이 종목 수익률만 쓴 단순 버전. 경보는 가치 훼손 판정이 아니다.${jmp.length ? ' 가격 단위 변경일은 제외했다.' : ''}</div></div>`;
  const rng = $('.sp-ctl input[type=range]', host), btn = $('.play', host), pp = $('.pp', host), cp = $('.cp', host), ph = $('.ph', host), g = $('.al', host), bk = $('.bk', host), bh = H - B - mid - 30; let idx = n - 1, timer = null;
  const draw = i => {
    idx = i; rng.value = i; pp.setAttribute('d', line(P.c, Yp, i)); const arr = DET.mode === 'slow' ? C : z.map(v => v == null ? null : Math.max(0, -v) * (cmax / 8)); cp.setAttribute('d', line(arr, Yc, i)); ph.setAttribute('x1', X(i)); ph.setAttribute('x2', X(i));
    const ms = marks.filter(m => m <= i); g.innerHTML = ms.map(m => `<line x1="${X(m)}" x2="${X(m)}" y1="${T}" y2="${mid - 8}" stroke="var(--red)" stroke-width="2" opacity=".8"/><circle cx="${X(m)}" cy="${Yp(P.c[m])}" r="5" fill="var(--red)" stroke="#fff" stroke-width="2"/>`).join('');
    const cur = arr[i] ?? 0, h = clamp(cur / cmax, 0, 1) * bh; bk.setAttribute('y', bh - h); bk.setAttribute('height', h); bk.setAttribute('fill', cur / (DET.mode === 'slow' ? DET.h : DET.th * cmax / 8 * 1) > 0.999 ? 'var(--red)' : 'var(--blue)');
    $('.al-n', host).textContent = ms.length; $('.al-d', host).textContent = numLabel(P.d[i]);
  };
  const stop = () => { clearInterval(timer); timer = null; btn.textContent = '▶'; };
  btn.onclick = () => { if (timer) { stop(); return; } if (idx >= n - 1) draw(0); btn.textContent = '❚❚'; timer = setInterval(() => { if (idx >= n - 1) { stop(); return; } draw(Math.min(n - 1, idx + 7)); }, 24); };
  rng.oninput = () => { stop(); draw(+rng.value); }; draw(n - 1);
  $$('[data-mode]', host).forEach(b => b.onclick = () => { stop(); DET.mode = b.dataset.mode; sceneP(host); });
  const bind = (id, k) => { const e = $('#' + id, host); if (e) e.oninput = () => { DET[k] = parseFloat(e.value); const keep = idx; sceneP(host); const r2 = $('.sp-ctl input[type=range]', host); r2.value = keep; r2.dispatchEvent(new Event('input')); }; }; bind('dk', 'k'); bind('dh', 'h'); bind('dth', 'th');
  return { set() { } };
}

/* ═════════ 장면 5: 반박 모델 구조 (설계) ═════════ */
function sceneR(host) {
  host.innerHTML = `<div class="sr"><svg viewBox="0 0 760 380">
    <g class="ed"><path d="M380 110 L190 200"/><path d="M380 110 L570 200"/><path d="M190 238 L380 300"/><path d="M570 238 L380 300"/></g>
    <g class="nd0" data-tip="사용자가 내린 결론"><rect x="270" y="60" width="220" height="56" rx="14" fill="var(--blue)"/><text x="380" y="85" text-anchor="middle" fill="#fff" font-size="12" font-weight="700" opacity=".8">주장</text><text x="380" y="104" text-anchor="middle" fill="#fff" font-size="16" font-weight="800">장기 보유가 타당하다</text></g>
    <g class="nd1" data-tip="사용자가 드는 사실. 공시와 맞는지 검증한다"><rect x="60" y="190" width="260" height="56" rx="14" fill="var(--green-s)" stroke="var(--green)" stroke-width="2"/><text x="190" y="214" text-anchor="middle" fill="var(--green)" font-size="12" font-weight="700">근거</text><text x="190" y="233" text-anchor="middle" font-size="15" font-weight="800">해외 성장성이 높다</text></g>
    <g class="nd2" data-tip="말하지 않았지만 결론에 필요한 숨은 가정"><rect x="440" y="190" width="260" height="56" rx="14" fill="var(--violet-s)" stroke="var(--violet)" stroke-width="2"/><text x="570" y="214" text-anchor="middle" fill="var(--violet)" font-size="12" font-weight="700">전제</text><text x="570" y="233" text-anchor="middle" font-size="15" font-weight="800">성장이 유지된다</text></g>
    <g class="nd3" data-tip="공시를 검색해 근거와 전제를 판정한다"><rect x="250" y="290" width="260" height="56" rx="14" fill="var(--amber-s)" stroke="var(--amber)" stroke-width="2"/><text x="380" y="314" text-anchor="middle" fill="var(--amber)" font-size="12" font-weight="700">공시 검색 (RAG)</text><text class="vr" x="380" y="333" text-anchor="middle" font-size="15" font-weight="800">지지</text></g></svg>
    <div class="note-line"><span class="chip">설계 단계</span>구현 전. 보유 이유를 주장·근거·전제로 나누고 공시로 확인하는 구조.</div></div>`;
  const vs = ['지지', '반박', '전제 약화', '근거 부족 · 유보']; let k = 0; const vr = $('.vr', host); const t = setInterval(() => { if (!document.body.contains(host)) { clearInterval(t); return; } k = (k + 1) % vs.length; vr.textContent = vs[k]; }, 1600);
  return { set() { } };
}

/* ═════════ 점수 막대(0~3)와 판정 ═════════ */
function meterHTML(score, d0 = 0) { return `<div class="meter">${[0, 1, 2].map(i => `<i class="${score != null && score > i ? 'on' + score : ''}" style="--d:${d0 + i * .15}s"></i>`).join('')}</div>`; }
function scoreVis(host) {
  const g = gridOf(); if (!g) { host.innerHTML = '<div class="empty">이 조합은 계산되지 않았다.</div>'; return; }
  const vc = verdictClass(g.verdict);
  host.innerHTML = `<div class="rv"><div class="three">
    <div class="mini"><h5>F-Score</h5><div class="v">${g.F_buy}<small> → </small>${g.F_now}</div>${meterHTML(g.score_F)}<p class="small">${g.score_F}점</p></div>
    <div class="mini"><h5>DuPont</h5><div class="v">${g.dPM_adj_pp == null ? '–' : sgn(g.dPM_adj_pp, 1, '%p')}</div>${meterHTML(g.score_DP)}<p class="small">${g.score_DP == null ? '자료 없음' : g.score_DP + '점'}</p></div>
    <div class="mini"><h5>Ohlson ${g.OH_held ? '<span class="chip violet">유보</span>' : ''}</h5><div class="v">${g.d_Q == null ? '–' : sgn(g.d_Q, 3)}<small> ΔQ</small></div>${meterHTML(g.score_OH)}<p class="small">${g.OH_held ? '합계 제외' : (g.score_OH ?? '–') + '점'}</p></div></div>
    <div class="verdict ${vc}" style="margin-top:18px"><div><small>합계 ${g.total_score}점</small><b>${verdictText[vc]}</b></div></div></div>`;
  observe(host);
}

/* ═════════ 드라이브 링크·파일 서랍 ═════════ */
function driveLink(path) { const lk = D.links || {}, ps = lk.paths || {}; let best = null; for (const k of Object.keys(ps)) if ((path === k || path.startsWith(k + '/')) && (!best || k.length > best.length)) best = k; return best ? { url: ps[best], exact: best === path } : { url: lk.root || '', exact: false }; }
async function copyText(t, btn) { try { await navigator.clipboard.writeText(t); } catch (e) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (_) { } a.remove(); } if (btn) { const o = btn.textContent; btn.textContent = '복사됨'; setTimeout(() => btn.textContent = o, 1300); } }
const iconOf = f => f.kind === 'dir' ? '<svg class="ico" viewBox="0 0 16 16" fill="none"><path d="M1.5 4.5a1 1 0 0 1 1-1h3.2l1.5 1.7h6.3a1 1 0 0 1 1 1v6.3a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="#CFE0FF" stroke="#1B64F2" stroke-width="1.2"/></svg>' : '<svg class="ico" viewBox="0 0 16 16" fill="none"><path d="M3.5 1.5h6l3 3v9a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z" fill="#fff" stroke="#697589" stroke-width="1.2"/><path d="M9.5 1.5v3h3" stroke="#697589" stroke-width="1.2"/></svg>';
const fileByPath = p => D.files.find(f => f.path === p);
const inheritText = d => { const p = fileByPath(d.inherit)?.desc; return p ? `“${p.title}” 폴더 안의 항목. ${p.text}` : ''; };
function tableHTML(card, n = 5) { return `<div class="tbl"><table><thead><tr>${card.cols.map(c => `<th>${esc(c.en)}<small>${esc(c.ko)}</small></th>`).join('')}</tr></thead><tbody>${card.preview.slice(0, n).map(r => `<tr>${r.map(v => `<td>${esc(v.length > 26 ? v.slice(0, 24) + '…' : v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
function openFile(path) {
  const f = fileByPath(path); if (!f) return; const desc = f.desc, dl = driveLink(path), card = D.tables.find(t => path.endsWith('/' + t.file) && path.includes('개발자전달')), parent = path.split('/').slice(0, -1).join('/');
  $('#filerBody').innerHTML = `<div style="padding:10px 4px 0"><span class="chip ${f.kind === 'dir' ? 'blue' : ''}">${f.kind === 'dir' ? '폴더' : (f.ext || '파일').toUpperCase()}</span>
    <h3 class="h-md" style="margin-top:12px">${esc(desc?.title || path.split('/').pop())}</h3><p style="margin-top:8px;color:var(--ink2)">${esc(desc?.text || (desc ? inheritText(desc) : ''))}</p>
    <dl class="kv"><dt>경로</dt><dd class="mono" style="font-size:12.5px">${esc(path)}</dd><dt>크기</dt><dd>${fsize(f.size)}${f.kind === 'dir' ? ` · 파일 ${nf.format(f.files)}개` : ''}</dd><dt>수정일</dt><dd>${f.mtime}${f.new ? ' <span class="new">NEW</span>' : ''}</dd></dl>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:22px">${dl.url ? `<a class="btn sm" href="${esc(dl.url)}" target="_blank" rel="noopener">${dl.exact ? 'Drive에서 열기' : 'Drive 루트 열기'}</a>` : ''}<button class="btn line sm" data-copy="${esc(path)}" type="button">경로 복사</button>${parent ? `<button class="btn ghost sm" data-open="${esc(parent)}" type="button">상위 폴더</button>` : ''}</div>
    ${card ? `<h4 style="margin-top:28px;font-size:15px">${nf.format(card.rows)}행 · 컬럼 ${card.cols.length}개</h4><div style="margin-top:10px">${tableHTML(card)}</div>` : ''}</div>`;
  const w = $('#filer'); w.hidden = false; $('#filerBody').scrollTop = 0;
}

/* ═════════ 찾아보기 ═════════ */
let KB = [];
function buildKB(extra) { KB = [...extra]; D.files.forEach(f => { if (f.desc?.title || f.kind === 'file') KB.push({ type: '파일', title: f.desc?.title || f.path.split('/').pop(), body: (f.desc?.text || '') + ' ' + f.path, tags: f.path, go: () => openFile(f.path) }); }); D.stocks.forEach(s => KB.push({ type: '종목', title: `${s.name} ${s.code}`, body: `${s.industry} · ${s.fs === 'CFS' ? '연결' : '별도'}재무제표`, tags: s.latest, go: () => { S.stock = s.code; saveS(); location.hash = '#/case'; } })); }
function search(q) { const ws = q.toLowerCase().split(/\s+/).filter(Boolean); if (!ws.length) return []; return KB.map(k => { const t = (k.title || '').toLowerCase(), b = (k.body || '').toLowerCase(), g = (k.tags || '').toLowerCase(); let s = 0; for (const w of ws) { if (t.includes(w)) s += 5; if (g.includes(w)) s += 3; if (b.includes(w)) s += 1; } return { k, s }; }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 12); }
const hlt = (s, ws) => { let o = esc(s); ws.forEach(w => { if (w.length) o = o.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); }); return o; };
function openFinder(q = '') { const w = $('#finder'); w.hidden = false; const i = $('#findInput'); i.value = q; renderFind(); setTimeout(() => i.focus(), 30); }
function renderFind() {
  const q = $('#findInput').value.trim(), out = $('#findOut');
  if (!q) { out.innerHTML = `<div class="sugg">${['ω', 'TTM', 'F-Score', '결측', 'PIT', '유보', '접수번호', '업종 중위수', 'CUSUM'].map(x => `<button type="button" data-q="${x}">${x}</button>`).join('')}</div>`; return; }
  const ws = q.toLowerCase().split(/\s+/), res = search(q);
  out.innerHTML = res.length ? res.map((r, i) => `<button class="hit" type="button" data-i="${i}"><b><span class="chip ${r.k.type === '파일' ? '' : r.k.type === '종목' ? 'green' : 'blue'}">${r.k.type}</span>${hlt(r.k.title, ws)}</b><p>${hlt((r.k.body || '').slice(0, 140), ws)}</p></button>`).join('') : `<div class="empty">결과 없음</div>`;
  $$('.hit', out).forEach(b => b.onclick = () => { const r = res[+b.dataset.i]; $('#finder').hidden = true; r.k.go(); });
}
document.addEventListener('click', e => { const t = e.target; if (t.closest('[data-close]')) { const w = t.closest('.drawer-wrap'); if (w) w.hidden = true; } const q = t.closest('[data-q]'); if (q) { $('#findInput').value = q.dataset.q; renderFind(); } const c = t.closest('[data-copy]'); if (c) copyText(c.dataset.copy, c); const o = t.closest('[data-open]'); if (o) openFile(o.dataset.open); const f = t.closest('[data-file]'); if (f) openFile(f.dataset.file); const fd = t.closest('[data-find]'); if (fd) openFinder(fd.dataset.find); });
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openFinder(); } if (e.key === 'Escape') $$('.drawer-wrap').forEach(w => w.hidden = true); });
document.addEventListener('input', e => { if (e.target.id === 'findInput') renderFind(); });

/* ═════════ 차트 위 주석: 사업보고서가 공개된 날과 그때의 F-Score ═════════ */
function annotations(code) {
  const seen = new Map();
  D.dates.forEach(d => { const f = snap(code, d)?.f; if (f?.rcept_no && f.score != null && !seen.has(f.rcept_no)) seen.set(f.rcept_no, { date: f.disclosed, fy: f.year, score: f.score, rc: f.rcept_no }); });
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
}
function annoSvg(code, X, Y, T, xmin, xmax) {
  const P = D.prices[code], first = numLabel(P.d[0]).replace(/\./g, '-'), last = numLabel(P.d[P.d.length - 1]).replace(/\./g, '-');
  return annotations(code).filter(a => a.date >= first && a.date <= last).map((a, k) => {
    const i = idxAt(code, a.date), x = clamp(X(i), xmin + 34, xmax - 34), y = Y(P.c[i]), ty = T + 12 + (k % 2) * 22;
    return `<g class="an" data-tip="FY${a.fy} 사업보고서 공개 ${a.date} · F-Score ${a.score}"><line x1="${x}" x2="${x}" y1="${ty + 10}" y2="${y}" stroke="var(--line2)" stroke-dasharray="2 3"/><circle cx="${x}" cy="${y}" r="4.5" fill="#fff" stroke="var(--ink)" stroke-width="2"/><rect x="${x - 33}" y="${ty - 10}" width="66" height="20" rx="10" fill="#fff" stroke="var(--line2)"/><text x="${x}" y="${ty + 4}" text-anchor="middle" font-size="11.5" font-weight="800" fill="var(--ink)">FY${String(a.fy).slice(2)} · F ${a.score}</text></g>`;
  }).join('');
}

/* ═════════ 11종목 호라이즌: 한 줄 = 산 날 대비 수익률, 진할수록 큰 변동 ═════════ */
const ADJ = {};
/* 가격 단위 변경(액면분할·병합)일은 시가총액 변화율로 대신해 이어 붙인 누적 지수 */
function adjSeries(code) {
  if (ADJ[code]) return ADJ[code]; const P = D.prices[code], j = new Set(priceJumps(code)), a = [1];
  for (let i = 1; i < P.c.length; i++) { let f = P.c[i] / P.c[i - 1]; if (j.has(i)) f = P.m[i - 1] ? P.m[i] / P.m[i - 1] : 1; a.push(a[i - 1] * f); }
  return (ADJ[code] = a);
}
function horizonVis(host, onPick) {
  const BAND = .4;
  const draw = () => {
    const W = 1000, rowH = 46, L = 176, R = 150, T = 8, plotW = W - L - R;
    const rows = D.stocks.map(s => { const P = D.prices[s.code], A = adjSeries(s.code), bi = idxAt(s.code, S.buy), ni = idxAt(s.code, S.now); return { s, P, A, bi, ni, g: D.grid[s.code]?.[`${S.buy}|${S.now}`], ret: A[ni] / A[bi] - 1 }; }).sort((a, b) => a.ret - b.ret);
    const d0 = Date.parse(S.buy) / 864e5, d1 = Date.parse(S.now) / 864e5, X = d => L + (d - d0) / (d1 - d0) * plotW, H = T + rows.length * rowH + 28;
    const vcol = { Yes: 'var(--red)', watch: '#E8A23B', No: 'var(--green)', hold: '#9AA7BA' };
    const layer = (r, k, sign, y0, h) => { let d = '', xl = 0; for (let i = r.bi; i <= r.ni; i += 3) { const v = r.A[i] / r.A[r.bi] - 1, a = clamp((sign > 0 ? Math.max(v, 0) : Math.max(-v, 0)) - k * BAND, 0, BAND) / BAND * h, x = X(numDay(r.P.d[i])); d += (d ? 'L' : 'M') + x.toFixed(1) + ' ' + (y0 - a).toFixed(1); xl = x; } return d ? d + `L${xl.toFixed(1)} ${y0}L${X(numDay(r.P.d[r.bi]))} ${y0}Z` : ''; };
    const yrs = []; for (let y = 2015; y <= 2019; y++) { const dd = Date.UTC(y, 0, 1) / 864e5; if (dd > d0 && dd < d1) yrs.push([y, X(dd)]); }
    host.innerHTML = `<div class="hz rv in"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="11종목 산 날 대비 수익률">
      ${yrs.map(([y, x]) => `<line x1="${x}" x2="${x}" y1="${T}" y2="${H - 24}" stroke="var(--line)" stroke-dasharray="2 5"/><text class="ax" x="${x + 5}" y="${H - 8}">${y}</text>`).join('')}
      ${rows.map((r, i) => { const top = T + i * rowH, y0 = top + rowH - 8, h = rowH - 14, vc = r.g ? verdictClass(r.g.verdict) : 'hold', sel = r.s.code === S.stock;
        return `<g class="hz-row" data-c="${r.s.code}" style="--i:${i}" tabindex="0" role="button" aria-label="${esc(r.s.name)} 선택"><rect x="0" y="${top}" width="${W}" height="${rowH}" rx="10" class="hz-bg" fill="${sel ? 'var(--blue-s)' : 'transparent'}"/>
        <circle cx="16" cy="${top + rowH / 2}" r="6" fill="${vcol[vc]}"/><text x="32" y="${top + rowH / 2 + 5}" font-size="15" font-weight="700" fill="var(--ink)">${esc(r.s.name)}</text>
        <g class="hz-d">${[0, 1, 2].map(k => `<path d="${layer(r, k, 1, y0, h)}" fill="var(--green)" opacity=".34"/><path d="${layer(r, k, -1, y0, h)}" fill="var(--red)" opacity=".34"/>`).join('')}</g><line x1="${L}" x2="${L + plotW}" y1="${y0}" y2="${y0}" stroke="var(--line2)"/>
        <text x="${L + plotW + 16}" y="${top + rowH / 2 + 6}" font-size="16" font-weight="800" fill="${r.ret < 0 ? 'var(--red)' : 'var(--green)'}" class="mono">${sgn(r.ret * 100, 0, '%')}</text>
        <text x="${W - 4}" y="${top + rowH / 2 + 5}" text-anchor="end" font-size="13" fill="var(--mute)" class="mono">${r.g ? `F ${r.g.F_buy}→${r.g.F_now}` : '–'}</text></g>`; }).join('')}</svg>
      <div class="legend"><span><i style="background:var(--green)"></i>산 날보다 위</span><span><i style="background:var(--red)"></i>아래</span><span>색이 겹칠수록 큰 변동 (한 겹 = ±40%, 3겹 = ±120%)</span><span>왼쪽 점 = 서서히 모델 판정</span><span>액면분할·병합일은 시가총액 변화율로 보정</span></div></div>`;
    $$('.hz-row', host).forEach(g => { const pick = () => onPick(g.dataset.c); g.onclick = pick; g.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }; });
  };
  draw(); return { update: draw };
}

/* ═════════ OpROA 폭포: 이익률 효과 + 회전 효과 + 상호작용 ═════════ */
function waterfallVis(host) {
  const sb = snap(S.stock, S.buy)?.d, sn = snap(S.stock, S.now)?.d;
  if (sb?.PM_pct == null || sn?.PM_pct == null) { host.innerHTML = '<div class="empty">이 조합은 분기 자료가 없어 분해하지 못한다.</div>'; return; }
  const ob = sb.PM_pct * sb.ATO, on = sn.PM_pct * sn.ATO, dp = sn.PM_pct - sb.PM_pct, da = sn.ATO - sb.ATO;
  const steps = [{ t: `산 날 ${sb.period}`, v: ob, total: true }, { t: 'PM 효과', sub: '이익률 변화', v: dp * sb.ATO }, { t: 'ATO 효과', sub: '회전 변화', v: sb.PM_pct * da }, { t: '상호작용', sub: 'ΔPM × ΔATO', v: dp * da }, { t: `지금 ${sn.period}`, v: on, total: true }];
  let cum = 0; const bars = steps.map(s => { if (s.total) { const b = { ...s, a: 0, b: s.v }; cum = s.v; return b; } const b = { ...s, a: cum, b: cum + s.v }; cum += s.v; return b; });
  const all = [0, ...bars.flatMap(b => [b.a, b.b])], mn = Math.min(...all), mx = Math.max(...all), pad = (mx - mn) * .18 + .5, lo = mn - pad, hi = mx + pad, W = 860, H = 380, L = 40, R = 20, T = 30, B = 70, bw = 96, gap = (W - L - R - bw * 5) / 4;
  const Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B), X = i => L + i * (bw + gap);
  host.innerHTML = `<div class="wf rv in"><svg viewBox="0 0 ${W} ${H}"><line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--ink)" stroke-width="1.5"/>
    ${bars.map((b, i) => { const top = Y(Math.max(b.a, b.b)), h = Math.max(2, Math.abs(Y(b.a) - Y(b.b))), col = b.total ? (b.v < 0 ? 'var(--red)' : 'var(--blue)') : (b.v >= 0 ? 'var(--green)' : 'var(--red)');
      const nx = bars[i + 1]; return `${nx ? `<line x1="${X(i) + bw}" x2="${X(i + 1)}" y1="${Y(b.b)}" y2="${Y(b.b)}" stroke="var(--line2)" stroke-dasharray="3 4"/>` : ''}<g class="wf-b" style="--i:${i}"><rect x="${X(i)}" y="${top}" width="${bw}" height="${h}" rx="8" fill="${col}"/></g>
      <text x="${X(i) + bw / 2}" y="${(b.b >= b.a ? top : top + h) + (b.b >= b.a ? -10 : 22)}" text-anchor="middle" font-size="16" font-weight="800" class="mono" fill="var(--ink)">${b.total ? b.v.toFixed(1) + '%' : sgn(b.v, 1, '%p')}</text>
      <text x="${X(i) + bw / 2}" y="${H - 38}" text-anchor="middle" font-size="14" font-weight="700" fill="var(--ink)">${esc(b.t)}</text>${b.sub ? `<text x="${X(i) + bw / 2}" y="${H - 18}" text-anchor="middle" class="ax">${esc(b.sub)}</text>` : ''}`; }).join('')}</svg></div>
    <div class="small">PM ${sb.PM_pct.toFixed(1)}% → ${sn.PM_pct.toFixed(1)}%, ATO ${sb.ATO.toFixed(2)} → ${sn.ATO.toFixed(2)}. 세 효과를 더하면 OpROA 변화와 같다.</div>`;
}

/* ═════════ 클릭으로 펼치는 숫자 추적 (DuPont 점수 → 원천 공시) ═════════ */
function lineageTree() {
  const sb = snap(S.stock, S.buy)?.d, sn = snap(S.stock, S.now)?.d, g = gridOf(), rows = D.dupont_rows?.[S.stock] || [];
  if (!sb || !sn || sn.PM_pct == null || sb.PM_pct == null || !g) return null;
  const find = d => rows.find(r => r.rc === d.rcept_no && `${r.y}Q${r.q}` === d.period);
  const side = (lab, d) => { const row = find(d); const qn = row ? (row.qs || '').split(',') : [], qs = qn.map(q => rows.find(r => `${r.y}Q${r.q}` === q));
    return { id: 'pmadj-' + lab, t: `PM_adj · ${lab}`, v: sgn(d.PM_adj, 1, '%p'), kids: [
      { id: 'pm-' + lab, t: 'PM = 영업이익 ÷ 매출', v: d.PM_pct.toFixed(1) + '%', kids: row ? [
        { id: 'op-' + lab, t: '영업이익 TTM', v: won(row.ot), kids: [{ id: 'q-' + lab, t: '네 분기의 합', v: d.period, quarters: qs.map((r, i) => ({ q: qn[i], v: r?.oq })), kids: [{ id: 'rc-' + lab, t: '원천 공시', rc: row.rc, v: d.available_date + ' 공개' }] }] },
        { id: 'rv-' + lab, t: '매출 TTM', v: won(row.rt) }] : [] },
      { id: 'med-' + lab, t: '업종 PM 중위수', v: d.ind_PM_median.toFixed(1) + '%', note: d.peer_fallback ? '전체 표본 중위수(임시)' : '' }] }; };
  return { id: 'root', t: 'DuPont 점수', v: (g.score_DP ?? '–') + '점', kids: [
    { id: 'dpm', t: 'ΔPM_adj', v: sgn(g.dPM_adj_pp, 1, '%p'), kids: [side('지금', sn), side('산 날', sb)] },
    { id: 'dat', t: '상대 ATO 변화', v: sgn(g.dATO_rel_pct, 1, '%'), kids: [{ id: 'ato-n', t: 'ATO_rel · 지금', v: sn.ATO_rel.toFixed(2) }, { id: 'ato-b', t: 'ATO_rel · 산 날', v: sb.ATO_rel.toFixed(2) }] }] };
}
function lineageVis(host) {
  const tree = lineageTree(); if (!tree) { host.innerHTML = '<div class="empty">이 조합은 분기 자료가 없다.</div>'; return; }
  const open = new Set(['root']);
  const walk = (n, d, par, out) => { out.push({ n, d, par }); if (open.has(n.id)) (n.kids || []).forEach(k => walk(k, d + 1, n.id, out)); return out; };
  const findN = (n, id) => n.id === id ? n : (n.kids || []).map(k => findN(k, id)).find(Boolean);
  const render = () => {
    const list = walk(tree, 0, null, []), maxD = Math.max(...list.map(x => x.d));
    host.innerHTML = `<div class="lg"><svg class="lg-svg"></svg><div class="lg-cols">${Array.from({ length: maxD + 1 }, (_, d) => `<div class="lg-col">${list.filter(x => x.d === d).map(({ n }) => `<div class="lg-n ${n.kids?.length ? 'has' : ''} ${open.has(n.id) ? 'open' : ''}" data-id="${n.id}" ${n.kids?.length ? 'role="button" tabindex="0"' : ''}><small>${esc(n.t)}</small><b>${esc(n.v ?? '')}</b>
      ${n.quarters ? `<div class="lg-q">${n.quarters.map(q => `<span class="${(q.v || 0) < 0 ? 'neg' : ''}"><em>${esc(q.q || '')}</em>${q.v != null ? won(q.v) : '–'}</span>`).join('')}</div>` : ''}${n.rc ? rcept(n.rc) : ''}${n.note ? `<span class="chip">${esc(n.note)}</span>` : ''}${n.kids?.length ? `<i class="lg-t">${open.has(n.id) ? '−' : '+'}</i>` : ''}</div>`).join('')}</div>`).join('')}</div></div>`;
    const wrap = $('.lg', host), svg = $('.lg-svg', host), wr = wrap.getBoundingClientRect(); svg.setAttribute('width', wrap.scrollWidth); svg.setAttribute('height', wrap.scrollHeight);
    let paths = '';
    list.filter(x => x.par).forEach(({ n, par }, i) => { const a = $(`.lg-n[data-id="${par}"]`, host).getBoundingClientRect(), b = $(`.lg-n[data-id="${n.id}"]`, host).getBoundingClientRect(); const x1 = a.right - wr.left, y1 = a.top + a.height / 2 - wr.top, x2 = b.left - wr.left, y2 = b.top + b.height / 2 - wr.top, mx = (x1 + x2) / 2; paths += `<path class="lg-p" style="--i:${i}" d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}"/>`; });
    svg.innerHTML = paths;
    if (!render.first) wrap.scrollTo({ left: wrap.scrollWidth, behavior: 'smooth' }); render.first = false;
    $$('.lg-n.has', host).forEach(el => { const tog = () => { const id = el.dataset.id; if (open.has(id) && id !== 'root') { const kill = n => { open.delete(n.id); (n.kids || []).forEach(kill); }; kill(findN(tree, id)); } else open.add(id); render(); }; el.onclick = tog; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } }; });
  };
  render();
}
const traceVis = lineageVis;

/* ═════════ 공시 시점 타임라인: 회계기간 끝 → 공시일 → 이용 가능일 ═════════ */
function pitVis(host) {
  const rows = D.dupont_rows?.[S.stock] || [], P = D.prices[S.stock]; if (!rows.length) { host.innerHTML = '<div class="empty">분기 자료가 없다.</div>'; return; }
  const qEnd = r => Date.UTC(r.y, r.q * 3, 0) / 864e5, pub = r => Date.UTC(+r.rc.slice(0, 4), +r.rc.slice(4, 6) - 1, +r.rc.slice(6, 8)) / 864e5;
  const avail = r => { const t = ymdNum(`${r.rc.slice(0, 4)}-${r.rc.slice(4, 6)}-${r.rc.slice(6, 8)}`); const i = P.d.findIndex(x => x > t); return i >= 0 ? numDay(P.d[i]) : pub(r) + 1; };
  const rs = rows.filter((r, i) => rows.findIndex(x => x.rc === r.rc && x.y === r.y && x.q === r.q) === i), d0 = Math.min(...rs.map(qEnd)) - 20, d1 = Math.max(...rs.map(avail)) + 20;
  const W = 1000, L = 90, R = 90, rowH = 26, H = rs.length * rowH + 60, X = d => L + (d - d0) / (d1 - d0) * (W - L - R);
  const yrs = []; for (let y = 2015; y <= 2020; y++) { const d = Date.UTC(y, 0, 1) / 864e5; if (d > d0 && d < d1) yrs.push([y, X(d)]); }
  host.innerHTML = `<div class="pit rv in"><svg viewBox="0 0 ${W} ${H}">${yrs.map(([y, x]) => `<line x1="${x}" x2="${x}" y1="14" y2="${H - 30}" stroke="var(--line)" stroke-dasharray="2 5"/><text class="ax" x="${x + 5}" y="${H - 12}">${y}</text>`).join('')}
    ${rs.map((r, i) => { const y = 24 + i * rowH, a = qEnd(r), p = pub(r), v = avail(r), lag = Math.round(p - a); return `<g class="pit-r" style="--i:${i}"><text x="${L - 14}" y="${y + 4}" text-anchor="end" font-size="12.5" fill="var(--mute)" class="mono">${r.y}Q${r.q}</text><line x1="${X(a)}" x2="${X(v)}" y1="${y}" y2="${y}" stroke="var(--line2)" stroke-width="3" stroke-linecap="round"/><line class="pit-bar" x1="${X(a)}" x2="${X(p)}" y1="${y}" y2="${y}" stroke="var(--blue)" stroke-width="3" stroke-linecap="round"/><circle cx="${X(a)}" cy="${y}" r="5" fill="#fff" stroke="var(--ink)" stroke-width="2.5" data-tip="${r.y}Q${r.q} 회계기간 끝"/><rect x="${X(p) - 4}" y="${y - 7}" width="8" height="14" rx="2" fill="var(--blue)" data-tip="공시일 ${r.rc.slice(0, 4)}-${r.rc.slice(4, 6)}-${r.rc.slice(6, 8)}"/><path d="M${X(v) - 4} ${y - 6}L${X(v) + 6} ${y}L${X(v) - 4} ${y + 6}Z" fill="var(--green)" data-tip="이용 가능일 (다음 거래일)"/><text x="${W - R + 14}" y="${y + 4}" font-size="12.5" font-weight="700" class="mono" fill="var(--ink2)">+${lag}일</text></g>`; }).join('')}</svg>
    <div class="legend"><span><i style="border:2px solid var(--ink);background:#fff;border-radius:50%"></i>회계기간 끝</span><span><i style="background:var(--blue)"></i>공시일</span><span><i style="background:var(--green)"></i>이용 가능일 (다음 거래일)</span><span>숫자는 기간이 끝난 뒤에야 알 수 있다. 모델은 이용 가능일 이후의 값만 쓴다.</span></div></div>`;
}
