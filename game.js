/**
 * 抖音小游戏入口。
 * 与浏览器版共用同一份 js/ 代码，差别只在 platform.js 里那一层适配。
 */
require('./js/config.js');
require('./js/level.js');
require('./js/platform.js');
require('./js/characters.js');
require('./js/render.js');
require('./js/ui.js');
require('./js/state.js');

GameGlobal.Game.Main.start();
