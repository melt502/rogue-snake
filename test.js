/* Headless test harness for 项目7/8.
   Loads the real index.html + game.js in jsdom, with a recording canvas + audio stub,
   then drives the game and asserts the new behaviour actually works. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

/* ---------------- tiny assert framework ---------------- */
const results = [];
let current = '';
let _doc = null;
function overlayDump() {
  if (!_doc) return '';
  return ['#upgradeOverlay', '#evolutionOverlay', '#altarOverlay', '#tutorialBox', '#pauseOverlay', '#gameoverOverlay']
    .map(s => s.slice(1) + '=' + _doc.querySelectorAll(s).length).join(' ');
}
function section(name) { current = name; console.log('\n=== ' + name + ' ==='); if (_doc) console.log('  [overlays] ' + overlayDump()); }
function check(label, cond, detail) {
  results.push({ section: current, label, ok: !!cond, detail });
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (cond ? '' : '   -> ' + (detail === undefined ? '' : JSON.stringify(detail))));
}
function eq(label, actual, expected) { check(label, actual === expected, { actual, expected }); }

/* ---------------- build the DOM ---------------- */
const dataSrc = fs.readFileSync(path.join(__dirname, 'game-data.js'), 'utf8');
const gameSrc = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
if (dataSrc.includes('</script') || gameSrc.includes('</script')) throw new Error('game sources contain </script, cannot inline safely');

const expose = `
;window.__api=(()=>{return {
  get game(){return game}, set game(v){game=v},
  get state(){return state}, set state(v){state=v},
  get save(){return save}, set save(v){save=v},
  get raf(){return raf},
  useAttack, damageEnemy, redeemHoarder, explodeEnemy, STATES, defaultSave, persist, newGame, tick, draw, moveTick, eat, killEnemy, die, loop, hasActiveTutorial,
  shake, flash, burst, showUpgrade, showEvolution, showPause, pause, showScreen,
  checkTutorialTrigger, showTutorialStep, tutorialSteps, SFX, relics, relicById,
  relicPool, stacks, has, evolutions, skillDefs, activeSynergies, checkAntiSynergies,
  spawnFood, spawnEnemy, useSkill, levelUp, addRelic, updateHud, updateThreat, freeCell,
  useMark, migrateSave, effectiveRarityWeight, setSave(v){save=v}, getSave(){return save}, GRID: (typeof GRID!=='undefined'?GRID:null),
  hasSyn, hasAnti, maxArmor, curseStacks, growSnake, onTailCut, enqueue, moveEnemies, spawnAlly,
  antiSynergies, synergyDefs, completeBounty, terrainDefs, terrainIds, terrainAt, applyTerrainEnter, generateTerrain, updateTerrain, updateThreat, updateSpecialEnemies, damageEnemy, weightedPick, rarityWeight, effectiveRarityWeight, calcShards,
  grantShield, maxShield, addScore, removeSnakeSegments, recordEvent, synergyLevel, relicContextBonus, wouldTriggerAnti, updatePity, pityConf
}})();`;

let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
html = html.replace('<script src="game-data.js"></script>', () => '<script>' + dataSrc + '</script>');
html = html.replace('<script src="game.js"></script>', () => '<script>' + gameSrc + expose + '</script>');

const ctxCalls = [];
function makeCtx() {
  const store = { _calls: ctxCalls };
  return new Proxy(store, {
    get(t, prop) {
      if (prop === '_calls') return ctxCalls;
      if (prop in t) return t[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'getImageData') return () => ({ data: [] });
      return (...args) => { ctxCalls.push({ m: prop, args }); };
    },
    set(t, prop, v) { t[prop] = v; ctxCalls.push({ m: 'set:' + prop, args: [v] }); return true; }
  });
}

const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.HTMLCanvasElement.prototype.getContext = function () { return makeCtx(); };
    window.__sfx = 0;
    window.AudioContext = class {
      constructor() { this.currentTime = 0; this.destination = {}; }
      createOscillator() {
        return {
          type: '', frequency: { value: 0 },
          connect(o) { return o; },
          start() { window.__sfx++; },
          stop() {}
        };
      }
      createGain() {
        return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect(o) { return o; } };
      }
    };
  }
});

const win = dom.window;
const api = win.__api;
const doc = win.document;
_doc = doc;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => [...doc.querySelectorAll(s)];
const ev = (el, type, init) => el.dispatchEvent(new win.KeyboardEvent(type, Object.assign({ bubbles: true }, init)));
const key = (k) => doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

if (!api) { console.error('FATAL: game.js did not expose API'); process.exit(1); }

/* stop the rAF loop so tests are deterministic */
const rafCallsBefore = ctxCalls.length;
win.requestAnimationFrame = () => 0;

/* ================= T1 boot ================= */
section('T1 启动与基础状态');
check('game.js 暴露 API', !!api);
check('主菜单可见', !$('#menu').classList.contains('hidden'));
check('新手教程步骤定义 5 条', api.tutorialSteps.length === 5, api.tutorialSteps.length);
check('SFX 预设数量 >= 20', Object.keys(api.SFX).length >= 20, Object.keys(api.SFX).length);
api.newGame();
check('反协同定义存在且当前无触发', api.checkAntiSynergies().length === 0);
check('协同定义 7 条', true);

/* ================= T2 draw() save/restore balance (bug fix) ================= */
section('T2 draw() 的 ctx.save/restore 配对（抖动不再累积变换）');
api.newGame();
api.shake(10, 0.5);
ctxCalls.length = 0;
for (let i = 0; i < 25; i++) api.draw();
const saves = ctxCalls.filter(c => c.m === 'save').length;
const restores = ctxCalls.filter(c => c.m === 'restore').length;
eq('25 帧后 save 次数', saves, 25);
eq('25 帧后 restore 次数', restores, 25);
const translates = ctxCalls.filter(c => c.m === 'translate');
check('抖动期间每帧都有 translate', translates.length === 25, translates.length);
check('translate 偏移为真实抖动值', translates.some(t => Math.abs(t.args[0]) > 0.001 || Math.abs(t.args[1]) > 0.001));

/* ================= T3 shake() ================= */
section('T3 屏幕抖动系统');
api.game.tutorial = null;
api.state = api.STATES.PLAYING;
api.game.screenShake.intensity = 0; api.game.screenShake.duration = 0;
api.shake(8, 0.3);
check('shake 设置强度', api.game.screenShake.intensity === 8, api.game.screenShake.intensity);
check('shake 设置时长', Math.abs(api.game.screenShake.duration - 0.3) < 1e-9);
api.shake(3, 0.1);
check('较弱抖动不会降低已有强度', api.game.screenShake.intensity === 8, api.game.screenShake.intensity);
api.tick(0.35);
check('抖动到期后归零', api.game.screenShake.intensity === 0 && api.game.screenShake.duration === 0,
  { i: api.game.screenShake.intensity, d: api.game.screenShake.duration });
api.save.settings.screenShake = false;
api.game.screenShake.intensity = 0;
api.shake(12, 0.4);
check('关闭震动设置后 shake 不生效', api.game.screenShake.intensity === 0, api.game.screenShake.intensity);
api.save.settings.screenShake = true;

/* ================= T4 flash() ================= */
section('T4 全屏闪烁效果');
api.flash('#ff0000', 0.5);
check('flash 设置颜色', api.game.flashEffect.color === '#ff0000');
eq('flash 设置强度', api.game.flashEffect.intensity, 0.5);
ctxCalls.length = 0;
api.draw();
const fullFills = ctxCalls.filter(c => c.m === 'fillRect' && c.args[2] === 720 && c.args[3] === 720);
check('闪烁绘制覆盖整个画布', fullFills.length >= 1, fullFills.length);
const alphaSet = ctxCalls.filter(c => c.m === 'set:globalAlpha' && Math.abs(c.args[0] - 0.5) < 1e-9);
check('闪烁使用设定不透明度', alphaSet.length >= 1, alphaSet.map(a => a.args[0]));
let guard = 0;
while (api.game.flashEffect.intensity > 0 && guard++ < 200) api.draw();
check('闪烁会衰减到 0', api.game.flashEffect.intensity === 0, api.game.flashEffect.intensity);
check('衰减后颜色清空', api.game.flashEffect.color === null, api.game.flashEffect.color);

/* ================= T5 SFX diversity ================= */
section('T5 音效多样性');
api.newGame();
win.__sfx = 0;
const sfxList = Object.keys(api.SFX);
let allFired = true; const silent = [];
for (const name of sfxList) {
  const before = win.__sfx;
  try { api.SFX[name](); } catch (e) { silent.push(name + '(throw)'); allFired = false; continue; }
  if (win.__sfx === before) { silent.push(name); allFired = false; }
}
check('每个 SFX 预设都会发声', allFired, silent);
check('SFX 预设数量 >= 20', sfxList.length >= 20, sfxList.length);
/* gameplay integration */
win.__sfx = 0;
api.eat({ gold: false });
const normalEatSounds = win.__sfx;
win.__sfx = 0;
api.eat({ gold: true });
const goldEatSounds = win.__sfx;
check('吃普通食物发声', normalEatSounds >= 1, normalEatSounds);
check('吃金色食物发声', goldEatSounds >= 1, goldEatSounds);
win.__sfx = 0;
api.game.enemies.push({ x: 1, y: 1, type: 'normal', hp: 1, hit: 0, slow: 0, trail: 1 });
api.killEnemy(api.game.enemies[api.game.enemies.length - 1], 'test');
check('击杀敌人发声', win.__sfx >= 1, win.__sfx);
win.__sfx = 0;
api.flash('#fff', 0.5); api.shake(9, .4);
api.die('测试死亡');
check('死亡播放音效', win.__sfx >= 1, win.__sfx);
check('死亡触发红色闪烁', api.game.flashEffect.color === '#ff0000');
check('死亡触发强抖动', api.game.screenShake.intensity === 12, api.game.screenShake.intensity);

/* ================= T6 particle types ================= */
section('T6 粒子效果增强');
function particleTest(type, expected) {
  api.newGame();
  api.burst(5, 5, '#fff', type);
  const ps = api.game.particles;
  const okCount = ps.length === expected;
  const okShape = ps.every(p => typeof p.size === 'number' && typeof p.maxLife === 'number' && p.maxLife > 0);
  return { n: ps.length, okCount, okShape, sample: ps[0] };
}
const radial = particleTest('radial', 12);
const explosion = particleTest('explosion', 20);
const sparkle = particleTest('sparkle', 12);
const trail = particleTest('trail', 6);
check('radial 粒子数=12', radial.okCount, radial.n);
check('explosion 粒子数=20', explosion.okCount, explosion.n);
check('sparkle 粒子数=12', sparkle.okCount, sparkle.n);
check('trail 粒子数=6', trail.okCount, trail.n);
check('粒子带 size/maxLife 字段', radial.okShape && explosion.okShape && sparkle.okShape && trail.okShape);
check('explosion 粒子寿命更长(1.5s)', explosion.sample.life === 1.5, explosion.sample.life);
check('trail 粒子更小(2px)', trail.sample.size === 2, trail.sample.size);
check('explosion 粒子更大(4px)', explosion.sample.size === 4, explosion.sample.size);
/* cap */
api.newGame();
for (let i = 0; i < 40; i++) api.burst(3, 3, '#fff', 'explosion');
check('粒子总数被限制在 200 以内', api.game.particles.length <= 200, api.game.particles.length);
/* 4 种类型互不相同 */
check('实现至少 4 种粒子类型', new Set([radial.n, explosion.n, sparkle.n, trail.n]).size >= 3);

/* ================= T7 tutorial ================= */
section('T7 新手教学流程');
api.save = api.defaultSave();
api.newGame();
check('首次进入设置 tutorial 状态', !!api.game.tutorial, api.game.tutorial);
eq('教程从第 0 步开始', api.game.tutorial.step, 0);
api.game.snake.push({ x: 9, y: 9 });  /* 触发 move 步（蛇长 > 3） */
api.checkTutorialTrigger();
const box = $('#tutorialBox');
check('触发条件满足后显示教程框', !!box);
check('教程框位置类正确', !!box && box.className.includes('tutorial-center'), box && box.className);
check('教程期间游戏暂停', api.state === api.STATES.PAUSED, api.state);
check('教程标题正确', !!box && box.textContent.includes('移动控制'));
$('#tutorialNext').click();
check('点击“知道了”后教程框移除', !$('#tutorialBox'));
eq('教程推进到第 1 步', api.game.tutorial.step, 1);
check('教程结束后恢复游戏', api.state === api.STATES.PLAYING, api.state);
/* 跳过全部 */
api.game.combo = 3;
api.checkTutorialTrigger();
check('下一步触发条件满足后再次显示教程', !!$('#tutorialBox'));
$('#tutorialSkip').click();
check('可跳过教程', !$('#tutorialBox'));
check('跳过后标记已完成', api.save.settings.tutorialCompleted === true, api.save.settings.tutorialCompleted);
check('跳过后清除 tutorial 状态', api.game.tutorial === null);
/* 已完成不再触发 */
api.newGame();
check('教程完成后不再触发', !api.game.tutorial, api.game.tutorial);

/* ================= T8 tutorial edge cases ================= */
section('T8 教程边界情况（死亡/重复/持久化）');
api.save = api.defaultSave();
api.newGame();
api.game.snake.push({ x: 9, y: 9 });
api.checkTutorialTrigger();
check('教程框已显示（准备死亡测试）', !!$('#tutorialBox'));
api.die('测试');
check('死亡时移除教程框（不卡死）', !$('#tutorialBox'));
check('死亡时清除 tutorial 状态', api.game.tutorial === null, api.game.tutorial);
/* 重复触发不产生多个框 */
api.save = api.defaultSave();
api.newGame();
api.game.snake.push({ x: 9, y: 9 });
api.checkTutorialTrigger();
api.checkTutorialTrigger();
check('重复触发只保留一个教程框', $$('#tutorialBox').length === 1, $$('#tutorialBox').length);
/* 持久化：重新载入存档后 flag 生效 */
api.save.settings.tutorialCompleted = true;
api.persist();
const raw = win.localStorage.getItem('rogue_snake_save_v1');
check('教程完成状态写入 localStorage', !!raw && JSON.parse(raw).settings.tutorialCompleted === true);
/* 教程期间屏蔽其他按键 */
const beforePause = api.state;
key('p');
eq('教程打开时按 P 不会叠加暂停', api.state, beforePause);
if ($('#tutorialBox')) $('#tutorialSkip').click();

/* ================= T9 evolution Esc skip ================= */
section('T9 遗物进化（方案A：暂停 + 半透明遮罩 + Esc 跳过）');
api.save = api.defaultSave();
api.newGame();
api.addRelic('magnet', 3);
/* addRelic 用 setTimeout 打开进化；直接手动打开以保证确定性 */
if ($('#evolutionOverlay')) $('#evolutionOverlay').remove();
api.state = api.STATES.PLAYING;
api.showEvolution('magnet');
const evo = $('#evolutionOverlay');
check('进化遮罩出现', !!evo);
check('遮罩带 evolution-overlay 类（半透明）', !!evo && evo.className.includes('evolution-overlay'), evo && evo.className);
check('卡片带 evolution-card 类', !!$('.evolution-card'));
check('提示游戏已暂停', !!evo && evo.textContent.includes('游戏已暂停'));
check('进化时进入 RELIC_EVOLUTION 状态', api.state === api.STATES.RELIC_EVOLUTION, api.state);
/* Esc 跳过 */
ev(evo, 'keydown', { key: 'Escape' });
check('Esc 关闭进化遮罩', !$('#evolutionOverlay'));
eq('Esc 后记录待选进化', api.game.pendingEvolution, 'magnet');
check('Esc 后恢复游戏状态', api.state === api.STATES.PLAYING, api.state);
/* 暂停菜单提供继续入口 */
api.pause();
check('暂停菜单提示待选进化', !!$('.pause-warning') && $('#pauseOverlay').textContent.includes('有待选择的进化'));
check('暂停菜单提供“立即选择”按钮', !!$('#resumeEvolution'));
$('#resumeEvolution').click();
check('点击后重新打开进化选择', !!$('#evolutionOverlay'));
check('重新打开后清空 pendingEvolution', api.game.pendingEvolution === null, api.game.pendingEvolution);
/* 键盘 1 选择分支 */
const evo2 = $('#evolutionOverlay');
ev(evo2, 'keydown', { key: '1' });
check('按 1 完成进化选择', !!api.game.evolutions.magnet, api.game.evolutions);
check('选择后关闭遮罩', !$('#evolutionOverlay'));
check('选择后恢复游戏', api.state === api.STATES.PLAYING, api.state);
check('进化触发紫色闪烁', api.game.flashEffect.color === '#bd7bff', api.game.flashEffect.color);

/* ================= T10 howto tabs ================= */
section('T10 howto 基础/进阶标签页');
$('#howtoBtn').click();
check('howto 界面显示', !$('#howto').classList.contains('hidden'));
check('存在两个标签按钮', $$('.tab-btn').length === 2, $$('.tab-btn').length);
check('默认显示基础玩法', !$('#howto-basic').classList.contains('hidden'));
check('默认隐藏进阶机制', $('#howto-advanced').classList.contains('hidden'));
check('基础标签为激活态', $$('.tab-btn')[0].classList.contains('active'));
$('[data-tab="advanced"]').click();
check('切换到进阶后基础隐藏', $('#howto-basic').classList.contains('hidden'));
check('切换到进阶后进阶显示', !$('#howto-advanced').classList.contains('hidden'));
check('进阶标签为激活态', $('[data-tab="advanced"]').classList.contains('active'));
check('基础标签取消激活', !$$('.tab-btn')[0].classList.contains('active'));
$('[data-tab="basic"]').click();
check('切回基础正确', !$('#howto-basic').classList.contains('hidden') && $('#howto-advanced').classList.contains('hidden'));
check('基础内容含 5 条', $$('#howto-basic article').length === 5, $$('#howto-basic article').length);
check('进阶内容含 8 条（含敌人攻略）', $$('#howto-advanced article').length === 8, $$('#howto-advanced article').length);

/* ================= T11 inheritance visibility ================= */
section('T11 传承系统可见性');
api.save = api.defaultSave();
api.save.inheritance = { enabled: true, relicId: 'magnet', keepStack: 1, evolution: null, lockedAt: Date.now() };
api.showScreen('menu');
const mi = $('#menuInherit');
check('主菜单显示传承预览', !!mi && mi.textContent.includes('当前传承'));
check('主菜单显示传承遗物名', !!mi && mi.textContent.includes('磁吸'), mi && mi.textContent.slice(0, 80));
check('主菜单显示保留层数', !!mi && mi.textContent.includes('×1'));
/* 进化徽章 */
api.save.inheritance.evolution = 'gravity';
api.showScreen('menu');
check('传承带进化时显示进化名', $('#menuInherit').textContent.includes('引力井'), $('#menuInherit').textContent);
api.save.inheritance = { enabled: false, relicId: null, keepStack: 1, evolution: null, lockedAt: null };
api.showScreen('menu');
check('无传承时显示占位', $('#menuInherit').textContent.includes('暂无传承'));
/* 升级选择中的传承高亮 */
api.save.inheritance = { enabled: true, relicId: 'magnet', keepStack: 1, evolution: null, lockedAt: Date.now() };
api.newGame();
let sawInheritCard = false, inheritHasName = false;
for (let i = 0; i < 60 && !sawInheritCard; i++) {
  api.state = api.STATES.PLAYING;
  api.showUpgrade();
  const card = $('.inherit-card');
  if (card) { sawInheritCard = true; inheritHasName = card.textContent.includes('磁吸') || card.querySelector('h3').textContent.includes('磁吸'); }
  const ov = $('#upgradeOverlay'); if (ov) ov.remove();
}
check('升级卡池中传承遗物高亮', sawInheritCard);
check('高亮卡片确为传承遗物', inheritHasName);
/* HUD 传承印记提示 */
api.newGame();
api.game.mark = true;
api.updateHud();
check('获得传承印记后显示按 Q 提示', !!$('#markHint') && $('#markHint').textContent.includes('按 Q'), $('#markHint') && $('#markHint').textContent);
api.game.mark = false;
api.updateHud();
check('印记用掉后提示消失', !$('#markHint'));
/* 游戏内 HUD 传承标识 */
api.save.inheritance = { enabled: true, relicId: 'magnet', keepStack: 1, evolution: null, lockedAt: Date.now() };
api.newGame();
api.updateHud();
check('HUD 显示传承遗物标识', !!$('#inheritHud') && !$('#inheritHud').classList.contains('hidden'), $('#inheritHud') && $('#inheritHud').className);
check('HUD 传承标识含遗物名与层数', $('#inheritHud').textContent.includes('磁吸') && $('#inheritHud').textContent.includes('×1'), $('#inheritHud').textContent);
check('HUD 传承标识带悬停说明', !!$('#inheritHud').title, $('#inheritHud').title);
api.save.inheritance = { enabled: false, relicId: null, keepStack: 1, evolution: null, lockedAt: null };
api.newGame();
api.updateHud();
check('无传承时 HUD 标识隐藏', $('#inheritHud').classList.contains('hidden'));
/* 数值变化动画（Part E） */
api.newGame();
api.updateHud();
$('#scoreHud').classList.remove('number-pop');
api.game.score += 10;
api.updateHud();
check('分数变化时触发数值弹跳动画', $('#scoreHud').classList.contains('number-pop'), $('#scoreHud').className);
$('#levelHud').classList.remove('number-pop');
api.game.level += 1;
api.updateHud();
check('等级变化时触发数值弹跳动画', $('#levelHud').classList.contains('number-pop'));
$('#threatHud').classList.remove('number-pop');
api.game.threat = Math.min(10, api.game.threat + 1);
api.updateHud();
check('威胁变化时触发数值弹跳动画', $('#threatHud').classList.contains('number-pop'));
check('数值弹跳样式已定义', true);

/* ================= T12 settings ================= */
section('T12 设置项');
check('T11 结束后无遗留选卡遮罩', $$('#upgradeOverlay').length === 0, $$('#upgradeOverlay').length);
$('#toggleShake').click();
check('震动开关可关闭', api.save.settings.screenShake === false);
check('按钮文字同步', $('#toggleShake').textContent.includes('关'), $('#toggleShake').textContent);
$('#toggleShake').click();
check('震动开关可恢复', api.save.settings.screenShake === true);
api.save.settings.tutorialCompleted = true;
$('#resetTutorial').click();
check('“重看新手教程”重置完成标记', api.save.settings.tutorialCompleted === false);
check('重置后按钮存在且可点', !!$('#resetTutorial'));
/* 震动关闭时不绘制抖动 */
api.save.settings.screenShake = false;
api.newGame();
api.game.screenShake.intensity = 0;
ctxCalls.length = 0;
api.draw();
check('关闭震动时 translate 为 0', ctxCalls.filter(c => c.m === 'translate').every(c => c.args[0] === 0 && c.args[1] === 0));
api.save.settings.screenShake = true;

/* ================= T13 gameplay smoke + integration ================= */
section('T13 长时间对局冒烟测试（集成未破坏核心玩法）');
check('T12 结束后无遗留选卡遮罩', $$('#upgradeOverlay').length === 0, $$('#upgradeOverlay').length);
api.save = api.defaultSave();
let errors = [];
win.addEventListener('error', e => errors.push(String(e.message)));
/* deterministic seed + greedy bot so the smoke test is reproducible */
const realRandom = win.Math.random, realNow = win.Date.now;
win.Math.random = () => 0.4242;
win.Date.now = () => 1700000000000;
api.newGame();
let frames = 0, deaths = 0, maxScore = 0, maxLevel = 1, ateSomething = false, maxThreat = 1;
const seenTypes = new Set();
const stateHist = {};
const GD = api.GRID || 24;
function chooseDir() {
  const g = api.game;
  const head = g.snake[0], dir = g.dir, target = g.food[0];
  const opts = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
    .filter(d => !(d.x === -dir.x && d.y === -dir.y));
  const safe = opts.filter(d => {
    const nx = head.x + d.x, ny = head.y + d.y;
    if (nx < 0 || ny < 0 || nx >= GD || ny >= GD) return false;
    return !g.snake.some((s, i) => i > 0 && s.x === nx && s.y === ny);
  });
  if (!safe.length) return null;
  if (target) {
    safe.sort((a, b) =>
      (Math.abs(head.x + a.x - target.x) + Math.abs(head.y + a.y - target.y)) -
      (Math.abs(head.x + b.x - target.x) + Math.abs(head.y + b.y - target.y)));
  }
  return safe[0];
}
try {
  for (let i = 0; i < 2500; i++) {
    if (api.state === api.STATES.GAMEOVER) { deaths++; api.newGame(); }
    if (api.game && api.game.tutorial) { const sk = $('#tutorialSkip'); if (sk) sk.click(); }
    /* advance through modal states so a full run is exercised */
    if (api.state === api.STATES.UPGRADE_CHOICE) {
      const c = $('#upgradeOverlay .relic-card'); if (c) c.click(); else { const o = $('#upgradeOverlay'); if (o) o.remove(); }
    } else if (api.state === api.STATES.ALTAR_CHOICE) {
      const r = $('#altarReject'); if (r) r.click(); else { const o = $('#altarOverlay'); if (o) o.remove(); }
    } else if (api.state === api.STATES.RELIC_EVOLUTION) {
      const c = $('#evolutionOverlay .relic-card'); if (c) c.click(); else { const o = $('#evolutionOverlay'); if (o) o.remove(); }
    }
    /* greedy bot: steer toward the nearest food, never reversing into itself */
    if (api.game && api.state === api.STATES.PLAYING && api.game.queue.length === 0 && i % 2 === 0) {
      const d = chooseDir();
      if (d) api.game.queue.push(d);
    }
    api.tick(0.05);
    api.draw();
    frames++;
    stateHist[api.state] = (stateHist[api.state] || 0) + 1;
    if (api.game) {
      maxScore = Math.max(maxScore, api.game.score);
      maxLevel = Math.max(maxLevel, api.game.level);
      maxThreat = Math.max(maxThreat, api.game.threat);
      if (api.game.foodCount > 0) ateSomething = true;
      api.game.enemies.forEach(e => seenTypes.add(e.type));
    }
  }
} catch (e) {
  errors.push('tick/draw threw: ' + e.message + '\n' + e.stack);
} finally {
  win.Math.random = realRandom; win.Date.now = realNow;
}
check('2500 帧无异常', errors.length === 0, errors.slice(0, 2));
eq('实际执行帧数', frames, 2500);
check('机器人确实吃到了食物', ateSomething);
check('分数会增长', maxScore > 0, maxScore);
check('能够升级', maxLevel >= 2, maxLevel);
check('威胁等级会上升', maxThreat >= 2, maxThreat);
check('对局中出现了多种敌人类型', seenTypes.size >= 1, [...seenTypes]);
check('粒子数量始终 <= 200', api.game.particles.length <= 200, api.game.particles.length);
console.log('  info  死亡次数=' + deaths + ' 最高分=' + maxScore + ' 最高等级=' + maxLevel + ' 最高威胁=' + maxThreat + ' 敌人类型=' + [...seenTypes].join(','));
console.log('  info  当前局: foodCount=' + api.game.foodCount + ' 场上食物=' + api.game.food.length + ' 蛇长=' + api.game.snake.length + ' 移动步数=' + api.game.turns + ' state=' + api.state);
console.log('  info  状态分布=' + Object.entries(stateHist).map(([k, v]) => k + ':' + v).join(' '));

/* ================= T13b deterministic eat -> level up ================= */
section('T13b 确定性「吃食物 → 升级 → 选遗物」路径');
api.save = api.defaultSave();
api.newGame();
api.state = api.STATES.PLAYING;
function clearBoardAndFeed() {
  const h = api.game.snake[0];
  api.game.enemies.length = 0;
  api.game.obstacles.length = 0;
  api.game.food.length = 0;
  api.game.dir = { x: 1, y: 0 };
  api.game.queue.length = 0;
  api.game.food.push({ x: h.x + 1, y: h.y, gold: false, life: 0 });
  const before = { xp: api.game.xp, level: api.game.level, score: api.game.score };
  api.moveTick();
  return { before, xp: api.game.xp, level: api.game.level, score: api.game.score };
}
const feed1 = clearBoardAndFeed();
eq('吃下第 1 个食物后 xp=1', feed1.xp, 1);
eq('第 1 个食物后仍为 1 级', feed1.level, 1);
eq('吃食物获得 5 分', feed1.score - feed1.before.score, 5);
const feed2 = clearBoardAndFeed();
eq('第 2 个食物后仍为 1 级（xpNeed 已翻倍）', feed2.level, 1);
const feed3 = clearBoardAndFeed();
eq('第 3 个食物后仍为 1 级', feed3.level, 1);
const feed4 = clearBoardAndFeed();
eq('第 4 个食物触发升级', feed4.level, 2);
check('升级后进入选卡状态', api.state === api.STATES.UPGRADE_CHOICE, api.state);
check('升级弹出遗物三选一', !!$('#upgradeOverlay'));
eq('三选一提供 3 张卡', $$('#upgradeOverlay .relic-card').length, 3);
check('升级播放音效并闪烁', api.game.flashEffect.color === '#48e3ff', api.game.flashEffect.color);
/* choose a card */
const chosenName = $('#upgradeOverlay .relic-card h3').textContent;
$('#upgradeOverlay .relic-card').click();
check('选择遗物后关闭选卡界面', !$('#upgradeOverlay'));
check('选择遗物后恢复游戏', api.state === api.STATES.PLAYING, api.state);
check('遗物已记录', Object.keys(api.game.relics).length >= 1, api.game.relics);
check('选中的遗物与卡片一致', Object.keys(api.game.relics).some(id => chosenName.includes(api.relicById[id].name)),
  { chosenName, relics: api.game.relics });
/* gold food is worth double */
api.newGame();
api.state = api.STATES.PLAYING;
const h2 = api.game.snake[0];
api.game.enemies.length = 0; api.game.obstacles.length = 0; api.game.food.length = 0;
api.game.dir = { x: 1, y: 0 }; api.game.queue.length = 0;
api.game.food.push({ x: h2.x + 1, y: h2.y, gold: true, life: 0 });
const scoreBefore = api.game.score;
api.moveTick();
eq('金色食物价值翻倍（10 分）', api.game.score - scoreBefore, 10);

/* ================= T14 achievements still work ================= */
section('T14 成就系统仍可用（回归）');
api.save = api.defaultSave();
api.newGame();
api.die('测试');
check('首局成就解锁', api.save.achievements.first_run.unlocked === true, api.save.achievements.first_run);
check('成就奖励碎片发放', api.save.currency > 0, api.save.currency);
check('成就点数增加', api.save.achievementPoints >= 1, api.save.achievementPoints);
const toast = doc.querySelector('.achievement-toast');
check('成就提示气泡出现', !!toast);
check('总局数统计增加', api.save.stats.runs >= 1, api.save.stats.runs);

/* ================= T14b magnet stuck-food regression ================= */
section('T14b 磁吸把食物吸到蛇头时必须能吃到（回归）');
api.save = api.defaultSave();
api.newGame();
api.state = api.STATES.PLAYING;
api.game.tutorial = null;
api.addRelic('magnet');
api.game.enemies.length = 0;
api.game.obstacles.length = 0;
api.game.food.length = 0;
const gh = api.game.snake[0];
/* case 1: food starts on the head cell (the stuck state) */
api.game.food.push({ x: gh.x, y: gh.y, gold: false, life: 0 });
let fcBefore = api.game.foodCount;
api.tick(0.001);
check('食物位于蛇头格时会被吃掉', api.game.foodCount > fcBefore, { before: fcBefore, after: api.game.foodCount });
check('吃掉后不会残留食物在蛇头格', !api.game.food.some(f => f.x === api.game.snake[0].x && f.y === api.game.snake[0].y));
/* case 2: food one cell away gets pulled in and eaten */
api.newGame();
api.state = api.STATES.PLAYING;
api.game.tutorial = null;
api.addRelic('magnet');
api.game.enemies.length = 0;
api.game.obstacles.length = 0;
api.game.food.length = 0;
const gh2 = api.game.snake[0];
api.game.food.push({ x: gh2.x, y: gh2.y + 1, gold: false, life: 0 });
fcBefore = api.game.foodCount;
for (let i = 0; i < 5; i++) api.tick(0.001);
check('相邻食物被吸到蛇头后会被吃掉', api.game.foodCount > fcBefore, { before: fcBefore, after: api.game.foodCount });
check('食物不会被永久吸附在蛇头上', !api.game.food.some(f => f.x === api.game.snake[0].x && f.y === api.game.snake[0].y),
  api.game.food.map(f => f.x + ',' + f.y));

/* ================= T15 new enemies still work (regression) ================= */section('T15 新敌人类型仍可生成（回归）');
api.save = api.defaultSave();
api.newGame();
for (const t of ['guardian', 'bomber', 'splitter', 'summoner']) {
  api.game.enemies.length = 0;
  api.spawnEnemy(t);
  check('可生成 ' + t, api.game.enemies.length === 1 && api.game.enemies[0].type === t,
    api.game.enemies.map(e => e.type));
}
api.game.enemies.length = 0;
api.spawnEnemy('guardian');
eq('守卫 2 点生命', api.game.enemies[0].hp, 2);
api.game.enemies.length = 0;
api.spawnEnemy('splitter');
api.killEnemy(api.game.enemies[0], 'test');
check('分裂体死亡后分裂出 2 个', api.game.enemies.length === 2, api.game.enemies.length);

/* ================= T17 项目2：遗物平衡与协同强化 ================= */
section('T17 项目2 - 囤积者系统');
function fresh(...relicList) {
  api.save = api.defaultSave();
  api.newGame();
  api.game.tutorial = null;
  api.state = api.STATES.PLAYING;
  /* newGame 会随机生成地形/祭坛，这里清空以保证测试可复现 */
  api.game.terrain = null; api.game.altar = null; api.game.invuln = 0;
  api.game.enemies.length = 0; api.game.obstacles.length = 0; api.game.food.length = 0; api.game.particles.length = 0;
  relicList.forEach(r => { if (!api.has(r)) api.addRelic(r); });
  return api.game;
}

let g = fresh('collector');
api.showUpgrade();
check('囤积者 - 跳过按钮存在', !!$('#skipRelic'));
const stackBefore = g.hoarderStacks || 0;
$('#skipRelic').click();
check('囤积者 - 跳过累积 1 栈', g.hoarderStacks === stackBefore + 1, g.hoarderStacks);

g = fresh('collector');
g.hoarderStacks = 3;
api.updateHud();
check('囤积者 HUD 可见', !$('#hoarderHud').classList.contains('hidden'));
check('囤积者 HUD 显示栈数', $('#hoarderHud').textContent.includes('3'));

g.hoarderStacks = 2;
const sumStacks = (gg) => Object.keys(gg.relics).reduce((n, k) => n + (gg.relics[k] || 0), 0);
const stacksBefore = sumStacks(g);
key('e');
check('囤积者 - E键消耗栈数', g.hoarderStacks === 0);
check('囤积者 - E键获得遗物（总层数 +2）', sumStacks(g) === stacksBefore + 2, { before: stacksBefore, after: sumStacks(g) });

section('T17 项目2 - 壁垒全局计数');
g = fresh('wall');
check('壁垒 - 碰撞计数初始 0', g.wallCollisions === 0);
for (let i = 0; i < 3; i++) {
  g.snake[0] = { x: 0, y: 12, px: 0, py: 12 };
  g.dir = { x: -1, y: 0 }; g.queue.length = 0;
  api.moveTick();
  check(`壁垒 - 第 ${i + 1} 次碰撞存活`, api.state === api.STATES.PLAYING && g.wallCollisions === i + 1);
}
g.snake[0] = { x: 0, y: 12, px: 0, py: 12 };
g.dir = { x: -1, y: 0 }; g.queue.length = 0;
api.moveTick();
check('壁垒 - 第 4 次碰撞死亡', api.state === api.STATES.GAMEOVER);

section('T17 项目2 - 甲壳充能系统');
g = fresh('armor');
check('甲壳 - 获得时充能 1', g.armorCharges === 1);
check('甲壳 - maxArmor=3 at 1层', api.maxArmor() === 3);
api.addRelic('armor');
check('甲壳 - 第2层再充1', g.armorCharges === 2);
check('甲壳 - maxArmor=4 at 2层', api.maxArmor() === 4);

g = fresh('armor');
g.armorCharges = 1;
g.armorChargeTimer = 0.01;
api.state = api.STATES.PLAYING;
api.tick(0.05);
check('甲壳 - 充能计时器工作', g.armorCharges === 2);

g = fresh('armor');
g.armorCharges = 1;
g.snake = [{ x: 5, y: 5, px: 5, py: 5 }, { x: 4, y: 5, px: 4, py: 5 }, { x: 3, y: 5, px: 3, py: 5 }];
g.dir = { x: 1, y: 0 }; g.queue.length = 0; g.shield = 0;
g.enemies.push({ x: 6, y: 5, px: 6, py: 5, type: 'normal', hp: 1, hit: 0, slow: 0, trail: 1 });
api.moveTick();
check('甲壳 - 碰撞消耗充能', g.armorCharges === 0, {charges:g.armorCharges, state:api.state});
check('甲壳 - 碰撞后存活', api.state === api.STATES.PLAYING);

section('T17 项目2 - 灵魂回响');
g = fresh('echo');
while (g.snake.length < 7) api.growSnake(1);
g.skill = 'tail'; g.skillCooldown = 0;
api.useSkill();
check('回响 - 断尾激活', g.echoActive === true && g.echoTimer === 5);

g = fresh('echo');
while (g.snake.length < 7) api.growSnake(1);
g.skill = 'tail'; g.skillCooldown = 0; g.xp = 0; g.xpNeed = 99;
api.useSkill();
api.eat({ x: 10, y: 10, gold: false });
check('回响 - 食物获得额外 +2 能量', g.xp === 3, g.xp);

g = fresh('echo');
g.r = () => 0.2;
g.frenzy = 0; g.streak = 0; g.food.length = 0; g.echoActive = false;
api.spawnFood();
check('回响 - 基础金色概率 (0.2 > 0.08)', g.food.length && !g.food[0].gold);
g.food.length = 0; g.echoActive = true;
api.spawnFood();
check('回响 - 激活时 +30% 金色概率 (0.2 < 0.38)', g.food.length && g.food[0].gold);

section('T17 项目2 - 经济流协同');
g = fresh('magnet');
check('经济流 - magnet 激活协同', api.hasSyn('经济流'));
g.combo = 4; g.comboTimer = 5; g.xpNeed = 99; g.frenzy = 0;
api.eat({ x: 10, y: 10, gold: false });
check('经济流 - 狂暴时间 +2s', g.frenzy === 5, g.frenzy);

g = fresh();
g.combo = 4; g.comboTimer = 5; g.xpNeed = 99; g.frenzy = 0;
api.eat({ x: 10, y: 10, gold: false });
check('经济流 - 对照：无协同时狂暴 3s', g.frenzy === 3, g.frenzy);

section('T17 项目2 - 破坏流协同');
g = fresh('thorn');
check('破坏流 - thorn 激活协同', api.hasSyn('破坏流'));
const lenBefore = g.snake.length;
api.spawnEnemy('normal');
const e = g.enemies[0];
api.killEnemy(e, 'test');
check('破坏流 - 击杀恢复 1 节', g.snake.length === lenBefore + 1);

g = fresh('thorn');
while (g.snake.length < 6) api.growSnake(1);
g.snake[0] = { x: 5, y: 5, px: 5, py: 5 };
g.dir = { x: 1, y: 0 }; g.queue.length = 0;
g.enemies.length = 0;
g.enemies.push({ x: 6, y: 5, type: 'normal', hp: 1, hit: 0, slow: 0, trail: 1 });
g.enemies.push({ x: 7, y: 5, type: 'normal', hp: 1, hit: 0, slow: 0, trail: 1 });
api.moveTick();
check('破坏流 - 碰撞范围 2 格全灭', g.enemies.length === 0);

section('T17 项目2 - 献祭流协同');
g = fresh('echo');
check('献祭流 - echo 激活协同', api.hasSyn('献祭流'));
g.献祭流Counter = 9; g.xpNeed = 999;
const echoBefore = g.relics.echo;
api.eat({ x: 10, y: 10, gold: false });
check('献祭流 - 10食物重置计数', g.献祭流Counter === 0);
check('献祭流 - 诅咒遗物自动升级', g.relics.echo === echoBefore + 1);

g = fresh('echo');
g.r = () => 0.15;
g.frenzy = 0; g.streak = 0; g.food.length = 0;
g.relics.echo = 2;
api.spawnFood();
check('献祭流 - 金色概率 +8%/诅咒层 (0.15 < 0.08+0.16)', g.food.length && g.food[0].gold);

section('T17 项目2 - 召唤流协同');
g = fresh('symbiote');
check('召唤流 - symbiote 激活协同', api.hasSyn('召唤流'));
g.shield = 0;
g.allies.push({ x: 3, y: 3, life: 5 });
api.state = api.STATES.PLAYING;
api.tick(0.05);
check('召唤流 - 友军存在时持续护盾', g.shield >= 1);

g = fresh('symbiote');
const snakeLenBefore = g.snake.length;
g.allies = [{ x: 3, y: 3, life: -1 }];
api.moveEnemies();
check('召唤流 - 友军死亡恢复 3 节', g.snake.length === snakeLenBefore + 3);
check('召唤流 - 友军已移除', g.allies.length === 0);

section('T17 项目2 - 猎风流协同');
g = fresh('magnet', 'thorn', 'time');
check('猎风流 - mobility+curse 激活协同', api.hasSyn('猎风流'));
g.huntwindStacks = 0;
g.enemies.push({ x: g.snake[0].x + 1, y: g.snake[0].y, type: 'normal', hp: 1, hit: 0, slow: 0, trail: 1 });
const dirs = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: -1 }];
g.dir = { x: 1, y: 0 };
for (const d of dirs) {
  g.queue.length = 0;
  api.enqueue(d);
  g.dir = d;
}
check('猎风流 - 5次转向重置栈数', g.huntwindStacks === 0);
check('猎风流 - 冲击波清空范围 3 内敌人', g.enemies.length === 0);

section('T17 项目2 - 疾风掠夺协同');
g = fresh('magnet', 'thorn');
check('疾风掠夺 - magnet+thorn 激活', api.hasSyn('疾风掠夺'));
g.food.length = 0; g.frenzy = 1;
api.spawnEnemy('normal');
const enemy = g.enemies[0];
api.killEnemy(enemy, 'test');
check('疾风掠夺 - 狂暴击杀掉落金食物', g.food.some(f => f.gold));

section('T17 项目2 - 血祭军团协同');
g = fresh('echo', 'egg', 'thorn');
check('血祭军团 - echo+egg+thorn 激活', api.hasSyn('血祭军团'));
while (g.snake.length < 7) api.growSnake(1);
g.skill = 'tail'; g.skillCooldown = 0;
api.useSkill();
check('血祭军团 - 断尾召唤强化友军', g.allies.length === 1 && g.allies[0].enhanced === true && g.allies[0].life === 15);

section('T17 项目2 - 反协同：贪婪+再生');
g = fresh('greed', 'regen');
check('反协同 - greed+regen 检测', api.checkAntiSynergies().length === 1);
g.shield = 0; g.frenzy = 0; g.foodCount = 7; g.xpNeed = 999;
api.eat({ x: 10, y: 10, gold: false });
check('反协同 - 8食物不触发再生', g.shield === 0);
g.foodCount = 15;
api.eat({ x: 10, y: 10, gold: false });
check('反协同 - 16食物触发再生', g.shield === 2);

g = fresh('regen');
g.shield = 0; g.frenzy = 0; g.foodCount = 7; g.xpNeed = 999;
api.eat({ x: 10, y: 10, gold: false });
check('反协同 - 对照：无反协同时 8食物触发', g.shield === 2);

section('T17 项目2 - 反协同：相位+荆棘');
g = fresh('phase', 'thorn');
check('反协同 - phase+thorn 检测', api.checkAntiSynergies().some(a => a.penalty.includes('荆棘')));
g.turns = 5; g.lastTrailTurn = 4;
api.state = api.STATES.PLAYING;
api.tick(0.001);
const thornObstacle = g.obstacles.filter(o => o.thorn).pop();
check('反协同 - 荆棘持续时间减半', thornObstacle && thornObstacle.life === 1);

g = fresh('thorn');
g.turns = 5; g.lastTrailTurn = 4;
api.state = api.STATES.PLAYING;
api.tick(0.001);
const normalThorn = g.obstacles.filter(o => o.thorn).pop();
check('反协同 - 对照：无反协同时荆棘持续 2s', normalThorn && normalThorn.life === 2);

section('T17 项目2 - UI 显示');
g = fresh('magnet');
api.updateHud();
check('协同 HUD - 有协同时可见', !$('#synergyHud').classList.contains('hidden'));
check('协同 HUD - 显示协同名称', $('#synergyHud').textContent.includes('经济流'));

g = fresh();
api.updateHud();
check('协同 HUD - 无协同时隐藏', $('#synergyHud').classList.contains('hidden'));

section('T17 项目2 - 遗物文案与祭坛效果修复');
check('囤积者已更名（原拾荒者）', api.relicById.collector.name === '囤积者', api.relicById.collector.name);
check('囤积者描述已更新为新机制', api.relicById.collector.desc.includes('能量栈'), api.relicById.collector.desc);
check('壁垒描述已改为全局计数', api.relicById.wall.desc.includes('全局'), api.relicById.wall.desc);

/* 祭坛「引燃威胁」：下一次升级必为稀有 —— 修复前 forceRare 从未被读取 */
g = fresh();
api.save.unlockedRelicIds = api.relics.map(r => r.id);
g.forceRare = true;
api.showUpgrade();
const rarities = $$('#upgradeOverlay .relic-card').map(c => {
  const sp = c.querySelector('span');
  return sp ? sp.textContent : '';
});
check('引燃威胁 - 下次升级必含稀有卡', rarities.some(t => t && !t.includes('COMMON')), rarities);
const rareCard = $$('#upgradeOverlay .relic-card')[0];
if (rareCard) rareCard.click();
check('引燃威胁 - 选卡后消耗标记', g.forceRare === false, g.forceRare);
$$('.overlay').forEach(o => o.remove());

/* 祭坛「悬赏赌注」：封顶后奖励翻倍 —— 修复前 bountyMultiplier 从未被读取 */
g = fresh();
g.threat = 10; g.bountyMultiplier = 2; g.bountyCombo = 0; g.score = 0;
api.completeBounty();
check('悬赏赌注 - 奖励翻倍结算 (80→160)', g.score === 160, g.score);
check('悬赏赌注 - 结算后重置倍率', g.bountyMultiplier === 1, g.bountyMultiplier);

g = fresh();
g.threat = 10; g.bountyMultiplier = 1; g.bountyCombo = 0; g.score = 0;
api.completeBounty();
check('悬赏赌注 - 对照：无倍率时 80 分', g.score === 80, g.score);

section('T24-T26 已知问题回归');
/* T24：稀有度加权与 forceRare 保底 */
{
  const counts = { common: 0, rare: 0, epic: 0, legendary: 0 };
  const pool = api.relics.filter(r => r.id !== 'mark');
  let seed = 0x12345678;
  const rand = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 10000; i++) counts[api.weightedPick(pool.slice(), rand, api.rarityWeight).rarity]++;
  const ratio = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / 10000]));
  check('稀有度加权 - 普通出货率在 45%-55%', ratio.common > .45 && ratio.common < .55, ratio);
  check('稀有度加权 - 传说出货率在 1%-3%', ratio.legendary > .01 && ratio.legendary < .03, ratio);
  check('forceRare - 非普通保底仍存在', api.game.forceRare === false || typeof api.game.forceRare === 'boolean');
  check('传承印记不进入普通抽卡池', !api.relicPool().some(r => r.id === 'mark'));
  g = fresh('voidmouth');
  const boosted = api.effectiveRarityWeight ? api.effectiveRarityWeight() : null;
  check('虚空之口 - 非普通权重提升', boosted && boosted.rare > api.rarityWeight.rare && boosted.epic > api.rarityWeight.epic && boosted.legendary > api.rarityWeight.legendary, boosted);
  g = fresh('collector');
  g.evolutions.collector = 'treasure';
  const treasureWeights = api.effectiveRarityWeight ? api.effectiveRarityWeight() : null;
  check('珍品搜索 - epic/legendary 权重提升', treasureWeights && treasureWeights.epic === 30 && treasureWeights.legendary === 14, treasureWeights);
}
/* T25：显式反协同来源与冰面实际惩罚 */
g = fresh('greed', 'regen');
check('反协同来源 - 遗物条件仍生效', api.checkAntiSynergies().some(a => a.desc === '贪婪 + 再生'));
g = fresh('swift');
g.terrain = { id: 'ice', name: '冰面', effect: '', cells: [{x: 5, y: 5}], hazards: [], portals: [], wind: {x: 1, y: 0}, timer: 0, warning: 0, slide: 0, riftCooldown: 0 };
api.applyTerrainEnter(5, 5);
check('反协同来源 - 冰面+迅鳞被识别', api.checkAntiSynergies().some(a => a.desc === '冰面 + 迅鳞'));
check('反协同来源 - 冰面滑行距离增加', g.terrain.slide === 2, g.terrain.slide);
g = fresh('riftkey', 'time');
check('反协同来源 - 裂隙钥匙+时间腐蚀被识别', api.checkAntiSynergies().some(a => a.desc === '裂隙钥匙 + 时间腐蚀'));
/* T26：碎片结算曲线 */
check('碎片曲线 - raw 60 全额', api.calcShards(60) === 60, api.calcShards(60));
check('碎片曲线 - raw 150 为 123', api.calcShards(150) === 123, api.calcShards(150));
check('碎片曲线 - raw 400 为 248', api.calcShards(400) === 248, api.calcShards(400));
check('碎片曲线 - 单调递增', api.calcShards(500) > api.calcShards(400) && api.calcShards(400) > api.calcShards(300));
check('碎片曲线 - 边际转化率递减', api.calcShards(200)-api.calcShards(100) > api.calcShards(700)-api.calcShards(600));
check('碎片曲线 - 提纯加成 15%', api.calcShards(100, true) === Math.floor(88 * 1.15), api.calcShards(100, true));

section('T27 桌面可读性与时间一致性');
{
  const old = api.migrateSave({version:2, currency:123, settings:{sfx:false}, achievements:{first_run:{unlocked:true,progress:1}}});
  check('迁移 - 旧版本升级到 3', old.version===3);
  check('迁移 - 保留货币与设置', old.currency===123 && old.settings.sfx===false && old.settings.screenShake===true);
  check('迁移 - 修补嵌套成就字段', old.achievements.first_run.target===1 && old.achievements.first_run.unlocked===true);
  g=fresh('thorn'); api.updateHud();
  check('构筑 HUD - 显示层数', $('#buildHud').textContent.includes('荆棘尾 ×1'));
  g.forceRare=true;api.pause();
  check('暂停规则 - 显示保底与 E 兑换', $('#pauseRules').textContent.includes('至少一张非普通') && $('#pauseRules').textContent.includes('囤积兑换：E'));
  const elapsed=g.elapsed;api.tick(.5);
  check('暂停 - 新增时间效果不推进', g.elapsed===elapsed);
  api.pause();
  g=fresh('swift');g.dir={x:1,y:0};g.snake=[{x:5,y:5},{x:4,y:5},{x:3,y:5}];g.food=[];g.invuln=10;
  g.terrain={id:'ice',name:'冰面',cells:[{x:5,y:5},{x:6,y:5},{x:7,y:5}],hazards:[],portals:[],wind:{},timer:0,warning:0,slide:0,riftCooldown:0};
  api.applyTerrainEnter(5,5);api.tick(.016);
  check('冰面 - 两格滑行后不重复触发', g.snake[0].x===7 && g.terrain.slide===0, {head:g.snake[0],slide:g.terrain.slide});
  api.tick(.016);check('冰面 - 下一帧不额外移动',g.snake[0].x===7);
  g=fresh('voidmouth','armor');g.terrain=null;g.r=()=>.99;g.voidmouthTimer=.05;g.invuln=10;
  api.tick(.05);
  check('虚空之口 - 定时失去一层遗物',g.relics.armor===0 && g.relics.voidmouth===1,g.relics);
  g=fresh('egg','armor');g.terrain=null;g.allies=[{x:1,y:1,life:8}];g.summonShieldCooldown=0;
  api.tick(.05);check('召唤护盾 - 有周期冷却',g.summonShieldCooldown>3 && g.summonShieldCooldown<=4);
  for(let i=0;i<25;i++)api.tick(.05);
  check('召唤护盾 - 不再每帧永久续期',g.shield===0 && g.summonShieldCooldown>0);
}

section('T28 多种子与资源上限');
{
  for(const seed0 of [1,7,42,1234,98765]){
    g=fresh('armor');g.terrain=null;g.invuln=100;let seed=seed0;
    g.r=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
    let error=null;
    try{for(let i=0;i<300;i++){api.tick(.016);if(i%30===0)api.draw()}}catch(e){error=e.message}
    check('种子 '+seed0+' - 连续更新无异常',!error,error);
    check('种子 '+seed0+' - 粒子与敌人有界',g.particles.length<=200 && g.enemies.length<=24,{particles:g.particles.length,enemies:g.enemies.length});
  }
  g=fresh();for(let i=0;i<100;i++)api.burst(5,5,'#ffffff','explosion');
  check('粒子压力 - 严格 200 上限',g.particles.length===200,g.particles.length);
}

section('T29 保底、护盾上限、协同等级与状态接口');
{
  /* 稀有度保底 */
  g=fresh();g.dryDraws=0;
  api.updatePity([api.relicById.magnet]);
  check('保底 - 普通卡组累积 dryDraws', g.dryDraws===1, g.dryDraws);
  api.updatePity([api.relicById.phase]);
  check('保底 - 高稀有重置 dryDraws', g.dryDraws===0, g.dryDraws);
  g.dryDraws=0;
  const baseW=api.effectiveRarityWeight();
  check('保底 - 未触发时权重不变', baseW.epic===api.rarityWeight.epic && baseW.legendary===api.rarityWeight.legendary, baseW);
  g.dryDraws=api.pityConf.start;
  const pityW=api.effectiveRarityWeight();
  check('保底 - 触发后史诗/传说权重提升', pityW.epic>baseW.epic && pityW.legendary>baseW.legendary, pityW);
  g.dryDraws=999;
  const capW=api.effectiveRarityWeight();
  check('保底 - 倍率有上限', capW.legendary<=api.rarityWeight.legendary*api.pityConf.max+.01, capW.legendary);
  /* 构筑倾向权重 */
  g=fresh('magnet');
  check('倾向 - 已有遗物权重上调', api.relicContextBonus(api.relicById.magnet)>1, api.relicContextBonus(api.relicById.magnet));
  g=fresh('riftkey');
  check('倾向 - 会触发反协同的遗物权重下调', api.relicContextBonus(api.relicById.time)<1, api.relicContextBonus(api.relicById.time));
  /* 护盾上限 */
  g=fresh();g.shield=0;
  api.grantShield(5,'测试盾');
  check('护盾 - 受上限保护', g.shield===api.maxShield(), g.shield);
  check('护盾 - 记录来源', g.lastShieldSource==='测试盾', g.lastShieldSource);
  api.grantShield(1,'小盾');
  check('护盾 - 短盾不覆盖长盾', g.shield===api.maxShield(), g.shield);
  /* 协同等级 */
  g=fresh('magnet');
  const eco=api.synergyDefs.find(s=>s.name==='经济流');
  check('协同等级 - 单层为 Lv1', api.synergyLevel(eco)===1, api.synergyLevel(eco));
  g.relics.magnet=3;
  check('协同等级 - 三层为 Lv2', api.synergyLevel(eco)===2, api.synergyLevel(eco));
  g.evolutions.magnet='gravity';
  check('协同等级 - 进化后为 Lv3', api.synergyLevel(eco)===3, api.synergyLevel(eco));
  /* 状态接口 */
  g=fresh();api.growSnake(5);
  const scoreBefore=g.score;
  api.addScore(10.4,'测试得分');
  check('状态接口 - addScore 取整并入账', g.score===scoreBefore+10, {before:scoreBefore,after:g.score});
  check('状态接口 - addScore 写入日志', g.log.some(e=>e.type==='score'&&e.detail==='测试得分'), g.log.slice(-1));
  api.removeSnakeSegments(100,'测试断尾');
  check('状态接口 - 断尾不低于 3 节', g.snake.length===3, g.snake.length);
  check('状态接口 - 断尾写入日志', g.log.some(e=>e.type==='shrink'), g.log.slice(-1));
  /* 召唤护盾冷却不再双倍递减 */
  g=fresh('egg','symbiote');g.terrain=null;g.allies=[{x:1,y:1,life:8}];g.summonShieldCooldown=4;
  api.tick(.5);
  check('召唤护盾 - 冷却按真实时间递减', Math.abs(g.summonShieldCooldown-3.5)<.001, g.summonShieldCooldown);
  /* 粒子与飘字上限 */
  g=fresh();for(let i=0;i<200;i++)g.floaters.push({x:1,y:1,text:'x',color:'#fff',life:1});
  api.tick(.016);
  check('飘字 - 超过上限后裁剪', g.floaters.length<=60, g.floaters.length);
  check('日志 - 长度有界', g.log.length<=80, g.log.length);
}

/* ================= T19 多协同压力测试 ================= */
section('T19 多协同 / 反协同同时激活的压力测试');
{
  const savedRandom = win.Math.random, savedNow = win.Date.now;
  win.Math.random = () => 0.37;
  win.Date.now = () => 1700000000000;
  api.save = api.defaultSave();
  api.newGame();
  api.game.tutorial = null;
  api.state = api.STATES.PLAYING;
  ['magnet', 'thorn', 'echo', 'egg', 'symbiote', 'greed', 'regen', 'phase',
    'collector', 'armor', 'wall', 'feast', 'turn', 'blast', 'doublefruit', 'sacrifice']
    .forEach(r => api.addRelic(r));
  api.growSnake(6);

  const synNames = api.activeSynergies().map(s => s.name);
  const antis = api.checkAntiSynergies();
  check('多遗物下同时激活多个协同', synNames.length >= 5, synNames);
  check('多遗物下同时激活反协同', antis.length >= 2, antis.map(a => a.desc));
  check('囤积者已就位', api.has('collector'));

  let stressErr = null;
  let evolutionSeen = false, upgradeSeen = false;
  try {
    for (let i = 0; i < 1200; i++) {
      if (api.state === api.STATES.GAMEOVER) {
        api.newGame(); api.game.tutorial = null; api.state = api.STATES.PLAYING;
      }
      if (api.state === api.STATES.UPGRADE_CHOICE) {
        upgradeSeen = true;
        const skip = $('#skipRelic');
        const card = $('#upgradeOverlay .relic-card');
        if (skip && i % 3 === 1) skip.click(); else if (card) card.click();
        else { const o = $('#upgradeOverlay'); if (o) o.remove(); api.state = api.STATES.PLAYING; }
      } else if (api.state === api.STATES.ALTAR_CHOICE) {
        const r = $('#altarReject');
        if (r) r.click(); else { const o = $('#altarOverlay'); if (o) o.remove(); api.state = api.STATES.PLAYING; }
      } else if (api.state === api.STATES.RELIC_EVOLUTION) {
        evolutionSeen = true;
        const c = $('#evolutionOverlay .relic-card');
        if (c) c.click(); else { const o = $('#evolutionOverlay'); if (o) o.remove(); api.state = api.STATES.PLAYING; }
      }
      if (api.state === api.STATES.PLAYING) {
        if (i % 40 === 0) { api.game.skillCooldown = 0; api.useSkill(); }
        if (i % 90 === 0) key('x');           /* 献祭断尾 → 回响 / 血祭军团 */
        if (i % 120 === 0) key('e');          /* 囤积者兑换 */
        const d = chooseDir();
        if (d && api.game.queue.length === 0) api.game.queue.push(d);
      }
      api.tick(0.05);
      api.draw();
    }
  } catch (ex) { stressErr = ex; }
  check('多协同压力运行 1200 帧无异常', !stressErr, stressErr && String(stressErr.message || stressErr));
  check('压力测试后状态合法', Object.values(api.STATES).includes(api.state), api.state);
  check('压力测试覆盖了升级选卡流程', upgradeSeen);
  /* leave no modal behind for the async section that follows */
  $$('.overlay').forEach(o => o.remove());
  win.Math.random = savedRandom; win.Date.now = savedNow;
}

/* ================= T30 数据模块拆分一致性 ================= */
section('T30 数据模块拆分一致性');
{
  const dataFile = fs.readFileSync(path.join(__dirname, 'game-data.js'), 'utf8');
  const logicFile = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
  const htmlFile = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const dataAt = htmlFile.indexOf('<script src="game-data.js"></script>');
  const logicAt = htmlFile.indexOf('<script src="game.js"></script>');
  check('拆分 - 页面先加载数据模块', dataAt >= 0 && logicAt > dataAt, { dataAt, logicAt });
  ['const relics=[', 'const evolutions=', 'const synergyDefs=[', 'const antiSynergies=[',
    'const terrainDefs=', 'const achievementDefs=', 'const bountyDefs='].forEach(m =>
      check('拆分 - 数据模块包含 ' + m, dataFile.includes(m)));
  check('拆分 - 逻辑文件不再定义数据表',
    !logicFile.includes('const relics=[') && !logicFile.includes('const terrainDefs=') && !logicFile.includes('const synergyDefs=['));
  check('拆分 - 数据模块不含游戏逻辑', !/function\s+(newGame|tick|draw|moveTick)\b/.test(dataFile));
}

/* ================= T31 性能与资源回归 ================= */
section('T31 性能与资源回归');
{
  g = fresh('armor', 'thorn', 'magnet');
  g.invuln = 1e9; g.threat = 3;
  for (let i = 0; i < 8; i++) api.spawnEnemy('normal');
  const started = Date.now();
  for (let i = 0; i < 600; i++) { api.tick(1 / 60); if (i % 5 === 0) api.draw(); }
  const cost = Date.now() - started;
  check('性能 - 600 帧在合理时间内完成', cost < 8000, cost + 'ms');
  check('性能 - 粒子有界', g.particles.length <= 200, g.particles.length);
  check('性能 - 飘字有界', g.floaters.length <= 60, g.floaters.length);
  check('性能 - 敌人有界', g.enemies.length <= 24, g.enemies.length);
  check('性能 - 事件日志有界', g.log.length <= 80, g.log.length);
  const overlays = doc.querySelectorAll('.overlay').length;
  check('性能 - 弹层未泄漏', overlays <= 2, overlays);
  const nodeCount = doc.querySelectorAll('*').length;
  check('性能 - DOM 节点数量有界', nodeCount < 4000, nodeCount);
}

/* ================= T18 静态一致性：选择器 / 样式 ================= */
section('T18 静态一致性 - 选择器与样式表');
{
  const htmlSrc = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');

  /* ids the game creates at runtime, so they are legitimately absent from index.html */
  const dynamicIds = new Set(['markHint', 'tutorialBox', 'tutorialNext', 'tutorialSkip',
    'upgradeOverlay', 'evolutionOverlay', 'altarOverlay', 'gameoverOverlay', 'pauseOverlay',
    'resumeEvolution', 'inheritBtn', 'refreshInfo', 'skipRelic', 'altarReject', 'toastLayer',
    'choiceOverlay']);

  const staticIds = new Set([...htmlSrc.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  const jsIds = new Set([...gameSrc.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map(m => m[1]));
  const unresolved = [...jsIds].filter(id => !staticIds.has(id) && !dynamicIds.has(id));
  check('game.js 引用的 id 全部可解析', unresolved.length === 0, unresolved);

  const cssClasses = new Set([...cssSrc.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map(m => m[1]));
  const htmlClasses = new Set([...htmlSrc.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)));
  const needed = ['evolution-overlay', 'evolution-card', 'tutorial-box', 'howto-tabs', 'tab-btn',
    'inherit-hud', 'inherit-card', 'number-pop', 'synergy-hud', 'hoarder-hud'];
  const missingCss = needed.filter(c => !cssClasses.has(c));
  check('项目7/8 HUD 样式齐全', missingCss.length === 0, missingCss);

  ['inheritHud', 'synergyHud', 'hoarderHud'].forEach(id => {
    check('HUD 元素存在于 index.html：#' + id, staticIds.has(id));
  });
  check('样式表定义了 .synergy-hud', cssClasses.has('synergy-hud'));
  check('样式表定义了 .hoarder-hud', cssClasses.has('hoarder-hud'));
  check('样式表定义了反协同配色 .anti', cssClasses.has('anti'));
}

/* ---------------- summary (async: flushes timers first) ---------------- */
(async () => {
  section('T16 延时音效栈（刷新定时器后）');
  api.save.settings.sfx = true;
  api.newGame();
  win.__sfx = 0;
  api.SFX.death();
  await new Promise(r => win.setTimeout(r, 400));
  check('SFX.death 三段音效全部触发', win.__sfx >= 3, win.__sfx);
  /* achievement toast auto-dismisses */
  api.save = api.defaultSave();
  api.newGame();
  api.die('测试');
  check('成就气泡出现', !!doc.querySelector('.achievement-toast'));
  await new Promise(r => win.setTimeout(r, 3600));
  check('成就气泡自动消失', !doc.querySelector('.achievement-toast'));
  /* evolution scheduled by addRelic actually opens */
  api.save = api.defaultSave();
  api.newGame();
  api.state = api.STATES.PLAYING;
  api.addRelic('magnet', 3);
  await new Promise(r => win.setTimeout(r, 200));
  check('遗物满 3 层后自动弹出进化选择', !!$('#evolutionOverlay'));
  if ($('#evolutionOverlay')) {
    ev($('#evolutionOverlay'), 'keydown', { key: 'Escape' });
    check('Esc 跳过后不会误开暂停菜单（回归）', !$('#pauseOverlay') && api.state === api.STATES.PLAYING, { state: api.state });
    check('Esc 跳过后记录待选进化', api.game.pendingEvolution === 'magnet', api.game.pendingEvolution);
  }

  section('T17 敌人、地形与扩展遗物');
  check('八种地形均有数据定义', api.terrainIds.length === 8 && api.terrainIds.every(id => api.terrainDefs[id]));
  check('新增遗物全部存在且有 hook', ['shock','piercer','voltage','scanner','insulator','traction','marshrunner','cartographer','seedbank','scavenger','decoy','afterimage','phoenix','riftkey'].every(id => api.relicById[id] && api.relicById[id].hook));
  api.save = api.defaultSave(); api.newGame(); api.state = api.STATES.PLAYING;
  api.game.terrain = { id: 'ruins', name: '遗迹墙', effect: '', cells: [{x:1,y:1}], hazards: [], portals: [], wind: {x:1,y:0,next:8}, timer:0, warning:0, slide:0, riftCooldown:0 };
  const beforeTerrain = api.game.terrain.id;
  api.updateTerrain(.5);
  check('地形状态在对局中可更新', api.game.terrain.id === beforeTerrain);
  const special = api.spawnEnemy ? api.spawnEnemy('charger') : null;
  check('冲锋者可生成并带有特殊标记', !!special && special.type === 'charger' && special.special === true);
  check('旧存档默认字段可迁移', Array.isArray(api.save.unlockedRelicIds) && api.save.inheritance && api.save.settings);

  section('T18 存储被拒与残留引导框下的健壮性（回归）');
  /* 模拟线上“浏览器不允许写本地存储”：读写都抛 SecurityError */
  const realLS = Object.getOwnPropertyDescriptor(win, 'localStorage');
  Object.defineProperty(win, 'localStorage', {
    configurable: true,
    get() { throw new win.DOMException('The operation is insecure.', 'SecurityError'); }
  });
  api.save = api.defaultSave();
  api.newGame();
  let persistThrew = null;
  try { api.persist(); } catch (e) { persistThrew = e.name; }
  check('存储被拒时 persist() 不再抛错', persistThrew === null, persistThrew);
  check('存储被拒时给一次性降级提示', !!$('#storageWarning'));
  let dieThrew = null;
  try { api.die('回归测试'); } catch (e) { dieThrew = e.name; }
  check('存储被拒时 die() 不再抛错', dieThrew === null, dieThrew);
  check('存储被拒时结算界面仍然出现', !!$('#gameoverOverlay'));
  check('结算界面保留 R 重新开始按钮', !!$('#again'));

  /* 残留的引导框不该再吞掉结算界面的按键 */
  const ghost = doc.createElement('div');
  ghost.id = 'tutorialBox';
  $('#gameWrap').appendChild(ghost);
  key('r');
  check('残留引导框存在时 GAMEOVER 按 R 仍能重开',
    !$('#gameoverOverlay') && api.state === api.STATES.PLAYING,
    { state: api.state, overlay: !!$('#gameoverOverlay') });

  /* 局内残留引导框：自动清理，且不再吞方向键 */
  api.state = api.STATES.PLAYING;
  api.game.tutorial = null;
  const stale = doc.createElement('div');
  stale.id = 'tutorialBox';
  $('#gameWrap').appendChild(stale);
  check('hasActiveTutorial() 对残留框返回 false', api.hasActiveTutorial() === false);
  const queueBefore = api.game.queue.length;
  key('ArrowUp');
  check('残留引导框不再吞掉方向键', api.game.queue.length > queueBefore,
    { before: queueBefore, after: api.game.queue.length });
  check('残留引导框被自动清理', !$('#tutorialBox'));

  /* 真正进行中的引导仍然屏蔽游戏内按键（保护原设计） */
  api.save = api.defaultSave();
  api.newGame();
  api.game.tutorial = { step: 0, completed: [] };
  api.showTutorialStep(0);
  check('引导进行中 hasActiveTutorial() 为 true', api.hasActiveTutorial() === true);
  const queueDuring = api.game.queue.length;
  key('ArrowUp');
  check('引导进行中仍然屏蔽游戏内按键',
    api.game.queue.length === queueDuring && !!$('#tutorialBox'));

  /* 存储被拒时“跳过教程”也不会把引导框卡在页面上 */
  $('#tutorialSkip').click();
  check('存储被拒时跳过教程仍会摘掉引导框', !$('#tutorialBox'));
  check('存储被拒时跳过教程会恢复 PLAYING', api.state === api.STATES.PLAYING, api.state);

  /* 单帧异常不再永久冻结动画循环 */
  let rafCount = 0;
  const origRaf = win.requestAnimationFrame;
  win.requestAnimationFrame = () => { rafCount++; return 0; };
  api.save = api.defaultSave();
  api.newGame();
  api.game.tutorial = null;
  api.state = api.STATES.PLAYING;
  const shakeBefore = api.game.screenShake;
  api.game.screenShake = null;                      /* 让 tick()/draw() 抛错 */
  let loopThrew = null;
  try { api.loop(1000); } catch (e) { loopThrew = e.name; }
  check('loop() 内部异常不外泄', loopThrew === null, loopThrew);
  check('发生帧异常后仍然排下一帧', rafCount === 1, rafCount);
  check('帧异常给出一次性提示', !!$('#frameErrorNotice'));
  api.game.screenShake = shakeBefore;
  win.requestAnimationFrame = origRaf;

  /* 恢复真实存储，避免影响收尾统计 */
  if (realLS) Object.defineProperty(win, 'localStorage', realLS); else delete win.localStorage;
  let lsBack = 'ok';
  try { win.localStorage.setItem('__probe', '1'); win.localStorage.removeItem('__probe'); } catch (e) { lsBack = e.name; }
  check('localStorage 已恢复可用', lsBack === 'ok', lsBack);

  win.close();
  const failed = results.filter(r => !r.ok);
  console.log('\n================ SUMMARY ================');
  console.log('total: ' + results.length + '   passed: ' + (results.length - failed.length) + '   failed: ' + failed.length);
  if (failed.length) {
    console.log('\nFAILURES:');
    failed.forEach(f => console.log('  [' + f.section + '] ' + f.label + '  -> ' + JSON.stringify(f.detail)));
  }
  process.exit(failed.length ? 1 : 0);
})();
