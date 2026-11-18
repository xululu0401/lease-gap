'use strict';
/* 注入测试：对 core.js 做一处小改动，看核心测试能不能抓到。跑完自动还原。
 * 首轮 21/28：两处等价变异已删（不能续住时 extMax 已置 0，oHi 守卫恒等；元的四舍五入两种写法在整数单位下等价）；
 * 交钥匙早优先、重叠 1 天的改法、60/90 天边界、续住最省时的标题 → 补测。 */
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const F=path.join(__dirname,'../core.js'),src=fs.readFileSync(F,'utf8');
const M=[
["return rent * (P.mode === '365' ? 360 : 365);","return rent * (P.mode === '365' ? 365 : 365);"],
["newLead: d2 * lead,","newLead: d2 * Math.max(lead, 0),"],
["earlySave: -d1 * early,","earlySave: 0,"],
["penalty: early ? P.penalty * U : 0,","penalty: 0,"],
["ext: ext ? P.extRate * U * ext : 0,","ext: ext ? P.extRate * U : 0,"],
["gap: gap ? P.hotel * U * gap : 0,","gap: gap ? P.hotel * U * (gap - 1) : 0,"],
["move2: gap ? P.move2 * U : 0","move2: 0"],
["return S <= O - P.overlap ||","return S < O - P.overlap ||"],
["(P.hotel !== null && S > O)","(S > O)"],
["var oLo = P.penalty !== null ? E - EARLY_MAX : E","var oLo = E - EARLY_MAX"],
["if (a.gap !== b.gap) return a.gap < b.gap;",""],
["if (da !== db) return da < db;",""],
["if (a.O !== b.O) return a.O < b.O;","if (a.O !== b.O) return a.O > b.O;"],
["for (var S = P.s0; S <= P.s1; S++)","for (var S = P.s0; S < P.s1; S++)"],
["if (cur !== null && x.best.diff >= cur) return;",""],
["if (P.overlap > 0) add(","if (P.overlap > 1) add("],
["var r = Math.ceil(ev.d1 / U);","var r = Math.floor(ev.d1 / U) + 1;"],
["if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return NaN;",""],
["else if (P.s1 - P.s0 > 60)","else if (P.s1 - P.s0 > 61)"],
["Math.abs(P.s0 - P.endDate) > 90","Math.abs(P.s0 - P.endDate) > 91"],
["P.move2 = P.hotel === null ? 0 :","P.move2 = "],
["var T = other.diff - (cat.early.diff - P.penalty * U);","var T = other.diff - cat.early.diff;"],
["var x = Math.ceil(e.pe.T / U) - 1;","var x = Math.floor(e.pe.T / U);"],
["if (/^[=+\\-@]/.test(x) && !/^-\\d+(\\.\\d+)?$/.test(x)) x = \"'\" + x;",""],
[".slice(0, 16).trim() || '这次搬家'",".trim() || '这次搬家'"],
["if (b.kind !== 'onTime')","if (b.kind === 'early')"],
];
let caught=0;const rows=[];
for(const [a,b] of M){
  if(src.indexOf(a)<0){rows.push('✗ 找不到原文：'+a.slice(0,80));continue;}
  fs.writeFileSync(F,src.replace(a,b));
  let ok=true;try{execFileSync('node',['--test',path.join(__dirname,'core.test.cjs')],{stdio:'pipe',timeout:120000});}catch(e){ok=false;}
  rows.push((ok?'✗ 没抓到':'✓ 抓到')+'：'+a.slice(0,70)+' → '+b.slice(0,70));if(!ok)caught++;
}
fs.writeFileSync(F,src);
console.log(rows.join('\n'));console.log('合计 '+caught+'/'+M.length);
