/* 从退租到起租 · 界面（ui.js）：所有读数取自 core.js 同一次 compute 的 out */
'use strict';
(function () {
  var A = window.AppCore, KEY = 'lease-gap:v1';
  var $ = function (id) { return document.getElementById(id); };
  var FIELDS = A.FIELDS;
  var PRESETS = [
    { key: 'def', name: '新房要我早点起租', note: '默认（虚构）：旧房月租 4,500、12 月 15 日到期、提前退违约金 1,000；新房月租 3,600，最早 11 月 28 日、最晚 12 月 5 日起租；搬家要重叠 2 天。' },
    { key: 'late', name: '新房要晚几天才空出来', note: '虚构示例：新房 12 月 20 日才空出来，旧房东不让续住，中间只能住外面或者想办法续住。', f: function (s) {
      s.name = '新房还没腾出来'; s.oldRent = '3000'; s.endDate = '2026-12-15'; s.penalty = ''; s.extRate = ''; s.extMax = '10';
      s.newRent = '3300'; s.s0 = '2026-12-20'; s.s1 = '2026-12-25'; s.overlap = '1'; s.hotel = '200'; s.move2 = '400'; s.mode = '30';
    } },
    { key: 'ext', name: '旧房东让按天续住', note: '虚构示例：旧房东同意按每天 120 元续住最多 14 天，新房最早 12 月 18 日起租。', f: function (s) {
      s.name = '续住几天再走'; s.oldRent = '3200'; s.endDate = '2026-12-15'; s.penalty = '1600'; s.extRate = '120'; s.extMax = '14';
      s.newRent = '3900'; s.s0 = '2026-12-18'; s.s1 = '2026-12-31'; s.overlap = '2'; s.hotel = '220'; s.move2 = '300'; s.mode = '365';
    } }
  ];
  var state, out, tmr;
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function presetState(k) { var s = A.defaultState(), p = PRESETS.filter(function (q) { return q.key === k; })[0]; if (p && p.f) p.f(s); return s; }
  function str(v, n) { return v == null || typeof v === 'object' ? '' : String(v).slice(0, n); }
  function sanitize(s) {
    if (!s || typeof s !== 'object') return null;
    var d = A.defaultState();
    FIELDS.forEach(function (k) { if (k in s) d[k] = str(s[k], k === 'name' ? 16 : 20); });
    return d;
  }
  function norm(s) { return JSON.stringify(sanitize(s)); }
  function presetKey(s) { var j = norm(s); for (var i = 0; i < PRESETS.length; i++) if (norm(presetState(PRESETS[i].key)) === j) return PRESETS[i].key; return null; }
  function load() { try { var t = localStorage.getItem(KEY); if (!t) return null; var j = JSON.parse(t); return j && j.state ? sanitize(j.state) : null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, state: state })); $('saveTag').textContent = '· 已自动存在本机'; } catch (e) { $('saveTag').textContent = '· 这台设备存不了，刷新会丢'; } }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  state = load() || A.defaultState();

  function fill() { FIELDS.forEach(function (k) { $(k).value = state[k]; }); }
  FIELDS.forEach(function (k) { $(k).addEventListener(k === 'mode' ? 'change' : 'input', function () { state[k] = this.value; schedule(); }); });
  function schedule() { clearTimeout(tmr); tmr = setTimeout(update, 80); }
  $('presets').addEventListener('click', function (e) { var b = e.target.closest('[data-p]'); if (!b) return; state = presetState(b.getAttribute('data-p')); fill(); update(); });
  $('acts').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b || !out.ok) return;
    var a = out.actions.filter(function (x) { return x.id === b.getAttribute('data-act'); })[0]; if (!a) return;
    state = A.applyChange(state, a); fill(); update();
  });

  function markErrors() {
    document.querySelectorAll('.bad').forEach(function (e) { e.classList.remove('bad'); });
    if (!out.ok) out.errors.forEach(function (er) { var el = $(er.field); if (el) el.classList.add('bad'); });
  }
  function renderPresets() {
    var key = presetKey(state);
    $('presets').innerHTML = PRESETS.map(function (p) { return '<button type="button" class="chip" id="preset_' + p.key + '" data-p="' + p.key + '" aria-pressed="' + (key === p.key) + '">' + esc(p.name) + '</button>'; }).join('');
    var cur = PRESETS.filter(function (p) { return p.key === key; })[0];
    $('presetNote').textContent = cur ? cur.note : '你自己改过的条件（默认那组是虚构示例）。';
  }

  /* 时间线：从两边都在的前 2 天到最后一个关键日后 2 天；一格一天 */
  function tlModel(o) {
    var P = o.P, b = o.ev.best, E = P.endDate;
    var lo = Math.min(b.O, b.S, E) - 2, hi = Math.max(b.O, b.S, E) + 2;
    var days = [];
    for (var d = lo; d <= hi; d++) days.push({
      d: d, old: d < b.O, nw: d >= b.S, out: d >= b.O && d < b.S, ov: d >= b.S && d < b.O, e: d === E
    });
    var step = days.length <= 16 ? 2 : days.length <= 40 ? 7 : 14, ticks = [];
    days.forEach(function (x, i) { if (x.d === b.O || x.d === b.S || x.d === E || (i % step === 0 && i < days.length - 2)) ticks.push(i); });
    return { days: days, lo: lo, hi: hi, ticks: ticks };
  }
  function renderTl() {
    var o = out, b = o.ev.best;
    if (!b) { $('tl').innerHTML = ''; return; }
    var m = tlModel(o), n = m.days.length;
    function row(cls, lb, f) { return '<div class="tlrow"><span class="lb">' + lb + '</span><div class="days ' + cls + '">' + m.days.map(function (x) { return '<i class="' + (f(x) ? 'on' : '') + (x.ov ? ' ov' : '') + (x.e ? ' e' : '') + '" title="' + A.iso(x.d) + '"></i>'; }).join('') + '</div></div>'; }
    var rows = row('old', '旧房', function (x) { return x.old; }) + row('new', '新房', function (x) { return x.nw; });
    if (b.gap) rows += row('out', '住外面', function (x) { return x.out; });
    /* 关键日优先显示，其他刻度离关键日太近就不画 */
    /* 刻度按容器实际宽度排：关键日（交钥匙/起租/到期）一定画，撞了就放第二行；普通刻度撞了就不画 */
    var px = Math.max(($('tl').clientWidth || 600) - 60, 100) / n, GAP = 40;
    var key = [b.O, b.S, o.P.endDate].map(function (d) { return d - m.lo; }), placed = [[], []], tk = '';
    function put(i, must) {
      for (var r = 0; r < (must ? 2 : 1); r++) {
        if (placed[0].concat(placed[1]).indexOf(i) >= 0) return;
        if (!placed[r].some(function (j) { return Math.abs(j - i) * px < GAP; })) {
          placed[r].push(i);
          tk += '<span style="left:' + ((i + 0.5) / n * 100).toFixed(2) + '%;top:' + (r * 15) + 'px">' + A.md(m.days[i].d).replace('月', '/').replace('日', '') + '</span>';
          return;
        }
      }
    }
    key.forEach(function (i) { put(i, true); });
    m.ticks.forEach(function (i) { put(i, false); });
    $('tl').innerHTML = rows + '<div class="axis"><span class="lb"></span><div class="ticks">' + tk + '</div></div>' +
      '<p class="legend">一格一天；<span><b style="background:var(--old)"></b>还住旧房</span> <span><b style="background:var(--new)"></b>新房在交租</span> ' + (b.gap ? '<span><b style="background:var(--out)"></b>住外面</span> ' : '') + '<span><b style="outline:2px solid var(--hi);outline-offset:-2px"></b>两边钥匙都在手</span> <span><b style="box-shadow:inset 0 -4px 0 var(--bad)"></b>旧房到期日</span></p>';
  }
  function renderCmp() {
    var o = out, P = o.P;
    $('cmp').innerHTML = '<table><thead><tr><th>走法</th><th>怎么排</th><th style="text-align:right">多花</th></tr></thead><tbody>' + A.catRows(o).map(function (r) {
      return '<tr id="row_' + r.key + '" class="' + (r.best ? 'best' : r.c ? '' : 'none') + '"><td>' + r.label + (r.best ? '<span class="tag">最省</span>' : '') + '</td><td>' + esc(r.c ? A.planLine(P, r.c) : '排不开：' + r.why) + '</td><td class="n">' + (r.c ? A.yuan(r.c.diff) + ' 元' : '—') + '</td></tr>';
    }).join('') + '</tbody></table>';
    var b = o.ev.best;
    $('bill').innerHTML = b ? A.bill(P, b).map(function (x) { return '<li><span>' + esc(x[0]) + '</span><span>' + A.yuan(x[1]) + ' 元</span></li>'; }).join('') + '<li class="sum"><span>合计</span><span>' + A.yuan(b.diff) + ' 元</span></li>' : '<li><span class="muted">还没有走得通的排法</span></li>';
  }

  function render() {
    var o = out;
    $('errBox').classList.toggle('hide', o.ok); $('okBox').classList.toggle('hide', !o.ok); $('cmpCard').classList.toggle('hide', !o.ok);
    if (!o.ok) { $('errBox').innerHTML = '先改好标红的地方：<ul>' + o.errors.map(function (e) { return '<li>' + esc(e.message) + '</li>'; }).join('') + '</ul>'; return; }
    $('headline').textContent = A.headline(o);
    $('why').textContent = A.explain(o);
    renderTl(); renderCmp();
    $('acts').innerHTML = o.actions.length ? o.actions.map(function (a) { return '<button type="button" class="act" id="' + a.id + '" data-act="' + a.id + '">→ ' + esc(a.text) + '</button>'; }).join('')
      : '<span class="muted">在这几样能谈的条件里，没找到能再省钱的改法。</span>';
  }
  function update() { clearTimeout(tmr); out = A.compute(state); markErrors(); renderPresets(); render(); save(); }

  function stamp() { var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function download(name, blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  function tag() { if (!out.ok) return '待改'; var b = out.ev.best; if (!b) return '排不开'; return b.diff < 0 ? '少花' + A.yuan(-b.diff).replace(/,/g, '') + '元' : '多花' + A.yuan(b.diff).replace(/,/g, '') + '元'; }
  $('dlCsv').addEventListener('click', function () { if (out.ok) download('从退租到起租-三种走法.csv', new Blob(['\ufeff' + A.toCSV(out, stamp())], { type: 'text/csv;charset=utf-8' })); });
  $('dlMd').addEventListener('click', function () { if (out.ok) download('从退租到起租-' + tag() + '.md', new Blob([A.toMD(out, stamp())], { type: 'text/markdown;charset=utf-8' })); });
  $('dlJson').addEventListener('click', function () { download('从退租到起租-备份.json', new Blob([JSON.stringify({ app: '从退租到起租', slug: 'lease-gap', version: 1, exported_at: stamp(), state: state }, null, 2)], { type: 'application/json' })); });
  $('impJson').addEventListener('click', function () { $('impFile').click(); });
  $('impFile').addEventListener('change', function () { var f = this.files && this.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { importText(String(rd.result)); }; rd.readAsText(f); this.value = ''; });
  function importText(t) {
    var s = null;
    try { var j = JSON.parse(t); s = sanitize(j && j.state ? j.state : j); } catch (e) { s = null; }
    if (!s) { $('impMsg').textContent = '这个文件读不出来，没改动。'; return false; }
    $('impMsg').textContent = '已导入。'; state = s; fill(); update(); return true;
  }
  $('reset').addEventListener('click', function () { state = A.defaultState(); $('impMsg').textContent = ''; fill(); update(); });

  /* 结果卡 PNG 1080×1350：文字与时间线取自同一次 out */
  function drawCard() {
    var W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d'), FF = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    g.fillStyle = '#f2f1ec'; g.fillRect(0, 0, W, H); g.fillStyle = '#fffefb'; g.fillRect(50, 50, W - 100, H - 100);
    var L = 100, Rr = W - 100, maxW = Rr - L, y = 150;
    function font(size, bold) { g.font = (bold ? '700 ' : '') + size + 'px ' + FF; }
    function clip(t, w) { t = String(t); if (g.measureText(t).width <= w) return t; while (t.length > 1 && g.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; }
    function wrap(t, size, color, bold, lim, x0, w0) {
      x0 = x0 || L; w0 = w0 || maxW;
      font(size, bold); g.fillStyle = color; var cur = '', n = 0;
      var toks = String(t).match(/[0-9.,:−]+ ?(?:元|天|晚|月|日)?[）)。，、；：]?|[（(「]?[^\s（(「][）)」。，、；：]?|\s/g) || [];
      for (var i = 0; i < toks.length; i++) { var ch = toks[i]; if (g.measureText(cur + ch).width > w0 && cur) { if (lim && ++n >= lim) { g.fillText(clip(cur + '…', w0), x0, y); y += size * 1.45; return; } g.fillText(cur, x0, y); y += size * 1.45; cur = ch.trim() ? ch : ''; } else cur += ch; }
      if (cur) { g.fillText(cur, x0, y); y += size * 1.45; }
    }
    font(54, true); g.fillStyle = '#22262a'; g.fillText('从退租到起租', L, y); y += 56;
    if (!out.ok || !out.ev.best) {
      font(42, true); g.fillStyle = '#a8372b'; g.fillText(out.ok ? '排不开' : '还算不了', L, y + 20); y += 90;
      if (out.ok) { wrap(A.headline(out), 30, '#4f565c', false, 4); y += 10; wrap(A.explain(out), 26, '#4f565c', false, 3); y += 20; out.actions.slice(0, 3).forEach(function (a) { wrap('→ ' + a.text, 25, '#2f6b4f', false, 3); y += 4; }); }
      else { out.errors.slice(0, 10).forEach(function (e) { wrap('· ' + e.message, 28, '#4f565c', false, 2); y += 6; }); y += 30; wrap('改好标红的地方，会自动重算。', 26, '#868c91'); }
      return cv;
    }
    var o = out, P = o.P, b = o.ev.best;
    font(26); g.fillStyle = '#868c91'; g.fillText(clip(P.name + ' · 旧房 ' + A.fmt(P.oldRent, 0) + ' 元/月 → 新房 ' + A.fmt(P.newRent, 0) + ' 元/月', maxW), L, y); y += 110;
    font(84, true); g.fillStyle = '#2f6b4f'; var big = b.diff < 0 ? '还少花 ' + A.yuan(-b.diff) + ' 元' : b.diff === 0 ? '不多花' : '多花 ' + A.yuan(b.diff) + ' 元'; g.fillText(clip(big, maxW), L, y); y += 30;
    font(30); g.fillStyle = '#4f565c'; y += 40; g.fillText(clip(A.mdw(b.O) + '交钥匙 → ' + A.mdw(b.S) + '起租', maxW), L, y); y += 60;
    wrap(A.headline(o), 27, '#22262a', true, 4); y += 10;
    /* 时间线 */
    var m = tlModel(o), n = m.days.length, x0 = L + 110, cw = (maxW - 110) / n;
    var lanes = [['旧房', '#c9873e', function (x) { return x.old; }], ['新房', '#3d6f8f', function (x) { return x.nw; }]];
    if (b.gap) lanes.push(['住外面', '#8a5a9e', function (x) { return x.out; }]);
    lanes.forEach(function (r) {
      font(24, true); g.fillStyle = '#4f565c'; g.fillText(r[0], L, y + 26);
      m.days.forEach(function (x, i) {
        var xx = x0 + i * cw; g.fillStyle = r[2](x) ? r[1] : '#f1efe9'; g.fillRect(xx, y, Math.max(cw - 1.5, 1), 34);
        if (x.ov) { g.strokeStyle = '#2f6b4f'; g.lineWidth = 3; g.strokeRect(xx + 1.5, y + 1.5, Math.max(cw - 4.5, 1), 31); }
        if (x.e) { g.fillStyle = '#a8372b'; g.fillRect(xx, y + 30, Math.max(cw - 1.5, 1), 4); }
      });
      y += 46;
    });
    font(20); g.fillStyle = '#868c91';
    /* 关键日标签：撞了就放第二行（实测 11/28 与 11/30 隔 2 格时「11月28日11月30日」连在一起） */
    var rowsUsed = [[], []], seen = [];
    [b.O, b.S, P.endDate].forEach(function (d) {
      if (seen.indexOf(d) >= 0) return; seen.push(d);
      var i = d - m.lo, cx = x0 + (i + 0.5) * cw, t = (new Date(d * 86400000).getUTCMonth() + 1) + '/' + new Date(d * 86400000).getUTCDate(), w = g.measureText(t).width;
      var lx = Math.min(Math.max(cx - w / 2, x0), Rr - w);
      for (var r = 0; r < 2; r++) if (!rowsUsed[r].some(function (u) { return lx < u[1] + 10 && lx + w + 10 > u[0]; })) { rowsUsed[r].push([lx, lx + w]); g.fillText(t, lx, y + 8 + r * 24); return; }
    });
    y += 66;
    /* 账 */
    font(28, true); g.fillStyle = '#22262a'; g.fillText('这笔账', L, y); y += 44;
    A.bill(P, b).concat([['合计', b.diff]]).forEach(function (r, i, arr) {
      var last = i === arr.length - 1; font(25, last); g.fillStyle = '#22262a';
      g.fillText(clip(r[0], maxW - 200), L, y); var t = A.yuan(r[1]) + ' 元'; g.fillText(t, Rr - g.measureText(t).width, y); y += 38;
    });
    y += 14;
    if (o.actions.length) { font(28, true); g.fillStyle = '#22262a'; g.fillText('改一样试试', L, y); y += 42; o.actions.slice(0, 2).forEach(function (a) { wrap('→ ' + a.text, 23, '#2f6b4f', false, 2); y += 2; }); }
    y = Math.max(y + 10, H - 130);
    wrap('房租按天折算（' + (P.mode === '365' ? '月租×12÷365' : '月租÷30') + '）；不算押金、水电、搬家公司本身的钱；以合同为准。默认数字为虚构示例。', 20, '#868c91', false, 2);
    return cv;
  }
  $('dlPng').addEventListener('click', function () { drawCard().toBlob(function (bl) { if (bl) download('从退租到起租-' + tag() + '-1080x1350.png', bl); }, 'image/png'); });

  /* 刻度按容器宽度排，所以窗口宽度变了要重画（实测：1280 打开再缩到 375，刻度挤在一起） */
  var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (out && out.ok) renderTl(); }, 120); });

  window.__lgUi = { state: function () { return clone(state); }, out: function () { return out; }, importText: importText, drawCard: drawCard, storageKey: KEY };
  fill(); update();
})();
