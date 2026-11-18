#!/usr/bin/env python3
"""从退租到起租 · 独立参考实现（按需求简报文字规则重写，不读 core.js）。
用 datetime.date 逐日算、Fraction 算钱（不用 core.js 的「整数计算单位」），生成 300 组 → tests/ref.json。
规则：
  日租 = 月租/30 或 月租*12/365
  对每个交钥匙日 O（不能提前退则 O>=E；能提前退最多往前 90 天；能续住最多往后 extMax 天）和起租日 S∈[s0,s1]：
    走得通 ⇔ 重叠天数 (O−S) ≥ 搬家天数，或 (S>O 且填了住外面每晚价)
    多花 = (E−S)·新日租 − max(E−O,0)·旧日租 + [O<E]·违约金 + max(O−E,0)·续住价 + max(S−O,0)·每晚价 + [S>O]·多搬一次
  最省：多花最小 → 住外面晚数少 → |O−E| 小 → O 早 → S 晚
  三类（提前退 / 到期退 / 续住）各取同样排序的第一名
"""
import json, random
from datetime import date, timedelta
from fractions import Fraction as F


def d(s):
    return date.fromisoformat(s)


def opt(st, k):
    return None if st.get(k, '') == '' else int(st[k])


def solve(st):
    E = d(st['endDate'])
    s0, s1 = d(st['s0']), d(st['s1'])
    pen, ext, hotel = opt(st, 'penalty'), opt(st, 'extRate'), opt(st, 'hotel')
    ext_max = int(st['extMax']) if ext is not None else 0
    move2 = (opt(st, 'move2') or 0) if hotel is not None else 0
    k = int(st['overlap'])
    if st['mode'] == '365':
        d1, d2 = F(int(st['oldRent']) * 12, 365), F(int(st['newRent']) * 12, 365)
    else:
        d1, d2 = F(int(st['oldRent']), 30), F(int(st['newRent']), 30)
    o_lo = E - timedelta(days=90) if pen is not None else E
    o_hi = E + timedelta(days=ext_max)
    plans = []
    O = o_lo
    while O <= o_hi:
        S = s0
        while S <= s1:
            ok = (O - S).days >= k or (hotel is not None and S > O)
            if ok:
                early = max((E - O).days, 0)
                extd = max((O - E).days, 0)
                gap = max((S - O).days, 0)
                cost = (E - S).days * d2 - early * d1 + (pen if early else 0) + extd * (ext or 0) + gap * (hotel or 0) + (move2 if gap else 0)
                kind = 'early' if early else ('ext' if extd else 'onTime')
                plans.append({'O': O, 'S': S, 'cost': cost, 'gap': gap, 'kind': kind})
            S += timedelta(days=1)
        O += timedelta(days=1)
    key = lambda p: (p['cost'], p['gap'], abs((p['O'] - E).days), p['O'], -p['S'].toordinal())
    out = {'count': len(plans), 'best': None, 'cat': {}}
    if plans:
        b = min(plans, key=key)
        out['best'] = pack(b)
    for kd in ('early', 'onTime', 'ext'):
        c = [p for p in plans if p['kind'] == kd]
        out['cat'][kd] = pack(min(c, key=key)) if c else None
    return out


def pack(p):
    return {'O': p['O'].isoformat(), 'S': p['S'].isoformat(), 'cost': float(p['cost']), 'costNum': p['cost'].numerator, 'costDen': p['cost'].denominator, 'gap': p['gap']}


def case(r):
    E = date(2026, 1, 1) + timedelta(days=r.randint(0, 700))
    s0 = E + timedelta(days=r.randint(-25, 20))
    st = {
        'name': 'x', 'oldRent': str(r.choice([1500, 2200, 3000, 3600, 4500, 6000, r.randint(500, 12000)])), 'endDate': E.isoformat(),
        'penalty': str(r.choice([0, 500, 1000, 2000, r.randint(0, 6000)])) if r.random() < .6 else '',
        'extRate': str(r.choice([80, 100, 150, 200, r.randint(0, 400)])) if r.random() < .45 else '', 'extMax': str(r.randint(1, 20)),
        'newRent': str(r.choice([1800, 2500, 3300, 3600, 5000, r.randint(500, 12000)])), 's0': s0.isoformat(),
        's1': (s0 + timedelta(days=r.randint(0, 15))).isoformat(), 'overlap': str(r.randint(0, 4)),
        'hotel': str(r.choice([0, 120, 200, 300, r.randint(50, 800)])) if r.random() < .6 else '',
        'move2': str(r.choice([0, 300, 500, r.randint(0, 1500)])) if r.random() < .7 else '', 'mode': r.choice(['30', '365']),
    }
    return st


def main():
    r = random.Random(20261118)
    cases, stats = [], {'early': 0, 'onTime': 0, 'ext': 0, 'none': 0, 'gap': 0}
    while len(cases) < 300:
        st = case(r)
        x = solve(st)
        b = x['best']
        if b is None:
            stats['none'] += 1
        else:
            kd = [k for k, v in x['cat'].items() if v == b][0]
            stats[kd] += 1
            if b['gap']:
                stats['gap'] += 1
        cases.append({'state': st, 'expect': x})
    json.dump({'stats': stats, 'cases': cases}, open(__file__.replace('ref.py', 'ref.json'), 'w'), ensure_ascii=False)
    print(stats)


if __name__ == '__main__':
    main()
