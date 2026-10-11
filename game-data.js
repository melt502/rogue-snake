'use strict';
/* ---------- 静态数据表（遗物、进化、协同、地形、成就、悬赏）----------
   与 game.js 同处全局词法作用域，需先于 game.js 加载。 */
/* ---------- 遗物数据 ---------- */
const relics=[
 {id:'magnet',name:'磁吸',rarity:'common',tags:['economy','mobility'],desc:'3 格内食物向蛇头移动；每层范围 +1。三层可进化为「引力井」或「磁暴」。',max:3,hook:'magnet'},
 {id:'doublefruit',name:'双倍果实',rarity:'rare',tags:['economy'],desc:'20% 概率生成金色食物，价值翻倍。',max:3,hook:'gold'},
 {id:'thorn',name:'荆棘尾',rarity:'common',tags:['attack','survive'],desc:'蛇尾经过的格子短暂成为荆棘，敌人触碰会受伤。三层可进化为「荆棘长廊」或「毒刺回旋」。',max:3,hook:'thorn'},
 {id:'blast',name:'爆裂',rarity:'epic',tags:['attack'],desc:'吃到金色食物时清除周围 1 格敌人。',max:3,hook:'blast'},
 {id:'phase',name:'穿墙相位',rarity:'legendary',tags:['mobility','survive'],desc:'每层有 1 次撞墙免死并传送到对侧。',max:3,hook:'phase'},
 {id:'sacrifice',name:'主动献祭',rarity:'rare',tags:['curse','attack'],desc:'按 X 断尾 2 节，获得 5 秒速度与分值爆发。三层可进化为「余烬」或「血契」。',max:3,hook:'sac'},
 {id:'echo',name:'灵魂回响',rarity:'epic',tags:['curse','economy'],desc:'断尾后的 5 秒内，每个食物额外获得 2 层能量，金色食物概率 +30%。',max:3,hook:'echo'},
 {id:'greed',name:'贪婪之胃',rarity:'rare',tags:['economy','curse'],desc:'食物分值 +12%，但每 7 秒自动减少 1 节。',max:3,hook:'greed'},
 {id:'egg',name:'虫卵',rarity:'common',tags:['summon'],desc:'每吃 5 个食物生成一只友方小蛇，持续 8 秒。三层可进化为「群落」或「爆裂孵化」。',max:3,hook:'egg'},
 {id:'symbiote',name:'共生',rarity:'epic',tags:['summon','survive'],desc:'友方小蛇存在时，移动间隔 -8ms。',max:3,hook:'sym'},
 {id:'carrion',name:'腐肉',rarity:'rare',tags:['summon','curse'],desc:'敌人死亡处生成 3 秒高价值食物。',max:3,hook:'carrion'},
 {id:'voidmouth',name:'虚空之口',rarity:'legendary',tags:['curse','economy'],desc:'稀有度权重提升，但每 10 秒随机失去 1 层遗物。',max:3,hook:'void'},
 {id:'armor',name:'甲壳',rarity:'common',tags:['survive'],desc:'抵挡敌人碰撞，最多存储 3 层护盾（每层 +1），每 10 秒充能 1 层。三层可进化为「反震」或「坚守」。',max:3,hook:'armor'},
 {id:'regen',name:'再生鳞',rarity:'rare',tags:['survive'],desc:'每吃 8 个食物，恢复 1 节并获得短暂护盾。',max:3,hook:'regen'},
 {id:'swift',name:'迅鳞',rarity:'common',tags:['mobility'],desc:'基础移动间隔 -6ms。',max:3,hook:'swift'},
 {id:'turn',name:'回旋肌',rarity:'common',tags:['mobility'],desc:'连续转向 6 次后，下一次食物价值 +100%。',max:3,hook:'turn'},
 {id:'collector',name:'囤积者',rarity:'rare',tags:['economy'],desc:'跳过遗物选择时累积 1 能量栈；按 E 消耗全部栈数，获得等量随机遗物（无选择）。三层可进化为「折价交易」或「珍品搜索」。',max:3,hook:'hoarder'},
 {id:'bounty',name:'赏金猎手',rarity:'epic',tags:['attack','economy'],desc:'悬赏奖励 +35%，击杀敌人额外计数。',max:3,hook:'bounty'},
 {id:'thunder',name:'雷击核心',rarity:'legendary',tags:['attack'],desc:'每 20 秒随机电击一个敌人。',max:3,hook:'thunder'},
 {id:'anchor',name:'锚定',rarity:'rare',tags:['survive'],desc:'区域切换时获得 3 秒无敌。',max:3,hook:'anchor'},
 {id:'feast',name:'盛宴',rarity:'epic',tags:['economy','curse'],desc:'连续吃到 3 个食物后下一个必为金色。',max:3,hook:'feast'},
 {id:'mirror',name:'镜像蛇',rarity:'rare',tags:['summon','attack'],desc:'每 12 秒复制一次蛇头轨迹，碰到敌人造成伤害。',max:3,hook:'mirror'},
 {id:'mark',name:'传承印记',rarity:'legendary',tags:['survive','economy'],desc:'获得一次改写传承的机会（按 Q 使用）。',max:1,hook:'mark'},
 {id:'time',name:'时间腐蚀',rarity:'epic',tags:['curse','mobility'],desc:'升级所需食物 -1，但威胁计时加速 20%。',max:3,hook:'time'},
 {id:'wall',name:'壁垒',rarity:'rare',tags:['survive'],desc:'前 3 次撞墙不会死亡（全局计数，不限区域），每层 +1 次。',max:3,hook:'wall'}
];
// 敌人与地形扩展遗物。每个 ID 都通过统一的 tick / combat hook 接入实际逻辑。
relics.push(
 {id:'shock',name:'震荡线圈',rarity:'rare',tags:['attack','mobility'],desc:'J 冲击范围增加 1 格。',max:3,hook:'shock'},
 {id:'piercer',name:'穿刺尖牙',rarity:'epic',tags:['attack'],desc:'J 冲击命中后可穿透并继续伤害一个敌人。',max:3,hook:'piercer'},
 {id:'voltage',name:'过载电池',rarity:'rare',tags:['attack','economy'],desc:'连续击杀每达到 3 次，主动技能冷却减少 1 秒。',max:3,hook:'voltage'},
 {id:'scanner',name:'预警扫描',rarity:'common',tags:['survive','mobility'],desc:'提前显示炮台射线、掘地者落点和熔岩危险格。',max:3,hook:'scanner'},
 {id:'insulator',name:'绝缘鳞',rarity:'rare',tags:['survive'],desc:'熔岩和风道伤害降低 50%。',max:3,hook:'insulator'},
 {id:'traction',name:'防滑鳞',rarity:'common',tags:['survive','mobility'],desc:'冰面额外滑行距离减少 1 格。',max:3,hook:'traction'},
 {id:'marshrunner',name:'沼行者',rarity:'common',tags:['mobility'],desc:'沼泽减速降低 50%，离开沼泽后短暂加速。',max:3,hook:'marshrunner'},
 {id:'cartographer',name:'地图师',rarity:'rare',tags:['economy','survive'],desc:'进入新区域时显示食物、祭坛和传送门。',max:3,hook:'cartographer'},
 {id:'seedbank',name:'种子库',rarity:'rare',tags:['economy'],desc:'食物被摧毁或消失时有概率重新生成。',max:3,hook:'seedbank'},
 {id:'scavenger',name:'回收协议',rarity:'rare',tags:['economy','attack'],desc:'击杀炮台或自爆者时额外生成一个食物。',max:3,hook:'scavenger'},
 {id:'decoy',name:'诱导信标',rarity:'epic',tags:['summon','survive'],desc:'每 12 秒生成诱饵，追踪敌人优先追踪诱饵。',max:3,hook:'decoy'},
 {id:'afterimage',name:'残影',rarity:'epic',tags:['mobility','attack'],desc:'转向后留下残影，敌人碰到会受伤。',max:3,hook:'afterimage'},
 {id:'phoenix',name:'余烬核心',rarity:'legendary',tags:['survive'],desc:'每局第一次死亡时保留 3 节蛇身并恢复 1 秒无敌。',max:1,hook:'phoenix'},
 {id:'riftkey',name:'裂隙钥匙',rarity:'epic',tags:['curse','mobility'],desc:'进入传送门后加速 2 秒，但威胁计时加速 10%。',max:3,hook:'riftkey'}
);
const tagNames={economy:'经济',mobility:'机动',attack:'攻击',survive:'生存',curse:'诅咒',summon:'召唤'};
const relicById=Object.fromEntries(relics.map(x=>[x.id,x]));
const skillDefs={dash:{name:'冲刺',icon:'➤',desc:'1.2 秒加速',cooldown:12},phase:{name:'相位穿越',icon:'◇',desc:'抵挡一次墙/敌蛇碰撞',cooldown:18},bait:{name:'诱饵',icon:'✦',desc:'4 秒吸引附近敌蛇',cooldown:16},tail:{name:'断尾爆发',icon:'⚡',desc:'断尾、护盾与加速',cooldown:20}};
const evolutions={magnet:[['gravity','引力井','吸引范围扩大至 7 格'],['storm','磁暴','狂热时每秒电击最近敌蛇']],thorn:[['corridor','荆棘长廊','尾迹荆棘持续 6 秒并伤害敌蛇'],['venom','毒刺回旋','敌蛇碰到尾迹会受伤并减速']],sacrifice:[['ember','余烬','断尾后下一颗食物触发范围爆发'],['blood','血契','断尾多失去 1 节，获得 80 分']],egg:[['colony','群落','友方蛇持续 20 秒并周期攻击敌蛇'],['hatch','爆裂孵化','友方蛇消失时爆炸伤害附近敌蛇']],armor:[['rebound','反震','护盾抵挡碰撞时击杀来犯敌蛇'],['bastion','坚守','护盾持续 6 秒并挡住一次墙撞']],collector:[['discount','折价交易','跳过升级获得 15 分与 1 秒护盾'],['treasure','珍品搜索','刷新选项时提高稀有度权重']]};
const baseUnlocked=['magnet','thorn','swift','armor','collector','feast','wall','turn'];
const synergyDefs=[
 {tags:['economy','mobility'],name:'经济流',desc:'食物分值额外 +20%，狂热持续时间 +2 秒'},
 {tags:['attack','survive'],name:'破坏流',desc:'击杀敌人恢复 1 节蛇身，撞击伤害范围扩大至 2 格'},
 {tags:['curse','economy'],name:'献祭流',desc:'诅咒遗物每层使金色概率 +8%，每吃 10 个食物随机提升 1 个诅咒遗物层数'},
 {tags:['summon','survive'],name:'召唤流',desc:'友方单位存在时每 4 秒获得 1 秒护盾，友方单位死亡时恢复 3 节'},
 {tags:['mobility','curse'],name:'猎风流',desc:'每次转向累积 1 层速度，5 层时释放冲击波清除周围敌人'},
 {tags:['economy','mobility','attack'],name:'疾风掠夺',desc:'狂热时击杀敌人额外获得金色食物'},
 {tags:['curse','summon','attack'],name:'血祭军团',desc:'断尾时召唤 1 个强化友军（持续 15 秒）'}
 ,{tags:['attack','mobility'],name:'冲击猎手',desc:'J 冲击击杀后减少主动技能冷却 2 秒'}
 ,{tags:['survive','mobility'],name:'地形适应',desc:'适应不同地形时获得护盾，最多 3 层'}
 ,{tags:['economy','summon'],name:'拾金军团',desc:'友方单位击杀敌人时有概率生成金色食物'}
];
const antiSynergies=[
  {conds:[{type:'relic',id:'greed'},{type:'relic',id:'regen'}],penalty:'再生触发间隔翻倍（16 个食物才触发 1 次）',desc:'贪婪 + 再生'},
  {conds:[{type:'relic',id:'phase'},{type:'relic',id:'thorn'}],penalty:'荆棘持续时间减半',desc:'穿墙 + 荆棘'},
  {conds:[{type:'terrain',id:'ice'},{type:'relic',id:'swift'}],penalty:'冰面滑行距离增加 1 格',desc:'冰面 + 迅鳞'},
  {conds:[{type:'relic',id:'riftkey'},{type:'relic',id:'time'}],penalty:'威胁增长速度增加 25%',desc:'裂隙钥匙 + 时间腐蚀'}
];
const achievementDefs={first_run:{name:'初次冒险',desc:'完成第一次游戏',cat:'beginner',reward:10},level_10:{name:'升级专家',desc:'在一局中达到10级',cat:'beginner',reward:10},relic_5:{name:'遗物收藏家',desc:'在一局中拥有5个不同遗物',cat:'beginner',reward:10},frenzy_first:{name:'连击新手',desc:'触发一次狂热状态',cat:'beginner',reward:10},threat_5:{name:'威胁应对',desc:'在威胁等级5+存活30秒',cat:'beginner',reward:10},score_1000:{name:'百分大师',desc:'在一局中获得1000+分数',cat:'challenge',reward:15},snake_30:{name:'长蛇传说',desc:'蛇身长度达到30节',cat:'challenge',reward:15},bounty_5:{name:'悬赏猎人',desc:'在一局中完成5个悬赏任务',cat:'challenge',reward:15},evolution_3:{name:'进化之路',desc:'在一局中获得3个遗物进化',cat:'challenge',reward:15},threat_10_60s:{name:'终局挑战',desc:'在威胁等级10存活60秒',cat:'challenge',reward:15},no_eat_60s:{name:'素食主义者',desc:'60秒不吃任何食物（可死亡后解锁）',cat:'fun',reward:20},tail_min:{name:'自杀式冲锋',desc:'使用断尾将蛇身减至最少3节',cat:'fun',reward:20},greed_curse:{name:'贪婪的代价',desc:'同时拥有贪婪之胃和贪婪契约',cat:'fun',reward:20},perfect_dodge:{name:'完美规避',desc:'有5+敌人时存活30秒且不击杀任何敌人',cat:'fun',reward:20},inherit_3x:{name:'传承大师',desc:'使用传承印记改写传承3次（累计）',cat:'fun',reward:20}};
const COMBAT={radius:2,cooldown:3,hitGrace:.45,maxEnemies:18,bombDelay:1.5,summonInterval:10};
const affixes=[['狭间','可活动区域缩小一圈'],['虫巢','每 10 秒生成一只敌人'],['荆棘之地','吃到食物后留下障碍'],['虚空','普通食物 -1，金色概率翻倍'],['风暴','每 20 秒出现移动障碍带'],['贪婪','食物分值 +50%，每 5 秒自动 -1 节']];
const terrainDefs={
 ruins:{name:'遗迹墙',effect:'2–4 个不可穿越墙块，出生点周围保留安全区',color:'#718276'},
 ice:{name:'冰面',effect:'进入后额外滑行 1 格',color:'#9fe8ff'},
 swamp:{name:'沼泽',effect:'玩家移动间隔 +20%，覆盖 20–30%',color:'#587b62'},
 lava:{name:'熔岩裂隙',effect:'每 5 秒激活危险格，停留会受伤',color:'#ff704d'},
 wind:{name:'风道',effect:'每 8 秒沿风向推动实体 1 格',color:'#b7c8ff'},
 rift:{name:'传送门',effect:'进入一端会传送到另一端并短暂无敌',color:'#c792ff'},
 bramble:{name:'荆棘林',effect:'短暂生成有限荆棘障碍',color:'#9be36b'},
 inversion:{name:'反转区',effect:'每 12 秒左右方向反转 2 秒',color:'#f0a5ff'}
};
const terrainIds=Object.keys(terrainDefs);
const bountyDefs=[{name:'收集者',desc:'30 秒内吃 3 个食物',dur:30,test:g=>g.foodCount>=g.bounty.startFood+3,reward:'能量 +1'},{name:'无伤穿行',desc:'存活 20 秒',dur:20,test:g=>g.elapsed>=g.bounty.startedAt+20,reward:'碎片 +10'},{name:'猎杀',desc:'消灭 1 个敌人',dur:50,test:g=>g.enemyKills>=g.bounty.startKills+1,reward:'速度 -10ms'},{name:'长蛇',desc:'蛇长达到 20 节',dur:60,test:g=>g.snake.length>=20,reward:'食物分值 +5%'},{name:'极限转向',desc:'连续转向 6 次',dur:30,test:g=>g.turns>=g.bounty.startTurns+6,reward:'刷新 +1'},{name:'金色盛宴',desc:'25 秒内吃到金色食物',dur:25,test:g=>g.goldEaten>g.bounty.startGold,reward:'金色概率提升'},{name:'区域漫游',desc:'悬赏期间完成一次升级',dur:50,test:g=>g.level>g.bounty.startLevel,reward:'进化能量 +1'},{name:'近身采集',desc:'在敌人 3 格内吃到食物',dur:35,test:g=>g.closeEat>g.bounty.startClose,reward:'分值加成'},{name:'快速反应',desc:'20 秒内完成 4 次转向',dur:20,test:g=>g.turns>=g.bounty.startTurns+4,reward:'刷新 +1'},{name:'持久战',desc:'存活 40 秒',dur:40,test:g=>g.elapsed>=g.bounty.startedAt+40,reward:'碎片 +10'}];
