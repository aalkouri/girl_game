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
    { id: 'chest', n: 'Storage Chest', e: '📦', kind: 'chest', cost: { wood: 15, stone: 5 }, max: 1, d: 'Shared storage that only takes things in. Everything inside is used automatically when anyone crafts. Press ACT next to it.' },
    { id: 'pot', n: 'Cooking Pot', e: '🍲', kind: 'pot', norot: true, cost: { wood: 5, stone: 15 }, max: 1, d: 'Press ACT next to it to cook food and drinks from berries.' },
    { id: 'smelter', n: 'Smelter', e: '⚒️', kind: 'smelter', norot: true, cost: { wood: 10, stone: 25 }, max: 1, d: 'Press ACT next to it and put rocks in: every 5 rocks smelt into 1 metal scrap, which pops out for pickup.' },
    { id: 'boat', n: 'Boat', e: '⛵', kind: 'boat', scrap: true, cost: { wood: 20, stone: 0, scrap: 4 }, d: 'Carries two players across the sea to other islands. It goes into one of your slots - use it, then put it in the water at the shore.' },
    { id: 'trap', n: 'Trap', e: '🪤', kind: 'item', item: 'trap', scrap: true, cost: { wood: 0, stone: 0, scrap: 2 }, d: 'Goes into one of your slots. Tap it there to set it down where you stand. When the big monster runs over it he is stuck for 20 seconds. One use.' },
    { id: 'wall', n: 'Spike Wall', e: '🚧', kind: 'wall', cost: { wood: 6, stone: 0 }, max: 24, d: 'A solid, indestructible barricade that blocks aliens. Placed in front of you, near camp.' },
  ];
  // things you can cook at a cooking pot (cost is in berries)
  const FOOD = [
    { id: 'juice', n: 'Berry Juice', e: '🧃', type: 'Drink', cost: { food: 2 }, d: 'Heals 40 HP right away.' },
    { id: 'tea', n: 'Berry Tea', e: '🍵', type: 'Drink', cost: { food: 3 }, d: '+25% movement speed for 60 seconds.' },
  ];
  const BY = {}; LIST.forEach(r => BY[r.id] = r);
  const FOOD_BY = {}; FOOD.forEach(f => FOOD_BY[f.id] = f);
  const ITEM_BY = Object.assign({ boat: { id: 'boat', n: 'Boat', e: '⛵' }, trap: { id: 'trap', n: 'Trap', e: '🪤' } }, FOOD_BY);   // everything that can sit in a slot
  // the camp (safe ring + build area) grows a little with every fire level
  const FIRE_MAX = 20;   // the fire can be levelled up to 20 (it used to stop at 5)
  const camp = lvl => lvl <= 5 ? 140 + lvl * 40 : 340 + (lvl - 5) * 12;   // safe ring / build area: +40 per level up to 5, then +12 per level (520 at level 20)
  const fuelMax = lvl => lvl <= 5 ? 150 + (lvl - 1) * 75 : 450 + (lvl - 5) * 40;
  const SMELT = { cost: 5, time: 10, queue: 5 };   // rocks per scrap, seconds per scrap, jobs a smelter can hold
  const FIRE_R = 46;   // footprint of the fire pit (flames + stone ring)
  const fireClear = kind => FIRE_R + (({ bench: 30, chest: 26, pot: 24, smelter: 30, wall: 24, trap: 18 })[kind] || 24) + 10;   // closest an item's centre may be to the fire: its whole body stays off the pit
  const RADIUS = { bench: 30, chest: 26, pot: 24, smelter: 30, wall: 24, trap: 18 };   // collision radius of each placeable (shared by server and the placement ghost)
  // Every island except home is split by biome: the quarter facing the home island (at 0,0) is forest, the other three
  // quarters are that island's own biome (island.b, e.g. 'd' desert). A chord at 0.404 r from the centre cuts off 25% of
  // a circle's area; the edge wobbles a little so it doesn't look ruled. Shared so the server's trees and the client's grass line up.
  const FOREST_CUT = 0.404;
  const homeDir = (ix, iy) => { const L = Math.hypot(ix, iy) || 1; return [-ix / L, -iy / L]; };   // unit vector from the island towards home
  // where the forest edge sits along the home direction (in island radii), at sideways position w (also in radii)
  const forestEdge = (ix, iy, w) => FOREST_CUT + 0.05 * Math.sin(w * 7 + ix * 0.001) + 0.025 * Math.sin(w * 17 + iy * 0.001);
  function inForestPart(ix, iy, r, x, y) {
    const [ux, uy] = homeDir(ix, iy), dx = x - ix, dy = y - iy, t = (dx * ux + dy * uy) / r, w = (dx * -uy + dy * ux) / r;
    return t > forestEdge(ix, iy, w);
  }
  return { FIRE_MAX, fuelMax, LIST, BY, FOOD, FOOD_BY, ITEM_BY, camp, SMELT, RADIUS, FIRE_R, fireClear, STATION_GAP: 120, WALL_GAP: 80, FOREST_CUT, homeDir, forestEdge, inForestPart };
});
