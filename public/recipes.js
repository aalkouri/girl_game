'use strict';
// Shared crafting recipes (server enforces costs/rules, client draws the menu).
// kind: 'bench' = the crafting bench (placed in camp; unlocks every other recipe)
//       'gear'  = a personal upgrade stored on the player (gear key)
//       'wall'  = a structure placed in front of the player
(function (root, make) {
  const x = make();
  if (typeof module === 'object' && module.exports) module.exports = x; else root.RC = x;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const LIST = [
    { id: 'bench', n: 'Crafting Bench', e: '🛠️', kind: 'bench', cost: { wood: 10, stone: 5 }, d: 'Place it in your camp (inside the fire ring) to unlock more recipes.' },
    { id: 'axe', n: 'Stone Axe', e: '🪓', kind: 'gear', gear: 'axe', cost: { wood: 3, stone: 4 }, d: 'Trees fall in 3 hits instead of 4.' },
    { id: 'pick', n: 'Stone Pickaxe', e: '⛏️', kind: 'gear', gear: 'pick', cost: { wood: 3, stone: 5 }, d: 'Rocks break in 2 hits instead of 3.' },
    { id: 'spear', n: 'Wooden Spear', e: '🔱', kind: 'gear', gear: 'spear', cost: { wood: 4, stone: 3 }, d: '+6 damage and longer reach against aliens.' },
    { id: 'chest', n: 'Storage Chest', e: '📦', kind: 'chest', cost: { wood: 15, stone: 5 }, max: 8, d: 'Shared storage: anyone can put things in or take them out. Press ACT next to it.' },
    { id: 'pot', n: 'Cooking Pot', e: '🍲', kind: 'pot', cost: { wood: 5, stone: 15 }, max: 4, d: 'Press ACT next to it to cook food and drinks from berries.' },
    { id: 'smelter', n: 'Smelter', e: '⚒️', kind: 'smelter', cost: { wood: 10, stone: 25 }, max: 4, d: 'Press ACT next to it: it takes 5 rocks and smelts them into 1 metal scrap, which pops out for pickup.' },
    { id: 'wall', n: 'Spike Wall', e: '🚧', kind: 'wall', cost: { wood: 6, stone: 0 }, max: 24, d: 'Blocks aliens and hurts them when they chew on it. Placed in front of you, near camp.' },
  ];
  // things you can cook at a cooking pot (cost is in berries)
  const FOOD = [
    { id: 'juice', n: 'Berry Juice', e: '🧃', type: 'Drink', cost: { food: 2 }, d: 'Heals 40 HP right away.' },
    { id: 'tea', n: 'Herbal Tea', e: '🍵', type: 'Drink', cost: { food: 3 }, d: '+25% movement speed for 60 seconds.' },
    { id: 'stew', n: 'Berry Stew', e: '🥣', type: 'Food', cost: { food: 4 }, d: 'Heals 60 HP and regenerates 2 HP/s for 30 seconds.' },
    { id: 'pie', n: 'Fruit Pie', e: '🥧', type: 'Food', cost: { food: 6 }, d: '+5 damage for 60 seconds.' },
  ];
  const BY = {}; LIST.forEach(r => BY[r.id] = r);
  const FOOD_BY = {}; FOOD.forEach(f => FOOD_BY[f.id] = f);
  // the camp (safe ring + build area) grows a little with every fire level
  const camp = lvl => 140 + lvl * 40;
  const SMELT = { cost: 5, time: 10, queue: 5 };   // rocks per scrap, seconds per scrap, jobs a smelter can hold
  const FIRE_R = 46;   // footprint of the fire pit (flames + stone ring)
  const fireClear = kind => FIRE_R + (({ bench: 30, chest: 26, pot: 24, smelter: 30, wall: 24 })[kind] || 24) + 10;   // closest an item's centre may be to the fire: its whole body stays off the pit
  const RADIUS = { bench: 30, chest: 26, pot: 24, smelter: 30, wall: 24 };   // collision radius of each placeable (shared by server and the placement ghost)
  return { LIST, BY, FOOD, FOOD_BY, camp, SMELT, RADIUS, FIRE_R, fireClear, STATION_GAP: 120, WALL_GAP: 80 };
});
