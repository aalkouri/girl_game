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
    { id: 'spear', n: 'Wooden Spear', e: '🔱', kind: 'gear', gear: 'spear', cost: { wood: 4, stone: 3 }, d: '+6 damage, and your attack becomes a long-reaching poke straight ahead.' },
    { id: 'chest', n: 'Storage Chest', e: '📦', kind: 'chest', cost: { wood: 15, stone: 5 }, max: 1, d: 'Shared storage that only takes things in. Everything inside is used automatically when anyone crafts. Press ACT next to it.' },
    { id: 'pot', n: 'Cooking Pot', e: '🍲', kind: 'pot', norot: true, cost: { wood: 5, stone: 15 }, max: 1, d: 'Press ACT next to it to cook food and drinks from berries.' },
    { id: 'smelter', n: 'Smelter', e: '⚒️', kind: 'smelter', norot: true, cost: { wood: 10, stone: 25 }, max: 1, d: 'Press ACT next to it and put rocks in: every 5 rocks smelt into 1 metal scrap, which pops out for pickup.' },
    { id: 'boat', n: 'Boat', e: '⛵', kind: 'boat', scrap: true, cost: { wood: 20, stone: 0, scrap: 4 }, d: 'Carries two players across the sea to other islands. It goes into one of your slots - use it, then put it in the water at the shore.' },
    { id: 'trap', n: 'Trap', e: '🪤', kind: 'item', item: 'trap', scrap: true, cost: { wood: 0, stone: 0, scrap: 2 }, d: 'Goes into one of your slots. Tap it there to set it down where you stand. When the big monster runs over it he is stuck for 20 seconds. One use.' },
    { id: 'campfire', n: 'Campfire', e: '🔥', kind: 'item', item: 'campfire', cost: { wood: 25, stone: 10 }, d: 'Goes into one of your slots. Tap it to light a campfire where you stand on an outer island (not near the shore). It burns, protects and can be upgraded just like the main fire.' },
    { id: 'wall', n: 'Spike Wall', e: '🚧', kind: 'wall', cost: { wood: 6, stone: 0 }, max: 24, d: 'A solid, indestructible barricade that blocks aliens. Placed in front of you, near camp.' },
  ];
  // things you can cook at a cooking pot (cost is in berries)
  const FOOD = [
    { id: 'juice', n: 'Berry Juice', e: '🧃', type: 'Drink', cost: { food: 2 }, d: 'Heals 40 HP right away.' },
    { id: 'steak', n: 'Steak Dinner', e: '🥩', type: 'Meal', cost: { food: 2, meat: 2 }, d: 'Heals 80 HP right away. Made from 2 chunks of meat (dropped by rabbits and wolves) and 2 berries.' },
    { id: 'tea', n: 'Berry Tea', e: '🍵', type: 'Drink', cost: { food: 3 }, d: '+25% movement speed for 60 seconds.' },
  ];
  const BY = {}; LIST.forEach(r => BY[r.id] = r);
  const FOOD_BY = {}; FOOD.forEach(f => FOOD_BY[f.id] = f);
  const ITEM_BY = Object.assign({ boat: { id: 'boat', n: 'Boat', e: '⛵' }, trap: { id: 'trap', n: 'Trap', e: '🪤' }, foot: { id: 'foot', n: "Lucky Rabbit's Foot", e: '🐾' }, campfire: { id: 'campfire', n: 'Campfire', e: '🔥' }, sloop: { id: 'sloop', n: 'Sloop', e: '🚤' }, galleon: { id: 'galleon', n: 'Galleon', e: '🛳️' } }, FOOD_BY);   // everything that can sit in a slot
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
  // the home island's snow quarter: a 90-degree wedge to the north, from a little past the camp out to the shore, with wavy edges
  const SNOW_A = -Math.PI / 2, SNOW_IN = 650;
  const snowIn = a => SNOW_IN + 60 * Math.sin(5 * a + 1.3);
  const snowHalf = d => Math.PI / 4 + 0.05 * Math.sin(d / 210) + 0.03 * Math.sin(d / 77 + 2);
  function inSnow(x, y) {
    const d = Math.hypot(x, y), a = Math.atan2(y, x); if (d < snowIn(a)) return false;
    const da = ((a - SNOW_A + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return Math.abs(da) < snowHalf(d);
  }
  // biome at a point of an outer island: forest on the quarter facing home, else the island's own biome; 'm' (mixed) islands are snow on one side and desert on the other
  function biomeAt(ix, iy, r, b, x, y) {
    if (inForestPart(ix, iy, r, x, y)) return 'f';
    if (b !== 'm') return b;
    const [ux, uy] = homeDir(ix, iy); return ((x - ix) * -uy + (y - iy) * ux) < 0 ? 's' : 'd';
  }
  // boat types (what the Boat Dealer sells): speed, riders, extra carry slots while aboard
  const BOATS = { boat: { speed: 190, riders: 2, slots: 0, sc: .8 }, sloop: { speed: 250, riders: 3, slots: 2, sc: 1 }, galleon: { speed: 320, riders: 4, slots: 4, sc: 1.25 } };
  const ARMOR = [0, .15, .30, .45];   // damage reduction by armor level
  const ARM_PC = { ah: 0.10, al: 0.12, ab: 0.23 };   // head / legs / body armor pieces (pelt trader): damage reduction, all three = 45%
  const armorOf = g => (g.ah ? ARM_PC.ah : 0) + (g.al ? ARM_PC.al : 0) + (g.ab ? ARM_PC.ab : 0);
  const GUNS = { pistol: { dmg: 18, cd: .6, speed: 900, ttl: .55 }, rifle: { dmg: 40, cd: 1.1, speed: 1200, ttl: .9 } };
  // The five traders found on the outer islands. offers: cost is paid from your own bag.
  const TRADERS = {
    1: { n: 'Pelt Trader', e: '🐺', d: 'Trades wolf pelts for armor.', offers: [
      { id: 'phood', n: 'Pelt Hood', e: '🧢', cost: { pelt: 4, scrap: 3 }, gear: 'ah', d: 'Head armor: take 10% less damage.' },
      { id: 'plegs', n: 'Pelt Leggings', e: '👖', cost: { pelt: 6, scrap: 5 }, gear: 'al', d: 'Leg armor: take 12% less damage.' },
      { id: 'pbody', n: 'Alpha Mantle', e: '🦺', cost: { apelt: 1, pelt: 8, scrap: 8, gold: 2 }, gear: 'ab', d: 'Body armor: take 23% less damage. The strongest piece.' }] },
    2: { n: 'Fisherman', e: '🎣', d: 'Sells a fishing rod for plain resources.', offers: [
      { id: 'rod', n: 'Fishing Rod', e: '🎣', cost: { scrap: 4, gold: 1 }, gear: 'rod', d: 'Press ACT at the shore to fish: you reel in berries from the sea.' }] },
    3: { n: 'Blacksmith', e: '⚒️', d: 'Trades scrap for weapons, guns included.', offers: [
      { id: 'sword', n: 'Iron Sword', e: '🗡️', cost: { scrap: 6 }, gear: 'sword', d: '+8 melee damage.' },
      { id: 'pistol', n: 'Pistol', e: '🔫', cost: { scrap: 10 }, gear: 'pistol', d: 'ATTACK fires bullets: 18 damage, fast, long range.' },
      { id: 'rifle', n: 'Rifle', e: '🎯', cost: { scrap: 18 }, gear: 'rifle', d: 'ATTACK fires a slow, heavy shot: 40 damage, very long range.' }] },
    4: { n: 'Boat Dealer', e: '⚓', d: 'Sells bigger, faster boats that carry more loot.', offers: [
      { id: 'sloop', n: 'Sloop', e: '🚤', cost: { scrap: 8, gold: 2 }, item: 'sloop', d: 'Speed 250, 3 riders, +2 item slots while aboard. Goes into a slot; use it at the shore.' },
      { id: 'galleon', n: 'Galleon', e: '🛳️', cost: { scrap: 20, gold: 6 }, item: 'galleon', d: 'Speed 320, 4 riders, +4 item slots while aboard. Goes into a slot; use it at the shore.' }] },
    5: { n: 'Ability Unlocker', e: '🔮', d: 'Unlocks the hidden ability of any class you own, for the right resources.', offers: [] },
  };
  return { BOATS, ARMOR, armorOf, GUNS, TRADERS, biomeAt, FIRE_MAX, fuelMax, LIST, BY, FOOD, FOOD_BY, ITEM_BY, camp, SMELT, RADIUS, FIRE_R, fireClear, STATION_GAP: 120, WALL_GAP: 80, FOREST_CUT, homeDir, forestEdge, inForestPart, SNOW_A, snowIn, snowHalf, inSnow };
});
