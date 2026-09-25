/**
 * VR GAMBLE FISH — How to Fish, in VR, on Tidewater's island.
 *
 * Boot: IWSDK world (VR, no built-in locomotion — movement is ff2's club
 * teleport, see locomotion/TeleportSystem.ts), then the baked island
 * streams in: sky, terrain, sea, village. The player starts where Tidewater
 * starts you — on the boardwalk above the pier, looking down it to the sea —
 * with a rod in hand (fishing/FishingSystem.ts) and a wallet on each wrist.
 */

import { launchXR, SessionMode, World } from '@iwsdk/core';
import type { Camera } from 'three';
import { Music } from './audio/music.ts';
import { ShoreSound } from './audio/shore.ts';
import { ensureAudio } from './audio/sfx.ts';
import { BackpackSystem, backpackDeps, backpackView } from './backpack/BackpackSystem.ts';
import { FishingSystem, fishingDeps, fishingView } from './fishing/FishingSystem.ts';
import { loadProps } from './fishing/props.ts';
import { createGameState } from './fishing/tidewater.ts';
import { WristWallet } from './ui/wallet.ts';
import { WaterFx } from './fx/water.ts';
import { locomotion, teleportView, TeleportSystem } from './locomotion/TeleportSystem.ts';
import { decodeTerrain, type WorldJson } from './world/data.ts';
import { Heightfield } from './world/heightfield.ts';
import { Ocean } from './world/ocean.ts';
import { createSky } from './world/sky.ts';
import { Surfaces } from './world/surfaces.ts';
import { buildTerrain } from './world/terrain.ts';
import { Grass } from './world/grass.ts';
import { VillageSigns, type BuildingFrame } from './village/signs.ts';
import { FishMarket } from './village/market.ts';
import { IslandBank } from './village/bank.ts';
import { bankDeps, bootBank } from './net/bank.ts';
import { bootCloudSave } from './net/cloudSave.ts';
import { RouletteTable } from './casino/RouletteTable.ts';
import { SlotMachine } from './casino/SlotMachine.ts';
import { BlackjackTable } from './casino/BlackjackTable.ts';
import { PointerSystem } from './ui/pointer.ts';
import { buildInteriors, interiorAt, openColliders, type Interior } from './village/interiors.ts';
import { HOME, HOME_SHOPS, HomeShopCounter, Shack } from './village/homeGoods.ts';
import { Blink } from './fx/blink.ts';
import { Vegetation } from './world/vegetation.ts';
import { buildVillage } from './world/village.ts';
import { buildLamps } from './world/lamps.ts';

/** ff2's fixed-foveation level: sharp centre, cheap rim. */
const FOVEATION = 0.33;

const container = document.getElementById('scene-container') as HTMLDivElement;
/** per-frame work for the village's people and counters (set once they're built) */
let villageTick: (dt: number) => void = () => {};
const status = document.getElementById('status') as HTMLElement;
const enter = document.getElementById('enter-vr') as HTMLButtonElement;
const bar = document.getElementById('bar-fill') as HTMLElement;

async function fetchBuffer(path: string, onProgress: (f: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(import.meta.env.BASE_URL + path);
  if (!res.ok || !res.body) throw new Error(`${path}: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    if (total) onProgress(got / total);
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out.buffer;
}

World.create(container, {
  // The Enter VR button calls IWSDK's explicit WebXR launcher from the
  // user's tap — Quest Browser needs that direct requestSession gesture.
  xr: { sessionMode: SessionMode.ImmersiveVR, offer: 'none' },
  features: { locomotion: false, grabbing: false, spatialUI: false },
  render: {
    defaultLighting: false,
    near: 0.05,
    far: 6000,
    camera: { position: [0, 1.6, 0] },
  },
}).then(async (world) => {
  world.renderer.xr.setFoveation(FOVEATION);

  status.textContent = 'Loading the island…';
  const progress = { terrain: 0, village: 0, props: 0, veg: 0 };
  const show = (): void => {
    bar.style.width = `${Math.round(((progress.terrain + progress.village + progress.props + progress.veg) / 4) * 100)}%`;
  };
  const [json, terrainBuf, villageBuf, propsBuf, vegBuf] = await Promise.all([
    fetch(import.meta.env.BASE_URL + 'world/world.json').then((r) => r.json() as Promise<WorldJson>),
    fetchBuffer('world/terrain.bin', (f) => ((progress.terrain = f), show())),
    fetchBuffer('world/village.bin', (f) => ((progress.village = f), show())),
    fetchBuffer('props/props.bin', (f) => ((progress.props = f), show())),
    fetchBuffer('world/veg.bin', (f) => ((progress.veg = f), show())),
  ]);

  status.textContent = 'Building…';
  const grid = decodeTerrain(json, terrainBuf);
  const scene = world.scene;
  const sky = createSky(scene);
  scene.add(buildTerrain(grid));
  scene.add(buildVillage(villageBuf, sky.state.night));
  const lamps = buildLamps((json as unknown as { lamps?: [number, number, number, string][] }).lamps ?? [], sky.state.night);
  scene.add(lamps);
  const signs = new VillageSigns((json as unknown as { buildings: BuildingFrame[] }).buildings ?? []);
  scene.add(signs.group);
  const vegetation = new Vegetation(vegBuf);
  scene.add(vegetation.group);
  const grass = vegetation.grassMask ? new Grass(vegetation.atlas, vegetation.grassMask, vegetation.grassRes, new Heightfield(grid), grid) : null;
  if (grass) scene.add(grass.mesh);
  const ocean = new Ocean(grid, sky.state);
  scene.add(ocean.mesh);
  const t0 = performance.now();
  let lastT = 0;
  ocean.mesh.onBeforeRender = (_r, _s, camera: Camera) => {
    const t = (performance.now() - t0) / 1000;
    const dt = Math.min(0.05, Math.max(0, t - lastT));
    // the day goes on (sky, sea, lights); the lamps are lit from dusk to dawn
    sky.update(dt);
    lamps.visible = sky.state.night.value > 0.01;
    villageTick(dt);
    lastT = t;
    ocean.update(t, camera);
    vegetation.update(t, camera);
    grass?.update(t, camera);
    signs.update(1 / 72);
  };

  const heightfield = new Heightfield(grid);
  // the walk-in buildings: their bodies open up (walls, a door gap, a floor) and get a room inside
  const frames = (json as unknown as { buildings: BuildingFrame[] }).buildings ?? [];
  const interiors = buildInteriors(frames);
  for (const i of interiors) scene.add(i.group);
  const surfaces = new Surfaces(heightfield, { boxes: openColliders(json.colliders.boxes, frames), cylinders: json.colliders.cylinders });
  locomotion.surfaces = surfaces;
  world.registerSystem(TeleportSystem);

  // the fishing: Tidewater's rules and save, the rod in your hand, the wallet on your wrists
  const game = createGameState();
  // the backpack's grid is the limit on what you carry now, not the hold's kilograms
  game.fits = () => true;
  // the account: the cloud save first (a new headset takes the account's), then collect anything bought while away
  bankDeps.state = game;
  void bootCloudSave(game).then(() => bootBank());
  const fx = new WaterFx((x, z) => ocean.heightAt(x, z));
  scene.add(fx.group);
  const wallet = new WristWallet(game, [world.player.raySpaces.left, world.player.raySpaces.right]);
  Object.assign(fishingDeps, { props: loadProps(propsBuf), state: game, ocean, terrain: heightfield, surfaces, layout: json.layout, wallet, fx });
  // point-and-click panels first: a hand on a button claims its trigger before fishing sees it
  world.registerSystem(PointerSystem);
  world.registerSystem(FishingSystem);
  backpackDeps.state = game;
  backpackDeps.props = fishingDeps.props;
  world.registerSystem(BackpackSystem);

  // stepping through a doorway: a blink hides the door you can't see open
  const blink = new Blink(world.camera);
  locomotion.onTeleport.push((from, to) => {
    if (interiorAt(interiors, from.x, from.z) !== interiorAt(interiors, to.x, to.z)) blink.fire();
  });

  fishingDeps.indoors = () => interiorAt(interiors, world.player.position.x, world.player.position.z) !== null;

  // the village's people and counters
  const stall = frames.find((b) => b.name === 'stall');
  const market = stall ? new FishMarket(scene, stall, game) : null;
  // the casinos' tables
  const tables: { update(dt: number, camera: Camera): void }[] = [];
  const room = (n: string): Interior | undefined => interiors.find((i) => i.name === n);
  const lure = room('C');
  if (lure) tables.push(new RouletteTable(lure, game, { chips: [1, 5, 25, 100], maxBet: 500, at: [0, -0.6] }));
  const vault = room('H');
  if (vault) tables.push(new IslandBank(vault, game, world.renderer));
  const shark = room('G');
  if (shark) tables.push(new BlackjackTable(shark, game, { chips: [5, 10, 25, 100], maxBet: 500, at: [0, -0.9] }));
  const reels = room('B');
  if (reels) {
    const z = -reels.d / 2 + 0.28;
    // deep lacquers with gold and chrome: sea-teal, cherry, midnight
    const looks = [
      { colour: '#0e4a50', accent: '#3fe0d0' },
      { colour: '#6e0f1a', accent: '#ffb627' },
      { colour: '#131f46', accent: '#ffd45a' },
    ];
    [-1.5, 0, 1.5].forEach((x, k) => tables.push(new SlotMachine(reels, game, world, { bets: [1, 5, 25], at: [x, z, 0], ...looks[k] })));
  }
  // the music (ff2's jukebox songs outside, the casinos' own inside) and the sea's sound
  const music = new Music(interiors.filter((i) => i.role.role === 'casino'));
  const shore = new ShoreSound(heightfield, json.layout.pier, () => interiorAt(interiors, world.player.position.x, world.player.position.z) !== null, () => sky.state.night.value);
  // your shack, and the shops that furnish it
  const kit = { renderer: world.renderer, props: fishingDeps.props! };
  const shack = room(HOME);
  if (shack) new Shack(shack, game, kit, (b) => surfaces.addBox(b));
  const homeShops = HOME_SHOPS.map((n) => room(n)).filter((r): r is Interior => !!r).map((r) => new HomeShopCounter(r, game, kit));
  villageTick = (dt) => {
    music.update(world.camera);
    shore.update(ocean.time, dt, world.camera);
    market?.update(dt, world.camera);
    for (const t of tables) t.update(dt, world.camera);
    blink.update(dt);
  };

  // Tidewater's start: the boardwalk up from the pier foot, looking down it.
  const s = json.layout.start;
  world.player.position.set(s.x, surfaces.floorYAt(s.x, s.z, 10), s.z);
  world.player.rotation.set(0, s.yaw, 0);

  // Dev hook: drive the rig without a headset (`__fish.move.to(x, z, yaw)`).
  (window as unknown as { __fish: unknown }).__fish = { world, surfaces, move: teleportView, json, game, fishing: fishingView, vegetation, backpack: backpackView, interiors, tables, music, shore, sky, homeShops };

  if (import.meta.env.DEV) void import('./dev/harness.ts').then((m) => m.installHarness(world));

  status.textContent = navigator.xr ? 'Ready.' : 'WebXR not available in this browser — desktop preview only.';
  enter.disabled = !navigator.xr;
  enter.addEventListener('click', () => {
    ensureAudio();
    launchXR(world, { sessionMode: SessionMode.ImmersiveVR });
  });
  // Hide the landing card once the session is up; bring it back after.
  // (A timer, not rAF: Quest Browser suspends window rAF while presenting.)
  window.setInterval(() => {
    document.body.classList.toggle('in-xr', !!world.session);
  }, 250);
});
