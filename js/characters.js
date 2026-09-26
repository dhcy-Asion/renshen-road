/** 用户提供的原始图片；名称别名只影响图片查找，不改变关卡和分值。 */
(function (root) {
  var G = root.Game;
  var files = {
  "阿托菲": "阿托菲.jpg",
  "基斯": "基斯.jpg",
  "希露菲": "希露菲.png",
  "洛琪希": "洛琪希.png",
  "爱丽丝": "艾莉丝.png",
  "瑞杰路德": "瑞杰路德.png",
  "爱丽儿": "爱丽儿.png",
  "扎诺巴": "札诺巴.png",
  "克利夫": "克里夫.png",
  "奥尔斯帝德": "奥尔斯帝德.png",
  "剑神": "剑神.png",
  "北神三世": "北神三世.jpg",
  "巴迪冈迪": "巴迪冈迪.png",
  "魔石老鼠": "魔石病老鼠.jpg",
  "鲁迪": "鲁迪.png",
  "人神": "人神.png",
  "北帝": "北帝.png",
  "基列奴": "基列奴.png",
  "水神列妲": "水神列妲.jpg",
  "水王伊佐露提": "水王伊佐露提.jpg"
};
  var aliases = { '水神': '水神列妲', '水王列妲': '水神列妲', '基斯勒': '基斯', '主角': '鲁迪', '艾莉丝': '爱丽丝', '札诺巴': '扎诺巴', '克里夫': '克利夫', '魔石病老鼠': '魔石老鼠' };
  var cache = {};
  var started = false;
  function preload() {
    if (started) return;
    started = true;
    Object.keys(files).forEach(function (name) {
      var entry = cache[name] = { image: null, ready: false, failed: false };
      try {
        var img = G.Platform.createImage();
        entry.image = img;
        img.onload = function () { entry.ready = img.width > 0 && img.height > 0; };
        img.onerror = function () { entry.failed = true; };
        img.src = 'assets/characters/' + files[name];
      } catch (e) { entry.failed = true; }
    });
  }
  G.Characters = {
    files: files,
    preload: preload,
    get: function (name) {
      var item = cache[aliases[name] || name];
      return item && item.ready ? item.image : null;
    }
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
