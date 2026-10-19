# Topple House

A 3D domino-toppling game set in a cutaway dollhouse. Each room is a level with a job to do: lay dominoes across the floor and up on the furniture, drop lines off table edges, and get marbles up and down with catapults, trebuchets, ramps, pulley lifts and trampolines to hit targets that sit up high. The whole house is a sandbox with every door open.

Play it at **https://samuelling.github.io/topple-house/** (once GitHub Pages is on), or open `index.html` directly in a browser. It's touch-first and works on a phone.

## Rooms

| Room | Mission | What makes it work |
| --- | --- | --- |
| Bedroom | Ring the bell on the nightstand | A catapult lobs a marble up onto the nightstand, or a trampoline bounces one there |
| Living room | Flip the lamp switch, then knock the remote off the coffee table | A split line: one branch on the floor, one into a catapult |
| Kitchen | Tip the cereal box on the island, then ring the spoon chime | The run starts on the counter, drops off its edge, and a trebuchet throws onto the island; the spoon branch has to arrive second |
| Bathroom | Knock the rubber duck off the tub | The bath mat is too slippery to build on: roll the toilet roll across it, or catapult over it |
| Hallway & stairs | Press the doorbell button on the front door | Down the stairs (each falling domino reaches a step farther), then a catapult at the door |
| Study | Knock the trophy off the top step of the bookshelf | The marble rolls off the desk. Catch it with a floor line into a pulley lift set to the shelf height, run it down a ramp first, or bounce it straight up with a trampoline |
| Whole house | Sandbox | All rooms joined, 20 of each gadget |

Each room scores up to three dominoes: finish the job, use par or fewer, and make every domino fall.

## Controls

- **Build** – drag one finger to lay a line on the floor or on any tabletop outlined in gold. Start on an existing domino to branch off it.
- **Gadgets** – pick one from the tray and tap to place it, then aim it with the gold handle and adjust its setting with − and +. The dotted arc shows where its marble will go.
  - **Catapult / trebuchet** (power): hit it with a domino or a marble and it throws the marble in its cup. The trebuchet throws from higher up and reaches counters.
  - **Ramp** (height): a slope with its high end at the back. Marbles roll down it, or up it if they're fast enough.
  - **Pulley lift** (height): hit it and its platform raises a marble to the set height, then nudges it off the front onto a ledge.
  - **Trampoline** (spring): any marble landing on it is thrown up and forward in the direction of its arrow.
- **Move** – tap to select, hold to grab a whole line, drag the handle to rotate, double-tap to flip.
- **Erase**, **Undo**.
- **Preview** plays a test run and stands everything back up. **Run** is the attempt that's scored.
- Camera: two fingers pinch to zoom, drag to pan and twist to rotate. One finger on the empty table orbits. The layers button cycles overhead, angled and low views. On a computer, right-drag orbits and scroll zooms.
- Settings: domino spacing, smart spacing down the stairs, slow motion, and **Shaky hands** (off by default), where setting a domino down next to a standing one can knock the line over.

## How it's built

```
src/engine.js   physics, rooms and gadgets — plain JS, no DOM, also runs under Node
src/ui.js       three.js (r128) scene, touch input and game flow
src/plan.js     2D floor-plan drawing for the room thumbnails
src/page.html   markup and styles
build.py        assembles everything into index.html
tools/          headless solvers used to tune the rooms
```

Rebuild after editing anything in `src/`:

```
python3 build.py
```

### Physics model

Units are centimetres and seconds. Dominoes are 8 × 4 × 1.2 cm.

- A falling domino is a rigid slab pivoting on its front bottom edge (φ̈ = 3g/2H · sin φ). Its top edge sweeps forward, and anything it meets within a strip slightly wider than the domino gets toppled, nudged or triggered. Chains run at about 0.9 m/s, and gaps longer than a domino is tall break them.
- Surfaces are layers: the floor (including the stepped stairs) plus every furniture top. Dominoes only interact with others on the same layer. On a tabletop, once a falling domino's centre of mass passes the edge it tumbles off as a free body and knocks whatever it lands on.
- Marbles and the toilet roll are full 3D balls: gravity, bouncing landings, rolling friction, falling off ledges and down stairs, and full-height walls (the walls are only drawn cut away).
- Catapults (55°) and trebuchets (58°, launching from 46 cm up) fire when any falling domino or ball hits them. Ramps are sloped support surfaces with a rolling-ball acceleration of 5/7·g·sinθ·cosθ. Lifts rise at 55 cm/s and push their marble off at 70 cm/s. Trampolines relaunch a landing marble at 66°. Every arc preview runs the same ball physics.

### Adding a gadget

Gadgets live in the `GADGETS` registry in `src/engine.js`: footprint, base height, one adjustable setting (`pmin`/`pmax`/`pstep`, a `label` and a `fmt`) and a `kind`. Behaviour hangs off the kind in four places:

- `fireGadget` – what happens when a domino or ball hits it
- `stepGadgets` – anything it does over time after firing (the lift rising)
- `stepBall` / `gadgetSurface` – how marbles collide with it or roll on it
- `predictArc` – the dotted preview

On the UI side, `buildGadgetMesh` builds the model and `animateGadget` moves it during a run. Planned additions follow the same pattern: a **fuse and firecracker** (a burning fuse lit by a domino, then an explosion impulse that knocks everything in a radius), a **mousetrap** (snaps when touched and flings what's on its bar), and a **wind-up toy truck** (a driven roller that carries a marble or pushes dominoes along its heading).

### Tools

```
node tools/solve.js                          # play scripted solutions through each room
node tools/aim.js kitchen trebuchet cereal   # map every spot and power that hits a target
node tools/study.js                          # check the Study's lift, ramp and trampoline routes
```

## Moving to iPhone

`src/engine.js` has no browser dependencies and holds all the rules: rooms, physics, gadgets and the stroke builder that lays out dominoes. A native version ports that file to Swift, and only the rendering and touch layer gets rebuilt (SceneKit or RealityKit with the same geometry).
