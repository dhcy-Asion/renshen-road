/**
 * 关卡数据 —— 改关卡只改这个文件。
 *
 * 刷新规则：每隔固定距离刷一组，一组 2 个角色占 2 条不同车道，
 * 剩 1 条空道。玩家三选一：碰 A / 碰 B / 什么都不碰。
 *
 * 9 组 × 2 = 18 个角色，正好是 11 个友好 + 7 个危险，每个角色出场一次。
 */
(function (root) {
  root.Game = root.Game || {};
  var C = root.Game.Config;

  /* 角色名表。f = friendly 友好，d = danger 危险 */
  var NAMES = {
    f01: '希露菲',
    f02: '洛琪希',
    f03: '基列奴',
    f04: '水王伊佐露提',
    f05: '瑞杰路德',
    f06: '阿托菲',
    f07: '爱丽儿',
    f08: '扎诺巴',
    f09: '克利夫',
    f10: '爱丽丝',
    f11: '奥尔斯帝德',
    d01: '基斯',
    d02: '剑神',
    d03: '北神三世',
    d04: '北帝',
    d05: '水神列妲',
    d06: '巴迪冈迪',
    d07: '魔石老鼠'
  };

  /**
   * 九组事件。lane: -1 左 / 0 中 / 1 右。
   * 每组空出来的那条道就是玩家的「安全选项」。
   *
   * 三个危险角色被换到了新的位置（同一批人，换个地方再见一次）：
   *   魔石老鼠 第 9 组·中道 → 第 5 组·左道
   *   北帝     第 8 组·中道（按用户布局表替换）
   *   巴迪冈迪 第 8 组·中道 → 第 9 组·中道
   * 所以「第几组会遇到谁」不能凭上一版记 —— 这正是辨识关卡的难点所在。
   */
  var GROUPS = [
    { z: 26,  a: { lane: -1, id: 'f01' }, b: { lane:  1, id: 'd01' } },  // 空 中
    { z: 48,  a: { lane:  0, id: 'f02' }, b: { lane:  1, id: 'd02' } },  // 空 左
    { z: 70,  a: { lane: -1, id: 'f10' }, b: { lane:  1, id: 'f04' } },  // 空 中（双友好）
    { z: 92,  a: { lane:  1, id: 'f03' }, b: { lane: -1, id: 'd03' } },  // 空 中
    { z: 114, a: { lane:  0, id: 'f05' }, b: { lane: -1, id: 'd07' } },  // 空 右
    { z: 136, a: { lane: -1, id: 'f06' }, b: { lane:  0, id: 'd05' } },  // 空 右
    { z: 158, a: { lane:  0, id: 'f07' }, b: { lane:  1, id: 'f08' } },  // 空 左（双友好）
    { z: 180, a: { lane:  1, id: 'f09' }, b: { lane:  0, id: 'd04' } },  // 空 左
    { z: 202, a: { lane: -1, id: 'f11' }, b: { lane:  0, id: 'd06' } }   // 空 右
  ];

  /**
   * 每个角色的分值 —— 按《无职转生》原作强度拟定。
   *
   * 友好角色 → 加到主角身上；危险角色 → 加到人神身上。
   * 没写在这里的角色用 config.js 的 FRIENDLY_GAIN / DANGER_GAIN 兜底。
   *
   * 档位大致是：S 级（世界最强）30 / A 级（七大列强级）22~26 /
   *            B 级（强者）14~18 / C 级（中坚）10~12 / D 级（弱）3~6
   *
   * 例外：魔石老鼠 30 分。它战斗力是 D 级，但按「危害」定档（见下表注释）。
   */
  var VALUE = {
    /* ---- 友好角色 ---- */
    f11: 30,   // 奥尔斯帝德 —— 龙神，世界最强
    f10: 24,   // 爱丽丝 —— 剑王／剑神级
    f05: 24,   // 瑞杰路德 —— 斯佩路德族最强战士
    f06: 22,   // 阿托菲 —— 魔神，不死身
    f03: 18,   // 基列奴 —— 按用户布局表保留 18 分
    f08: 16,   // 扎诺巴 —— 神力，怪力无双
    f02: 12,   // 洛琪希 —— 水圣级魔术师
    f09: 10,   // 克利夫 —— 魔术师
    f01: 10,   // 希露菲 —— 无咏唱魔术师
    f07: 6,    // 爱丽儿 —— 阿斯拉公主，政治人物
    f04: 5,    // 水王伊佐露提 —— 按用户布局表保留 5 分

    /* ---- 危险角色 ---- */
    d07: 30,   // 魔石老鼠 —— 魔石病的带菌者。战力低，但沾上就是绝症，
               //              所以按「危害」而不是「战斗力」定到最高档。
               //              ★ 这一档是新版关卡表里定的（旧版是 3），
               //                也是全表唯一的「看着弱、其实最痛」的陷阱。
    d02: 26,   // 剑神（加尔・法利昂）—— 七大列强之一
    d03: 24,   // 北神三世（亚历山大・雷白克）—— 原七大列强第七位
    d06: 22,   // 巴迪冈迪 —— 魔王，不死身
    d04: 14,   // 北帝 —— 按用户布局表保留 14 分
    d05: 14,   // 水神列妲 —— 按用户布局表保留 14 分
    d01: 6     // 基斯 —— 谋士，战斗力弱
  };

  /** 取某个角色的分值：优先用 VALUE 覆盖，否则用类别默认值 */
  function gainOf(id, kind) {
    if (VALUE[id] !== undefined) return VALUE[id];
    return kind === 'friendly' ? C.FRIENDLY_GAIN : C.DANGER_GAIN;
  }

  function makeEntity(z, lane, id) {
    var kind = id.charAt(0) === 'f' ? 'friendly' : 'danger';
    return {
      id: id,
      name: NAMES[id] || id,
      kind: kind,
      z: z,
      lane: lane,
      x: lane * C.LANE_W,
      value: gainOf(id, kind),   // 碰到后加减多少战力
      tagLift: 0,        // 名牌在屏幕上的抬高量（世界米），见 config.TAG_STAGGER_H
      resolved: false,   // 已经处理过（吃到 / 撞到 / 错过）
      hitHero: false     // 是不是被主角碰上（用于结算统计）
    };
  }

  /** 生成一局完整的实体列表 */
  function build() {
    var list = [];
    for (var i = 0; i < GROUPS.length; i++) {
      var g = GROUPS[i];
      var ea = makeEntity(g.z, g.a.lane, g.a.id);
      var eb = makeEntity(g.z, g.b.lane, g.b.id);
      /* 同组两个角色 z 相同，名牌在屏幕上会叠在一起（见 config.TAG_STAGGER_H），
       * 把偏右的那个抬起来，两块名牌就永远错开。 */
      if (g.a.lane !== g.b.lane) {
        (g.a.lane > g.b.lane ? ea : eb).tagLift = C.TAG_STAGGER_H;
      }
      list.push(ea);
      list.push(eb);
    }
    /* 人神：堵在终点，横向覆盖全部三条道 */
    list.push({
      id: 'boss',
      name: C.BOSS_TEXT,
      kind: 'boss',
      z: C.TOTAL_DISTANCE,
      lane: 0,
      x: 0,
      resolved: false,
      hitHero: false
    });
    return list;
  }

  root.Game.Level = {
    NAMES: NAMES,
    GROUPS: GROUPS,
    VALUE: VALUE,
    gainOf: gainOf,
    build: build
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
