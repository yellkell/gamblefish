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
| **Fight** | Reel with the **trigger** (pressure sets the speed), or grip the reel handle with your other hand and crank. Keep the tension in the green. A hooked fish runs first, and won't come in until it's tired. |
| **Wallet** | Look at either wrist: a rolling counter shows your money. |

## Running

```sh
npm install
npm run dev          # bakes the island on first run, then http://localhost:5180
npm run build        # bake + typecheck + static build in dist/
npm run check:teleport   # and check:backpack, check:casino, check:fish, check:camps,
                         # check:line, check:mining, check:statue
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
  - A gradient sky with fog, and sprite clouds.
  - Four Lambert draws for the village.

  At the pier head that's about 43 draw calls and 200k triangles.

Not carried over yet: vegetation (palms), the boat, the reef and the swimming fish,
and the vendors.

## Opening

- **On the page:** ff2's publisher card (yellkell.com, PRESENTS) fades in and out, then the
  splash: the FISH & CHIPS mark (`src/ui/logo.ts`: a chip for the ampersand) breathing in its
  glow. The leaping fish over the chip is the game's own sailfish, photographed once its
  model loads and faded in. The loader, a neon ENTER VR, and a thumbstick icon sit under it.
- **In the browser tab:** the mark's chip with the sailfish leaping across its face
  (`public/favicon.svg`), plus the .ico, home-screen and manifest icons made from it.
- **In the headset:** the first session of a page load opens on ff2's boot intro
  (`src/experience/bootIntro.ts`): the publisher card, then the same mark, then the curtain
  drops. While it's up the controls wait and the first song decodes, starting as it drops.

## Fishing (How to Fish's loop, Tidewater's rules)

- **Game logic:** `src/fishing/tidewater.ts` imports Tidewater's fishing code
  as-is. That covers the 18 species with their prices, the habitats and bite
  timing, the line-tension fight, the gear tracks and the save, which lives
  under its own key. One change: "deep water" starts at this island's drop-off
  (9 m, all deep by 15 m) rather than Tidewater's 16–28 m, which no cast here
  reaches. Without it the mahi-mahi and blackfin tuna, which live only in the
  deep, never bit. Off the end of the deep walk they now do.
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
  rotation plays: Paradise, Poo Song, Experimental Song, New Song 35, Mist,
  By the River, Like That, Imagine, Novus (`src/audio/songs/`, in filename order).
  Inside the casinos it's Give It To Me then Fusion, round and round (`src/audio/casino/`),
  spilling muffled out of their doors as you walk up.
  The backpack's **MUSIC** button mutes it all.
- **The day:** `src/world/sky.ts` runs a whole day in about 40 minutes, with the
  night going faster. Sun and moon move across the sky; dawn, midday, golden hour,
  sunset, dusk and a moonlit night each have their own sky, fog, sea and light.
  After dark the windows glow, the lamps light up (`src/world/lamps.ts`), the stars
  come out and the crickets start.
- **Clouds:** `src/world/clouds.ts` fills the sky with fair-weather cumulus drifting
  on the trade wind, out to the horizon wherever you stand. Each cloud is a heap of soft
  puffs on a flat base, lit by the sky's own sun and moon: white tops and grey-blue bellies
  by day, a silver edge as one crosses the sun, gold then pink through the sunset, and dim
  moonlit shapes against the stars. The far ones fade into the horizon haze.
  - **Cost:** one draw for the whole sky, about a thousand sprites, sorted back to front a
    few times a second.
- **Hawks:** `src/world/hawks.ts`. Every few minutes a red-tailed hawk comes in over the
  island, finds a thermal near you and circles up it, banked into the turn. Its wings are
  fingered at the tips and held in a shallow V. It gives a few deep beats now and then,
  then glides off without a sound.
  Sometimes its mate comes along. Their paths stay clear of the hills. They keep a hawk's
  hours: they come only while the sun is well up (7:30 to about 5 pm on the island's
  clock) and are gone before sunset, so you never see one at dusk or at night.
  - **The bird:** pale underneath with dark wing bars and fingertips, brown on top with the
    rufous tail. It flaps in its vertex shader, at the shoulder and the wrist, so each hawk
    costs one draw.
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
  crystal chandelier, a vanity with a jewellery box (a real box, its velvet lining sunk in its well:
  laid flush with a solid block's top it flickered), pearls on a velvet bust, a
  ring under a glass cloche and a mermaid's tiara. The Boutique sells a velvet chaise
  longue, a gilded cheval mirror, silk drapes, a baby grand and a painted silk screen. Coral is at home (`src/village/villa.ts`), lit like the
  room around her rather than by the sky outside.
- **Coral talks to you** (`src/village/coral.ts`), in a speech bubble over her head
  (`src/ui/speechBubble.ts`) that pops up when you come in, turns to face you and shrinks away
  when she's done:
  - Her heart is the gifts you've given her, one heart each, shown in the bubble. How she greets
    you moves through five stages as it fills (a stranger, warming, fond, close, yours), with
    her own lines after dark.
  - Anything delivered since your last visit she thanks you for in person, by name, one line
    each, a heart filling with a chime; then a word on where the two of you are now.
  - Early on, with nothing new, she hints at the Jeweller and the Boutique. Straight back in:
    "Back so soon?" Walking out: a goodbye, seen back through the doorway.
  - What she's thanked you for and how often you've called are saved (`coral` in the save); an
    older save counts everything already in her villa as thanked.
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
  - The rod in your hand looks like what you've bought (`src/fishing/rodLook.ts`): the blank,
    grips, wraps and fittings follow your rod (brown fibreglass and cork up to a navy big-game
    blank with gold guides and a gimbal butt), the reel's body and trim your reel, and the line
    on the spool, through the guides and out to the float your line. The bake tags each of the
    rod's vertices with its material, so it's repainted in place.
  - Your hook and bait hang under the float on a short leader (`src/fishing/baitRig.ts`): the
    shops' own models, swinging on the cast, sinking under the float in the water, gone
    while a fish has them. At the Bait Shop every bait you've bought (and the frozen shrimp you
    started with) has a **USE** button to put it on the hook, and at the Tackle Shop a **YOUR
    ROD AND REEL** board on the wall by the rack does the same for the rod in your hand and the
    reel on it. That only changes the look: the bites come as fast as your best bait brings them,
    you cast as far as your best rod and reel in as fast as your best reel. Buying new gear puts it on. The picks are saved (`looks`, by track).
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
  Point at the corner arrows to turn the pages, or point at the book and flick the thumbstick
  left or right.
- **Winning at the casinos** (`src/casino/celebrate.ts`): every win flashes light, sends
  a ring across the table and throws confetti and glints, which settle on the felt. The
  amount rises in gold, and both controllers buzz. All of it scales with the win.
  - **Big wins** get a banner with a shine sweeping across its letters and light rays
    turning behind it, and a fountain of gold coins that ring down and settle. (The shark's
    bounty gets the coins too; the statue, the helter skelter and the walks opening don't.)
  - **Chips** (`src/casino/chips.ts`) have a real chip's edge spots and inlay ring, so a
    pay stack reads as money.
  - **Roulette:** the winning pocket lights up on the wheel and the winning spots pulse
    gold. Each winning stack is paid chip by chip beside it, then slides over to you. A
    straight-up hit gets a STRAIGHT UP! banner.
  - **Blackjack:** the pay lands chip by chip beside your bet, the felt glows gold under
    the winning cards and the hand's label throbs. A natural gets a BLACKJACK! banner and
    the biggest burst.
  - **Slots:** the winning symbols glow and the payline turns gold. A small win's amount
    rises when the count lands. From three shells or hooks up the win is a show that lasts
    the whole count: the amount rolls up in big gold figures over the reels, the NICE WIN,
    BIG WIN! or JACKPOT! banner stays up and confetti keeps popping. When the count lands
    the figures slam and burst, then float away.
- **The case wall** (`src/casino/CaseWall.ts`, rules in `src/casino/cases.ts`): on The
  Lucky Lure's right-hand wall, between the roulette table and the door. It opens THE LURE
  CASE ($50) the way a CS case opens.
  - **The spin:** point at OPEN and pull the trigger. A strip of cards races past a gold
    marker, ticking card by card, and slows to a crawl onto your prize. The prize is drawn
    first (crypto RNG) and the strip is dressed round it, so the spin only shows it.
  - **Grades** in CS's names and colours: Consumer (logs and small fish), Industrial,
    Mil-Spec (the first gems), Restricted, Classified, Covert (an opah, a ruby) and the
    ★ Rare Special (a blue marlin). The board shows everything in the case and each grade's
    odds. One fish in ten comes out Silver.
  - **Gems only with the pickaxe:** until the Jeweller's pickaxe is yours the case holds just
    logs and fish, and the board says the gems are to come. It returns about 94.5% without
    the gems and 92.3% with them.
  - **The reveal:** your card comes out of the strip in its grade's light, with rays from
    Restricted up. Mil-Spec and up get a party in the grade's colour; Classified, Covert and
    the ★ Rare Special get a banner.
  - **Where it goes:** logs into your backpack, a fish into its grid and a stone into your
    pouch. A fish with no room is sold on the spot. Nothing from the case fills the field
    guide: its fish and gem pages are for what you catch and dig out yourself. (The
    Jeweller's window still names a case stone in your pouch.)
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
    about a minute later. Beside the backpack tray lies a little bundle of real logs, one for each
    you carry up to a full stack of six, bound with rope, the count burnt into a pine tag
    (`src/backpack/stash.ts`).
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
    After dark its lanterns come on like the pier's (`src/skelter/lights.ts`): a little iron
    lantern on the slide's outer rail every 5 m, with a festoon of bulbs strung between them,
    so the whole tower is wound in a spiral of warm light you can see from the beach.
- **The fire dancers' camps** (`src/camps/`): FIRE FIGHT 2's beach-party dancers (the glowstick
  crowd round its bonfires, ff2's `src/arena/cove/`) have gone off into the wilds in **twelve** little
  groups, each dancing round its own fire in a clearing with a chest beside it (the carpenter's
  sea chest, built so its lid opens: hollow inside, lined in red velvet, its logs lying in the
  bottom). None of them is on the chart and none can be seen from the
  start: they're over the ridges, down the hollows and round the far coasts, a long walk out
  (two of them in the big forest behind the village, off to the left as you look up from the pier,
  and two out on the far right, up the island's east coast).
  Listen for the drums, which carry further than the firelight: a little West African ensemble
  in 12/8 (bell, shaker, two bass drums and a djembe with a fill every fourth bar), each camp at
  its own tempo. `npm run check:camps` proves every
  one is hidden from the boardwalk, the pier and the beach, is level and standable, and can be
  reached on foot.
  - **Pleased to see you:** walk into a camp and its dancers throw their hands in the air, and gift
    you everything in their chest (no pop-up: the chest's readout keeps the count, "2 of 12 camps
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
  - **The beach party:** find all twelve and a thirteenth group comes down to the main beach, west of the
    timber yard, and lights a fire there (the hidden camps' chests say so once you have). Their chest fills every day with a couple of nice fish
    (Silver or better) and a stack of logs, fresh at midnight. Which camps you've found, and what's left in each chest,
    are saved. (A save that already had the beach party, from when there were fewer to find,
    keeps it.)
- **The gem rocks** (`src/mining/`): prospecting, with a pickaxe from the Jeweller.
  - **The Jeweller's windows** (`src/village/gemWindows.ts`): a second counter down the Jeweller's
    right-hand wall, a screen of glass and brass bars along it with two windows cut in it, a board
    over each. The **Prospector's Window** sells the **pickaxe** ($250; one lies on the counter till
    it's yours) and nothing else: where the rocks are is yours to find out. **We Buy Gems**
    shows every kind in your pouch with a SELL for each, and SELL ALL; one of each kind you've
    ever found lies on a velvet pad under it.
  - **The rocks** (`src/mining/sites.ts`, `src/mining/rock.ts`): thirty-two big boulders out in the
    wilds, eight on each kind of ground (a good few in the forest behind the village and out on the
    east side), none on the chart, veined with glowing lines in the colour of
    what's inside, breathing softly day and night. The bake clears the plants and Tidewater's own rocks round each. Own the
    pick and walk up to one and it's in your hand, the rod over your shoulder, as the axe is among
    the trees. Swing its point into the rock: steel rings on stone, chips and sparks fly, a jolt in
    your hand, and the veins open wider and blaze. Six blows and it bursts apart, the chunks glowing along the cracks as they tumble and sink into rubble.
    Like a dancers' chest, a rock is a one-time find: once broken it stays broken (rubble where it
    stood, and nothing left in the way of a teleport), and never grows back. Stones you leave in its
    tray wait there for you. Which rocks you've broken, and what's still in each, are saved.
  - **The tray:** out of the rubble rises a tray like the dancers' chest pack, lined in black
    velvet, the rock's stones turning in its slots; its board opens on "The sparkle blinds your
    eyes!", never where you are or what the stones are worth (the Jeweller might want to look at
    them). Reach in and click one (trigger or grip) and it
    flies into your pouch; TAKE ALL; CLOSE. What's inside depends on the ground (`src/mining/gems.ts`):
    peridot and aquamarine on the shore, watermelon tourmaline and emerald in the forest, amethyst
    and black opal on the high ground, sapphire and ruby on the peaks, the second of each the rare
    one. Each stone has its carats and is worth them.
  - **The stones** (`src/mining/gemMesh.ts`): each cut as a lapidary would (an oval, a pear, a
    trillion, a cushion and a heart as brilliants, crown and pavilion facets interlocking; emerald
    and baguette step cuts; the opal a cabochon), every facet its own flat normal. Their shader lights
    each from its own jeweller's studio fixed in the world (a dark room hung with lamps), so they
    scintillate as you move your head: through each facet the light that went in at the crown and
    came back off a pavilion facet, split a little for red, green and blue (fire), coloured by its
    path through the stone, under the surface's own reflection. The black opal's harlequin patches
    flash their colours as it turns; the tourmaline is pink at the heart and green at the rind; the
    emerald cut's table shows its hall of mirrors. Little four-pointed stars flash on them.
  - **The book:** once the pickaxe is yours the field guide gains a last spread after the fish, the
    eight gems four to a page. One you haven't found is a shadow with no name: where to look (the
    ground, how high, what the stone looks like) and whether it's the common one there or a rare
    one. The first you take fills its entry in (its names, where it's found, how many and your
    biggest, and a true DID YOU KNOW? fact), and the stone itself lies on the page, turning.
  - **The pouch:** once the pickaxe is yours (not before), a violet velvet drawstring pouch sits
    beside the backpack tray, under the logs: pleated at the neck by a gold cord with tasselled
    ends, your three most valuable kinds of stone sparkling in its open mouth, and a black velvet
    tag with how many you have: take these to the Jeweller (no prices till you're at his window). `npm run check:mining` checks that every rock is on its
    ground, clear, standable and reachable, and that the stones and the pouch behave.
- **The golden statue** (`src/statue/`): the island's thanks, once you've had everything it has to
  give. `src/statue/journey.ts` keeps the tally, five legs:
  - **the book:** every fish in the field guide, the great white too;
  - **the dancers:** all twelve hidden camps found;
  - **the gems:** every kind of stone the rocks hold;
  - **the shops:** everything they sell that stays yours: all 28 pieces for your shack and Coral's
    villa, every level of rod, reel, line, hooks, bait and charm, the axe and the pickaxe;
  - **the helter skelter:** one full descent, all three tiers to the bottom (the ride's win counts it,
    `journey.rides` in the save; rides from before it was counted don't, so ride it once more).

  Finish the last and (once you're off the tower and have no fish on) a big golden statue of the
  sailfish off the logo rises out of the sand where you come down onto the beach, west of the pier
  foot, to a fanfare, a QUITE THE JOURNEY! banner and a word wherever you are. The fish is the game's
  own sailfish, 5.5 m bill to tail, bent into a leap, its markings kept as shading in the gold, its sail's
  rays standing out, leaping from a golden splash; little stars glint over it, and after dark it keeps a
  warm glow of its own. On the plinth's face an engraved bronze plaque: *Quite the journey! Thanks for
  Playing! Created by yellkell. Music by IBWildcat1998, poopoodoodoo689, JakeThePro & Crystalzach.*
  Once up it's saved (`journey.unveiled`), stands there every visit, and is a gold star on the field
  guide's chart (point at it to stand before the plaque). About five draws, built only once it's
  earned. `npm run check:statue` checks the plot (dry, clear, in sight from the start, solid) and that
  only all five legs together earn it.
- **The boards** (`src/ui/boards.ts`): every shop's, table's and counter's point-and-click board is a
  thing in the room, not a pane of dark glass: made of what that place would make it of, lettered
  its way, and set in a real frame. The carpenter's is planed pine with the lettering burnt in; the
  florist's sage-green boards with flowers painted round; the pawn shop prices things on manila
  tickets on string; the taxidermist uses engraved brass plaques; the jeweller black velvet and
  gold leaf in a gilt frame; the boutique cream linen and teal ribbons; the tackle shop navy boards
  with a painted rope and life-ring buttons; the bait shop and the fish market a chalkboard; the fortune
  teller starry cloth and tarot cards; the bank green leather tooled in gold with brass plates; the
  Lucky Lure black lacquer with art-deco gold leaf and pink enamel; the Card Shark green baize with
  ivory plaques on a mahogany stand; the dancers' chest bark
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
  steeper than 45°, or 62° when the landing is at least half a metre below you:
  you can scramble down what you couldn't climb, so no hillside leaves you stuck
  with every aim burning red (`npm run check:teleport` proves every spot you can
  stand on out on the hills has a way off).
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
| `src/world/` | baked data reader, heightfield, surfaces (pure), terrain, ocean, sky, clouds, hawks, village |
| `src/audio/` | ff2's synth SFX bus and cash chime; Tidewater's sampled fishing and shore sounds; the music |
| `src/fishing/` | the rod, cast, bites, fight, landing, catch card, the line meter clipped to the rod |
| `src/woodworks/` | the axe, the woodlots and the timber yard; the reef and deep walks, their build crates and boards, and the bucket at the end |
| `src/skelter/` | the helter skelter: its plot, the tower and slide, the ride (from HELTER SKELTER) |
| `src/mining/` | the gem rocks: their sites, the boulders and their cracks, the pickaxe, the cut stones and their shader, the tray, the pouch |
| `src/camps/` | the fire dancers' hidden camps: their sites, fires and dancers (from FIRE FIGHT 2), the chests and what's in them, the drums |
| `src/ui/` | ff2's Rajdhani type kit and coin symbol, canvas panels, the wrist wallet |
| `src/dev/harness.ts` | dev-only emulator driver |
| `tools/bake-world.mjs` | Tidewater → `public/world/` |
| `tools/bake-props.mjs` | Tidewater's rod, bobber and fish → `public/props/` |
| `tools/make-icons.mjs` | `public/favicon.svg` → the .ico and PNG icons beside it (run after editing the SVG) |
| `tools/teleport-check.mjs` | headless teleport rules check, including no landing under a house floor |
| `tools/fish-check.mjs` | headless check that the timed fish keep their hours and the trophy fish need their gear |
| `tools/camps-check.mjs` | headless check that the camps are hidden from the start, level, reachable, and their chests fill properly |
| `tools/line-check.mjs` | headless check that the fishing line lies over the pier's rails, posts and deck as drawn, not through them, and goes round a lamp post it's swung against (`src/world/lineWrap.ts`) rather than over or through it |

Dev hook: `__fish.move.to(x, z, yaw)`, `__fish.move.snapTurn(±1)` and
`__fish.move.stepBack()`.

## Credits

- **Island, fishing rules, rod, fish and sounds:** from [Tidewater](https://github.com/dgreenheck/tidewater)
  by Dan Greenheck (MIT). See `vendor/tidewater/LICENSE` and `CREDITS.md`, and
  `public/audio/CREDITS.md` for the CC0 recordings.
- **Teleport, cash chime, coin symbol, type kit, the sea's soundscape, the music, and the fire dancers and their bonfires:** from FIRE FIGHT 2. Rajdhani
  is under the SIL OFL (`src/assets/fonts/OFL-rajdhani.txt`).
