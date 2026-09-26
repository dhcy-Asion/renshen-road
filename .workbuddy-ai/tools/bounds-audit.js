/**
 * 画面越界审计 —— 开发期自检用，不参与游戏运行。
 *
 * 做法：劫持 2D context 的 fillText，把每一次文字绘制的包围盒记下来，
 * 跑完整局后统计哪些帧有文字超出逻辑屏幕范围（会被屏幕边缘切掉）。
 *
 * 用法：node bounds-audit.js
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
const CSS_W = 390, CSS_H = 844, DPR = 3;
const PHYS_W = CSS_W * DPR, PHYS_H = CSS_H * DPR;

let NOW = 0, pending = null;
Date.now = function () { return 1750000000000 + NOW; };
global.performance = { now: function () { return NOW; } };
global.requestAnimationFrame = function (fn) { pending = fn; return 1; };

const canvas = createCanvas(PHYS_W, PHYS_H);
canvas.style = {};
canvas.addEventListener = function () {};
canvas.getBoundingClientRect = function () { return { left: 0, top: 0, width: CSS_W, height: CSS_H }; };

global.GameGlobal = {};
global.tt = {
  createCanvas: function () { return canvas; },
  getSystemInfoSync: function () {
    /* 按官方文档：宽高一律是逻辑分辨率，物理 = 逻辑 × pixelRatio */
    return { windowWidth: CSS_W, windowHeight: CSS_H, screenWidth: CSS_W, screenHeight: CSS_H, pixelRatio: DPR };
  },
  onTouchStart: function () {}, onTouchEnd: function () {}, onTouchCancel: function () {}
};

['config', 'level', 'platform', 'render', 'ui', 'state'].forEach(function (m) {
  require(path.join(PROJ, 'js', m + '.js'));
});
const Game = global.GameGlobal.Game;
const C = Game.Config;

/* 劫持 fillText 记录包围盒 */
const ctx = canvas.getContext('2d');
const realFillText = ctx.fillText.bind(ctx);
const realMeasure = ctx.measureText.bind(ctx);
let currentFrame = 0;
const problems = [];

ctx.fillText = function (text, x, y) {
  if (text && String(text).trim()) {
    const m = ctx.font.match(/([\d.]+)px/);
    const fontPx = m ? parseFloat(m[1]) : 0;
    const w = realMeasure(String(text)).width;
    const left = x - w / 2, right = x + w / 2;
    const top = y - fontPx, bottom = y + fontPx * 0.25;
    if (left < -0.5 || right > Game.State.W + 0.5 || top < -0.5 || bottom > Game.State.H + 0.5) {
      problems.push({
        frame: currentFrame, text: String(text),
        left: Math.round(left), right: Math.round(right),
        top: Math.round(top), bottom: Math.round(bottom),
        W: Math.round(Game.State.W), H: Math.round(Game.State.H),
        camZ: Game.State.camZ.toFixed(1)
      });
    }
  }
  return realFillText(text, x, y);
};

function step(dtMs) {
  NOW += dtMs;
  const fn = pending; pending = null;
  if (fn) fn(NOW);
  currentFrame++;
}

Game.Main.start();
step(16);
/* 开始界面 / 结算界面静态各扫一遍 */
for (let i = 0; i < 3; i++) step(16);

Game.Main.startGame();
let guard = 0;
while (Game.State.phase !== 'result' && guard++ < 3000) step(1000 / 60);
for (let i = 0; i < 5; i++) step(16);

console.log('总帧数 =', currentFrame);
console.log('越界文字次数 =', problems.length);
if (problems.length) {
  /* 按文字聚合，避免刷屏 */
  const byText = {};
  problems.forEach(function (p) {
    const k = p.text;
    if (!byText[k]) byText[k] = { n: 0, minLeft: 1e9, maxRight: -1e9, sample: p };
    byText[k].n++;
    byText[k].minLeft = Math.min(byText[k].minLeft, p.left);
    byText[k].maxRight = Math.max(byText[k].maxRight, p.right);
    byText[k].sample = p;
  });
  Object.keys(byText).forEach(function (k) {
    const v = byText[k];
    console.log('  「' + k + '」 越界 ' + v.n + ' 帧  最左=' + v.minLeft + ' 最右=' + v.maxRight +
      '  (屏幕宽 ' + v.sample.W + ', camZ≈' + v.sample.camZ + ')');
  });
} else {
  console.log('  没有文字被屏幕切掉。');
}
