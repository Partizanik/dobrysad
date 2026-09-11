/* ---- Dobry Sad city visual layer: ambient life simulation (isometric road network) -------------
   Walkers, cars, and a rare dog/cat "easter egg" travel over the actual street graph (every road
   tile, 4-connected). Since roads are now dynamic -- grown by city-geometry.js's
   computeRoadTiles() from wherever the player actually placed buildings, not baked into a fixed
   layout -- city-renderer.js hands this file a fresh {"col,row":true} road-membership map (plus a
   signature string) whenever the building set changes, via setRoads(), instead of the old
   one-time setLayout() built from a static tiles map. Pure simulation; drawing is exposed as
   collectRenderables() so city-renderer.js can depth-sort people/cars together with buildings in
   one pass (necessary now that the world is isometric and occlusion depends on position, not just
   draw order). No GameAPI calls, no game-state knowledge.

   Walkers ("person" sprites) have real destinations, not just a random neighbor picked forever at
   every intersection -- the explicit ask was "give their movement some sense, let them walk into a
   building and back out instead of circling the map aimlessly". Each time a walker needs a new
   trip, pickDestination() mostly (70%) aims it at a building's doorstep (see
   city-geometry.js's computeRoadTiles, which now also returns one per building) via a real
   shortest path (findPath, plain BFS -- the road graph is small, a few hundred tiles even at a
   fully built city, so this is cheap to run once per trip) and the rest of the time at a random
   road tile, so the street still has some casual wandering rather than every walker only ever
   beelining building to building. Arriving at a doorstep switches the sprite to mode:'inside' for
   a few seconds -- collectRenderables skips drawing it, so it visually steps inside -- then it
   reappears at the same doorstep and picks its next trip. Cars and the rare dog/cat easter egg
   keep the original pick-a-random-neighbor-forever behavior (advanceOther) -- purposeful movement
   was only ever asked for people. ---------------------------------------------------------------- */
(function(global){
  'use strict';

  // Hard ceilings for a fully built-out city -- how many walkers/cars actually appear at any
  // moment is scaled DOWN from these by targetWalkers()/targetCars() below, based on how many
  // buildings the player has actually placed, so a brand-new city with one building shows one
  // person (not a full street's worth of pedestrians and traffic all at once).
  var MAX_WALKERS = 6, MAX_CARS = 2, MAX_EGG = 1;
  var buildingCount = 0;
  function targetWalkers(){
    if(buildingCount <= 0) return 0;
    return Math.min(MAX_WALKERS, Math.ceil(buildingCount/2));
  }
  function targetCars(){
    if(buildingCount < 3) return 0;
    return Math.min(MAX_CARS, Math.floor(buildingCount/3));
  }
  // real painted people (see assets.js's realImageSlot calls) replacing the old flat-colour
  // npc_01..05 placeholders -- this was the original "people don't match the building art style"
  // complaint, now fixed with actual period-costumed figures instead of solid-colour blobs.
  //
  // item 10: npc_vendor_01/npc_newsboy_01/npc_fisherman_01 used to wander the street graph like
  // everyone else, which never made sense for a vendor -- their art already shows them standing
  // still next to their cart/stall/dock (the flower cart, the newspaper bundle, the fishing nets
  // and basket), so a walking vendor looked like it had abandoned its goods mid-stroll. They're
  // now placed by the player as static decor instead (see DECOR in index.html, same slots reused
  // verbatim -- Assets.blit doesn't care whether a slot's category says 'npc' or 'decor'), same as
  // a bench or a lamppost: dropped once, stays put. Removing them here is the whole fix; no assets
  // were deleted, just no longer picked by spawn()/ensureWalkers().
  var NPC_SLOTS = [
    'npc_woman_fancy_01', 'npc_woman_peasant_01', 'npc_man_suit_01', 'npc_man_worker_01',
    'npc_elder_man_01', 'npc_elder_woman_01', 'npc_mother_pram_01', 'npc_mother_pram_02'
  ];
  // the horse-drawn cart replaces the flat-colour car_XX slots on the street for the same reason --
  // no era-appropriate car art exists yet (the one Model-T-style generation that came back didn't
  // match the painterly style, see nanobanana_prompts.md), so a single real cart is better than a
  // mix of one real cart and two mismatched flat cars.
  var CAR_SLOTS = ['cart_horse_01'];

  // how long a walker who stepped into a building stays out of sight before it re-emerges and
  // picks its next trip
  var INSIDE_DWELL_MIN = 4, INSIDE_DWELL_MAX = 9;
  // chance a walker's next trip targets a building's doorstep rather than a random road tile
  var DEST_BUILDING_CHANCE = 0.7;

  var sprites = [];
  var running = false;
  var eggTimer = 0, nextEggAt = 7;
  var reduceMotion = false;
  var graph = null;      // { nodes: [key], adj: key->neighbors[] }
  var graphSig = null;   // signature of the roads map this graph was built from (rebuild on change)
  var doorsteps = [];    // [{col,row}] -- one entry-point tile per building, from computeRoadTiles

  function rand(a, b){ return a + Math.random()*(b-a); }
  function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function tileKey(c,r){ return c+','+r; }

  function buildGraph(roads){
    var nodes = Object.keys(roads);
    var adj = {};
    nodes.forEach(function(k){
      var parts = k.split(','); var c = +parts[0], r = +parts[1];
      var n = [];
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){
        var nk = tileKey(c+d[0], r+d[1]);
        if(roads[nk]) n.push(nk);
      });
      adj[k] = n;
    });
    graph = { nodes: nodes, adj: adj };
  }

  function ensureGraph(roads, sig, newDoorsteps){
    if(graphSig !== sig){
      buildGraph(roads);
      graphSig = sig;
      doorsteps = newDoorsteps || [];
      // the building set just changed -- any walker mid-trip may be following a path that crosses
      // a tile a new building's footprint just claimed, or heading for a doorstep that no longer
      // exists (its building got moved/removed). Cheapest safe fix: clear their path and mark them
      // "arrived" so next tick they pick a fresh trip against the new graph, from wherever they
      // currently stand -- exactly like reaching a real destination would. Walkers already inside
      // a building are untouched -- they pick fresh against the new graph anyway when they emerge.
      sprites.forEach(function(s){
        if(s.kind === 'person' && s.mode !== 'inside'){ s.path = null; s.t = 1; }
      });
    }
  }

  function randomNode(){
    if(!graph || !graph.nodes.length) return null;
    var k = graph.nodes[Math.floor(Math.random()*graph.nodes.length)];
    var p = k.split(',');
    return { col:+p[0], row:+p[1] };
  }

  function neighborsOf(col,row){
    if(!graph) return [];
    var n = graph.adj[tileKey(col,row)] || [];
    return n.map(function(k){ var p = k.split(','); return { col:+p[0], row:+p[1] }; });
  }

  /* plain BFS shortest path over the (small, unweighted) road graph -- returns the list of
     {col,row} steps from (but not including) the start up to and including the destination, or
     null if no route exists (shouldn't normally happen -- every building's driveway connects back
     to the one street spine -- but a mid-rebuild graph could transiently disconnect something). */
  function findPath(fromKey, toKey){
    if(fromKey === toKey) return [];
    if(!graph || !graph.adj[fromKey] || !graph.adj[toKey]) return null;
    var visited = {}; visited[fromKey] = true;
    var queue = [fromKey], prev = {}, found = false;
    while(queue.length){
      var cur = queue.shift();
      if(cur === toKey){ found = true; break; }
      var nbrs = graph.adj[cur] || [];
      for(var i=0; i<nbrs.length; i++){
        var nk = nbrs[i];
        if(!visited[nk]){ visited[nk] = true; prev[nk] = cur; queue.push(nk); }
      }
    }
    if(!found) return null;
    var path = [], cur2 = toKey;
    while(cur2 !== fromKey){ path.unshift(cur2); cur2 = prev[cur2]; }
    return path.map(function(k){ var p = k.split(','); return { col:+p[0], row:+p[1] }; });
  }

  /* give a walker its next trip: mostly a building doorstep (it'll step "inside" on arrival), the
     rest of the time a plain road tile (keeps some casual wandering on the street instead of every
     walker only ever beelining building to building). Returns false if nothing reachable right
     now, so the caller can fall back rather than leaving the sprite stuck mid-tile. */
  function pickDestination(s){
    var fromKey = tileKey(s.col, s.row);
    if(!graph || !graph.adj[fromKey]){
      // the walker's own tile stopped being a road (a building went up on top of it) -- relocate
      // rather than leave it stranded off-graph forever.
      var relocate = randomNode();
      if(!relocate) return false;
      s.col = s.tcol = relocate.col; s.row = s.trow = relocate.row; s.t = 1;
      fromKey = tileKey(s.col, s.row);
    }
    var dest = null, isDoorstep = false;
    if(doorsteps.length && Math.random() < DEST_BUILDING_CHANCE){
      var pool = doorsteps.filter(function(d){ return tileKey(d.col, d.row) !== fromKey; });
      if(pool.length){ dest = pick(pool); isDoorstep = true; }
    }
    if(!dest){
      var node = randomNode(), tries = 0;
      while(node && tileKey(node.col, node.row) === fromKey && tries < 5){ node = randomNode(); tries++; }
      if(node) dest = node;
    }
    if(!dest) return false;
    var path = findPath(fromKey, tileKey(dest.col, dest.row));
    if(!path || !path.length) return false;
    s.path = path;
    s.enteringOnArrival = isDoorstep;
    return true;
  }

  function spawn(kind, temp){
    var start = randomNode();
    if(!start) return null;
    var slot = kind === 'car' ? pick(CAR_SLOTS) : kind === 'person' ? pick(NPC_SLOTS) : (kind === 'cat' ? 'cat_01' : 'dog_01');
    var s = {
      kind: kind, slot: slot, temp: !!temp,
      col: start.col, row: start.row, tcol: start.col, trow: start.row, t: 1,
      // slowed down from the original (1.1-1.5 / 0.42-0.58) -- at full speed cars crossed a whole
      // tile in under a second, which read as scurrying/twitchy rather than an ambient street.
      speed: kind === 'car' ? rand(0.55, 0.75) : rand(0.22, 0.3),
      dir: 0, life: 0,
      mode: 'walk', path: null, enteringOnArrival: false, insideTimer: 0
    };
    sprites.push(s);
    return s;
  }

  // Both grow AND shrink toward the target -- a decoration/removal action (task #56) or a plot
  // going back to empty can lower buildingCount, and the street should thin back out to match
  // rather than staying stuck at whatever peak it once reached.
  function ensureWalkers(){
    var want = targetWalkers();
    var list = sprites.filter(function(s){ return s.kind === 'person' && !s.temp; });
    while(list.length < want){ var s = spawn('person'); if(!s) break; list.push(s); }
    while(list.length > want){ var extra = list.pop(); extra.dead = true; }
  }
  function ensureCars(){
    var want = targetCars();
    var list = sprites.filter(function(s){ return s.kind === 'car'; });
    while(list.length < want){ var s = spawn('car'); if(!s) break; list.push(s); }
    while(list.length > want){ var extra = list.pop(); extra.dead = true; }
  }
  function maybeSpawnEasterEgg(dt){
    eggTimer += dt;
    if(eggTimer < nextEggAt) return;
    eggTimer = 0; nextEggAt = rand(14, 30);
    if(sprites.filter(function(s){ return s.temp; }).length >= MAX_EGG) return;
    spawn(Math.random() < 0.5 ? 'cat' : 'dog', true);
  }

  // cars and the rare dog/cat easter egg: unchanged from the original -- pick any neighbor other
  // than the one just come from, forever (temp sprites additionally self-despawn after a few hops).
  function advanceOther(s, dt){
    s.t += dt*s.speed;
    if(s.t >= 1){
      s.col = s.tcol; s.row = s.trow;
      if(s.temp){ s.life += 1; if(s.life > 3){ s.dead = true; return; } }
      var opts = neighborsOf(s.col, s.row).filter(function(n){ return !(n.col===s._fromCol && n.row===s._fromRow); });
      if(!opts.length) opts = neighborsOf(s.col, s.row);
      if(!opts.length){ s.dead = true; return; }
      var next = opts[Math.floor(Math.random()*opts.length)];
      s.dir = Math.atan2(next.row-s.row, next.col-s.col);
      s._fromCol = s.col; s._fromRow = s.row;
      s.tcol = next.col; s.trow = next.row;
      s.t = 0;
    }
  }

  // people: follow a real path toward a real destination (see pickDestination) instead of picking
  // a random neighbor at every intersection -- and step "inside" for a while on arrival when that
  // destination was a building's doorstep.
  function advancePerson(s, dt){
    if(s.mode === 'inside'){
      s.insideTimer -= dt;
      if(s.insideTimer <= 0){
        s.mode = 'walk';
        // nothing reachable right this instant (e.g. graph mid-rebuild) -- try again shortly
        // rather than popping back out with nowhere to go.
        if(!pickDestination(s)){ s.mode = 'inside'; s.insideTimer = 2; }
      }
      return;
    }
    s.t += dt*s.speed;
    if(s.t >= 1){
      s.col = s.tcol; s.row = s.trow; s.t = 1;
      if(s.path && s.path.length){
        var next = s.path.shift();
        s.dir = Math.atan2(next.row-s.row, next.col-s.col);
        s.tcol = next.col; s.trow = next.row; s.t = 0;
        return;
      }
      // arrived at the trip's final destination
      if(s.enteringOnArrival){
        s.mode = 'inside';
        s.insideTimer = rand(INSIDE_DWELL_MIN, INSIDE_DWELL_MAX);
        return;
      }
      if(!pickDestination(s)){
        // nothing reachable this instant -- fall back to a single random step so it's never
        // frozen mid-street (mirrors the old unconditional random-neighbor behavior for one hop)
        var opts = neighborsOf(s.col, s.row);
        if(opts.length){
          var n2 = pick(opts);
          s.dir = Math.atan2(n2.row-s.row, n2.col-s.col);
          s.tcol = n2.col; s.trow = n2.row; s.t = 0;
        }
      }
    }
  }

  function advance(s, dt){
    if(s.kind === 'person') advancePerson(s, dt);
    else advanceOther(s, dt);
  }

  function update(dt){
    if(reduceMotion || !graph) return;
    for(var i = sprites.length-1; i >= 0; i--){
      var s = sprites[i];
      advance(s, dt);
      if(s.dead) sprites.splice(i, 1);
    }
    ensureWalkers();
    ensureCars();
    maybeSpawnEasterEgg(dt);
  }

  /* returns depth-sortable draw entries for the current frame, in content-space, via the same
     GEO/layout the renderer used to lay out buildings -- so painter's-algorithm sorting works
     uniformly across buildings, people, and cars. Sprites currently "inside" a building are
     skipped entirely -- that's the whole visual effect of stepping inside. */
  function collectRenderables(GEO, layout, Assets){
    if(!Assets) return [];
    var out = [];
    sprites.forEach(function(s){
      if(s.mode === 'inside') return;
      var a = GEO.isoToContent(layout, s.col, s.row);
      var b = GEO.isoToContent(layout, s.tcol, s.trow);
      var x = a.x + (b.x-a.x)*s.t, y = a.y + (b.y-a.y)*s.t;
      var depth = GEO.depthAt(layout, s.col + (s.tcol-s.col)*s.t, s.row + (s.trow-s.row)*s.t);
      out.push({
        depth: depth + 0.4,
        draw: function(ctx){
          if(s.kind === 'car'){ Assets.blit(ctx, s.slot, x, y, 1, Math.cos(s.dir) < 0); return; }
          var bob = reduceMotion ? 0 : Math.sin((Date.now()/280) + x*0.05) * 0.6;
          Assets.blit(ctx, s.slot, x, y + bob, 1, Math.cos(s.dir) < 0);
        }
      });
    });
    return out;
  }

  global.NpcLife = {
    setRoads: function(roads, sig, count, doorstepList){ ensureGraph(roads, sig, doorstepList); buildingCount = count || 0; },
    start: function(){
      if(running) return;
      reduceMotion = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
      running = true;
      if(graph){ ensureWalkers(); ensureCars(); }
    },
    stop: function(){
      running = false;
      sprites = [];
      eggTimer = 0;
    },
    isRunning: function(){ return running; },
    update: update,
    collectRenderables: collectRenderables
  };
})(window);
