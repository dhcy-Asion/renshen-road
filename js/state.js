/**
 * 游戏状态机 + 主循环 + 碰撞判定。
 */
(function (root) {
  root.Game = root.Game || {};
  var C = root.Game.Config;
  var G = root.Game;

  var S = {
    /* 世界 */
    camZ: 0,
    entities: [],
    dangerTotal: 0,
    dangerValueTotal: 0,

    /* 主角 */
    playerLane: 0,      // 逻辑车道（-1/0/1），碰撞用这个，瞬移
    playerX: 0,         // 逻辑世界 x
    visualX: 0,         // 渲染用 x，做极短的视觉插值，避免硬跳

    /* 战力 */
    heroPower: 0,
    godPower: 0,
    ateFriendly: 0,
    hitDanger: 0,

    /* 流程 */
    phase: 'ready',     // ready | running | freeze | result
    win: false,
    freezeUntil: 0,

    /* 表现 */
    flash: 0,
    heroPulse: 0,
    godPulse: 0,

    /* 视口 */
    W: C.DESIGN_W,
    H: 1920,
    horizon: 691,

    lastT: -1           // -1 = 还没跑过第一帧（不能用 0，raf 的首个时间戳可能就是 0）
  };
  G.State = S;

  /* ------------------------------ 生命周期 ------------------------------ */

  function syncViewport() {
    S.W = G.Platform.W;
    S.H = G.Platform.H;
    S.horizon = S.H * C.HORIZON_RATIO;
  }

  function reset() {
    S.camZ = 0;
    S.entities = G.Level.build();
    S.dangerTotal = 0;        // 危险角色个数
    S.dangerValueTotal = 0;   // 危险角色分值总和（血条满格用这个，兼容每个角色分值不同的情况）
    for (var i = 0; i < S.entities.length; i++) {
      if (S.entities[i].kind === 'danger') {
        S.dangerTotal++;
        S.dangerValueTotal += S.entities[i].value;
      }
    }

    S.playerLane = 0;
    S.playerX = 0;
    S.visualX = 0;

    S.heroPower = C.HERO_BASE;
    S.godPower = C.GOD_BASE;
    S.ateFriendly = 0;
    S.hitDanger = 0;

    S.win = false;
    S.freezeUntil = 0;
    S.flash = 0;
    S.heroPulse = 0;
    S.godPulse = 0;
  }

  function startGame() {
    reset();
    S.phase = 'running';
    G.UI.resetButtons();
  }

  /* -------------------------------- 操作 -------------------------------- */

  function moveLane(dir) {
    var next = S.playerLane + dir;
    if (next < -1) next = -1;
    if (next > 1) next = 1;
    if (next === S.playerLane) return;
    S.playerLane = next;
    S.playerX = next * C.LANE_W;   // 逻辑上瞬移，渲染层做极短插值
  }

  function onTap(x, y) {
    if (S.phase === 'ready') {
      if (G.UI.hitButton('start', x, y)) startGame();
    } else if (S.phase === 'result') {
      if (G.UI.hitButton('retry', x, y)) startGame();
    } else if (S.phase === 'running') {
      moveLane(x < S.W / 2 ? -1 : 1);
    }
  }

  function onSwipeLR(dir) {
    if (S.phase === 'running') moveLane(dir);
  }

  /* ------------------------------ 碰撞判定 ------------------------------ */

  function enterFreeze() {
    S.phase = 'freeze';
    S.freezeUntil = G.Platform.now() + C.FREEZE_MS;
    S.flash = 1;
  }

  function updateRunning(dt) {
    S.camZ += C.SPEED * dt;
    var playerZ = S.camZ + C.FOLLOW_DIST;

    for (var i = 0; i < S.entities.length; i++) {
      var e = S.entities[i];
      if (e.resolved) continue;

      /* 人神：堵在终点，必碰 */
      if (e.kind === 'boss') {
        if (playerZ >= e.z - C.HIT_Z) {
          e.resolved = true;
          e.hitHero = true;
          enterFreeze();
          return;
        }
        continue;
      }

      /* 已经越过主角 → 错过，不再处理 */
      if (e.z < playerZ - C.HIT_Z) {
        e.resolved = true;
        continue;
      }

      /* 命中判定：纵向贴近 + 横向在宽容阈值内 */
      var hitZ = Math.abs(e.z - playerZ) < C.HIT_Z;
      var hitX = Math.abs(e.x - S.playerX) < C.LANE_W * C.HIT_X;
      if (hitZ && hitX) {
        e.resolved = true;
        e.hitHero = true;
        if (e.kind === 'friendly') {
          S.heroPower += e.value;
          S.ateFriendly++;
          S.heroPulse = 1;
        } else {
          S.godPower += e.value;
          S.hitDanger++;
          S.godPulse = 1;
          S.flash = 1;
        }
      }
    }
  }

  /* -------------------------------- 更新 -------------------------------- */

  function decay(dt) {
    if (S.flash > 0) S.flash = Math.max(0, S.flash - dt * 3.2);
    if (S.heroPulse > 0) S.heroPulse = Math.max(0, S.heroPulse - dt * 2.2);
    if (S.godPulse > 0) S.godPulse = Math.max(0, S.godPulse - dt * 1.6);

    /* 渲染用 x 的极短插值：约 0.1 秒到位，消除瞬移的硬跳感 */
    var k = 1 - Math.exp(-dt / C.LANE_LERP);
    S.visualX += (S.playerX - S.visualX) * k;
    if (Math.abs(S.playerX - S.visualX) < 0.002) S.visualX = S.playerX;
  }

  function update(dt) {
    decay(dt);

    if (S.phase === 'running') {
      updateRunning(dt);
    } else if (S.phase === 'freeze') {
      if (G.Platform.now() >= S.freezeUntil) {
        S.win = S.heroPower > S.godPower;
        S.phase = 'result';
        G.UI.resetButtons();
      }
    }
  }

  /* ------------------------------ 主循环 ------------------------------ */

  function frame(t) {
    /* 不信任 raf 回调的时间戳：各平台给的值不保证同源，万一是 undefined
     * 就会让 dt 恒为 0 —— 表现是「点了开始但画面一动不动」。拿不到就自计时。 */
    if (typeof t !== 'number' || !isFinite(t)) t = G.Platform.now();
    if (S.lastT < 0) S.lastT = t;          // 首帧只对齐基准，不产生位移

    var dt = (t - S.lastT) / 1000;
    S.lastT = t;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;   // 切后台回来时防止瞬移一大截

    update(dt);

    var ctx = G.Platform.ctx;
    G.Platform.clear();
    G.Render.drawScene(ctx);
    G.UI.draw(ctx);

    G.Platform.raf(frame);
  }

  /* ------------------------------- 启动 ------------------------------- */

  function start() {
    G.Platform.init();
    if (G.Characters) G.Characters.preload();
    syncViewport();
    reset();
    S.phase = 'ready';
    S.lastT = -1;

    if (!G.Platform.isTT) {
      window.addEventListener('resize', function () {
        G.Platform.init();
        syncViewport();
      });
      /* 方便在电脑上调试 */
      window.addEventListener('keydown', function (e) {
        var k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') onSwipeLR(-1);
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') onSwipeLR(1);
        else if (k === ' ' || k === 'Enter') {
          if (S.phase === 'ready' || S.phase === 'result') startGame();
        }
      });
    }

    G.Platform.onSwipe(onTap, onSwipeLR);
    G.Platform.raf(frame);
  }

  G.Main = {
    start: start,
    startGame: startGame,
    moveLane: moveLane
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
