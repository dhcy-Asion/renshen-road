/**
 * 从 js/level.js 导出关卡布局表（CSV）。
 * level.js 是唯一数据源，改完关卡跑一下这个脚本即可，保证两边不会走偏。
 *
 *   node .workbuddy-ai/tools/export-level.js
 */
const path = require('path');
const fs = require('fs');

const PROJ = path.resolve(__dirname, '..', '..');
global.GameGlobal = global;
require(path.join(PROJ, 'js', 'config.js'));
require(path.join(PROJ, 'js', 'level.js'));

const C = global.Game.Config;
const L = global.Game.Level;
const LANE = { '-1': '左', '0': '中', '1': '右' };

const rows = [['距离(米)', '车道', '角色', '类别', '分值', '分值加到', '本组空道']];

L.GROUPS.forEach(function (g) {
  const used = [g.a.lane, g.b.lane];
  const empty = [-1, 0, 1].filter(l => used.indexOf(l) < 0).map(l => LANE[l]).join('/');
  [g.a, g.b].forEach(function (x) {
    const friendly = x.id.charAt(0) === 'f';
    rows.push([
      g.z,
      LANE[x.lane],
      L.NAMES[x.id],
      friendly ? '友好' : '危险',
      L.gainOf(x.id, friendly ? 'friendly' : 'danger'),
      friendly ? '主角' : '人神',
      empty
    ]);
  });
});

rows.push([C.TOTAL_DISTANCE, '全部', C.BOSS_TEXT, 'boss', '—', '—', '无（必碰）']);

const csv = rows.map(r => r.join(',')).join('\n') + '\n';
fs.writeFileSync(path.join(PROJ, '关卡布局表.csv'), '\ufeff' + csv, 'utf8');
console.log(csv);

/* 顺带打印一份汇总，方便核对平衡。
 * 注意：每组只能碰 1 个角色，所以「满分」不是所有友好角色分值之和，
 * 而是「每组能拿到的最好结果」之和。 */
const ents = L.build();
const sumAll = function (kind) {
  return ents.filter(e => e.kind === kind).reduce((a, e) => a + e.value, 0);
};
const bestPerGroup = function (kind) {
  return L.GROUPS.reduce(function (acc, g) {
    const vals = [g.a, g.b].filter(x => x.id.charAt(0) === (kind === 'friendly' ? 'f' : 'd'))
      .map(x => L.gainOf(x.id, kind));
    return acc + (vals.length ? Math.max.apply(null, vals) : 0);
  }, 0);
};

const maxHero = bestPerGroup('friendly');
const maxGod = bestPerGroup('danger');

console.log('--- 汇总 ---');
console.log('友好角色 ' + ents.filter(e => e.kind === 'friendly').length + ' 个，分值合计 ' + sumAll('friendly') +
  '（但每组只能吃 1 个，满分只算得到 ' + maxHero + '）');
console.log('危险角色 ' + ents.filter(e => e.kind === 'danger').length + ' 个，分值合计 ' + sumAll('danger') +
  '（每组只能撞 1 个，最多吃到 ' + maxGod + '）');
console.log('人神血条满格     ：' + (C.GOD_BASE + sumAll('danger')));

/* ---- 容错对照表 ---- */
const per = L.GROUPS.map(function (g) {
  const fs = [g.a, g.b].filter(x => x.id.charAt(0) === 'f').map(x => L.gainOf(x.id, 'friendly'));
  const ds = [g.a, g.b].filter(x => x.id.charAt(0) === 'd').map(x => L.gainOf(x.id, 'danger'));
  return {
    bestF: fs.length ? Math.max.apply(null, fs) : 0,
    d: ds.length ? ds[0] : 0
  };
});

const judge = function (hero, god) { return hero > god ? '赢' : '输'; };
const line = function (label, hero, god) {
  return label.padEnd(24, '　') + '你 ' + String(hero).padStart(4) + '  vs  人神 ' + String(god).padStart(4) + '   → ' + judge(hero, god);
};

console.log('');
console.log('--- 容错对照表（HERO_BASE ' + C.HERO_BASE + ' / GOD_BASE ' + C.GOD_BASE + '）---');
console.log(line('完美（九组全对）', C.HERO_BASE + maxHero, C.GOD_BASE));
console.log(line('全程走空道', C.HERO_BASE, C.GOD_BASE));
console.log(line('全程认错', C.HERO_BASE, C.GOD_BASE + maxGod));

/* 走空道 N 组：按最贵/最便宜的组算区间 */
const sortedF = per.map(p => p.bestF).sort((a, b) => b - a);
console.log('');
console.log('走空道（不吃不撞）：');
for (let n = 1; n <= 5; n++) {
  const worst = sortedF.slice(0, n).reduce((a, b) => a + b, 0);   // 漏掉最贵的 n 组
  const best = sortedF.slice(-n).reduce((a, b) => a + b, 0);      // 漏掉最便宜的 n 组
  console.log('  漏 ' + n + ' 组：你 ' + (C.HERO_BASE + maxHero - worst) + ' ~ ' + (C.HERO_BASE + maxHero - best) +
    '  vs  人神 ' + C.GOD_BASE + '   → ' + (C.HERO_BASE + maxHero - worst > C.GOD_BASE ? '怎么漏都赢' : (C.HERO_BASE + maxHero - best > C.GOD_BASE ? '看漏哪几组' : '怎么漏都输')));
}

/* 认错 N 次：惩罚 = 少吃的友好分（主角少拿）+ 该危险角色的分值（人神多拿）。
 * 两者必须来自同一组，所以直接枚举组合，报最好/最坏结局。 */
const mistakeGroups = L.GROUPS.map(function (g, i) {
  return per[i].d > 0 ? { z: g.z, f: per[i].bestF, d: per[i].d } : null;
}).filter(Boolean);

function combinations(arr, k) {
  const out = [];
  (function walk(start, picked) {
    if (picked.length === k) { out.push(picked.slice()); return; }
    for (let i = start; i < arr.length; i++) {
      picked.push(arr[i]); walk(i + 1, picked); picked.pop();
    }
  })(0, []);
  return out;
}

console.log('');
console.log('认错角色（撞危险）：');
for (let n = 1; n <= 3; n++) {
  if (n > mistakeGroups.length) break;
  let minMargin = Infinity, maxMargin = -Infinity, minTxt = '', maxTxt = '';
  combinations(mistakeGroups, n).forEach(function (set) {
    const fLoss = set.reduce((a, x) => a + x.f, 0);
    const dGain = set.reduce((a, x) => a + x.d, 0);
    const hero = C.HERO_BASE + maxHero - fLoss;
    const god = C.GOD_BASE + dGain;
    const margin = hero - god;
    if (margin < minMargin) { minMargin = margin; minTxt = hero + ' vs ' + god; }
    if (margin > maxMargin) { maxMargin = margin; maxTxt = hero + ' vs ' + god; }
  });
  console.log('  错 ' + n + ' 次：最坏 ' + minTxt.padStart(13) + '（差 ' + minMargin +
    '）　最好 ' + maxTxt.padStart(13) + '（差 ' + maxMargin + '）　→ ' +
    (minMargin > 0 ? '怎么错都赢' : (maxMargin > 0 ? '看错的是哪个' : '怎么错都输')));
}
