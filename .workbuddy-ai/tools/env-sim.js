/**
 * 双端环境模拟器 —— 开发期自检用，不参与游戏运行。
 *
 * 与 render-test.js 的区别：render-test 只验证「渲染 + 状态机」，
 * 它把 addEventListener 直接 stub 成空函数，所以**永远走不到触摸回调**。
 * 本工具补齐这一块：真实地派发触摸 / 鼠标事件，并把抖音（tt）与浏览器
 * 两条分支都跑一遍，用来抓「真机上才炸」的问题。
 *
 * 用法：
 *   node env-sim.js tt        模拟抖音小游戏环境
 *   node env-sim.js browser   模拟浏览器环境
 */
const path = require('path');
const fs = require('fs');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const MODE = process.argv[2] === 'browser' ? 'browser' : 'tt';
const PROJ = path.resolve(__dirname, '..', '..');
const MODS = ['config', 'level', 'platform', 'render', 'ui', 'state'];

/* 无头环境没有中文字体，注册一个 */
['msyhbd.ttc', 'msyh.ttc', 'Dengb.ttf', 'Deng.ttf'].forEach(function (f) {
  const p = 'C:/Windows/Fonts/' + f;
  if (fs.existsSync(p)) {
    try { GlobalFonts.registerFromPath(p, 'sans-serif'); } catch (e) { /* ignore */ }
  }
});

const CSS_W = 390, CSS_H = 844;      // 逻辑 CSS 尺寸（iPhone 14 一类的竖屏）
const PHYS_W = 1080, PHYS_H = 2340;  // 物理像素

let NOW = 0;
let pending = null;

/* 让 Date.now() 也跟着模拟时钟走，否则抖音分支（无 performance 时退回
 * Date.now）会拿真实墙上时间跟模拟时钟比，定格阶段永远等不到结束。 */
const EPOCH = 1750000000000;
Date.now = function () { return EPOCH + NOW; };

function makeCanvas() {
  const c = createCanvas(PHYS_W, PHYS_H);
  c.style = {};
  c._listeners = {};
  c.addEventListener = function (type, fn) {
    (c._listeners[type] = c._listeners[type] || []).push(fn);
  };
  c.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: CSS_W, height: CSS_H };
  };
  return c;
}

const theCanvas = makeCanvas();

/* ------------------------- 环境装配 ------------------------- */

const ttHandlers = {};

if (MODE === 'tt') {
  global.GameGlobal = {};
  global.tt = {
    createCanvas: function () { return theCanvas; },
    getSystemInfoSync: function () {
      /* 按官方文档：所有宽高都是「逻辑分辨率」，物理 = 逻辑 × pixelRatio。
       * 所以这里返回的是 CSS 尺寸，不是物理尺寸。 */
      return {
        windowWidth: CSS_W, windowHeight: CSS_H,
        screenWidth: CSS_W, screenHeight: CSS_H,
        pixelRatio: PHYS_W / CSS_W
      };
    },
    onTouchStart: function (fn) { ttHandlers.start = fn; },
    onTouchEnd: function (fn) { ttHandlers.end = fn; },
    onTouchCancel: function (fn) { ttHandlers.cancel = fn; }
  };
} else {
  global.window = {
    innerWidth: CSS_W,
    innerHeight: CSS_H,
    devicePixelRatio: PHYS_W / CSS_W,
    _listeners: {},
    addEventListener: function (type, fn) {
      (this._listeners[type] = this._listeners[type] || []).push(fn);
    }
  };
  global.document = { getElementById: function () { return theCanvas; } };
  global.performance = { now: function () { return NOW; } };
}

global.requestAnimationFrame = function (fn) { pending = fn; return 1; };
if (MODE !== 'tt') global.window.requestAnimationFrame = global.requestAnimationFrame;
/* 抖音小游戏里 performance.now() 也是可用的，这里一并接到模拟时钟上 */
global.performance = { now: function () { return NOW; } };

/* ------------------------- 加载游戏 ------------------------- */

MODS.forEach(function (m) { require(path.join(PROJ, 'js', m + '.js')); });
const Game = (MODE === 'tt' ? global.GameGlobal : global.window).Game;

/* ------------------------- 事件派发 ------------------------- */

function dispatch(type, clientX, clientY) {
  if (MODE === 'tt') {
    const fn = ttHandlers[type];
    if (!fn) throw new Error('tt 未注册 ' + type + ' 回调');
    const touch = { clientX: clientX, clientY: clientY };
    fn({ touches: [touch], changedTouches: [touch] });
  } else {
    const fns = theCanvas._listeners[type] || [];
    if (!fns.length) throw new Error('浏览器版未在 canvas 上注册 ' + type + ' 监听');
    const touch = { clientX: clientX, clientY: clientY };
    fns.forEach(function (fn) {
      fn({ touches: [touch], changedTouches: [touch] });
    });
  }
}

/* 逻辑坐标 → 事件里的 CSS 坐标（真机上 clientX/Y 就是 CSS 像素） */
function toCss(x, y) {
  return { x: x * (CSS_W / Game.State.W), y: y * (CSS_H / Game.State.H) };
}

function tap(x, y) {
  const p = toCss(x, y);
  dispatch(MODE === 'tt' ? 'start' : 'touchstart', p.x, p.y);
  dispatch(MODE === 'tt' ? 'end' : 'touchend', p.x, p.y);
}

function swipe(x, y, dx) {
  const a = toCss(x, y);
  const b = toCss(x + dx, y);
  dispatch(MODE === 'tt' ? 'start' : 'touchstart', a.x, a.y);
  dispatch(MODE === 'tt' ? 'end' : 'touchend', b.x, b.y);
}

/* ------------------------- 驱动 ------------------------- */

function step(dtMs) {
  NOW += dtMs;
  const fn = pending;
  pending = null;
  if (fn) fn(NOW);
}

function run(label, fn) {
  try {
    fn();
    console.log('  [OK]   ' + label);
    return true;
  } catch (e) {
    console.log('  [FAIL] ' + label + '  →  ' + e.name + ': ' + e.message);
    console.log('         ' + String(e.stack).split('\n').slice(1, 4).join('\n         ').trim());
    return false;
  }
}

console.log('=== 环境: ' + MODE + ' ===');

run('加载 6 个模块 + Main.start()', function () { Game.Main.start(); });

console.log('  视口: 逻辑 ' + Game.State.W + '×' + Game.State.H.toFixed(0) +
  ' / CSS ' + Game.Platform.cssW + '×' + Game.Platform.cssH +
  ' / 背衬 ' + theCanvas.width + '×' + theCanvas.height +
  ' / scale ' + Game.Platform.scale.toFixed(3));
console.log('  背衬像素比 = ' + (theCanvas.width / Game.Platform.cssW).toFixed(2) +
  'x（设备 ' + (PHYS_W / CSS_W) + 'x，越接近越好）');

run('渲染第一帧', function () { step(16); });

const S = Game.State;
const b = Game.UI.__buttons ? Game.UI.__buttons() : null;

/* 点「开始」按钮：按钮矩形由 drawReady 在上一帧写入，位置取屏幕中心 */
run('点击「开始」按钮', function () {
  tap(Game.State.W / 2, Game.State.H * 0.84);
});
console.log('  phase = ' + S.phase + '（期望 running）');

run('游戏中途点击右半屏切道', function () {
  step(16);
  tap(S.W * 0.75, S.H * 0.6);
});
console.log('  playerLane = ' + S.playerLane + '（期望 1）');

run('游戏中途点击左半屏切道', function () {
  tap(S.W * 0.25, S.H * 0.6);
});
console.log('  playerLane = ' + S.playerLane + '（期望 0）');

run('左右滑动切道', function () {
  swipe(S.W * 0.5, S.H * 0.6, 90);
});
console.log('  playerLane = ' + S.playerLane + '（期望 1）');

if (MODE === 'browser') {
  /* 触屏设备的真实事件序列：touchstart/touchend 之后浏览器还会补发
     mousedown/mouseup。如果不拦，一次点击会被处理两遍。 */
  run('触屏点一下（含浏览器补发的鼠标事件）只切一格', function () {
    const before = S.playerLane;
    const p = toCss(S.W * 0.25, S.H * 0.6);   // 左半屏 → 应该只往左走一格
    dispatch('touchstart', p.x, p.y);
    dispatch('touchend', p.x, p.y);
    dispatch('mousedown', p.x, p.y);          // 补发
    dispatch('mouseup', p.x, p.y);            // 补发
    const moved = S.playerLane - before;
    if (moved !== -1) throw new Error('切了 ' + moved + ' 格（期望 -1 格）');
  });
  console.log('  playerLane = ' + S.playerLane + '（期望 0）');
}

run('跑完整局（跑到结算）', function () {
  let guard = 0;
  while (S.phase !== 'result' && guard++ < 3000) step(1000 / 60);
  if (S.phase !== 'result') throw new Error('30 秒内没跑到 result，卡在 ' + S.phase);
});
console.log('  你=' + S.heroPower + ' 人神=' + S.godPower + ' → ' + (S.win ? '胜利' : '失败'));

run('结算界面点「再来一次」', function () {
  step(16);
  tap(S.W / 2, S.H * 0.80);
});
console.log('  phase = ' + S.phase + '（期望 running）');
