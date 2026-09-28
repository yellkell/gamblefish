# Fish & Chips

Fish by day, chips by night: the catch pays for the casino's chips. (The repo, the
site and the services keep their old `gamblefish` names so links and saves still work.)

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
    The pier's handrails are laid end to end. Tidewater overlaps each bay's rails
    over the posts, and the overlapping faces flickered.
    The four outhouses are left out, and gateways for the woodworks' walks are cut in the
    pier head's rails.
    The walkway's sway braces run pile to pile. Tidewater stops each one 25–45 cm short of the
    piles at both ends, which leaves the boards floating.
  - `world.json` — the layout and Tidewater's collision world.
- The runtime (`src/world/`) rebuilds all of this in three.js for Quest:
  - LOD terrain chunks.
  - A single-pass Gerstner ocean shaded with Tidewater's water optics (by way of FIRE FIGHT 2's
    cove sea): light absorbed and scattered along the refracted ray down to the seabed, the sand
    and its caustics seen through it, exact Fresnel, the sky's own colours in the reflection, a
    GGX sun path, drifting ripple layers and a lace of foam at the waterline.
  - A gradient sky with fog.
  - Four Lambert draws for the village.

  At the pier head that's about 43 draw calls and 200k triangles.

Not carried over yet: vegetation (palms), the boat, the reef and the swimming fish,
and the vendors.

## Opening

- **On the page:** ff2's publisher card (yellkell.com, PRESENTS) fades in and out, then the
  splash: the FISH & CHIPS mark (`src/ui/logo.ts`: a chip for the ampersand) breathing in its
  glow. The leaping fish over the chip is the game's own sailfish, photographed once its
  model loads and faded in. The loader, a neon ENTER VR, and a thumbstick icon sit under it.
- **In the headset:** the first session of a page load opens on ff2's boot intro
  (`src/experience/bootIntro.ts`): the publisher card, then the same mark, then the curtain
  drops. While it's up the controls wait and the first song decodes, starting as it drops.

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
- **Ripples** (`src/fx/water.ts`) ride the swell: each ring's vertices are raised to
  the sea's height at that point, from the ocean's own waves, so a passing crest no
  longer hides them.
- **Sea:** `src/audio/shore.ts` is ff2's cove soundscape on this island, with the
  same Tidewater recordings. Surf breaks and washes up the beaches around you, timed
  to the foam you see running up the sand, over a distant surf roar. Water laps
  under the pier. Indoors it's all muffled.
- **Music:** `src/audio/music.ts` plays songs off ff2's jukebox. Outside, the
  rotation plays: Paradise, Poo Song, VOne, Experimental Song
  (`src/audio/songs/`, in filename order). Inside the casinos it's Give It To Me
  (`src/audio/casino/`), which spills muffled out of their doors as you walk up.
  The backpack's **MUSIC** button mutes it all.
- **The day:** `src/world/sky.ts` runs a whole day in about 40 minutes, with the
  night going faster. Sun and moon move across the sky; dawn, midday, golden hour,
  sunset, dusk and a moonlit night each have their own sky, fog, sea and light.
  After dark the windows glow, the lamps light up (`src/world/lamps.ts`), the stars
  come out and the crickets start.
- **Fish that keep their own hours:** `src/fishing/timedFish.ts` adds five species,
  each biting only in its window: bonefish at dawn, queen triggerfish at midday,
  permit at sunset, lookdown at night under the pier lamps, and glasseye snapper after
  midnight. `npm run check:fish` checks the windows.
- **Your shack:** the hut on the beach (HOME) is yours. The Carpenter, Florist,
  Taxidermist and Pawn Shop each sell things for it from a counter and a price
  board (`src/village/homeGoods.ts`). What you buy is delivered to its spot in the
  shack and kept in your save.
  - The Carpenter: a driftwood bed with a patchwork quilt, a table and two ladder-back
    chairs, a kilim rug, a bookshelf, and a sea chest for the foot of the bed.
  - The Florist: a kentia palm, a hibiscus in bloom, a Boston fern in a macramé
    hanger, a moth orchid on a bamboo stand, and a monstera in a woven basket.
  - The Taxidermist: tarpon, mahi-mahi, red snapper and a leaping sailfish, each on a
    carved plaque with an engraved brass plate.
  - The Pawn Shop: a ship in a bottle on a rum barrel, a mariner's globe, a painting of
    the bay, and a brass diving helmet on its salvage crate.
- **How the goods are made:** each shop's things are modelled in `src/village/wares/`
  with a small kit (`src/village/craft.ts`): leaves, petals and leaflets as curved,
  folded blades grown from real stems; tapered tubes; turned and rounded pieces; wood
  grain, linen, velvet and rattan painted once on a canvas.
  - **Draw calls:** plain colours and cloth share one material per finish, with the
    colour baked into each piece. Everything delivered to the shack or the villa is
    baked together, one draw per material for the whole room.
  - **Load time:** each thing is built once at load; its board picture is taken from
    a copy.
  - **Cost:** the town from the pier costs the same as before (rooms are drawn only
    when you can see into them). A fully furnished shack costs about as many draws as
    it did before this polish.
- **Coral's villa:** Villa Mar (L) is furnished the same way. The Jeweller sells a
  crystal chandelier, a vanity with a jewellery box, pearls on a velvet bust, a
  ring under a glass cloche and a mermaid's tiara. The Boutique sells a velvet chaise
  longue, a gilded cheval mirror, silk drapes, a baby grand and a painted silk screen. Coral is at home (`src/village/villa.ts`), lit like the
  room around her rather than by the sky outside, and a board
  over her sofa counts your gifts in hearts, with a new line from her for each one.
- **Fishing upgrades** (`src/fishing/gear.ts`, `src/village/gearShop.ts`), on
  Tidewater's own upgrade tracks:
  - The **Tackle Shop** sells rods (cast distance), reels (reel speed) and line
    (breaking strain), each now with a big-game top level, and hooks: sharper hooks
    hold the window to strike open longer.
  - The **Bait Shop** sells bait, up to live bonito. Better bait brings bites sooner. The cheapest
    step up ($25) is **goop bait**: FIRE FIGHT 2's Goopliath no bigger than your thumb, by the tub
    (`src/village/wares/goop.ts`). His twenty gel blobs in ff2's boxer's stance are polygonised once
    at load from the same smooth-min, in his lime-to-bottle-green gel with the nucleus glowing
    through and his two bead eyes. A save from before goop bait keeps the bait it had.
  - The **Fortune Teller** sells luck charms, up to the sea king's doubloon. They
    make trophy fish bite more often.
  - Each board says what a level does for you in plain numbers against what you have (cast 13 m
    further, bites 28% sooner, trophy fish 2.4× as often), and which trophy fish need it.
  - Every shop board shows a picture of each thing it sells: the item's own 3D model,
    photographed once at load (`src/ui/thumbnail.ts`).
- **Trophy fish** (`src/fishing/trophyFish.ts`): roosterfish, opah, sailfish,
  swordfish (night only) and blue marlin. They bite only when you have the gear each one
  needs and the bobber is over deep enough water (8–13 m, out past the drop-off off the
  pier head, so the longer rods matter). The marlin needs everything at the top and a
  charm. Each has its own body, built from a Tidewater anatomy with a bill, a sail or a
  comb added. `npm run check:fish` checks that none bites without its gear.
- **Signs** (`src/village/signs.ts`): every business has a painted timber board, 5 cm thick,
  lit by the scene. Each is lettered by hand in a
  sign-writer's serif, letters a hair off the line with a painted shadow, over wood grain, and has
  seen some weather: paint chipped back to grey timber at the edges and seams, flecks gone, rain
  streaks, grime along the foot. A picture of the trade sits beside the name and a line says what's
  inside: planks painted in the trade's colour with a pinstripe (a rod, a baited hook, a fish, a saw
  and hammer, the pawnbroker's three balls, a mounted fish, a potted hibiscus); gold leaf on oiled
  dark hardwood for the jeweller, the boutique and the bank; hand-painted stars for the fortune
  teller; glass-tube neon on stained timber for the casinos. Your shack, Coral's villa and the
  boatyard have none.
- **The pier's sign** (`src/village/pierSign.ts`): no words. A snapper cut from a thick plank, its
  edges eased, painted coral and gold by hand (scales, fin rays, the gill, a bright eye) and worn
  back to the grain in places, hanging from the entrance arch on two iron chains and swinging a
  little in the wind. It replaces Tidewater's plain board (world.json `pierSign` keeps where it hung).
- **Roofs** (`src/world/village.ts`): the bake keeps Tidewater's roof coordinates, and the village's
  own draws texture the roofs from them in the fragment stage: thatch streaked down the slope in
  courses, older and greyer in patches; corrugated metal with its ribs, sheet seams and laps, and
  rust streaking down from the eave. No textures, no extra draws; the detail fades with distance.
- **The village:** the Rum Shack (I) and the empty Captain's Table (M) are gone, and
  each spot is now a small garden. The beds' heliconias and birds of paradise are made the way the
  Florist's plants are (`src/world/beds.ts`): leaves on their own stalks, and flower spikes of red
  and yellow bracts, or the bird's green beak with its orange crest and blue tongue. They're in
  full within 16 m of you, coarser beyond.
- **The Tackle Shop's porch:** its roof hung from under the thatch eave, at eye height. The bake
  raises any porch like that (taller walls, a shallower pitch) until it clears 2 m. Rooms are only drawn when you could see into them
  (from inside, or from in front of the doorway), so looking back at town from the
  pier costs about 100 draw calls instead of about 800.
- **Field guide:** the backpack has a second tab (the BACKPACK and FIELD GUIDE
  buttons stand off the tray's left edge, above MUSIC), a book of the island's marine fauna
  (`src/backpack/fieldGuide.ts`). It has a title page with your progress, two species to
  a page, and the tarpon and the trophy fish on a page each at the back. A species you
  haven't caught shows as a shadow with where and when to look. The first one you land
  fills its entry in: its picture, names, habitat, how many you've caught and your best, and a
  true DID YOU KNOW? fact. Opposite the title page is a chart of the bay drawn from the terrain
  (`src/backpack/chart.ts`), showing depths, the drop-off, the reef, the pier, and numbered places
  (the shops, the casinos, home, the timber yard and the east woodlot) with a key, plus a dot for
  where you're standing. Point at a marker, a line of the key or a finished walk's platform and
  you're there: inside a room a step in from its door, or in front of the place, looking at it. The
  backpack shuts behind you. (Not with a fish on the line.) The great white has the last page.
  Point at the corner arrows to turn the pages.
- **Winning at the casinos** (`src/casino/celebrate.ts`): every win flashes light, sends
  a ring across the table and throws confetti and glints, which settle on the felt. The
  amount rises in gold, and both controllers buzz. All of it scales with the win.
  - **Roulette:** the winning spots pulse gold. Each winning stack is paid chip by chip
    beside it, then slides over to you. A straight-up hit gets a STRAIGHT UP! banner.
  - **Blackjack:** the pay lands chip by chip beside your bet and the hand's label
    throbs. A natural gets a BLACKJACK! banner and the biggest burst.
  - **Slots:** the winning symbols glow and the amount rises when the count lands.
    Three shells or hooks get a NICE WIN banner, on top of the BIG WIN and JACKPOT ones.
- **The fish's skin** (`src/fishing/fishSkin.ts`): Tidewater's WGSL fish material, ported to
  GLSL on three's standard material. It adds scales in colour and relief, each species'
  markings, the lateral line and gill cover, see-through ray-striped fins, eyes with an iris
  and cornea, and the silvery sheen. The bake keeps each vertex's anatomy data for it, and
  seats the eye domes on the head so none stand off it.
- **The great white** (`src/fishing/shark.ts`, `src/fishing/sharkShow.ts`): the last catch.
  Once every other page of the field guide is filled, it takes baits in 6 m of water or more.
  - Every few seconds it breaches and runs. A ring lights on the rod's foregrip: grab it with
    your other hand and hold on until the run breaks. One-handed it strips line, and reeling
    against a run snaps it.
  - Three held runs beat it. It rolls up alongside you under a GREAT WHITE! banner, and you let
    it go for a bounty.
  - Its skin is its own pattern: denticles, scars, gill slits, snout pores and teeth.
- **The woodworks** (`src/woodworks/`): build your own way out to the reef and deep water.
  - **Timber yard:** an open stall on the beach west of the pier foot. It sells the AXE
    ($60), a bundle of 10 logs ($40) and a cart of 50 ($180) for when you'd rather not chop.
  - **Woodlots:** six almond trees behind the yard, and six more on the far side of the village
    past the boatyard, with a log pile and a chopping block but no stall (`src/woodworks/lots.ts`).
    Once you own the axe, walk up to either and it's in your hand. Swing it into a trunk: four good blows and the tree creaks, falls away
    from you, and its 4 logs fly into your backpack. A sapling grows back from the stump
    about a minute later. The backpack tray shows your log count.
  - **The build boards** (`src/woodworks/buildSign.ts`): what asks for wood is a notice board of old
    planks nailed into a frame on two stakes, with a pitched cap, lettered by hand like the shop
    signs. How far along it is shows as a row of log ends, the ones in painted in, the rest chalked
    round; PUT IN WOOD is a tag hung under it on two cords. It's lit like everything round it.
  - **The walks:** put wood in a build crate on the pier head and a walk lays itself out plank by
    plank through a gateway in the rail. At first only the **reef walk** (48 logs) is on offer: it
    runs 60 m out to a platform over the reef's edge. Until it's finished the deep walk's gateway
    keeps the pier's rail and has no crate. Then the **deep walk** (44 logs) opens, running past the
    drop-off to a platform over 14 m of water. Each platform stands on a regular grid of piles, is
    railed down its sides and open at the far edge to fish off, and has a lantern at each corner and
    a bucket and a coil of rope made fast to a cleat (`src/woodworks/bucket.ts`), their shine fading
    with the daylight so they're moonlit at night, not lit up, and an orange-and-white life ring
    on the rail across from them (`src/woodworks/buoy.ts`). Each walk appears
    on the field guide's chart, named, once it's finished. Wood, the axe and the walks are saved.
    Until a walk's finished a rope with its sign hangs across the gateway and the way is shut; with
    the last plank down it's unhooked, swings down and it's gone, and the walk is open. (Tidewater
    hung a string of floats on the head's rail right across the reef walk's gateway; the bake hangs
    it along the rail past the gateway instead.)
- **The helter skelter** (`src/skelter/`): [HELTER SKELTER](https://github.com/yellkell/helter) in
  its full glory, at the back left of the village (as the chart draws it). Once the deep walk's
  finished its plot is staked out, with a build crate and a board: **500 logs**. The logs raise it as
  they go in: the plinth, the 300 m candy-striped drum with the slide spiralling up round it, the
  roof, the finial and the flag, a timber collar climbing with the work. Then it's on the chart.
  - **To the top:** the board by the crate becomes the ride's: RIDE TO THE TOP takes you up to the
    balcony, where a warning comes up before the descent: centre yourself in your play space (a
    ring on the balcony floor marks the middle; hold the Meta button to recentre), because the ride
    moves you and you dodge the gates with your real body.
  - **The ride:** helter's, carried over whole: DOWN's sliding, three tiers with a landing between,
    gates to lean past, the voiced 3-2-1 on each bay, 4 Leaf Clovers at the top and New Song 98 or
    New Song 129 on the way down (`src/audio/skelter.ts`). While you're up the teleport is off and
    the slide moves you, the rod's away and the island's songs step aside.
  - **The coins are money:** $1 a coin, $5 a gem, paid into your wallet at every landing. Clip a
    gate and you're off the ride, but you keep what you caught. At the bottom: back up to the top,
    or step off into the village.
  - The painted tower is lit by the island's sun, so it goes gold at sunset and dark at night.
- **The fire dancers' camps** (`src/camps/`): FIRE FIGHT 2's beach-party dancers (the glowstick
  crowd round its bonfires, ff2's `src/arena/cove/`) have gone off into the wilds in **eight** little
  groups, each dancing round its own fire in a clearing with a chest beside it (the carpenter's
  sea chest, built so its lid opens: hollow inside, lined in red velvet, its logs lying in the
  bottom). None of them is on the chart and none can be seen from the
  start: they're over the ridges, down the hollows and round the far coasts, a long walk out.
  Listen for the drums, which carry further than the firelight: a little West African ensemble
  in 12/8 (bell, shaker, two bass drums and a djembe with a fill every fourth bar), each camp at
  its own tempo. `npm run check:camps` proves every
  one is hidden from the boardwalk, the pier and the beach, is level and standable, and can be
  reached on foot.
  - **Pleased to see you:** walk into a camp and its dancers throw their hands in the air, and gift
    you everything in their chest (no pop-up: the chest's readout keeps the count, "2 of 8 camps
    found"). A hidden camp's gift is given once.
  - **The chest:** walk up to it and it opens by itself (or grip its lid). The lid swings up and the
    **chest pack** rises out of it: a tray like your backpack's, lined in the chest's red velvet and
    lit by the fire (never black under the moon), with the dancers' fish lying in its slots and
    their logs beside it. Its readout is the dancers' welcome ("We're happy to see you! Glad you
    found us. Please take these as a gift!"), never the camp's name, so no chest gives away where
    it is. Reach in and **click** a fish to pack it straight into your
    backpack, or **grip** it to take it in your hand and put it in your backpack yourself (A).
    Point at the logs to add them to your stack, or TAKE ALL. There's always a prize fish a tier up
    (the harder camps can hold a Gold). Walk away and the lid comes down; shut it with CLOSE and it stays shut till you've stepped away
    and come back.
  - **The beach party:** find all eight and a ninth group comes down to the main beach, west of the
    timber yard, and lights a fire there (the hidden camps' chests say so once you have). Their chest fills every day with a couple of nice fish
    (Silver or better) and a stack of logs, fresh at midnight. Which camps you've found, and what's left in each chest,
    are saved.
- **The boards** (`src/ui/boards.ts`): every shop's, table's and counter's point-and-click board is a
  thing in the room, not a pane of dark glass: made of what that place would make it of, lettered
  its way, and set in a real frame. The carpenter's is planed pine with the lettering burnt in; the
  florist's sage-green boards with flowers painted round; the pawn shop prices things on manila
  tickets on string; the taxidermist uses engraved brass plaques; the jeweller black velvet and
  gold leaf in a gilt frame; the boutique cream linen and teal ribbons; the tackle shop navy boards
  with a painted rope and life-ring buttons; the bait shop and the fish market a chalkboard; the fortune
  teller starry cloth and tarot cards; the bank green leather tooled in gold with brass plates; the
  Lucky Lure black lacquer with art-deco gold leaf and pink enamel; the Card Shark green baize with
  ivory plaques on a mahogany stand; Coral's is a cross-stitch sampler; the dancers' chest bark
  cloth printed with tapa bands in a bamboo frame, with carved tags. Indoors they're drawn like
  the rooms (the lamp's light painted on); outdoors they're lit like everything else, and dim at
  dusk.
- **ALWAYS DAY:** a switch under MUSIC in the backpack holds the island in the early
  afternoon. The fish that only bite at night won't bite while it's on.
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
- **Look and sound:** a Line2 ribbon and ff2's `uiClick` on the same audio bus. The
  landing marker (`src/locomotion/marker.ts`) is the club's octagon at 0.42×, drawn in
  light rather than as a grey puck. It has a glowing rim, a tinted fill, two chevrons
  that ripple toward your facing, a ring that pings out from the rim, and a low curtain
  of light on its outline. A good landing is sea-glass `#5ee8d8`; a refused one turns
  hazard `#e8352a` with stripes. It pops in when you start aiming. It costs two draws.

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
| `src/fishing/` | the rod, cast, bites, fight, landing, catch card, the line meter clipped to the rod |
| `src/woodworks/` | the axe, the woodlots and the timber yard; the reef and deep walks, their build crates and boards, and the bucket at the end |
| `src/skelter/` | the helter skelter: its plot, the tower and slide, the ride (from HELTER SKELTER) |
| `src/camps/` | the fire dancers' hidden camps: their sites, fires and dancers (from FIRE FIGHT 2), the chests and what's in them, the drums |
| `src/ui/` | ff2's Rajdhani type kit and coin symbol, canvas panels, the wrist wallet |
| `src/dev/harness.ts` | dev-only emulator driver |
| `tools/bake-world.mjs` | Tidewater → `public/world/` |
| `tools/bake-props.mjs` | Tidewater's rod, bobber and fish → `public/props/` |
| `tools/teleport-check.mjs` | headless teleport rules check, including no landing under a house floor |
| `tools/fish-check.mjs` | headless check that the timed fish keep their hours and the trophy fish need their gear |
| `tools/camps-check.mjs` | headless check that the camps are hidden from the start, level, reachable, and their chests fill properly |
| `tools/line-check.mjs` | headless check that the fishing line lies over the pier's rails, posts and deck as drawn, not through them |

Dev hook: `__fish.move.to(x, z, yaw)`, `__fish.move.snapTurn(±1)` and
`__fish.move.stepBack()`.

## Credits

- **Island, fishing rules, rod, fish and sounds:** from [Tidewater](https://github.com/dgreenheck/tidewater)
  by Dan Greenheck (MIT). See `vendor/tidewater/LICENSE` and `CREDITS.md`, and
  `public/audio/CREDITS.md` for the CC0 recordings.
- **Teleport, cash chime, coin symbol, type kit, the sea's soundscape, the music, and the fire dancers and their bonfires:** from FIRE FIGHT 2. Rajdhani
  is under the SIL OFL (`src/assets/fonts/OFL-rajdhani.txt`).
