/**
 * HUD 与界面。全部用 Canvas 绘制 —— 抖音小游戏没有 DOM，不能用 HTML 标签。
 */
(function (root) {
  root.Game = root.Game || {};
  var C = root.Game.Config;
  var G = root.Game;

  var buttons = {};   // name -> {x, y, w, h}

  function font(px, bold) {
    return (bold === false ? '' : 'bold ') + px + 'px sans-serif';
  }

  function drawButton(ctx, name, label, cx, cy, w, h, fontSize) {
    buttons[name] = { x: cx - w / 2, y: cy - h / 2, w: w, h: h };

    ctx.fillStyle = C.C.BTN;
    G.Render.roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
    ctx.fill();

    ctx.strokeStyle = C.C.BTN_LINE;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = C.C.HERO;
    ctx.font = font(fontSize);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + fontSize * 0.04);
    ctx.textBaseline = 'alphabetic';
  }

  function hitButton(name, x, y) {
    var b = buttons[name];
    if (!b) return false;
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }

  /* ------------------------------ HUD ------------------------------ */

  function drawHud(ctx) {
    var S = G.State;
    var W = S.W;

    /* 顶部细进度条（贴屏幕顶边） */
    var p = Math.max(0, Math.min(1, (S.camZ + C.FOLLOW_DIST) / C.TOTAL_DISTANCE));
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(0, 0, W, 10);
    ctx.fillStyle = C.C.PROGRESS;
    ctx.fillRect(0, 0, W * p, 10);

    /* 人神战力：屏幕最上方居中 */
    var topY = 62;
    var label = '人神战力：' + S.godPower;
    ctx.font = font(36);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    var tw = ctx.measureText(label).width;
    var padX = 26, padY = 16;
    var boxW = tw + padX * 2, boxH = 36 + padY * 2;

    ctx.fillStyle = C.C.HUD_BG;
    G.Render.roundRect(ctx, W / 2 - boxW / 2, topY - boxH / 2, boxW, boxH, boxH / 2);
    ctx.fill();

    ctx.fillStyle = C.C.BOSS;
    ctx.fillText(label, W / 2, topY + 1);

    /* 血条 */
    var barW = 420, barH = 12;
    var barX = W / 2 - barW / 2;
    var barY = topY + boxH / 2 + 14;

    var max = C.GOD_BAR_MODE === 'dynamic'
      ? Math.max(1, S.godPower)
      : Math.max(1, C.GOD_BASE + S.dangerValueTotal);
    var ratio = Math.max(0, Math.min(1, S.godPower / max));

    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    G.Render.roundRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fill();

    ctx.fillStyle = C.C.GOD_BAR;
    if (S.godPulse > 0) ctx.globalAlpha = 0.6 + 0.4 * Math.sin(S.godPulse * Math.PI * 4);
    G.Render.roundRect(ctx, barX, barY, Math.max(barH, barW * ratio), barH, barH / 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* --------------------------- 开始界面 --------------------------- */

  /** 取某类角色的分值范围文本，例 "+10" 或 "+10~20"（兼容每个角色分值不同的情况） */
  function gainText(kind) {
    var min = Infinity, max = -Infinity;
    var list = G.State.entities;
    for (var i = 0; i < list.length; i++) {
      if (list[i].kind !== kind) continue;
      if (list[i].value < min) min = list[i].value;
      if (list[i].value > max) max = list[i].value;
    }
    if (min === Infinity) return '';
    return min === max ? ('+' + min) : ('+' + min + ' ~ +' + max);
  }

  function drawReady(ctx) {
    var S = G.State, W = S.W, H = S.H;

    ctx.fillStyle = 'rgba(6,8,20,0.82)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = C.C.HERO;
    ctx.font = font(84);
    ctx.fillText(C.TITLE, W / 2, H * 0.26);

    ctx.fillStyle = C.C.HUD_DIM;
    ctx.font = font(34, false);
    var lines = [
      '左右滑动，或点击屏幕两侧切换车道',
      '',
      '吃到友好角色 → 你的战力 ' + gainText('friendly'),
      '撞到危险角色 → 人神战力 ' + gainText('danger'),
      '',
      '终点的人神堵住三条道路，躲不掉。',
      '战力高过他才算赢。'
    ];
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], W / 2, H * 0.40 + i * 52);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.font = font(26, false);
    ctx.fillText('看角色与姓名，认出伙伴，避开危险', W / 2, H * 0.72);

    drawButton(ctx, 'start', '开 始', W / 2, H * 0.84, 360, 108, 44);
  }

  /* --------------------------- 结算界面 --------------------------- */

  function drawResult(ctx) {
    var S = G.State, W = S.W, H = S.H;
    var win = S.win;

    ctx.fillStyle = 'rgba(6,8,20,0.86)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = win ? C.C.WIN : C.C.LOSE;
    ctx.font = font(96);
    ctx.fillText(win ? '胜  利' : '失  败', W / 2, H * 0.28);

    ctx.fillStyle = C.C.HUD_DIM;
    ctx.font = font(32, false);
    ctx.fillText(win ? '你的战力压过了人神' : '人神的战力压过了你', W / 2, H * 0.36);

    /* 并排对比 */
    var y = H * 0.50;
    var colW = W * 0.36;

    ctx.fillStyle = C.C.HERO;
    ctx.font = font(38, false);
    ctx.fillText('你', W / 2 - colW / 2, y);
    ctx.font = font(72);
    ctx.fillText(String(S.heroPower), W / 2 - colW / 2, y + 76);

    ctx.fillStyle = C.C.BOSS;
    ctx.font = font(38, false);
    ctx.fillText(C.BOSS_TEXT, W / 2 + colW / 2, y);
    ctx.font = font(72);
    ctx.fillText(String(S.godPower), W / 2 + colW / 2, y + 76);

    ctx.fillStyle = C.C.HUD_DIM;
    ctx.font = font(40, false);
    ctx.fillText(win ? '>' : '<', W / 2, y + 52);

    /* 明细 */
    ctx.font = font(28, false);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('吃到友好角色 ' + S.ateFriendly + ' 个　·　撞到危险角色 ' + S.hitDanger + ' 个',
      W / 2, y + 168);

    drawButton(ctx, 'retry', '再 来 一 次', W / 2, H * 0.80, 440, 108, 40);
  }

  function draw(ctx) {
    var S = G.State;
    if (S.phase === 'ready') {
      drawReady(ctx);
    } else if (S.phase === 'result') {
      drawHud(ctx);
      drawResult(ctx);
    } else {
      drawHud(ctx);
      if (S.phase === 'freeze') {
        ctx.fillStyle = 'rgba(255,80,80,0.12)';
        ctx.fillRect(0, 0, S.W, S.H);
      }
    }
  }

  G.UI = {
    draw: draw,
    hitButton: hitButton,
    resetButtons: function () { buttons = {}; }
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
