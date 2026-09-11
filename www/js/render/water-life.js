/* ---- Dobry Sad city visual layer: sea life (rowboat, gulls, shoreline foam) -----------------
   The waterfront band (WATER_ROWS in city-geometry.js) is now wide enough to feel like real open
   sea, not a decorative strip -- this module populates it with a slow-drifting rowboat/fisherman
   (the purchased hand-painted asset), plus gulls wheeling overhead and an animated foam line (the
   purchased sea pack's 18 real wave frames) washing along the water/promenade edge. The old
   procedurally-drawn ferry/tanker/surfer sprites were removed per explicit request -- they never
   matched the hand-painted look of the real asset packs used everywhere else. Boats/foam float on
   the water plane and depth-sort with buildings/people via collectRenderables(); gulls fly above
   everything and are drawn separately, always on top, via collectSky() -- city-renderer.js calls
   that last, unsorted. Pure simulation + draw-entry generation; no GameAPI calls, no game-state
   knowledge. ------------------------------------------------------------------------------------ */
(function(global){
  'use strict';

  var MAX_ROWBOAT = 1, MAX_HOUSEBOAT = 1, MAX_GULL = 4, MAX_SPARROW = 3;
  // several rowboat/fisherman looks now share the shore-hugging slot at random, same cleaned-sprite
  // pipeline/style as boat_rowboat_01 (see tools/dewhite_sprites.py + tools/clean_sprites.py).
  var ROWBOAT_SLOTS = ['boat_rowboat_01', 'boat_rowboat_02', 'boat_rowboat_03', 'boat_rowboat_04'];
  // sky birds: gulls patrol the shoreline/water band like before (real painted art now, replacing
  // the procedural wing-flap doodle -- see assets.js's 'seagull_01' realImageSlot); sparrows are a
  // second, smaller species from the same cleaned-sprite batch that flit over the WHOLE city (full
  // row span, not just the water band) since they're land/park birds, not sea birds.
  var GULL_SLOTS = ['seagull_01'];
  var SPARROW_SLOTS = ['sparrow_flying_01', 'sparrow_flying_02'];
  // the houseboat is a much bigger, slower vessel -- it doesn't hug the shore like the rowboat, it
  // sits further out in open water, and it's deliberately rare (only some cities get one at all,
  // decided once per layout so it doesn't flicker in/out on every ensureBoats() call).
  var HOUSEBOAT_CHANCE = 0.4;
  var houseboatDecided = false, houseboatAllowed = false;
  var boats = [], gulls = [];
  var running = false, layout = null;
  var reduceMotion = false;

  // shoreline foam: the purchased sea pack's 18-frame wave animation, tiled along the
  // water/promenade boundary and cycled together so the whole coastline pulses like one real
  // wave washing in, rather than 18 independent loops that would never sync into a single line.
  var FOAM_FRAMES = 18, FOAM_FPS = 9;
  var foamElapsed = 0;

  function rand(a, b){ return a + Math.random()*(b-a); }
  function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  function setLayout(l){
    if(layout === l) return;
    layout = l;
    boats = []; gulls = [];
    houseboatDecided = false; // re-roll the rarity gate for the new city/layout
  }

  function ensureBoats(){
    if(!layout) return;
    // the rowboat/fisherman hugs the shore, close to land -- a small oar-powered boat, rowing at
    // a naturally slow, human pace.
    while(boats.filter(function(b){ return b.kind === 'rowboat'; }).length < MAX_ROWBOAT){
      var slot = ROWBOAT_SLOTS[Math.floor(Math.random()*ROWBOAT_SLOTS.length)];
      boats.push({ kind:'rowboat', slot: slot, row: layout.waterRow1 - rand(0.7, 0.95), col: rand(layout.minCol, layout.maxCol),
        dir: Math.random()<0.5?1:-1, speed: rand(0.1, 0.16) });
    }
    if(!houseboatDecided){
      houseboatDecided = true;
      houseboatAllowed = Math.random() < HOUSEBOAT_CHANCE;
    }
    if(houseboatAllowed){
      // further out than the rowboat (bigger vessel, doesn't hug the shore the same way) and much
      // slower -- a lumbering houseboat, not something oar-powered.
      while(boats.filter(function(b){ return b.kind === 'houseboat'; }).length < MAX_HOUSEBOAT){
        boats.push({ kind:'houseboat', slot:'boat_houseboat_01', row: layout.waterRow1 - rand(1.3, 1.7), col: rand(layout.minCol, layout.maxCol),
          dir: Math.random()<0.5?1:-1, speed: rand(0.045, 0.075) });
      }
    }
  }
  function ensureGulls(){
    if(!layout) return;
    while(gulls.filter(function(g){ return g.kind !== 'sparrow'; }).length < MAX_GULL){
      gulls.push({
        kind: 'gull', slot: pick(GULL_SLOTS),
        row: rand(layout.waterRow0 != null ? layout.waterRow0 : 0, layout.waterRow1),
        col: rand(layout.minCol-3, layout.maxCol+3),
        dir: Math.random()<0.5?1:-1, speed: rand(0.5, 0.85),
        bobPhase: Math.random()*Math.PI*2, altitude: rand(30, 58)
      });
    }
    // sparrows flit over the whole field (minRow..maxRow), lower and faster than the gulls out
    // over the water -- distinct enough silhouette/altitude that the two species read separately.
    while(gulls.filter(function(g){ return g.kind === 'sparrow'; }).length < MAX_SPARROW){
      gulls.push({
        kind: 'sparrow', slot: pick(SPARROW_SLOTS),
        row: rand(layout.minRow != null ? layout.minRow : 0, layout.maxRow),
        col: rand(layout.minCol-3, layout.maxCol+3),
        dir: Math.random()<0.5?1:-1, speed: rand(0.75, 1.15),
        bobPhase: Math.random()*Math.PI*2, altitude: rand(14, 28)
      });
    }
  }

  function update(dt){
    if(!layout) return;
    ensureBoats(); ensureGulls();
    if(!reduceMotion) foamElapsed += dt;
    if(reduceMotion) return;
    boats.forEach(function(b){
      b.col += b.dir*b.speed*dt;
      if(b.col > layout.maxCol+2){ b.col = layout.maxCol+2; b.dir = -1; }
      else if(b.col < layout.minCol-2){ b.col = layout.minCol-2; b.dir = 1; }
    });
    gulls.forEach(function(g){
      g.col += g.dir*g.speed*dt;
      if(g.col > layout.maxCol+3) g.col = layout.minCol-3;
      else if(g.col < layout.minCol-3) g.col = layout.maxCol+3;
    });
  }

  function collectRenderables(GEO, L, Assets, range){
    if(!Assets || !L) return [];
    var out = [];
    boats.forEach(function(b){
      var p = GEO.isoToContent(L, b.col, b.row);
      out.push({ depth: GEO.depthAt(L, b.col, b.row), draw: function(ctx){ Assets.blit(ctx, b.slot, p.x, p.y, 1, b.dir < 0); } });
    });
    // shoreline foam -- one synced frame across every visible column right at the water's edge,
    // bounded to the current viewport (falls back to the whole field width when no range is
    // given, e.g. from a test calling this directly) so it costs nothing extra at any field size.
    // The field now has a sea on BOTH the north and south edges (see city-geometry.js), so this
    // draws the same synced foam line along whichever shore row(s) fall in view -- south included
    // when it has one (older/smaller layouts without waterRow0S just skip that half, harmlessly).
    // Each column is also checked against the field's own oval boundary (GEO.insideEllipse) --
    // without that, a straight column sweep across "every visible column" sails right past the
    // map's actual curved edge wherever the oval has narrowed in near its north/south tips, which
    // is what let the wave line visibly stick out past the map on both shores before this fix.
    var c0 = range ? Math.max(L.minCol, range.c0) : L.minCol;
    var c1 = range ? Math.min(L.maxCol, range.c1) : L.maxCol;
    var frameN = 1 + Math.floor(foamElapsed*FOAM_FPS) % FOAM_FRAMES;
    var slot = 'wave_' + (frameN<10?'0'+frameN:frameN);
    var foamRows = [L.waterRow1 + 0.5];
    if(L.waterRow0S != null) foamRows.push(L.waterRow0S - 0.5);
    foamRows.forEach(function(foamRow){
      for(var fc = Math.floor(c0); fc <= Math.ceil(c1); fc++){
        if(!GEO.insideEllipse(L, fc, foamRow)) continue;
        (function(fc){
          var p = GEO.isoToContent(L, fc, foamRow);
          out.push({ depth: GEO.depthAt(L, fc, foamRow) + 0.1, draw: function(ctx){ Assets.blit(ctx, slot, p.x, p.y); } });
        })(fc);
      }
    });
    return out;
  }

  /* gulls fly above the whole scene -- drawn last, unsorted, by city-renderer.js, not merged into
     the depth-sorted ground/water list. */
  function collectSky(GEO, L, Assets){
    if(!Assets || !L) return [];
    return gulls.map(function(g){
      var p = GEO.isoToContent(L, g.col, g.row);
      var bob = reduceMotion ? 0 : Math.sin(Date.now()/650 + g.bobPhase) * 3;
      return { draw: function(ctx){ Assets.blit(ctx, g.slot, p.x, p.y - g.altitude + bob, 1, g.dir < 0); } };
    });
  }

  global.WaterLife = {
    setLayout: setLayout,
    start: function(){
      if(running) return;
      reduceMotion = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
      running = true;
      if(layout){ ensureBoats(); ensureGulls(); }
    },
    stop: function(){ running = false; boats = []; gulls = []; },
    isRunning: function(){ return running; },
    update: update,
    collectRenderables: collectRenderables,
    collectSky: collectSky
  };
})(window);
