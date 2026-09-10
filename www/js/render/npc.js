/* ---- Dobry Sad city visual layer: ambient life simulation (isometric road network) -------------
   Walkers, cars, and a rare dog/cat "easter egg" travel over the actual street graph (every road
   tile, 4-connected). Since roads are now dynamic -- grown by city-geometry.js's
   computeRoadTiles() from wherever the player actually placed buildings, not baked into a fixed
   layout -- city-renderer.js hands this file a fresh {"col,row":true} road-membership map (plus a
   signature string) whenever the building set changes, via setRoads(), instead of the old
   one-time setLayout() built from a static tiles map. Pure simulation; drawing is exposed as
   collectRenderables() so city-renderer.js can depth-sort people/cars together with buildings in
   one pass (necessary now that the world is isometric and occlusion depends on position, not just
   draw order). No GameAPI calls, no game-state knowledge. ---------------------------------------- */
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
  var NPC_SLOTS = [
    'npc_woman_fancy_01', 'npc_woman_peasant_01', 'npc_man_suit_01', 'npc_man_worker_01',
    'npc_elder_man_01', 'npc_elder_woman_01', 'npc_mother_pram_01', 'npc_mother_pram_02',
    'npc_vendor_01', 'npc_newsboy_01', 'npc_fisherman_01'
  ];
  // the horse-drawn cart replaces the flat-colour car_XX slots on the street for the same reason --
  // no era-appropriate car art exists yet (the one Model-T-style generation that came back didn't
  // match the painterly style, see nanobanana_prompts.md), so a single real cart is better than a
  // mix of one real cart and two mismatched flat cars.
  var CAR_SLOTS = ['cart_horse_01'];

  var sprites = [];
  var running = false;
  var eggTimer = 0, nextEggAt = 7;
  var reduceMotion = false;
  var graph = null;    // { nodes: [key], adj: key->neighbors[] }
  var graphSig = null; // signature of the roads map this graph was built from (rebuild on change)

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

  function ensureGraph(roads, sig){
    if(graphSig !== sig){ buildGraph(roads); graphSig = sig; }
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
      dir: 0, life: 0
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

  function advance(s, dt){
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
     uniformly across buildings, people, and cars. */
  function collectRenderables(GEO, layout, Assets){
    if(!Assets) return [];
    return sprites.map(function(s){
      var a = GEO.isoToContent(layout, s.col, s.row);
      var b = GEO.isoToContent(layout, s.tcol, s.trow);
      var x = a.x + (b.x-a.x)*s.t, y = a.y + (b.y-a.y)*s.t;
      var depth = GEO.depthAt(layout, s.col + (s.tcol-s.col)*s.t, s.row + (s.trow-s.row)*s.t);
      return {
        depth: depth + 0.4,
        draw: function(ctx){
          if(s.kind === 'car'){ Assets.blit(ctx, s.slot, x, y, 1, Math.cos(s.dir) < 0); return; }
          var bob = reduceMotion ? 0 : Math.sin((Date.now()/280) + x*0.05) * 0.6;
          Assets.blit(ctx, s.slot, x, y + bob, 1, Math.cos(s.dir) < 0);
        }
      };
    });
  }

  global.NpcLife = {
    setRoads: function(roads, sig, count){ ensureGraph(roads, sig); buildingCount = count || 0; },
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
