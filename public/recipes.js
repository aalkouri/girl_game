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
    { id: 'wall', n: 'Spike Wall', e: '🚧', kind: 'wall', cost: { wood: 6, stone: 0 }, d: 'Blocks aliens and hurts them when they chew on it. Placed in front of you, near camp.' },
  ];
  const BY = {}; LIST.forEach(r => BY[r.id] = r);
  return { LIST, BY, WALL_MAX: 24 };
});
