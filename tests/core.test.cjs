/* 从退租到起租 · 核心测试：node --test tests/core.test.cjs
 * 锚点：tests/ref.json（独立 Python 按文字规则用 date + Fraction 重写，300 组，逐日穷举）、默认场景手算、
 *       违约金临界两侧、排不开、非法日期、改法真的重算且更省、导出。 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const A = require(path.join(__dirname, '..', 'core.js'));
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'ref.json'), 'utf8'));
const U = A.U;
const D = () => A.defaultState();
const one = (o) => Object.assign(D(), o);

test('默认场景：手算读数、标题、说明、三种走法、账、改法', () => {
  const o = A.compute(D()); assert.ok(o.ok, JSON.stringify(o.errors));
  const e = o.ev, b = e.best;
  /* 日租 4500/30 = 150、3600/30 = 120。11/30 交钥匙（提前 15 天）、11/28 起租（比 12/15 早 17 天）：
     17 × 120 − 15 × 150 + 1000 = 790；到期退最好是 12/5 起租：10 × 120 = 1200 */
  assert.equal(e.d1, 150 * U); assert.equal(e.d2, 120 * U);
  assert.equal(A.iso(b.O), '2026-11-30'); assert.equal(A.iso(b.S), '2026-11-28'); assert.equal(b.diff, 790 * U); assert.equal(b.kind, 'early');
  assert.equal(e.cat.onTime.diff, 1200 * U); assert.equal(A.iso(e.cat.onTime.S), '2026-12-05'); assert.equal(e.cat.ext, null);
  assert.equal(A.headline(o), '换到公司附近：最省是 11月30日交旧房钥匙（提前 15 天，违约金 1,000 元），两边钥匙重叠 2 天，11月28日新房起租，比到期当天无缝换房多花 790 元。照到期日退要多花 1,200 元，这样省 410 元。');
  /* 违约金临界：提前退去掉违约金是 −210，要 ≥ 1200 − (−210) = 1410 才不省 */
  assert.equal(A.explain(o), '旧房日租 150 元、新房日租 120 元（月租 ÷ 30）。一共试了 712 种走得通的「哪天交钥匙 × 哪天起租」。违约金涨到 1,410 元及以上，提前退就不再省钱。');
  assert.deepEqual(A.bill(o.P, b).map((x) => [x[0], A.yuan(x[1])]), [['新房比旧房到期早起租 17 天', '2,040'], ['提前 15 天退，旧房租按天退回', '−2,250'], ['违约金', '1,000']]);
  assert.deepEqual(o.actions.map((a) => a.text), [
    '跟新房东商量最晚起租推后 7 天（到 12月12日）：最省多花 790 → 360 元，少花 430 元（12月15日交旧房钥匙、12月12日新房起租）',
    '搬家少留 1 天重叠（1 天）：最省多花 790 → 640 元，少花 150 元（11月29日交旧房钥匙、11月28日新房起租）']);
});

test('与独立 Python 实现逐组对拍（300 组：可行数、最省、三类各自最省，钱按分数精确相等）', () => {
  assert.equal(REF.cases.length, 300);
  const st = REF.stats;
  assert.ok(st.early >= 40 && st.onTime >= 60 && st.ext >= 30 && st.none >= 20 && st.gap >= 50, JSON.stringify(st));
  const same = (b, y, m) => {
    if (!y) { assert.equal(b, null, m); return; }
    assert.ok(b, m); assert.equal(A.iso(b.O), y.O, m); assert.equal(A.iso(b.S), y.S, m); assert.equal(b.gap, y.gap, m);
    assert.equal(b.diff * y.costDen, y.costNum * U, m + ' 钱');   /* 计算单位 / U == 分数 */
  };
  for (const c of REF.cases) {
    const o = A.compute(c.state), m = JSON.stringify(c.state); assert.ok(o.ok, JSON.stringify(o.errors) + m);
    assert.equal(o.ev.feasibleCount, c.expect.count, m);
    same(o.ev.best, c.expect.best, m);
    for (const k of ['early', 'onTime', 'ext']) same(o.ev.cat[k], c.expect.cat[k], m + ' ' + k);
  }
});

test('最省确实最省：逐个排法暴力比对 + 每条都走得通', () => {
  let n = 0;
  for (const c of REF.cases.slice(0, 120).concat([{ state: D() }])) {
    const o = A.compute(c.state), P = o.P, b = o.ev.best;
    if (!b) continue;
    assert.ok(A.feasible(P, b.O, b.S));
    if (b.gap) assert.ok(P.hotel !== null); else assert.ok(b.O - b.S >= P.overlap);
    assert.ok(b.S >= P.s0 && b.S <= P.s1);
    for (let O = o.ev.oLo; O <= o.ev.oHi; O++) for (let S = P.s0; S <= P.s1; S++) if (A.feasible(P, O, S)) assert.ok(A.cost(P, O, S).diff >= b.diff);
    n++;
  }
  assert.ok(n >= 80, String(n));
});

test('每条改法：真的改了输入、重算后读数对得上、确实更省', () => {
  let n = 0;
  for (const c of REF.cases.concat([{ state: D() }])) {
    const o = A.compute(c.state), ids = o.actions.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const a of o.actions) {
      const o2 = A.compute(A.applyChange(c.state, a)); assert.ok(o2.ok, a.text);
      assert.equal(o2.ev.best.diff, a.after.diff); assert.equal(o2.ev.best.O, a.after.O); assert.equal(o2.ev.best.S, a.after.S);
      if (o.ev.best) assert.ok(o2.ev.best.diff < o.ev.best.diff, a.text); else assert.ok(/能排开了/.test(a.text));
      n++;
    }
  }
  assert.ok(n >= 200, String(n));
});

test('违约金临界两侧：1409 仍提前退、1410 改成到期退', () => {
  let o = A.compute(one({ penalty: '1409' }));
  assert.equal(o.ev.best.kind, 'early'); assert.equal(o.ev.best.diff, 1199 * U);
  o = A.compute(one({ penalty: '1410' }));
  assert.equal(o.ev.best.kind, 'onTime'); assert.equal(o.ev.best.diff, 1200 * U);
  assert.ok(A.explain(o).endsWith('违约金不超过 1,409 元时，提前退才更省。'), A.explain(o));
  o = A.compute(one({ penalty: '0', s0: '2026-12-20', s1: '2026-12-25' }));   /* 新房晚于到期才起租：提前退只会多住外面（260 > 150），没有违约金也不省 */
  assert.equal(o.ev.best.kind, 'onTime');
  assert.ok(A.explain(o).endsWith('就算没有违约金，提前退也不更省。'), A.explain(o));
});

test('排不开 / 住外面 / 续住', () => {
  /* 新房 12/20 才起租，不能续住、不住外面：排不开 */
  let o = A.compute(one({ s0: '2026-12-20', s1: '2026-12-25', hotel: '' }));
  assert.equal(o.ev.best, null);
  assert.equal(A.headline(o), '换到公司附近：照现在的条件排不开——新房 12月20日才能起租，旧房 12月15日到期，又不能续住、也不住外面。');
  assert.deepEqual(o.actions.map((a) => a.id), ['act_ext']);
  assert.ok(/能排开了，最省多花 450 元/.test(o.actions[0].text), o.actions[0].text);   /* 12/22 交钥匙、12/20 起租：−5×120 + 7×150 = 450 */
  /* 填了住外面每晚 260 + 多搬 300：12/15 交钥匙住外面 5 晚：−600 + 1300 + 300 = 1000 */
  o = A.compute(one({ s0: '2026-12-20', s1: '2026-12-25' }));
  assert.equal(o.ev.best.gap, 5); assert.equal(o.ev.best.diff, 1000 * U);
  assert.deepEqual(A.bill(o.P, o.ev.best).map((x) => A.yuan(x[1])), ['−600', '1,300', '300']);
  /* 不住外面时「多搬一次」不参与（填了也不算） */
  assert.equal(A.compute(one({ hotel: '', move2: 'abc' })).ok, true);
  /* 续住比住外面便宜就续住 */
  o = A.compute(one({ s0: '2026-12-20', s1: '2026-12-25', extRate: '100', extMax: '10' }));
  /* 续住 100 元/天比新房日租 120 便宜：续满 10 天到 12/25 交钥匙、12/23 起租：10 × 100 − 8 × 120 = 40 */
  assert.equal(o.ev.best.kind, 'ext'); assert.equal(A.iso(o.ev.best.O), '2026-12-25'); assert.equal(A.iso(o.ev.best.S), '2026-12-23'); assert.equal(o.ev.best.diff, 40 * U);
});

test('同样省的排法：住外面少的优先，再看离到期近的', () => {
  /* 两边月租都 3000、无违约金：提前退一天退一天、早起租一天交一天 → 很多排法都多花 0 */
  const o = A.compute(one({ oldRent: '3000', newRent: '3000', penalty: '0', overlap: '0', s0: '2026-12-10', s1: '2026-12-20', hotel: '100' }));
  assert.equal(o.ev.best.diff, 0); assert.equal(A.iso(o.ev.best.O), '2026-12-15'); assert.equal(o.ev.best.gap, 0);
  assert.ok(A.headline(o).indexOf('不多花') > 0, A.headline(o));
});

test('补测（注入首轮漏网）：同样省时交钥匙早的优先、重叠 1 天也给改法、日期间隔边界、续住最省时标题写到期退对比', () => {
  /* 旧 150/天、新 100/天、违约金 0、续住 50/天、重叠 1 天：12/14 交（12/13 起租）= 2×100 − 150 = 50；
     12/16 交（12/15 起租）= 0 + 50 = 50；到期退 12/14 起租 = 100。前两条一样多花、都不住外面、离到期都 1 天 → 选交钥匙早的 */
  let o = A.compute(one({ oldRent: '4500', newRent: '3000', penalty: '0', extRate: '50', extMax: '1', overlap: '1', s0: '2026-12-13', s1: '2026-12-15', hotel: '' }));
  assert.equal(o.ev.cat.early.diff, 50 * U); assert.equal(o.ev.cat.onTime.diff, 100 * U);
  assert.equal(o.ev.cat.early.diff, o.ev.cat.ext.diff); assert.equal(o.ev.best.kind, 'early'); assert.equal(A.iso(o.ev.best.O), '2026-12-14');
  o = A.compute(one({ overlap: '1' }));
  assert.ok(o.actions.some((a) => a.id === 'act_overlap' && a.set.overlap === 0));
  assert.equal(A.compute(one({ s0: '2026-11-01', s1: '2026-12-31' })).ok, true);   /* 正好 60 天 */
  assert.equal(A.compute(one({ s0: '2026-11-01', s1: '2027-01-01' })).ok, false);
  assert.equal(A.compute(one({ s0: '2027-03-15', s1: '2027-03-15' })).ok, true);   /* 正好 90 天 */
  assert.equal(A.compute(one({ s0: '2027-03-16', s1: '2027-03-16' })).ok, false);
  o = A.compute(one({ oldRent: '3200', penalty: '1600', extRate: '120', extMax: '14', newRent: '3900', s0: '2026-12-18', s1: '2026-12-31', hotel: '220', move2: '300', mode: '365' }));
  assert.equal(A.headline(o), '换到公司附近：最省是 12月29日交旧房钥匙（续住 14 天），两边钥匙重叠 2 天，12月27日新房起租，比到期当天无缝换房多花 141 元。照到期日退要多花 575 元，这样省 434 元。');
});

test('日租两种口径：÷30 与 ×12÷365', () => {
  const o = A.compute(one({ mode: '365' }));
  assert.equal(o.ev.d1, 4500 * 360); assert.equal(A.yuan2(o.ev.d1), '147.95');
  assert.equal(A.yuan2(A.compute(D()).ev.d1), '150.00');
  assert.ok(A.explain(o).indexOf('月租 × 12 ÷ 365') > 0);
  assert.equal(A.yuan(U / 2), '1'); assert.equal(A.yuan(-U / 2), '−1'); assert.equal(A.yuan(U / 2 - 1), '0');
  assert.equal(A.yuan2(-1), '0.00'); assert.equal(A.yuan2(-U), '-1.00');
});

test('非法输入：逐项报错、可同时多项、日期校验', () => {
  const cases = [
    [{ oldRent: '' }, 'oldRent', '旧房月租没填'], [{ oldRent: '0' }, 'oldRent', '旧房月租要在 1～100000 元 之间'], [{ newRent: '3600.5' }, 'newRent', '新房月租要填整数'],
    [{ endDate: '2026-02-30' }, 'endDate', '旧房到期日要填日期，比如 2026-12-15'], [{ s0: '明天' }, 's0', '新房最早起租要填日期，比如 2026-12-15'],
    [{ s1: '2026-11-20' }, 's1', '新房最晚起租不能早于最早起租'], [{ s1: '2027-02-01' }, 's1', '新房最早到最晚起租最多隔 60 天'],
    [{ s0: '2027-04-01', s1: '2027-04-02' }, 's0', '新房起租和旧房到期最多差 90 天'], [{ overlap: '15' }, 'overlap', '搬家要两边钥匙都在手要在 0～14 天 之间'],
    [{ extRate: '100', extMax: '0' }, 'extMax', '最多续住要在 1～60 天 之间'], [{ penalty: '-1' }, 'penalty', '提前退的违约金要填数字'],
  ];
  for (const [o, f, msg] of cases) { const r = A.compute(one(o)); assert.equal(r.ok, false, JSON.stringify(o)); assert.equal(r.errors[0].field, f); assert.equal(r.errors[0].message, msg); }
  const r = A.compute(one({ oldRent: 'x', endDate: '', newRent: '0' }));
  assert.deepEqual(r.errors.map((e) => e.field), ['oldRent', 'endDate', 'newRent']);
  assert.equal(A.compute(null).ok, false);
});

test('输入宽容：全角数字、年月日写法、斜杠、空格、名字截 16 字', () => {
  const o = A.compute(one({ oldRent: '４５００', endDate: '2026年12月15日', s0: '2026/11/28', s1: ' 2026.12.5 ', name: '一二三四五六七八九十甲乙丙丁戊己庚辛' }));
  assert.ok(o.ok, JSON.stringify(o.errors)); assert.equal(o.P.oldRent, 4500); assert.equal(A.iso(o.P.endDate), '2026-12-15'); assert.equal(A.iso(o.P.s1), '2026-12-05');
  assert.equal(o.P.name, '一二三四五六七八九十甲乙丙丁戊己');
  assert.equal(A.compute(one({ name: '  ' })).P.name, '这次搬家');
  assert.equal(A.parseDate('2028-02-29') > 0, true); assert.ok(isNaN(A.parseDate('2027-02-29')));
  assert.equal(A.mdw(A.parseDate('2026-11-28')), '11月28日（周六）');
});

test('导出：CSV 防公式注入、MD 同口径', () => {
  const o = A.compute(one({ name: '=HYPERLINK(1)' }));
  const csv = A.toCSV(o, '2026-11-18 10:00');
  assert.ok(csv.indexOf("'=HYPERLINK(1)") > 0);
  assert.ok(csv.indexOf('旧房日租,150.00,元') > 0);
  assert.ok(csv.indexOf('提前退,2026-11-30,2026-11-28,15,0,2,0,790.00,最省') > 0, csv);
  assert.ok(csv.indexOf('续住几天再退,排不开,没填续住价（当作不能续住）') > 0);
  assert.ok(csv.indexOf('违约金,1000.00') > 0 && csv.indexOf('合计,790.00') > 0);
  assert.ok(csv.indexOf("提前 15 天退，旧房租按天退回,-2250.00") > 0);
  const md = A.toMD(A.compute(D()), 'X');
  assert.ok(md.indexOf('**' + A.headline(A.compute(D())) + '**') > 0);
  assert.ok(md.indexOf('| 到期退 | 12月15日交旧房钥匙（正好到期），两边钥匙重叠 10 天，12月5日新房起租 | 1,200 元 |') > 0);
  assert.ok(md.indexOf('- 合计：790 元') > 0);
});
