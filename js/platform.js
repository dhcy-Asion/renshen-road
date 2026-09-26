/**
 * 平台适配层 —— 唯一需要为「浏览器 / 抖音」分叉的文件。
 * 游戏逻辑只调用这里的方法，所以同一份代码两边都能跑。
 */
(function (root) {
  root.Game = root.Game || {};
  var C = root.Game.Config;

  var isTT = (typeof tt !== 'undefined') && tt && (typeof tt.createCanvas === 'function');

  var P = {
    isTT: isTT,
    canvas: null,
    ctx: null,
    cssW: 0,        // 屏幕的 CSS 宽度
    cssH: 0,        // 屏幕的 CSS 高度
    scale: 1,       // 逻辑坐标 → 物理像素 的缩放比
    W: C.DESIGN_W,  // 逻辑宽度（恒定 1080）
    H: 1920,        // 逻辑高度（按屏幕比例动态算）

    init: function () {
      var canvas, physW, physH;

      if (isTT) {
        canvas = tt.createCanvas();
        var info = tt.getSystemInfoSync();
        /* 注意：getSystemInfoSync 返回的所有宽高都是**逻辑分辨率**，
         * 物理分辨率 = 逻辑 × pixelRatio。以前直接把 screenWidth 当成物理宽，
         * 结果画布被做成 1x —— 在高分屏手机上整屏发虚。
         * 主画布铺满整个屏幕，所以 CSS 尺寸也取屏幕尺寸，保证不被拉伸。 */
        this.cssW = info.screenWidth || info.windowWidth;
        this.cssH = info.screenHeight || info.windowHeight;
        var dpr = Math.min(info.pixelRatio || 1, C.MAX_DPR);
        physW = Math.round(this.cssW * dpr);
        physH = Math.round(this.cssH * dpr);
        canvas.width = physW;
        canvas.height = physH;
      } else {
        canvas = document.getElementById('game');
        var vw = window.innerWidth, vh = window.innerHeight;
        var aspect = vw / vh;
        if (aspect > 0.62) vw = vh * 0.62;          // 桌面宽屏 → 收窄成手机比例，两边留黑边
        else if (aspect < 0.42) vh = vw / 0.42;     // 极端长屏 → 保底
        canvas.style.width = Math.round(vw) + 'px';
        canvas.style.height = Math.round(vh) + 'px';
        this.cssW = vw;
        this.cssH = vh;
        var dpr = window.devicePixelRatio || 1;
        physW = Math.round(vw * dpr);
        physH = Math.round(vh * dpr);
        canvas.width = physW;
        canvas.height = physH;
      }

      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');

      /* 以宽度为基准等比缩放；逻辑宽度恒为 1080，逻辑高度按屏幕比例浮动 */
      this.scale = physW / C.DESIGN_W;
      this.W = C.DESIGN_W;
      this.H = physH / this.scale;

      /* 把画布坐标系整体映射到「逻辑坐标」上，之后所有绘制都用逻辑单位 */
      this.ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);

      return this;
    },

    /** 逻辑坐标 → 清屏 */
    clear: function () {
      this.ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      this.ctx.clearRect(0, 0, this.W, this.H);
    },

    /**
     * 触摸监听。回调收到的是「逻辑坐标」。
     * 同时兼容：点击左右半屏切道 + 左右滑动切道。
     */
    onSwipe: function (onTap, onSwipeLR) {
      var self = this;
      var startX = 0, startY = 0, startT = 0, active = false;
      var SWIPE_MIN = 30;   // 逻辑坐标下的最小滑动距离

      function toLogic(clientX, clientY) {
        if (isTT) {
          return { x: clientX * (self.W / self.cssW), y: clientY * (self.H / self.cssH) };
        }
        /* 必须走 self.canvas —— 这里的 canvas 不是 init() 里的局部变量，
         * 写成裸的 canvas 会直接抛 ReferenceError，浏览器版所有点击/滑动全部失效。 */
        var r = self.canvas.getBoundingClientRect();
        return {
          x: (clientX - r.left) * (self.W / self.cssW),
          y: (clientY - r.top) * (self.H / self.cssH)
        };
      }

      function begin(clientX, clientY) {
        var p = toLogic(clientX, clientY);
        startX = p.x; startY = p.y; startT = Date.now(); active = true;
      }

      function end(clientX, clientY) {
        if (!active) return;
        active = false;
        var p = toLogic(clientX, clientY);
        var dx = p.x - startX;
        var dy = p.y - startY;
        var dt = Date.now() - startT;

        if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) && dt < 600) {
          onSwipeLR(dx > 0 ? 1 : -1);
        } else {
          onTap(p.x, p.y);
        }
      }

      if (isTT) {
        tt.onTouchStart(function (e) { var t = e.touches[0]; begin(t.clientX, t.clientY); });
        tt.onTouchEnd(function (e) { var t = e.changedTouches[0]; end(t.clientX, t.clientY); });
        tt.onTouchCancel(function () { active = false; });
      } else {
        var cv = self.canvas;
        /* 触屏设备上浏览器会在 touchend 之后再补发一套 mousedown/mouseup
         * （compat mouse events）。不拦的话一次点击会被处理两遍 ——
         * 点一下切两格、滑一下跳两格。用一个时间窗把补发的鼠标事件吃掉。 */
        var lastTouchAt = 0;
        var MOUSE_AFTER_TOUCH_MS = 700;
        var isGhostMouse = function () { return Date.now() - lastTouchAt < MOUSE_AFTER_TOUCH_MS; };

        cv.addEventListener('touchstart', function (e) {
          lastTouchAt = Date.now();
          var t = e.touches[0]; begin(t.clientX, t.clientY);
        }, { passive: true });
        cv.addEventListener('touchend', function (e) {
          lastTouchAt = Date.now();
          var t = e.changedTouches[0]; end(t.clientX, t.clientY);
        }, { passive: true });
        cv.addEventListener('mousedown', function (e) {
          if (isGhostMouse()) return;
          begin(e.clientX, e.clientY);
        });
        cv.addEventListener('mouseup', function (e) {
          if (isGhostMouse()) return;
          end(e.clientX, e.clientY);
        });
      }
    },

    /** 浏览器与抖音分别使用各自的图片对象。 */
    createImage: function () {
      return isTT ? tt.createImage() : new window.Image();
    },

    /** 逐帧回调 */
    raf: function (fn) {
      if (isTT) return requestAnimationFrame(fn);
      return window.requestAnimationFrame(fn);
    },

    /** 高精度时间戳（毫秒） */
    now: function () {
      return (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();
    }
  };

  root.Game.Platform = P;
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
