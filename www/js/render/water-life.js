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

  var MAX_ROWBOAT = 1, MAX_GULL = 4;
  var boats = [], gulls = [];
  var running = false, layout = null;
  var reduceMotion = false;

  // shoreline foam: the purchased sea pack's 18-frame wave animation, tiled along the
  // water/promenade boundary and cycled together so the whole coastline pulses like one real
  // wave washing in, rather than 18 independent loops that would never sync into a single line.
  var FOAM_FRAMES = 18, FOAM_FPS = 9;
  var foamElapsed = 0;

  function rand(a, b){ return a + Math.random()*(b-a); }

  function setLayout(l){
    if(layout === l) return;
    layout = l;
    boats = []; gulls = [];
  }

  function ensureBoats(){
    if(!layout) return;
    // the rowboat/fisherman hugs the shore, close to land -- a small oar-powered boat, rowing at
    // a naturally slow, human pace.
    while(boats.filter(function(b){ return b.kind === 'rowboat'; }).length < MAX_ROWBOAT){
      boats.push({ kind:'rowboat', slot:'boat_rowboat_01', row: layout.waterRow1 - rand(0.7, 0.95), col: rand(layout.minCol, layout.maxCol),
        dir: Math.random()<0.5?1:-1, speed: rand(0.1, 0.16) });
    }
  }
  function ensureGulls(){
    if(!layout) return;
    while(gulls.length < MAX_GULL){
      gulls.push({
        slot: Math.random()<0.5?'seagull_01':'seagull_02',
        row: rand(layout.waterRow0 != null ? layout.waterRow0 : 0, layout.waterRow1),
        col: rand(layout.minCol-3, layout.maxCol+3),
        dir: Math.random()<0.5?1:-1, speed: rand(0.5, 0.85),
        bobPhase: Math.random()*Math.PI*2, altitude: rand(30, 58)
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
