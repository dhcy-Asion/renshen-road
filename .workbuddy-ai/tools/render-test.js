/**
 * 无头渲染验证：用 @napi-rs/canvas 模拟浏览器环境，跑完整局并导出截图。
 * 只用于开发期自检，不参与游戏运行。
 */
const path = require('path');
const fs = require('fs');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

/* 无头环境默认没有中文字体，手动注册一个，否则汉字会渲染成豆腐块 */
['msyhbd.ttc', 'msyh.ttc', 'Dengb.ttf', 'Deng.ttf'].forEach(function (f) {
  const p = 'C:/Windows/Fonts/' + f;
  if (fs.existsSync(p)) {
    try { GlobalFonts.registerFromPath(p, 'sans-serif'); } catch (e) { /* ignore */ }
  }
});

const PROJ = path.resolve(__dirname, '..', '..');
const SHOTS = path.join(__dirname, 'shots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

/* ---------------- 模拟浏览器环境 ---------------- */
const W = 1080, H = 2340;
const canvas = createCanvas(W, H);
canvas.style = {};
canvas.addEventListener = function () {};
canvas.getBoundingClientRect = function () {
  return { left: 0, top: 0, width: W, height: H };
};

let NOW = 0;
let pending = null;

global.window = {
  innerWidth: W,
  innerHeight: H,
  devicePixelRatio: 1,
  addEventListener: function () {},
  requestAnimationFrame: function (fn) { pending = fn; return 1; }
};
global.document = { getElementById: function () { return canvas; } };
global.performance = { now: function () { return NOW; } };
global.requestAnimationFrame = global.window.requestAnimationFrame;

/* ---------------- 加载游戏 ---------------- */
['config', 'level', 'platform', 'render', 'ui', 'state'].forEach(function (m) {
  require(path.join(PROJ, 'js', m + '.js'));
});

const Game = global.window.Game;
const C = Game.Config;

/* ---------------- 驱动 ---------------- */
let frameNo = 0;
function step(dtMs) {
  NOW += dtMs;
  const fn = pending;
  pending = null;
  if (fn) fn(NOW);
  frameNo++;
}

function shoot(name) {
  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(SHOTS, name + '.png'), buf);
}

/* ---------------- 自动玩家 ---------------- */
const MODE = process.argv[2] === 'worst' ? 'worst' : 'best';

function autoPilot() {
  const S = Game.State;
  const playerZ = S.camZ + C.FOLLOW_DIST;
  /* 找最近一组还没处理、且在 25 米内的实体 */
  let target = null;
  for (let i = 0; i < S.entities.length; i++) {
    const e = S.entities[i];
    if (e.resolved || e.kind === 'boss') continue;
    const d = e.z - playerZ;
    if (d > 0 && d < 25) {
      if (!target || d < target.d) target = { d: d, e: e };
    }
  }
  if (!target) return null;
  /* 找同组的目标角色：best 模式挑友好里分值最高的，worst 模式挑危险里分值最高的 */
  const want = MODE === 'worst' ? 'danger' : 'friendly';
  let lane = null, best = -Infinity;
  for (let i = 0; i < S.entities.length; i++) {
    const e = S.entities[i];
    if (e.kind !== want) continue;
    if (Math.abs(e.z - target.e.z) > 0.001) continue;
    if (e.value > best) { best = e.value; lane = e.lane; }
  }
  if (lane === null) return null;
  if (target.d < 18 && S.playerLane !== lane) {
    S.playerLane = lane;
    S.playerX = lane * C.LANE_W;
  }
  return target;
}

/* ---------------- 跑一局 ---------------- */
Game.Main.start();
console.log('phase after start =', Game.State.phase, '| 视口', Game.State.W.toFixed(0) + '×' + Game.State.H.toFixed(0), '| 地平线', Game.State.horizon.toFixed(0));
step(16);
shoot('1-ready');

Game.Main.startGame();
console.log('phase after startGame =', Game.State.phase);

const marks = [1.0, 4.5, 12, 20, 26, 29];
const dt = 1000 / 60;
let t = 0, mi = 0;
let guard = 0;
const trace = [];

while (guard++ < 3000) {
  autoPilot();
  step(dt);
  t += dt / 1000;

  if (mi < marks.length && t >= marks[mi]) {
    shoot('2-run-' + String(mi + 1) + 's');
    trace.push('t=' + t.toFixed(1) + 's camZ=' + Game.State.camZ.toFixed(1) +
      ' 你=' + Game.State.heroPower + ' 人神=' + Game.State.godPower +
      ' 吃' + Game.State.ateFriendly + ' 撞' + Game.State.hitDanger);
    mi++;
  }

  if (Game.State.phase === 'result') break;
  if (Game.State.phase === 'freeze') shoot('3-freeze');
}

shoot('4-result');

const S = Game.State;
console.log('\n--- 行程轨迹 ---');
trace.forEach(function (l) { console.log(l); });
console.log('\n--- 终局 ---');
console.log('phase      =', S.phase);
console.log('主角战力   =', S.heroPower, '(初始 ' + C.HERO_BASE + ' + 吃到 ' + S.ateFriendly + ' 个友好角色的分值)');
console.log('人神战力   =', S.godPower, '(初始 ' + C.GOD_BASE + ' + 撞到 ' + S.hitDanger + ' 个危险角色的分值)');
console.log('结果       =', S.win ? '胜利' : '失败');
console.log('总耗时     =', t.toFixed(1) + ' 秒');
console.log('截图已存到 =', SHOTS);
