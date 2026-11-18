/* 封面 cover.svg（1200×1200）：时间线与读数来自 core.js 同一次 compute；再用浏览器截成 cover.png。 */
const fs = require('node:fs');
const A = require('./core.js');
const o = A.compute(A.defaultState()), P = o.P, b = o.ev.best, t = o.ev.cat.onTime;
if (!o.ok || b.diff !== 790 * A.U || t.diff !== 1200 * A.U) throw new Error('默认场景不对');
const F = "-apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
const lo = Math.min(b.O, b.S, P.endDate) - 2, hi = Math.max(b.O, b.S, P.endDate) + 2, n = hi - lo + 1, x0 = 230, W = 830, cw = W / n;
const lane = (y, c, on) => Array.from({ length: n }, (_, i) => { const d = lo + i, ov = d >= b.S && d < b.O; return `<rect x="${(x0 + i * cw).toFixed(1)}" y="${y}" width="${(cw - 3).toFixed(1)}" height="56" rx="4" fill="${on(d) ? c : '#f1efe9'}"${ov ? ' stroke="#2f6b4f" stroke-width="4"' : ''}/>` + (d === P.endDate ? `<rect x="${(x0 + i * cw).toFixed(1)}" y="${y + 50}" width="${(cw - 3).toFixed(1)}" height="6" fill="#a8372b"/>` : ''); }).join('');
const lab = (d, y) => `<text x="${(x0 + (d - lo + 0.5) * cw).toFixed(1)}" y="${y}" text-anchor="middle" font-family="${F}" font-size="26" fill="#868c91">${A.md(d)}</text>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" fill="#f2f1ec"/>
  <rect x="60" y="60" width="1080" height="1080" rx="18" fill="#fffefb"/>
  <text x="140" y="230" font-family="${F}" font-size="120" font-weight="800" fill="#22262a">从退租到起租</text>
  <text x="140" y="305" font-family="${F}" font-size="40" fill="#4f565c">旧房到期和新房起租对不上，哪天交钥匙最省</text>
  <text x="140" y="420" font-family="${F}" font-size="34" fill="#4f565c">旧房 ${A.fmt(P.oldRent, 0)} 元/月 ${A.md(P.endDate)}到期 · 新房 ${A.fmt(P.newRent, 0)} 元/月</text>
  <text x="140" y="500" font-family="${F}" font-size="58" font-weight="800" fill="#2f6b4f">多花 ${A.yuan(b.diff)} 元<tspan fill="#868c91" font-size="40" font-weight="400">　照到期退要 ${A.yuan(t.diff)} 元</tspan></text>
  <text x="140" y="625" font-family="${F}" font-size="34" font-weight="700" fill="#4f565c">旧房</text>${lane(588, '#c9873e', (d) => d < b.O)}
  <text x="140" y="705" font-family="${F}" font-size="34" font-weight="700" fill="#4f565c">新房</text>${lane(668, '#3d6f8f', (d) => d >= b.S)}
  ${lab(b.S, 760)}${lab(b.O, 795)}${lab(P.endDate, 760)}
  <rect x="140" y="830" width="920" height="200" rx="14" fill="#dcefe4"/>
  <text x="180" y="900" font-family="${F}" font-size="38" fill="#2f6b4f">→ ${A.md(b.O)}交钥匙（提前 ${b.early} 天，违约金 ${A.fmt(P.penalty, 0)}）</text>
  <text x="180" y="975" font-family="${F}" font-size="38" fill="#2f6b4f">→ ${A.md(b.S)}新房起租，两边钥匙重叠 ${b.overlapDays} 天</text>
  <text x="140" y="1090" font-family="${F}" font-size="24" fill="#868c91">房租按天折算的粗算 · 数字是虚构示例 · 以合同为准</text>
</svg>`;
fs.writeFileSync('cover.svg', svg);
fs.writeFileSync('cover-shot.html', '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0}</style></head><body>' + svg + '</body></html>');
console.log('cover.svg', svg.length);
