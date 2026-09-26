/**
 * 投影与场景绘制。
 * 核心：世界坐标 (x, y, z) → 屏幕坐标。物体在世界里绝对静止，
 * 只有 camZ 在推进，所以「相对位置不变、不断靠近主角」是公式的天然结果。
 */
(function (root) {
  root.Game = root.Game || {};
  var C = root.Game.Config;
  var G = root.Game;

  var _skyGrad = null, _skyH = -1;

  /** 世界坐标 → 屏幕坐标。返回 null 表示在近裁剪面之后（不绘制） */
  function project(x, y, z) {
    var S = G.State;
    var dz = z - S.camZ;
    if (dz < C.NEAR) return null;
    var s = C.FOCAL / dz;
    return {
      x: S.W / 2 + x * s,
      y: S.horizon + (C.CAM_H - y) * s,
      s: s,
      dz: dz
    };
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** 地面投影阴影 —— 让「飘着的文字」看起来是站在路面上的 */
  function drawShadow(ctx, x, z, worldW) {
    var p = project(x, 0, z);
    if (!p) return;
    var rw = worldW * 0.5 * p.s;
    if (rw < 2.5) return;
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rw, rw * 0.30, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * 画一个「站在路面上」的名牌。
   *
   * 字号按透视算 rawFontPx，但会被夹在 [minPx, maxPx] 之间：
   *   不夹下限 → 远处的字在手机上根本读不出来（逻辑 1080px 投到 400pt 屏幕上会缩到 1/3）
   *   不夹上限 → 长名字贴脸时宽度会爆掉屏幕（"亚历山大・雷白克" 8 个字）
   * 另外 maxW 再兜一层底，保证任何名字都不会超出屏幕。
   *
   * 返回实际绘制高度，方便调用方在它上方继续叠东西。
   */
  function drawNameTag(ctx, text, cx, baseY, rawFontPx, color, bgColor, opt) {
    opt = opt || {};
    var minPx = opt.minPx || 20;
    var maxPx = opt.maxPx || 90;
    var maxW = opt.maxW || (G.State.W * 0.86);
    var alpha = (opt.alpha === undefined) ? 1 : opt.alpha;

    var fontPx = Math.max(minPx, Math.min(maxPx, rawFontPx));
    ctx.font = 'bold ' + fontPx + 'px sans-serif';
    var w = ctx.measureText(text).width;
    if (w > maxW) {
      fontPx = fontPx * (maxW / w);
      ctx.font = 'bold ' + fontPx + 'px sans-serif';
      w = ctx.measureText(text).width;
    }
    if (fontPx < 12) return 0;

    var padX = fontPx * 0.24;
    var padY = fontPx * 0.17;
    var boxW = w + padX * 2;
    var boxH = fontPx + padY * 2;

    /* 把名牌整体夹回屏幕内。
     * 外车道的角色贴近主角时，投影横向偏移会超过半屏（偏移 = 车道偏移 × FOCAL / dz，
     * dz 越小偏移越大），只靠 maxW 限宽是不够的 —— 实测「亚历山大・雷白克」
     * 会被屏幕左边切掉 240 多像素。这里只挪名牌，脚下的投影阴影不动。 */
    var W = G.State.W;
    var margin = fontPx * 0.3;
    if (boxW + margin * 2 >= W) {
      cx = W / 2;
    } else {
      if (cx - boxW / 2 < margin) cx = margin + boxW / 2;
      if (cx + boxW / 2 > W - margin) cx = W - margin - boxW / 2;
    }

    ctx.globalAlpha = alpha;
    ctx.fillStyle = bgColor;
    roundRect(ctx, cx - boxW / 2, baseY - boxH, boxW, boxH, Math.min(fontPx * 0.24, boxH / 2));
    ctx.fill();

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, cx, baseY - padY);
    ctx.globalAlpha = 1;

    return boxH;
  }

  /* ------------------------------ 天空 ------------------------------ */

  function drawSky(ctx) {
    var S = G.State;
    if (_skyH !== S.H || !_skyGrad) {
      _skyGrad = ctx.createLinearGradient(0, 0, 0, S.horizon + S.H * 0.06);
      _skyGrad.addColorStop(0, C.C.SKY_TOP);
      _skyGrad.addColorStop(0.55, C.C.SKY_MID);
      _skyGrad.addColorStop(0.82, C.C.SKY_LOW);
      _skyGrad.addColorStop(1, C.C.SKY_HORIZON);
      _skyH = S.H;
    }
    ctx.fillStyle = _skyGrad;
    ctx.fillRect(0, 0, S.W, S.horizon + 2);

    /* 地平线以下铺一层暗色地面，避免路两侧露出天空渐变 */
    ctx.fillStyle = '#161a2e';
    ctx.fillRect(0, S.horizon, S.W, S.H - S.horizon);
  }

  /* ------------------------------ 路面 ------------------------------ */

  function drawRoad(ctx) {
    var S = G.State;
    var seg = C.ROAD_SEG;
    var maxSeg = Math.ceil(C.FAR / seg);
    var baseIdx = Math.floor(S.camZ / seg);
    var nearZ = S.camZ + C.NEAR;
    var halfW = C.ROAD_HALF_W;

    for (var i = maxSeg; i >= 0; i--) {
      var idx = baseIdx + i;
      var zFar = (idx + 1) * seg;
      var zNear = idx * seg;
      if (zFar < nearZ) continue;
      if (zNear < nearZ) zNear = nearZ;

      var fl = project(-halfW, 0, zFar);
      var fr = project(halfW, 0, zFar);
      var nl = project(-halfW, 0, zNear);
      var nr = project(halfW, 0, zNear);
      if (!fl || !nl) continue;

      ctx.fillStyle = (idx % 2 === 0) ? C.C.ROAD_A : C.C.ROAD_B;
      ctx.beginPath();
      ctx.moveTo(fl.x, fl.y);
      ctx.lineTo(fr.x, fr.y);
      ctx.lineTo(nr.x, nr.y);
      ctx.lineTo(nl.x, nl.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** 直线在 3D 里是直线，投影后仍是直线，所以车道线用一条梯形就够 */
  function drawLaneLines(ctx) {
    var S = G.State;
    var zFar = S.camZ + C.FAR;
    var zNear = S.camZ + C.NEAR;
    var xs = [-C.LANE_W * 0.5, C.LANE_W * 0.5];
    var half = 0.055;

    ctx.fillStyle = C.C.LANE_LINE;
    for (var k = 0; k < xs.length; k++) {
      var X = xs[k];
      var fl = project(X - half, 0, zFar);
      var fr = project(X + half, 0, zFar);
      var nl = project(X - half, 0, zNear);
      var nr = project(X + half, 0, zNear);
      if (!fl || !nl) continue;
      ctx.beginPath();
      ctx.moveTo(fl.x, fl.y);
      ctx.lineTo(fr.x, fr.y);
      ctx.lineTo(nr.x, nr.y);
      ctx.lineTo(nl.x, nl.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* ---------------------------- 路边景物 ---------------------------- */

  function drawPillars(ctx) {
    var S = G.State;
    var spacing = 8;
    var h = 2.6;
    var halfW = 0.16;
    var offset = C.ROAD_HALF_W + 0.9;

    var first = Math.ceil((S.camZ + C.NEAR) / spacing);
    var last = Math.floor((S.camZ + C.FAR) / spacing);

    ctx.fillStyle = C.C.PILLAR;
    for (var i = first; i <= last; i++) {
      var z = i * spacing;
      for (var sgn = -1; sgn <= 1; sgn += 2) {
        var p0 = project(sgn * offset, 0, z);
        var p1 = project(sgn * offset, h, z);
        if (!p0 || !p1) continue;
        var w = halfW * p0.s;
        if (w < 0.6) continue;
        ctx.fillRect(p0.x - w, p1.y, w * 2, p0.y - p1.y);
      }
    }
  }

  /* ------------------------------ 角色 ------------------------------ */

  /** 保持原图比例和完整内容，脚部锚定路面；没有图片时保留原名牌。 */
  function drawPortrait(ctx, name, p, worldH, worldW, alpha) {
    var img = G.Characters && G.Characters.get(name);
    if (!img) return 0;
    var scale = Math.min(worldW * p.s / img.width, worldH * p.s / img.height);
    var w = img.width * scale, h = img.height * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, p.x - w / 2, p.y - h, w, h);
    ctx.restore();
    return h;
  }

  function drawEntities(ctx) {
    var S = G.State;
    var list = S.entities;

    /* 画家算法：远 → 近 */
    var visible = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.resolved) continue;
      var dz = e.z - S.camZ;
      if (dz < C.NEAR || dz > C.FAR) continue;
      visible.push(e);
    }
    visible.sort(function (a, b) { return b.z - a.z; });

    for (var j = 0; j < visible.length; j++) {
      var e = visible[j];
      var p = project(e.x, 0, e.z);
      if (!p) continue;

      if (e.kind === 'boss') {
        drawShadow(ctx, e.x, e.z, 5.2);
        var bossH = drawPortrait(ctx, e.name, p, 3.5, 4.8, 1);
        drawNameTag(ctx, e.name, p.x, p.y - bossH, (bossH ? 0.65 : C.BOSS_TEXT_H) * p.s,
          C.C.BOSS, C.C.BOSS_BG,
          { minPx: 28, maxPx: 110, maxW: S.W * 0.9, alpha: 1 });
      } else {
        /* 越远越淡，从远裁剪面处淡入，避免「突然冒出来」 */
        var t = p.dz / C.FAR;
        var alpha = 1 - t * t * 0.75;
        /* 名牌可以整体抬高（见 config.TAG_STAGGER_H）：屏幕 y = horizon + (CAM_H - y) * s，
         * 所以世界高度抬 h 米，屏幕就往上走 h * s 像素。脚下的投影阴影不跟着抬。 */
        var baseY = p.y - e.tagLift * p.s;
        drawShadow(ctx, e.x, e.z, 1.5);
        var portraitH = drawPortrait(ctx, e.name, p, 2.3, 1.55, alpha);
        if (portraitH) baseY = p.y - portraitH - e.tagLift * p.s;
        drawNameTag(ctx, e.name, p.x, baseY, 0.40 * p.s,
          C.C.TEXT, C.C.TEXT_BG,
          { minPx: 22, maxPx: 58, maxW: S.W * 0.44, alpha: alpha });
      }
    }
  }

  function drawHero(ctx) {
    var S = G.State;
    var p = project(S.visualX, 0, S.camZ + C.FOLLOW_DIST);
    if (!p) return;

    drawShadow(ctx, S.visualX, S.camZ + C.FOLLOW_DIST, 1.7);

    var heroH = drawPortrait(ctx, C.HERO_TEXT, p, 1.75, 1.25, 1);
    var boxH = drawNameTag(ctx, C.HERO_TEXT, p.x, p.y + (heroH ? 52 : 0), 0.3 * p.s,
      C.C.HERO, C.C.HERO_BG,
      { minPx: 28, maxPx: 48, maxW: S.W * 0.30, alpha: 1 });

    /* 头顶战力数字 */
    var numPx = Math.max(34, Math.min(60, boxH * 0.62));
    var numY = p.y - heroH - (heroH ? 0 : boxH) - numPx * 0.4;
    ctx.font = 'bold ' + numPx + 'px sans-serif';
    var txt = String(S.heroPower);
    var w = ctx.measureText(txt).width;
    var padX = numPx * 0.28, padY = numPx * 0.18;

    ctx.fillStyle = C.C.HERO_BG;
    roundRect(ctx, p.x - w / 2 - padX, numY - numPx - padY, w + padX * 2, numPx + padY * 2, numPx * 0.32);
    ctx.fill();

    ctx.fillStyle = C.C.HERO;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(txt, p.x, numY - padY);

    /* 吃到友好角色时的一圈光晕 */
    if (S.heroPulse > 0) {
      ctx.globalAlpha = S.heroPulse * 0.85;
      ctx.strokeStyle = C.C.HERO;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y - boxH / 2, boxH * (1.5 - S.heroPulse * 0.55), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /** 撞击时的全屏红闪 */
  function drawFlash(ctx) {
    var S = G.State;
    if (S.flash <= 0) return;
    ctx.fillStyle = 'rgba(255,60,60,' + (S.flash * 0.32).toFixed(3) + ')';
    ctx.fillRect(0, 0, S.W, S.H);
  }

  function drawScene(ctx) {
    drawSky(ctx);
    drawRoad(ctx);
    drawLaneLines(ctx);
    drawPillars(ctx);
    drawEntities(ctx);
    /* 结算面板已经在屏幕中央用大字号并排显示双方战力了，这里再画主角的
     * 头顶数字会透过 0.86 的半透明遮罩露出一个重影，跟面板上的数字几乎重叠。 */
    if (G.State.phase !== 'result') drawHero(ctx);
    drawFlash(ctx);
  }

  G.Render = {
    project: project,
    roundRect: roundRect,
    drawNameTag: drawNameTag,
    drawScene: drawScene
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
