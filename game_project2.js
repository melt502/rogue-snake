'use strict';
/* ---------- PROJECT 2 OPTIMIZATIONS DOCUMENTATION ----------
 * This file contains all relic balance and synergy enhancements:
 * 
 * PART A - Optimized Relics:
 * 1. collector → Hoarder system: accumulate energy stacks, spend for random relics
 * 2. wall → First 3 wall collisions per run don't kill
 * 3. armor → Recharges every 10s, stores up to 3 charges  
 * 4. echo → Enhanced: +2 energy per food for 5s + 30% gold chance after 断尾
 * 
 * PART B - Enhanced Synergies (2-tag):
 * - 经济流: +20% food value, +2s frenzy duration
 * - 破坏流: Kill restores 1 segment, collision damage range 2 cells
 * - 献祭流: Each curse level +8% gold, every 10 foods upgrade 1 curse relic
 * - 召唤流: Shield while allies exist, restore 3 segments when ally dies
 * - 猎风流: Each turn accumulates speed, 5 stacks = shockwave
 * 
 * PART C - Second-Order Synergies (3-tag):
 * - 疾风掠夺 (economy+mobility+attack): Frenzy kills spawn gold food
 * - 血祭军团 (curse+summon+attack): 断尾 summons enhanced ally (15s)
 * 
 * PART D - Anti-Synergies:
 * - Greed + Regen: Regen interval doubled
 * - Phase + Thorn: Thorn duration halved
 */

/* Key implementation notes for integration:
 * - Add hoarderStacks to game state in newGame()
 * - Add wallCollisions counter to game state
 * - Add armorCharges and armorChargeTimer to game state
 * - Add echoTimer to game state for enhanced echo
 * - Add huntwindStacks for 猎风流
 * - Update synergy descriptions in synergyDefs array
 * - Add antiSynergies array and checkAntiSynergies() function
 * - Modify eat() to implement 献祭流 auto-levelup
 * - Modify killEnemy() to implement 破坏流 segment restore
 * - Modify tick() to implement armor recharging and 召唤流
 * - Update updateHud() to show active synergies/anti-synergies
 */

// Example of the updated relic descriptions:
const relicsOptimized = [
  {id:'collector',name:'囤积者',rarity:'rare',tags:['economy'],desc:'跳过遗物选择时累积1能量栈；按E消耗全部栈数获得对应数量随机遗物（无选择）。三层可进化为「折价交易」或「珍品搜索」。',max:3,hook:'hoarder'},
  {id:'wall',name:'壁垒',rarity:'rare',tags:['survive'],desc:'前3次撞墙不会死亡（全局计数，不限区域），每层+1次。',max:3,hook:'wall'},
  {id:'armor',name:'甲壳',rarity:'common',tags:['survive'],desc:'抵挡敌人碰撞，最多存储3层护盾（每层+1），每10秒充能1层。三层可进化为「反震」或「坚守」。',max:3,hook:'armor'},
  {id:'echo',name:'灵魂回响',rarity:'epic',tags:['curse','economy'],desc:'断尾后的5秒内，每个食物额外获得2层能量，金色食物概率+30%。',max:3,hook:'echo'},
];

// Enhanced synergy definitions:
const synergyDefsEnhanced = [
  {tags:['economy','mobility'], name:'经济流', 
   desc:'食物分值额外+20%，狂热持续时间+2秒'},
  
  {tags:['attack','survive'], name:'破坏流',
   desc:'击杀敌人恢复1节蛇身，撞击伤害范围扩大至2格'},
  
  {tags:['curse','economy'], name:'献祭流',
   desc:'诅咒遗物每层使金色概率+8%，每吃10个食物随机提升1个诅咒遗物层数'},
  
  {tags:['summon','survive'], name:'召唤流',
   desc:'友方单位存在时获得持续护盾，友方单位死亡时恢复3节'},
  
  {tags:['mobility','attack'], name:'猎风流',
   desc:'每次转向累积1层速度，5层时释放冲击波清除周围敌人'},
  
  // Second-order synergies (3 tags)
  {tags:['economy','mobility','attack'], name:'疾风掠夺',
   desc:'狂热时击杀敌人额外获得金色食物'},

  {tags:['curse','summon','attack'], name:'血祭军团',
   desc:'断尾时召唤1个强化友军（持续15秒）'}
];

// Anti-synergy system:
const antiSynergies = [
  {
    relics: ['greed', 'regen'],
    penalty: '再生触发间隔翻倍（16个食物才触发1次）',
    desc: '贪婪 + 再生'
  },
  {
    relics: ['phase', 'thorn'],
    penalty: '荆棘持续时间减半',
    desc: '穿墙 + 荆棘'
  }
];

function checkAntiSynergies() {
  const active = [];
  for (const anti of antiSynergies) {
    if (anti.relics.every(id => has(id))) {
      active.push(anti);
    }
  }
  return active;
}

/* Key function modifications needed:

// In newGame(), add:
game.hoarderStacks = 0;
game.wallCollisions = 0;
game.armorCharges = has('armor') ? stacks('armor') : 0;
game.armorChargeTimer = 10;
game.echoTimer = 0;
game.echoActive = false;
game.huntwindStacks = 0;
game.献祭流Counter = 0;

// In moveTick() wall collision section, replace with:
if (n.x<0||n.x>=GRID||n.y<0||n.y>=GRID) {
  if (game.skillPhase) {
    game.skillPhase=false;
    game.skillCooldown=Math.max(game.skillCooldown,1);
    n.x=(n.x+GRID)%GRID;
    n.y=(n.y+GRID)%GRID;
    game.floaters.push({x:n.x,y:n.y,text:'相位穿越',color:'#48e3ff',life:1});
  } else if (has('phase')&&game.phaseCharges<stacks('phase')) {
    game.phaseCharges++;
    n.x=(n.x+GRID)%GRID;
    n.y=(n.y+GRID)%GRID;
  } else if (has('wall')&&game.wallCollisions<(3+(stacks('wall')-1))) {
    // PROJECT 2: Wall now counts globally, not per region
    game.wallCollisions++;
    n.x=(n.x+GRID)%GRID;
    n.y=(n.y+GRID)%GRID;
    game.shield=1;
    game.floaters.push({x:n.x,y:n.y,text:`壁垒 (${game.wallCollisions}/3)`,color:'#48e3ff',life:1});
  } else if (game.evolutions.armor==='bastion'&&game.wallSafe) {
    game.wallSafe=false;
    n.x=(n.x+GRID)%GRID;
    n.y=(n.y+GRID)%GRID;
    game.shield=1;
  } else return die('撞墙');
}

// In moveTick() enemy collision section, replace armor logic:
if (enemy) {
  if (game.skillPhase) {
    game.skillPhase=false;
    killEnemy(enemy,'技能击杀');
  } else if (game.evolutions.armor==='rebound'&&game.shield) {
    game.shield=0;
    killEnemy(enemy,'反震击杀');
  } else if (has('thorn')||has('blast')||game.snake.length>=6) {
    killEnemy(enemy,'collision kill');
  } else if (game.shield>0) {
    game.shield=0;
    enemy.hit=1;
    game.snake.pop();
  } else if (has('armor')&&game.armorCharges>0) {
    // PROJECT 2: Armor now uses charges
    game.armorCharges--;
    enemy.hit=1;
    game.snake.pop();
    game.floaters.push({x:game.snake[0].x,y:game.snake[0].y,text:`甲壳 (${game.armorCharges}剩余)`,color:'#48e3ff',life:1});
  } else return die('enemy hit');
}

// In tick(), add armor recharging:
if (has('armor')) {
  game.armorChargeTimer -= dt;
  if (game.armorChargeTimer <= 0 && game.armorCharges < (3 + (stacks('armor')-1))) {
    game.armorCharges++;
    game.armorChargeTimer = 10;
    game.floaters.push({x:GRID/2,y:GRID/2,text:'甲壳充能',color:'#66f2a2',life:0.8});
  }
}

// PROJECT 2: Echo timer
if (game.echoActive) {
  game.echoTimer -= dt;
  if (game.echoTimer <= 0) {
    game.echoActive = false;
  }
}

// PROJECT 2: 召唤流 - Shield while allies exist
if (activeSynergies().some(s=>s.name==='召唤流') && game.allies.length > 0) {
  game.shield = Math.max(game.shield, 1);
}

// PROJECT 2: 猎风流 - Speed stack decay
if (game.huntwindStacks > 0 && !game.huntwindUsed) {
  // Decay if no turn for 2 seconds
  game.huntwindDecay = (game.huntwindDecay || 0) + dt;
  if (game.huntwindDecay >= 2) {
    game.huntwindStacks = 0;
    game.huntwindDecay = 0;
  }
}

// In killEnemy(), add:
// PROJECT 2: 破坏流 - Restore segment on kill
if (activeSynergies().some(s=>s.name==='破坏流')) {
  const tail = game.snake[game.snake.length-1];
  game.snake.push({x:tail.x, y:tail.y, px:tail.x, py:tail.y});
  game.floaters.push({x:game.snake[0].x,y:game.snake[0].y,text:'破坏流：恢复',color:'#66f2a2',life:0.8});
}

// PROJECT 2: 疾风掠夺 - Spawn gold food on kill during frenzy
if (activeSynergies().some(s=>s.name==='疾风掠夺') && game.frenzy > 0) {
  spawnFood(true); // Force gold
  game.floaters.push({x:enemy.x,y:enemy.y,text:'疾风掠夺',color:'#ffd166',life:1});
}

// In eat(), add:
// PROJECT 2: Echo enhanced effect
if (has('echo') && game.echoActive) {
  game.xp += 2; // +2 energy instead of +1
  game.floaters.push({x:game.snake[0].x,y:game.snake[0].y,text:'回响 +2',color:'#ff77c8',life:0.8});
}

// PROJECT 2: 献祭流 - Auto level up curse relics
if (activeSynergies().some(s=>s.name==='献祭流')) {
  game.献祭流Counter = (game.献祭流Counter || 0) + 1;
  if (game.献祭流Counter >= 10) {
    game.献祭流Counter = 0;
    const curseRelics = Object.keys(game.relics).filter(id => 
      relicById[id] && relicById[id].tags.includes('curse') && 
      game.relics[id] < relicById[id].max
    );
    if (curseRelics.length > 0) {
      const target = pick(curseRelics, game.r);
      game.relics[target]++;
      game.floaters.push({x:GRID/2,y:GRID/2,text:`献祭流：${relicById[target].name}+1`,color:'#ff77c8',life:1.5});
    }
  }
}

// In eat(), modify frenzy duration:
if (game.combo>=(has('turn')?4:5)) {
  let frenzyDuration = 3;
  if (activeSynergies().some(s=>s.name==='经济流')) {
    frenzyDuration += 2; // PROJECT 2: +2s for 经济流
  }
  game.frenzy=clamp(Math.max(game.frenzy,frenzyDuration)+(has('feast')?1:0),0,7);
  // ... rest of frenzy code
}

// In enqueue() (direction change):
if (game.queue.length<2) {
  game.queue.push(d);
  // PROJECT 2: 猎风流 - Accumulate speed stacks on turn
  if (activeSynergies().some(s=>s.name==='猎风流')) {
    game.huntwindStacks = (game.huntwindStacks || 0) + 1;
    game.huntwindDecay = 0;
    if (game.huntwindStacks >= 5 && !game.huntwindUsed) {
      game.huntwindStacks = 0;
      game.huntwindUsed = true;
      // Shockwave - clear nearby enemies
      const targets = game.enemies.filter(e => 
        Math.abs(e.x-game.snake[0].x) + Math.abs(e.y-game.snake[0].y) <= 3
      );
      targets.forEach(e => killEnemy(e, '猎风流冲击波'));
      game.floaters.push({x:GRID/2,y:GRID/2,text:'猎风冲击波！',color:'#48e3ff',life:1.5});
      setTimeout(() => game.huntwindUsed = false, 1000);
    }
  }
}

// In skip button handler, update collector logic:
$('#skipRelic').onclick=()=>{
  if (has('collector')) {
    game.hoarderStacks = (game.hoarderStacks || 0) + 1;
    game.floaters.push({x:GRID/2,y:GRID/2,text:`囤积 +1 (${game.hoarderStacks}栈)`,color:'#ffd166',life:1});
  }
  game.score+=game.evolutions.collector==='discount'?15:0;
  if (game.evolutions.collector==='discount') game.shield=1;
  over.remove();
  state=STATES.PLAYING;
  updateHud();
};

// Reference only: use E to redeem, preserving S for downward movement.
if (e.key==='e'||e.key==='E') {
  if (state===STATES.PLAYING && has('collector') && game.hoarderStacks > 0) {
    e.preventDefault();
    const count = game.hoarderStacks;
    game.hoarderStacks = 0;
    const pool = relicPool().filter(r=>stacks(r.id)<r.max);
    for (let i=0; i<count && pool.length>0; i++) {
      const relic = pick(pool, game.r);
      addRelic(relic.id);
      // Remove from pool if maxed
      const idx = pool.findIndex(r=>r.id===relic.id);
      if (idx>=0 && stacks(relic.id)>=relic.max) {
        pool.splice(idx, 1);
      }
    }
    game.floaters.push({x:GRID/2,y:GRID/2,text:`囤积者：获得${count}个遗物`,color:'#ffd166',life:2});
    beep(880,.15,'triangle');
  }
}

// In useSkill() for tail/sacrifice, add:
if (id==='tail' && game.snake.length>5) {
  game.snake.splice(-2);
  game.shield=3;
  game.skillActive=.9;
  
  // PROJECT 2: Enhanced echo effect
  if (has('echo')) {
    game.echoActive = true;
    game.echoTimer = 5; // 5 seconds instead of 3
  }
  
  // PROJECT 2: 血祭军团 - Summon enhanced ally
  if (activeSynergies().some(s=>s.name==='血祭军团')) {
    const p = freeCell();
    if (p) {
      game.allies.push({x:p.x, y:p.y, life:15, enhanced:true}); // 15s duration
      game.floaters.push({x:p.x,y:p.y,text:'血祭军团！',color:'#ff647c',life:1.5});
    }
  }
  
  if (game.snake.length<=3) checkAchievement('tail_min',1);
}

// In spawnFood(), add echo gold bonus:
const goldBase = 0.08 + (has('doublefruit')?stacks('doublefruit')*.04:0);
const goldFrenzy = game.frenzy>0 ? 0.18 : 0;
const goldFeast = (has('feast')&&game.streak>=3) ? 0.3 : 0;
const goldEcho = (game.echoActive) ? 0.3 : 0; // PROJECT 2: Echo +30% gold
const goldSacrifice = 0; // Calc from 献祭流
let goldSacrificeBonus = 0;
if (activeSynergies().some(s=>s.name==='献祭流')) {
  const curseStacks = Object.keys(game.relics)
    .filter(id => relicById[id] && relicById[id].tags.includes('curse'))
    .reduce((sum, id) => sum + game.relics[id], 0);
  goldSacrificeBonus = curseStacks * 0.08; // +8% per curse stack
}
const gold = forceGold || game.r() < (goldBase + goldFrenzy + goldFeast + goldEcho + goldSacrificeBonus);

// In moveEnemies(), handle ally death for 召唤流:
for (const a of game.allies) {
  a.life -= .16;
  const e = game.enemies.find(e=>Math.abs(e.x-a.x)+Math.abs(e.y-a.y)<=2);
  if (e) killEnemy(e,'友方蛇击杀');
  
  // PROJECT 2: 召唤流 - Restore on ally death
  if (a.life <= 0) {
    if (game.evolutions.egg==='hatch') damageNearby(3);
    if (activeSynergies().some(s=>s.name==='召唤流')) {
      for (let i=0; i<3; i++) {
        const tail = game.snake[game.snake.length-1];
        game.snake.push({x:tail.x, y:tail.y, px:tail.x, py:tail.y});
      }
      game.floaters.push({x:a.x,y:a.y,text:'召唤流：恢复3节',color:'#66f2a2',life:1.5});
    }
  }
}

// In tick(), handle thorn duration for anti-synergy:
if (has('thorn') && game.turns !== game.lastTrailTurn) {
  game.lastTrailTurn = game.turns;
  const tail = game.snake.at(-1);
  if (tail) {
    let thornDuration = game.evolutions.thorn==='corridor' ? 6 : 2;
    // PROJECT 2: Anti-synergy - Phase + Thorn halves duration
    if (checkAntiSynergies().some(a=>a.relics.includes('phase')&&a.relics.includes('thorn'))) {
      thornDuration /= 2;
    }
    game.obstacles.push({x:tail.x, y:tail.y, life:thornDuration, thorn:true, venom:game.evolutions.thorn==='venom'});
  }
}

// In eat() for regen:
const regenInterval = has('regen') ? 8 : 999;
// PROJECT 2: Anti-synergy - Double interval if greed+regen
const hasAntiSynergy = checkAntiSynergies().some(a=>
  a.relics.includes('greed') && a.relics.includes('regen')
);
const actualRegenInterval = hasAntiSynergy ? regenInterval * 2 : regenInterval;
if (game.foodCount % actualRegenInterval === 0 && has('regen')) {
  game.shield = 2;
  const tail = game.snake[game.snake.length-1];
  game.snake.push({x:tail.x, y:tail.y, px:tail.x, py:tail.y});
}

// In updateHud(), add synergy display:
const syns = activeSynergies();
const antiSyns = checkAntiSynergies();
let synDisplay = '';
if (syns.length > 0) {
  synDisplay += '<div class="synergy-display">';
  synDisplay += '<h4>⚡ 协同效果</h4>';
  syns.forEach(s => {
    synDisplay += `<div class="synergy-item"><strong>${s.name}</strong>: ${s.desc}</div>`;
  });
  synDisplay += '</div>';
}
if (antiSyns.length > 0) {
  synDisplay += '<div class="antisynergy-display">';
  synDisplay += '<h4>⚠️ 反协同</h4>';
  antiSyns.forEach(a => {
    synDisplay += `<div class="antisynergy-item"><strong>${a.desc}</strong>: ${a.penalty}</div>`;
  });
  synDisplay += '</div>';
}
$('#synergyDisplay').innerHTML = synDisplay;

// Add hoarder display in HUD:
if (has('collector') && game.hoarderStacks > 0) {
  $('#hoarderDisplay').textContent = `囤积者: ${game.hoarderStacks}栈 [按E使用]`;
  $('#hoarderDisplay').classList.remove('hidden');
} else {
  $('#hoarderDisplay').classList.add('hidden');
}

*/
