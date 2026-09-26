/**
 * 定点截图 —— 开发期自检用，不参与游戏运行。
 *
 * 把镜头强行停在某个距离上渲染一帧并存图，用来检查「玩家必须做判断的那一刻」
 * 画面到底长什么样（这游戏的玩法就是认名字，读不出来就等于玩法失效）。
 *
 * 用法：node shot-at.js <camZ> <输出名> [主角车道]
 *   node shot-at.js 185.5 group9-15m 0
 */
const path = require('path');
const fs = require('fs');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

['msyhbd.ttc', 'msyh.ttc', 'Dengb.ttf', 'Deng.ttf'].forEach(function (f) {
  const p = 'C:/Windows/Fonts/' + f;
  if (fs.existsSync(p)) {
    try { GlobalFonts.registerFromPath(p, 'sans-serif'); } catch (e) { /* ignore */ }
  }
});

const PROJ = path.resolve(__dirname, '..', '..');
const SHOTS = path.join(__dirname, 'shots');
const CSS_W = 390, CSS_H = 844, DPR = 3;

let NOW = 0, pending = null;
Date.now = function () { return 1750000000000 + NOW; };
global.performance = { now: function () { return NOW; } };
global.requestAnimationFrame = function (fn) { pending = fn; return 1; };

const canvas = createCanvas(CSS_W * DPR, CSS_H * DPR);
canvas.style = {};
canvas.addEventListener = function () {};
canvas.getBoundingClientRect = function () { return { left: 0, top: 0, width: CSS_W, height: CSS_H }; };

global.GameGlobal = {};
global.tt = {
  createCanvas: function () { return canvas; },
  getSystemInfoSync: function () {
    return { windowWidth: CSS_W, windowHeight: CSS_H, screenWidth: CSS_W, screenHeight: CSS_H, pixelRatio: DPR };
  },
  onTouchStart: function () {}, onTouchEnd: function () {}, onTouchCancel: function () {}
};

['config', 'level', 'platform', 'render', 'ui', 'state'].forEach(function (m) {
  require(path.join(PROJ, 'js', m + '.js'));
});
const Game = global.GameGlobal.Game;
const C = Game.Config;

Game.Main.start();
const camZ = parseFloat(process.argv[2] || '185.5');
const name = process.argv[3] || ('camZ-' + camZ);
const lane = parseInt(process.argv[4] || '0', 10);

/* 拦截 fillText，记录「真正画出去」的横向范围（含 drawNameTag 的夹紧结果） */
const ctx = canvas.getContext('2d');
const realFillText = ctx.fillText.bind(ctx);
const realMeasure = ctx.measureText.bind(ctx);
const drawn = [];
ctx.fillText = function (text, x, y) {
  if (text && String(text).trim()) {
    const m = ctx.font.match(/([\d.]+)px/);
    const f = m ? parseFloat(m[1]) : 0;
    const w = realMeasure(String(text)).width;
    drawn.push({ text: String(text), font: f, left: x - w / 2, right: x + w / 2, y: y });
  }
  return realFillText(text, x, y);
};

Game.Main.startGame();
Game.State.camZ = camZ;
Game.State.playerLane = lane;
Game.State.playerX = lane * C.LANE_W;
Game.State.visualX = Game.State.playerX;

NOW += 16;
if (pending) pending(NOW);

if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
fs.writeFileSync(path.join(SHOTS, name + '.png'), canvas.toBuffer('image/png'));

/* 顺便把这一帧各实体的距离和名牌的实际落点打出来 */
const S = Game.State;
console.log('camZ=' + camZ + '  playerZ=' + (camZ + C.FOLLOW_DIST).toFixed(1) +
  '  逻辑屏 ' + S.W + '×' + S.H.toFixed(0) + '  背衬 ' + canvas.width + '×' + canvas.height);
S.entities.forEach(function (e) {
  const p = Game.Render.project(e.x, 0, e.z);
  if (!p || e.resolved) return;
  const d = drawn.find(function (x) { return x.text === e.name; });
  if (!d) { console.log('  ' + e.name + '  lane=' + e.lane + ' dz=' + p.dz.toFixed(1) + '  （未绘制）'); return; }
  const flag = (d.left < 0 || d.right > S.W) ? '  ← 出屏' : '';
  console.log('  ' + e.name.padEnd(8, '　') + ' lane=' + e.lane +
    ' dz=' + p.dz.toFixed(1).padStart(5) +
    ' 字号=' + d.font.toFixed(0).padStart(3) +
    ' 左=' + Math.round(d.left).toString().padStart(5) +
    ' 右=' + Math.round(d.right).toString().padStart(5) + flag);
});

/* 同组名牌是否互相遮挡（玩家要靠读名字做判断，被盖住就等于玩法失效）。
 * 注意要按 2D 矩形判，因为名牌可以被整体抬高错开。 */
const byZ = {};
S.entities.forEach(function (e) {
  if (e.resolved || e.kind === 'boss') return;
  const d = drawn.find(function (x) { return x.text === e.name; });
  if (!d) return;
  const f = d.font;
  (byZ[e.z] = byZ[e.z] || []).push({
    name: e.name, left: d.left, right: d.right, top: d.y - f * 1.2, bottom: d.y + f * 0.2
  });
});
Object.keys(byZ).forEach(function (z) {
  const g = byZ[z];
  if (g.length < 2) return;
  const a = g[0], b = g[1];
  const ovW = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const ovH = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (ovW > 0 && ovH > 0) {
    const ov = ovW * ovH;
    const areaA = (a.right - a.left) * (a.bottom - a.top);
    const areaB = (b.right - b.left) * (b.bottom - b.top);
    console.log('  ⚠ z=' + z + ' 同组名牌重叠 ' + Math.round(ovW) + '×' + Math.round(ovH) +
      'px —— 「' + a.name + '」被盖住 ' + Math.round(ov / areaA * 100) + '%，「' + b.name +
      '」被盖住 ' + Math.round(ov / areaB * 100) + '%');
  } else {
    console.log('  ✓ z=' + z + ' 「' + a.name + '」/「' + b.name + '」不重叠（横向错开 ' +
      Math.round(Math.min(a.right, b.right) - Math.max(a.left, b.left)) + 'px，纵向错开 ' +
      Math.round(Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) + 'px）');
  }
});
