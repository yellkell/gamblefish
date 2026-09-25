# VR Gamble Fish

A VR adaptation of **How to Fish**, set on **Tidewater's** island
([dgreenheck/tidewater](https://github.com/dgreenheck/tidewater), MIT), built on
the **Immersive Web SDK** (IWSDK 0.4.2, three r184 — the same stack as
[FIRE FIGHT 2](https://github.com/yellkell/ff2)).

Movement is teleport-only, and it is **FIRE FIGHT 2's club teleport**, carried over
whole.

**Play:** https://yellkell.github.io/gamblefish/ (Quest Browser → ENTER VR)

## Controls

| | |
|---|---|
| **Teleport** | Either stick forward to aim. Roll the stick to pick your facing, then release to go. |
| **Snap turn / step back** | Flick the stick sideways to turn, or back to step back. |
| **Rod out / away** | **B** puts it in your right hand, **Y** in your left. It starts in your right hand. |
| **Cast** | Hold the **trigger** (your finger on the line), swing the rod and let go. |
| **Strike** | When the bobber goes under, yank the rod back or pull the trigger. |
| **Fight** | Reel with the **trigger** (pressure sets the speed), or grip the reel handle with your other hand and crank. Keep the tension in the green. |
| **Wallet** | Look at either wrist: a rolling counter shows your money. |

## Running

```sh
npm install
npm run dev          # bakes the island on first run, then http://localhost:5180
npm run build        # bake + typecheck + static build in dist/
npm run check:teleport
```

In dev, IWSDK's plugin injects the IWER Quest 3 emulator, so **ENTER VR** works on a
desktop. On a Quest, open the dev server's LAN address in the Quest Browser.

## Where the island comes from

Tidewater is a WebGPU/WGSL engine. Quest Browser can't run WebGPU inside WebXR, so
none of its renderer carries over. Its **world generation** is plain CPU
JavaScript, though, and that does carry over:

- `vendor/tidewater/` holds Tidewater's source, unmodified (MIT, see its
  `LICENSE`, `CREDITS.md` and `VERSION`).
- `tools/bake-world.mjs` runs Tidewater's own `TerrainData` and `Village`
  builders headlessly in Node (about 2 s). It writes `public/world/`:
  - `terrain.bin` — the heightfield on a 2 m grid, a ground-colour map and water depth.
  - `village.bin` — the village, pier and boardwalks as merged, vertex-coloured meshes.
  - `world.json` — the layout and Tidewater's collision world.
- The runtime (`src/world/`) rebuilds all of this in three.js for Quest:
  - LOD terrain chunks.
  - A single-pass Gerstner ocean, coloured by Tidewater's depth map.
  - A gradient sky with fog.
  - Four Lambert draws for the village.

  At the pier head that's about 43 draw calls and 200k triangles.

Not carried over yet: vegetation (palms), the boat, the reef and the swimming fish,
and the vendors.

## Fishing (How to Fish's loop, Tidewater's rules)

- **Game logic:** `src/fishing/tidewater.ts` imports Tidewater's fishing code
  as-is. That covers the 18 species with their prices, the habitats and bite
  timing, the line-tension fight, the gear tracks and the save, which lives
  under its own key.
- **Props:** `tools/bake-props.mjs` bakes Tidewater's own rod and reel, bobber
  and all 18 fish, colouring the fish the way its skin shader does. The rod's
  vertex animation (blank bend, rotor, bail, crank, spool) is ported from WGSL
  to GLSL in `src/fishing/props.ts`.
- **VR play:** `src/fishing/FishingSystem.ts` runs it all in VR.
  - The rod sits in your palm and points where you aim.
  - The cast uses your real tip speed. An assist forgives late releases on
    elevation only.
  - The rod-hand haptics carry the nibbles, the take and every surge.
  - Teleport closes during the fight.
- **Sound:** Tidewater's CC0 fishing recordings (`public/audio`) play at
  Tidewater's mix levels, on ff2's SFX bus.
- **Sea:** `src/audio/shore.ts` is ff2's cove soundscape on this island, with the
  same Tidewater recordings. Surf breaks and washes up the beaches around you, timed
  to the foam you see running up the sand, over a distant surf roar. Water laps
  under the pier. Indoors it's all muffled.
- **Music:** `src/audio/music.ts` plays songs off ff2's jukebox. Outside, the
  rotation plays: Paradise, Poo Song, VOne, Experimental Song
  (`src/audio/songs/`, in filename order). Inside the casinos it's Give It To Me
  (`src/audio/casino/`), which spills muffled out of their doors as you walk up.
  The backpack's **MUSIC** button mutes it all.
- **Wallet:** `src/ui/wallet.ts` puts an odometer-style money counter on both
  wrists. Any change in the balance rings ff2's cash chime, pitched up for
  money in and down for money out.

## Dev harness

In `npm run dev`, `window.__harness` drives the emulated Quest:

- `await __harness.enter()`, then `__harness.stand(55, 34, Math.PI, 2.3)` to
  stand on the pier head.
- `await __harness.cast()`, then `await __harness.until('fighting')` (it
  strikes by itself), then `await __harness.fight()`.
- `__harness.snapshot(camPos, lookAt)` renders the live XR scene from a
  spectator camera. The emulator's own XR canvas can't be screenshotted.

## Teleport (ff2 club, exact)

`src/locomotion/TeleportSystem.ts` is ff2's `src/rave/systems/ClubTeleportSystem.ts`.
The controls, arc, marker, sound and tuning are identical:

- **Stick forward** (either hand, past 0.5) opens a ballistic arc from that
  controller: 7.5 m/s, 9.8 gravity, 48 × 35 ms samples.
- **Roll the stick** to spin the facing arrow in the octagon marker.
- **Release** (below 0.35) to go. The head lands on the marker, facing the arrow.
- **Sideways flick** (0.7 engage, 0.3 re-arm) snap-turns 35° about the head, one
  snap per flick.
- **Back flick** steps 0.5 m away from where you're looking, then tries 0.34 and
  0.2 m. It never throws an arc.
- **Headset recentre** re-plants you where you stood.
- **Look and sound:** galvanised-steel `#9aa4ac` Line2 ribbon and 0.42× octagon
  puck, hazard `#e8352a` when refused, and ff2's `uiClick` on the same audio bus.

What had to be new is **where** you may land. The club was a list of flat
rectangles; the island has terrain and a sea. `src/world/surfaces.ts` answers the
same questions as ff2's `TELEPORT_AREAS`, `floorYAt` and `crossesWall`:

- **Floor areas** are Tidewater's walkable colliders (pier, pier steps,
  boardwalks, stairs, porches, stoops) plus dry ground.
- **Refused landings:** the sea, the swash line (below 0.25 m) and slopes
  steeper than 38°.
- **Walls** are Tidewater's solid colliders. As with the club's bar counter,
  each one's **top is its sill**, so a hop at deck height passes over the pier's
  under-deck beams, but the rails stop it.
- **Raised floors** catch an arc only as it falls onto them. The ground catches
  it either way, just as the club floor did.
- **On sloped ground**, the marker tilts to lie along the slope.
- **Stepping back** on natural ground allows 0.35 m of rise or fall. On decks it
  keeps the club's 5 cm.

## Layout

| Path | What |
|---|---|
| `src/main.ts` | IWSDK boot, load, Enter VR |
| `src/locomotion/` | ff2 teleport, its tuning, the octagon |
| `src/world/` | baked data reader, heightfield, surfaces (pure), terrain, ocean, sky, village |
| `src/audio/` | ff2's synth SFX bus and cash chime; Tidewater's sampled fishing and shore sounds; the music |
| `src/fishing/` | the rod, cast, bites, fight, landing, catch card, tension gauge |
| `src/ui/` | ff2's Rajdhani type kit and coin symbol, canvas panels, the wrist wallet |
| `src/dev/harness.ts` | dev-only emulator driver |
| `tools/bake-world.mjs` | Tidewater → `public/world/` |
| `tools/bake-props.mjs` | Tidewater's rod, bobber and fish → `public/props/` |
| `tools/teleport-check.mjs` | headless teleport rules check (24 checks) |

Dev hook: `__fish.move.to(x, z, yaw)`, `__fish.move.snapTurn(±1)` and
`__fish.move.stepBack()`.

## Credits

- **Island, fishing rules, rod, fish and sounds:** from [Tidewater](https://github.com/dgreenheck/tidewater)
  by Dan Greenheck (MIT). See `vendor/tidewater/LICENSE` and `CREDITS.md`, and
  `public/audio/CREDITS.md` for the CC0 recordings.
- **Teleport, cash chime, coin symbol, type kit, the sea's soundscape and the music:** from FIRE FIGHT 2. Rajdhani
  is under the SIL OFL (`src/assets/fonts/OFL-rajdhani.txt`).
