/* 从退租到起租 · 计算核心（core.js）
 * 问题：换租时旧房的到期日和新房的起租日很少正好对上。新房东只肯留几天、旧房还没到期，
 *       要么两边房租一起交，要么提前退交违约金，要么先搬出去住几晚外面，要么跟旧房东续住几天。
 *       这里把每一种「哪天交旧房钥匙 × 哪天新房起租」都算一遍，找最省的那天。
 * 口径（设计选择，页面「怎么算的」写明）：
 *   - 房租按天折算：日租 = 月租 ÷ 30，或 月租 × 12 ÷ 365（用户选）。
 *   - 旧房住到交钥匙那天的前一晚；新房从起租那天起算。交钥匙那天 O、起租那天 S。
 *   - 比较基准是「到期那天交钥匙、同一天新房起租」（无缝换房，往往排不出来）：
 *       多花 = 新房提前起租天数 × 新日租（E − S，晚起租为负）
 *            − 提前退省下的旧房租（E − O）× 旧日租 + 违约金（O < E 时）
 *            + 续住天数（O − E）× 续住日价（O > E 时）
 *            + 外面住的晚数（S − O）× 每晚价（S > O 时）
 *     这个差和你从哪天开始算、算到哪天无关，所以不同条件之间可以直接比。
 *   - 能走通的排法：新房起租在「最早～最晚」之间；要么两边钥匙重叠 ≥ 搬家要的天数（S ≤ O − k），
 *     要么先搬出去、中间住外面（S > O，且填了每晚价）。
 * 精确计算：1 元 = 10950 个计算单位（365 × 30），两种日租都是整数，比较不受浮点误差影响。 */
(function (root) {
  'use strict';
  var U = 10950;
  var DAY = 86400000;
  var EARLY_MAX = 90;   /* 提前退最多往前看 90 天 */

  function defaultState() {
    return {
      name: '换到公司附近', oldRent: '4500', endDate: '2026-12-15', penalty: '1000', extRate: '', extMax: '10',
      newRent: '3600', s0: '2026-11-28', s1: '2026-12-05', overlap: '2', hotel: '260', move2: '300', mode: '30'
    };
  }
  var FIELDS = ['name', 'oldRent', 'endDate', 'penalty', 'extRate', 'extMax', 'newRent', 's0', 's1', 'overlap', 'hotel', 'move2', 'mode'];

  function half(s) { return String(s == null ? '' : s).replace(/[\uFF01-\uFF5E]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); }).replace(/\u3000/g, ' ').replace(/\s/g, ''); }
  function parseDate(s) {
    s = half(s).replace(/[年月/.]/g, '-').replace(/日$/, '');
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (!m) return NaN;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1) return NaN;
    var t = Date.UTC(y, mo - 1, d), dt = new Date(t);
    if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return NaN;   /* 2 月 30 日之类 */
    return Math.round(t / DAY);
  }
  function iso(day) { var d = new Date(day * DAY); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()); }
  function p2(x) { return (x < 10 ? '0' : '') + x; }
  var WK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  function md(day) { var d = new Date(day * DAY); return (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日'; }
  function mdw(day) { return md(day) + '（' + WK[new Date(day * DAY).getUTCDay()] + '）'; }

  function parse(st) {
    var errs = [], P = {};
    st = st && typeof st === 'object' ? st : {};
    function int(f, lo, hi, label, unit, opt) {
      var s = half(st[f]);
      if (opt && s === '') return null;
      if (!/^\d+$/.test(s)) { errs.push({ field: f, message: label + (s === '' ? '没填' : /^\d+\.\d+$/.test(s) ? '要填整数' : '要填数字') }); return null; }
      var x = Number(s);
      if (x < lo || x > hi) { errs.push({ field: f, message: label + '要在 ' + lo + '～' + hi + unit + ' 之间' }); return null; }
      return x;
    }
    function date(f, label) {
      var d = parseDate(st[f]);
      if (isNaN(d)) { errs.push({ field: f, message: label + '要填日期，比如 2026-12-15' }); return null; }
      return d;
    }
    P.name = String(st.name == null ? '' : st.name).slice(0, 16).trim() || '这次搬家';
    P.oldRent = int('oldRent', 1, 100000, '旧房月租', ' 元');
    P.endDate = date('endDate', '旧房到期日');
    P.penalty = int('penalty', 0, 100000, '提前退的违约金', ' 元', true);
    P.extRate = int('extRate', 0, 10000, '续住每天', ' 元', true);
    P.extMax = P.extRate === null ? 0 : int('extMax', 1, 60, '最多续住', ' 天');   /* 不能续住时「最多续住」不参与 */
    P.newRent = int('newRent', 1, 100000, '新房月租', ' 元');
    P.s0 = date('s0', '新房最早起租');
    P.s1 = date('s1', '新房最晚起租');
    P.overlap = int('overlap', 0, 14, '搬家要两边钥匙都在手', ' 天');
    P.hotel = int('hotel', 0, 5000, '中间住外面每晚', ' 元', true);
    P.move2 = P.hotel === null ? 0 : int('move2', 0, 20000, '多搬一次', ' 元', true) || 0;   /* 先搬出去寄存、再搬进新房，多出来的那趟 */
    P.mode = String(st.mode) === '365' ? '365' : '30';
    if (P.s0 !== null && P.s1 !== null) {
      if (P.s1 < P.s0) errs.push({ field: 's1', message: '新房最晚起租不能早于最早起租' });
      else if (P.s1 - P.s0 > 60) errs.push({ field: 's1', message: '新房最早到最晚起租最多隔 60 天' });
    }
    if (P.s0 !== null && P.endDate !== null && Math.abs(P.s0 - P.endDate) > 90) errs.push({ field: 's0', message: '新房起租和旧房到期最多差 90 天' });
    return errs.length ? { errors: errs } : { P: P, errors: [] };
  }

  /* 日租（计算单位）：÷30 → 月租 × 365；×12÷365 → 月租 × 360 */
  function daily(P, rent) { return rent * (P.mode === '365' ? 360 : 365); }

  function cost(P, O, S) {
    var E = P.endDate, d1 = daily(P, P.oldRent), d2 = daily(P, P.newRent);
    var early = O < E ? E - O : 0, ext = O > E ? O - E : 0, gap = S > O ? S - O : 0, lead = E - S;
    var parts = {
      newLead: d2 * lead,                         /* 新房比到期日早起租多交（晚起租为负） */
      earlySave: -d1 * early,                     /* 提前退省下的旧房租（负） */
      penalty: early ? P.penalty * U : 0,
      ext: ext ? P.extRate * U * ext : 0,
      gap: gap ? P.hotel * U * gap : 0,
      move2: gap ? P.move2 * U : 0
    };
    return {
      O: O, S: S, early: early, ext: ext, gap: gap, overlapDays: S < O ? O - S : 0, lead: lead,
      parts: parts, diff: parts.newLead + parts.earlySave + parts.penalty + parts.ext + parts.gap + parts.move2,
      kind: early ? 'early' : ext ? 'ext' : 'onTime'
    };
  }
  function feasible(P, O, S) { return S <= O - P.overlap || (P.hotel !== null && S > O); }
  function better(a, b, E) {   /* a 比 b 好？多花少 → 外面住得少 → 交钥匙离到期近 → 交钥匙早 → 起租晚 */
    if (!b) return true;
    if (a.diff !== b.diff) return a.diff < b.diff;
    if (a.gap !== b.gap) return a.gap < b.gap;
    var da = Math.abs(a.O - E), db = Math.abs(b.O - E);
    if (da !== db) return da < db;
    if (a.O !== b.O) return a.O < b.O;
    return a.S > b.S;
  }

  function evaluate(P) {
    var E = P.endDate;
    var oLo = P.penalty !== null ? E - EARLY_MAX : E, oHi = P.extRate !== null ? E + P.extMax : E;
    var best = null, cat = { early: null, onTime: null, ext: null }, n = 0;
    for (var O = oLo; O <= oHi; O++) {
      for (var S = P.s0; S <= P.s1; S++) {
        if (!feasible(P, O, S)) continue;
        var c = cost(P, O, S); n++;
        if (better(c, best, E)) best = c;
        if (better(c, cat[c.kind], E)) cat[c.kind] = c;
      }
    }
    /* 违约金临界：提前退的最优多花 = 其余最优 时的违约金 */
    var other = [cat.onTime, cat.ext].filter(Boolean).sort(function (a, b) { return a.diff - b.diff; })[0] || null, pe = null;
    if (cat.early && other) {
      var T = other.diff - (cat.early.diff - P.penalty * U);   /* 违约金 × U 小于 T 时提前退更省 */
      pe = { T: T, earlyBest: best.kind === 'early' };
    }
    return { best: best, cat: cat, other: other, feasibleCount: n, oLo: oLo, oHi: oHi, pe: pe, d1: daily(P, P.oldRent), d2: daily(P, P.newRent) };
  }

  function applyChange(st, a) {
    var s = JSON.parse(JSON.stringify(st));
    Object.keys(a.set).forEach(function (k) { s[k] = String(a.set[k]); });
    return s;
  }

  function actions(st, P, ev) {
    var acts = [], cur = ev.best ? ev.best.diff : null;
    function add(id, set, label) {
      var a = { id: id, set: set }, q = parse(applyChange(st, a));
      if (!q.P) return;
      var x = evaluate(q.P);
      if (!x.best) return;
      if (cur !== null && x.best.diff >= cur) return;
      a.after = { diff: x.best.diff, O: x.best.O, S: x.best.S };
      a.text = label + '：' + (cur === null ? '能排开了，最省多花 ' + yuan(x.best.diff) + ' 元' : '最省多花 ' + yuan(cur) + ' → ' + yuan(x.best.diff) + ' 元，少花 ' + yuan(cur - x.best.diff) + ' 元') + '（' + md(x.best.O) + '交旧房钥匙、' + md(x.best.S) + '新房起租）';
      acts.push(a);
    }
    if (P.s1 + 7 - P.s0 <= 60) add('act_later', { s1: iso(P.s1 + 7) }, '跟新房东商量最晚起租推后 7 天（到 ' + md(P.s1 + 7) + '）');
    if (P.overlap > 0) add('act_overlap', { overlap: P.overlap - 1 }, '搬家少留 1 天重叠（' + (P.overlap - 1) + ' 天）');
    if (P.extRate === null) {
      var r = Math.ceil(ev.d1 / U);
      add('act_ext', { extRate: r, extMax: 14 }, '问旧房东能不能按原价续住，每天 ' + fmt(r, 0) + ' 元、最多 14 天');
    }
    return acts;
  }

  function compute(st) {
    var q = parse(st);
    if (!q.P) return { ok: false, errors: q.errors };
    var P = q.P, ev = evaluate(P);
    return { ok: true, errors: [], P: P, ev: ev, actions: actions(st, P, ev) };
  }

  /* —— 文字 —— */
  function fmt(x, d) {
    var s = Math.abs(x).toFixed(d), p = s.split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (x < 0 && Number(s) !== 0 ? '−' : '') + p.join('.');
  }
  function yuan(u) { var a = Math.abs(u), r = Math.floor((2 * a + U) / (2 * U)); return fmt(u < 0 ? -r : r, 0); }   /* 计算单位 → 元，四舍五入（.5 远离 0） */
  function yuan2(u) { var a = Math.abs(u), r = Math.floor((2 * a * 100 + U) / (2 * U)); return (u < 0 && r ? '-' : '') + Math.floor(r / 100) + '.' + p2(r % 100); }

  var KIND = { early: '提前退', onTime: '到期退', ext: '续住几天再退' };
  function planLine(P, c) {
    var s = md(c.O) + '交旧房钥匙';
    if (c.early) s += '（提前 ' + c.early + ' 天，违约金 ' + fmt(P.penalty, 0) + ' 元）';
    else if (c.ext) s += '（续住 ' + c.ext + ' 天）';
    else s += '（正好到期）';
    if (c.gap) s += '，中间住外面 ' + c.gap + ' 晚';
    else if (c.overlapDays) s += '，两边钥匙重叠 ' + c.overlapDays + ' 天';
    else s += '，当天搬';
    return s + '，' + md(c.S) + '新房起租';
  }
  function bill(P, c) {   /* 多花的钱一项项列出来（只列不为 0 的） */
    var L = [], p = c.parts;
    if (c.lead > 0) L.push(['新房比旧房到期早起租 ' + c.lead + ' 天', p.newLead]);
    else if (c.lead < 0) L.push(['新房比旧房到期晚起租 ' + (-c.lead) + ' 天（这几天的新房租不用交）', p.newLead]);
    if (c.early) { L.push(['提前 ' + c.early + ' 天退，旧房租按天退回', p.earlySave]); L.push(['违约金', p.penalty]); }
    if (c.ext) L.push(['续住 ' + c.ext + ' 天 × ' + fmt(P.extRate, 0) + ' 元', p.ext]);
    if (c.gap) L.push(['住外面 ' + c.gap + ' 晚 × ' + fmt(P.hotel, 0) + ' 元', p.gap]);
    if (c.gap && P.move2) L.push(['东西先寄存、多搬一次', p.move2]);
    return L;
  }
  function headline(o) {
    var P = o.P, e = o.ev, b = e.best;
    if (!b) return P.name + '：照现在的条件排不开——' + whyNone(P) + '。';
    var s = P.name + '：最省是 ' + planLine(P, b) + '，比到期当天无缝换房' + (b.diff < 0 ? '还少花 ' + yuan(-b.diff) : b.diff === 0 ? '不多花' : '多花 ' + yuan(b.diff)) + (b.diff ? ' 元' : '') + '。';
    var t = e.cat.onTime;
    if (b.kind !== 'onTime') s += t ? '照到期日退要多花 ' + yuan(t.diff) + ' 元，这样省 ' + yuan(t.diff - b.diff) + ' 元。' : '照到期日退排不开。';
    return s;
  }
  function whyNone(P) {
    var r = [];
    if (P.s0 > P.endDate && P.extRate === null && P.hotel === null) r.push('新房 ' + md(P.s0) + '才能起租，旧房 ' + md(P.endDate) + '到期，又不能续住、也不住外面');
    else if (P.s0 > P.endDate + P.extMax - P.overlap && P.hotel === null) r.push('续住到最晚也凑不够 ' + P.overlap + ' 天重叠，又不住外面');
    else r.push('在能填的范围里找不到既有地方住、又够搬家重叠的排法');
    return r.join('；');
  }
  function explain(o) {
    var P = o.P, e = o.ev, b = e.best;
    var s = '旧房日租 ' + yuan(e.d1) + ' 元、新房日租 ' + yuan(e.d2) + ' 元（月租' + (P.mode === '365' ? ' × 12 ÷ 365' : ' ÷ 30') + '）。';
    if (!b) return s + (P.hotel === null ? '填一个「中间住外面每晚」的价钱，或者问旧房东能不能续住，就有排法了。' : '');
    s += '一共试了 ' + fmt(e.feasibleCount, 0) + ' 种走得通的「哪天交钥匙 × 哪天起租」。';
    if (e.pe) {
      var x = Math.ceil(e.pe.T / U) - 1;
      if (e.pe.earlyBest) s += '违约金涨到 ' + fmt(Math.ceil(e.pe.T / U), 0) + ' 元及以上，提前退就不再省钱。';
      else if (x >= 0) s += '违约金不超过 ' + fmt(x, 0) + ' 元时，提前退才更省。';
      else s += '就算没有违约金，提前退也不更省。';
    }
    return s;
  }
  function catRows(o) {
    var P = o.P, e = o.ev;
    return ['early', 'onTime', 'ext'].map(function (k) {
      var c = e.cat[k];
      var why = k === 'early' && P.penalty === null ? '没填违约金（当作不能提前退）' : k === 'ext' && P.extRate === null ? '没填续住价（当作不能续住）' : '这样排不开（重叠不够、又不住外面）';
      return { key: k, label: KIND[k], c: c, why: c ? '' : why, best: !!(c && e.best && c.O === e.best.O && c.S === e.best.S) };
    });
  }

  function csvCell(v) { var x = String(v); if (/^[=+\-@]/.test(x) && !/^-\d+(\.\d+)?$/.test(x)) x = "'" + x;   /* 负数照常写，其余 = + - @ 开头的加引号防公式注入 */ return /[",\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }
  function row(a) { return a.map(csvCell).join(','); }
  function toCSV(o, when) {
    var P = o.P, e = o.ev, L = [];
    L.push(row(['从退租到起租', '导出时间', when, '名字', P.name]));
    L.push(row(['项目', '数值', '单位']));
    [['旧房月租', P.oldRent, '元'], ['旧房到期', iso(P.endDate), ''], ['提前退违约金', P.penalty === null ? '不能提前退' : P.penalty, '元'], ['续住每天', P.extRate === null ? '不能续住' : P.extRate, '元'], ['最多续住', P.extRate === null ? '' : P.extMax, '天'],
      ['新房月租', P.newRent, '元'], ['新房最早起租', iso(P.s0), ''], ['新房最晚起租', iso(P.s1), ''], ['搬家要重叠', P.overlap, '天'], ['中间住外面每晚', P.hotel === null ? '不住外面' : P.hotel, '元'], ['多搬一次', P.hotel === null ? '' : P.move2, '元'],
      ['日租算法', P.mode === '365' ? '月租×12÷365' : '月租÷30', ''], ['旧房日租', yuan2(e.d1), '元'], ['新房日租', yuan2(e.d2), '元']
    ].forEach(function (r) { L.push(row(r)); });
    L.push('');
    L.push(row(['走法', '交旧房钥匙', '新房起租', '提前退天数', '续住天数', '重叠天数', '住外面晚数', '比无缝换房多花 元', '是否最省']));
    catRows(o).forEach(function (r) {
      var c = r.c;
      L.push(row(c ? [r.label, iso(c.O), iso(c.S), c.early, c.ext, c.overlapDays, c.gap, yuan2(c.diff), r.best ? '最省' : ''] : [r.label, '排不开', r.why, '', '', '', '', '', '']));
    });
    if (e.best) {
      L.push('');
      L.push(row(['最省走法的账', '元']));
      bill(P, e.best).forEach(function (b) { L.push(row([b[0], yuan2(b[1])])); });
      L.push(row(['合计', yuan2(e.best.diff)]));
    }
    L.push('');
    L.push(row(['改法', '改完最省多花 元']));
    o.actions.forEach(function (a) { L.push(row([a.text, yuan2(a.after.diff)])); });
    return L.join('\r\n') + '\r\n';
  }
  function toMD(o, when) {
    var P = o.P, e = o.ev, L = [];
    L.push('# 从退租到起租 · ' + P.name, '', '_导出：' + when + '_', '', '**' + headline(o) + '**', '', explain(o), '');
    L.push('| 走法 | 怎么排 | 比无缝换房多花 |', '|---|---|---|');
    catRows(o).forEach(function (r) { L.push('| ' + r.label + (r.best ? '（最省）' : '') + ' | ' + (r.c ? planLine(P, r.c) : '排不开：' + r.why) + ' | ' + (r.c ? yuan(r.c.diff) + ' 元' : '—') + ' |'); });
    L.push('');
    if (e.best) {
      L.push('最省那条的账：', '');
      bill(P, e.best).forEach(function (b) { L.push('- ' + b[0] + '：' + yuan(b[1]) + ' 元'); });
      L.push('- 合计：' + yuan(e.best.diff) + ' 元', '');
    }
    o.actions.forEach(function (a) { L.push('- ' + a.text); });
    if (o.actions.length) L.push('');
    L.push('> 房租按天折算，违约金、续住价、住外面每晚多少都按你填的算；合同怎么写以合同为准。默认数字是虚构示例。');
    return L.join('\n') + '\n';
  }

  var api = { U: U, FIELDS: FIELDS, defaultState: defaultState, parse: parse, parseDate: parseDate, iso: iso, md: md, mdw: mdw, daily: daily, cost: cost, feasible: feasible,
    evaluate: evaluate, applyChange: applyChange, actions: actions, compute: compute, headline: headline, explain: explain, planLine: planLine, bill: bill, catRows: catRows,
    fmt: fmt, yuan: yuan, yuan2: yuan2, KIND: KIND, toCSV: toCSV, toMD: toMD, EARLY_MAX: EARLY_MAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AppCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
