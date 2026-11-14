'use strict';
// Shared class definitions (used by the server for gameplay and by the client for the picker/art).
(function (root, make) {
  const x = make();
  if (typeof module === 'object' && module.exports) module.exports = x; else root.GC = x;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  // stat defaults; classes override. All multipliers are 1 = normal.
  const DEF = { hp: 100, spd: 150, dmg: 10, cd: .45, range: 65, knock: 22, wood: 1, stone: 1, food: 1, burn: 1, heal: 0, rev: 1, regen: 0, light: 125, feed: 1, crit: 0, dia: 1, slow: 0 };
  // look: [shirt, dark, hair, frontTool, backItem]
  const RAW = [
    // --- unlocked ---
    { id: 'forester', n: 'Forester', e: '🪓', price: 0, d: '+25% wood from trees', wood: 1.25, look: ['#4caf50', '#2e7d32', '#5d3a1a', 'axe'] },
    { id: 'marine', n: 'Marine', e: '🔫', price: 0, d: 'Tough, hits hard', hp: 130, dmg: 20, look: ['#e53935', '#8e1a17', '#2b2b2b', 'gun'] },
    { id: 'tech', n: 'Radio Tech', e: '📻', price: 0, d: 'Fire burns 25% slower', burn: .75, spd: 165, look: ['#fdd835', '#b39b00', '#3a2a10', 'flare', 'radio'] },
    { id: 'medic', n: 'Medic', e: '🩹', price: 0, d: 'Heals allies, fast revive', heal: 3, rev: 2, look: ['#29b6f6', '#0277bd', '#c98a3a', null, 'medpack'] },
    // --- tier 1: 50 diamonds ---
    { id: 'scout', n: 'Scout', e: '🧭', price: 50, d: 'Very fast, sees far at night', hp: 85, spd: 190, dmg: 9, light: 175, look: ['#8d6e63', '#5d4037', '#212121', 'dagger', 'pack'] },
    { id: 'miner', n: 'Miner', e: '⛏️', price: 50, d: 'Double stone, sturdy', hp: 115, stone: 2, look: ['#78909c', '#455a64', '#3e2723', 'pick'] },
    { id: 'forager', n: 'Forager', e: '🍓', price: 50, d: 'Double berries, slowly self-heals', food: 2, regen: .6, look: ['#ec407a', '#ad1457', '#6d4c41', null, 'basket'] },
    { id: 'pyro', n: 'Stoker', e: '🔥', price: 50, d: 'Wood burns 50% longer', feed: 1.5, look: ['#ff7043', '#bf360c', '#4e342e', 'torch'] },
    // --- tier 2: 120 diamonds ---
    { id: 'guard', n: 'Guard', e: '🛡️', price: 120, d: 'Huge HP, shoves aliens back', hp: 190, spd: 125, dmg: 9, knock: 45, look: ['#5c6bc0', '#303f9f', '#9e9e9e', 'shield'] },
    { id: 'hunter', n: 'Hunter', e: '🏹', price: 120, d: 'Attacks from far away', hp: 90, dmg: 12, range: 140, look: ['#558b2f', '#33691e', '#bf8040', 'bow', 'quiver'] },
    { id: 'duelist', n: 'Duelist', e: '🤺', price: 120, d: 'Lightning-fast attacks', hp: 90, dmg: 11, cd: .25, look: ['#ab47bc', '#6a1b9a', '#eeeeee', 'sword'] },
    { id: 'engineer', n: 'Engineer', e: '🔧', price: 120, d: '+20% all gathering, efficient fire', wood: 1.2, stone: 1.2, food: 1.2, burn: .9, look: ['#ffa726', '#e65100', '#212121', 'wrench', 'pack'] },
    // --- tier 3: 250 diamonds ---
    { id: 'shaman', n: 'Shaman', e: '🪘', price: 250, d: 'Heals team, slows nearby aliens', hp: 105, heal: 4, rev: 1.5, slow: .2, look: ['#26a69a', '#00695c', '#5d4037', 'staff'] },
    { id: 'berserker', n: 'Berserker', e: '🪓', price: 250, d: 'Glass cannon: huge damage', hp: 80, spd: 165, dmg: 32, cd: .4, look: ['#b71c1c', '#7f0000', '#ff6f00', 'greataxe'] },
    { id: 'sentinel', n: 'Sentinel', e: '🏮', price: 250, d: 'Huge light, slows aliens near you', hp: 140, spd: 135, light: 235, slow: .3, look: ['#fbc02d', '#f57f17', '#37474f', 'lantern'] },
    { id: 'lucky', n: 'Lucky', e: '🍀', price: 250, d: '+50% diamonds, lucky critical hits', dmg: 12, crit: .2, dia: 1.5, look: ['#43a047', '#1b5e20', '#ffd54f', 'clover'] },
    // --- tier 4: 400 diamonds ---
    { id: 'pyromancer', n: 'Pyromancer', e: '☄️', price: 400, d: 'Master of fire: fuel lasts much longer', burn: .6, feed: 1.4, dmg: 15, look: ['#d84315', '#8d1e00', '#ffab00', 'fireorb'] },
    { id: 'warden', n: 'Warden', e: '⚜️', price: 400, d: 'Frontline leader: tank, heal, slow', hp: 165, dmg: 18, rev: 1.5, heal: 2, slow: .15, look: ['#3949ab', '#1a237e', '#bdbdbd', 'banner'] },
    { id: 'phantom', n: 'Phantom', e: '🥷', price: 400, d: 'Blazing fast, deadly crits', hp: 80, spd: 205, dmg: 24, cd: .35, crit: .3, look: ['#424242', '#111111', '#000000', 'twindagger'] },
    { id: 'legend', n: 'Legend', e: '👑', price: 400, d: 'The best at almost everything', hp: 150, spd: 165, dmg: 26, cd: .35, regen: .8, wood: 1.2, light: 150, look: ['#ffd54f', '#c79100', '#ffffff', 'blade'] },
  ];
  const LIST = RAW.map(c => Object.assign({}, DEF, c));
  const BY = {}; LIST.forEach(c => BY[c.id] = c);
  return { LIST, BY, DEF, DEFAULT_OWNED: LIST.filter(c => c.price === 0).map(c => c.id) };
});
