/* ---- Dobry Sad city visual layer: the Canvas renderer (isometric) -----------------------------
   Owns <canvas id="cityFullCanvas"> inside #cityFullWrap, the draw loop, and dirty-tracking. Reads
   game state exclusively through window.GameAPI (see index.html) and draws with window.CityAssets
   (sprites/ground tiles) + window.CityGeometry (iso layout/coordinate math) + window.NpcLife
   (ambient people/car/pet simulation). Never mutates game state directly -- the only path back
   into the game is GameAPI.tapPlot(), called from city-input.js, not from here.

   Pan/zoom is entirely a canvas transform (ctx.setTransform/translate/scale) applied fresh every
   frame -- no DOM element is ever moved, resized, or re-laid-out to pan or zoom the view, which is
   what keeps the motion feeling like a native map control instead of "dragging an HTML div".
   city-input.js drives `view` with its own smoothing/inertia; this file just renders whatever
   `view` currently holds, every animation frame, unconditionally (not only on interaction), so
   ambient life and any in-flight pan/zoom easing always look continuous.

   Free-placement field: the district is now a big buildable grass field (see GameAPI.
   getCityGridDims()) instead of a small fixed 30-plot block layout, so unlike the old version this
   file no longer bakes the whole district to one offscreen canvas once -- it can't, at the scale
   the field is meant to grow to (see city-geometry.js's header comment). Instead every frame it
   works out which (col,row) tile range is actually visible through the current pan/zoom and draws
   only that range (drawVisibleGround) -- cheap regardless of how large the field gets, which is
   exactly the point. Roads are derived fresh from the live building positions (ensureRoads(),
   cached until the building set changes) rather than being part of a static layout, since where
   the roads run now depends on where the player actually built. --------------------------------- */
(function(global){
  'use strict';

  var GEO, Assets, Npc, Water;

  var wrap, canvas, ctx;
  var view = { scale: 1, tx: 0, ty: 0, contentW: 800, contentH: 800 };
  var layout = null;
  var layoutDims = null; // {cols,rows,waterRows,promenadeRows} the current layout was built for
  var mounted = false;
  var rafId = null;
  var lastTs = 0;
  var resizeObs = null;

  var roads = {}, roadsSig = null; // dynamic road-tile membership map, rebuilt only when it changes

  // real tree species (see assets.js) cycled along the promenade treeline -- was just
  // tree_01/tree_02 (2 procedural shapes) alternating; this is the direct "map looks too empty"
  // fix once real art existed to fill it with.
  var TREE_ROW_SLOTS = [
    'tree_birch_01', 'tree_apple_01', 'tree_poplar_01', 'tree_linden_01',
    'tree_spruce_01', 'tree_willow_01', 'tree_shrub_01', 'tree_old_bare_01'
  ];

  function deps(){
    GEO = global.CityGeometry; Assets = global.CityAssets; Npc = global.NpcLife; Water = global.WaterLife;
    return !!(GEO && Assets && Npc && Water && global.GameAPI);
  }

  function els(){
    if(!wrap) wrap = document.getElementById('cityFullWrap');
    if(!canvas) canvas = document.getElementById('cityFullCanvas');
    if(!ctx && canvas) ctx = canvas.getContext('2d');
  }

  function dpr(){ return Math.min(2, global.devicePixelRatio || 1); }

  function resizeCanvas(){
    var rect = wrap.getBoundingClientRect();
    var d = dpr();
    var w = Math.max(1, Math.round(rect.width*d)), h = Math.max(1, Math.round(rect.height*d));
    if(canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h; }
    return rect;
  }

  function ensureLayout(){
    var dims = global.GameAPI.getCityGridDims();
    if(!layout || !layoutDims || layoutDims.cols !== dims.cols || layoutDims.rows !== dims.rows ||
       layoutDims.waterRows !== dims.waterRows || layoutDims.promenadeRows !== dims.promenadeRows){
      layout = GEO.buildLayout(dims);
      layoutDims = dims;
      view.contentW = layout.contentW; view.contentH = layout.contentH;
      Water.setLayout(layout);
      roadsSig = null; // force a road-graph rebuild against the new layout too
    }
  }

  /* rebuild the road-tile map (and NpcLife's walk graph over it) only when the active city's
     building positions actually changed -- a cheap string-signature check against at most
     CITY_PLOTS (30) short entries, once per frame, is negligible next to redrawing the scene. */
  function ensureRoads(GameAPI){
    var cities = GameAPI.getCities();
    var activeIdx = GameAPI.getActiveCityIdx();
    var city = cities[activeIdx];
    if(!city) return;
    var sig = activeIdx + '#' + city.plots.map(function(p){ return p ? (p.col+':'+p.row) : ''; }).join('|');
    if(sig === roadsSig) return;
    roadsSig = sig;
    var buildings = city.plots.filter(Boolean).map(function(p){ return { col: p.col, row: p.row }; });
    roads = GEO.computeRoadTiles(layout, buildings);
    Npc.setRoads(roads, sig);
  }

  /* which (col,row) tiles are actually on screen right now, plus a small margin so tiles don't
     visibly pop in at the viewport edge while panning -- the whole reason this file no longer
     needs (or could afford, at 100x100+) a single full-district bake. */
  function visibleTileRange(rect){
    var corners = [
      { x: rect.left, y: rect.top }, { x: rect.left+rect.width, y: rect.top },
      { x: rect.left, y: rect.top+rect.height }, { x: rect.left+rect.width, y: rect.top+rect.height }
    ];
    var minCol=Infinity, maxCol=-Infinity, minRow=Infinity, maxRow=-Infinity;
    corners.forEach(function(pt){
      var world = GEO.screenToWorld(view, rect, pt.x, pt.y);
      var iso = GEO.contentToIso(layout, world.x, world.y);
      if(iso.col<minCol) minCol=iso.col; if(iso.col>maxCol) maxCol=iso.col;
      if(iso.row<minRow) minRow=iso.row; if(iso.row>maxRow) maxRow=iso.row;
    });
    var margin = 2;
    return {
      c0: Math.max(layout.minCol, Math.floor(minCol)-margin), c1: Math.min(layout.maxCol, Math.ceil(maxCol)+margin),
      r0: Math.max(layout.minRow, Math.floor(minRow)-margin), r1: Math.min(layout.maxRow, Math.ceil(maxRow)+margin)
    };
  }

  /* placement-mode "can I build here" feedback: buildable field tiles within GAP of any existing
     building (or of the tile currently held, when moving) get a soft red wash, everything else
     buildable gets a soft green wash -- reuses GameAPI.canBuildAt so the highlight can never say
     yes where the actual tap would then be denied. */
  function placementInfo(GameAPI){
    var pending = GameAPI.getPendingPlacement();
    var lifted = GameAPI.getLiftedPlot();
    if(!pending && !lifted) return null;
    return { active: true };
  }

  function drawVisibleGround(c, L, range, GameAPI, tinting){
    var TW = GEO.TW, TH = GEO.TH;
    var activeIdx = GameAPI.getActiveCityIdx();
    // occupancy lookup for the ground-patch-under-buildings feature -- rebuilt every frame (cheap:
    // at most ~30 plots per city) rather than cached, since it must always match what drawDynamic
    // is about to draw on top of it a few lines later in the same frame.
    var occupied = {};
    var citiesNow = GameAPI.getCities();
    var cityNow = citiesNow && citiesNow[activeIdx];
    if(cityNow){
      cityNow.plots.forEach(function(plot){ if(plot) occupied[plot.col+','+plot.row] = true; });
    }
    for(var row = range.r0; row <= range.r1; row++){
      for(var col = range.c0; col <= range.c1; col++){
        var type = GEO.tileTypeAt(L, col, row);
        if(!type) continue;
        var p = GEO.isoToContent(L, col, row);
        if(type === 'water'){ Assets.drawWaterTile(c, p.x, p.y, TW, TH, col*7+row*13); continue; }
        if(type === 'promenade'){ Assets.drawPromenadeTile(c, p.x, p.y, TW, TH); continue; }
        var isRoad = !!roads[col+','+row];
        if(isRoad) Assets.drawRoadTile(c, p.x, p.y, TW, TH, col*31+row*17+1);
        else Assets.drawPlotGroundTile(c, p.x, p.y, TW, TH, col*31+row*17+1);
        if(!isRoad && occupied[col+','+row]) Assets.drawBuildingPad(c, p.x, p.y, TW, TH);
        if(tinting && !isRoad){
          var ok = GameAPI.canBuildAt(activeIdx, col, row);
          Assets.drawBuildTint(c, p.x, p.y, TW, TH, ok);
        }
      }
    }
    // trees along the promenade edge, lampposts along the field's outer edge -- bounded to the
    // currently-visible column range instead of the whole (potentially huge) field width.
    // Cycles through the full real-art species list (was just 2 procedural shapes) so the
    // shoreline actually reads as a varied treeline instead of one pattern repeating end to end --
    // this is the direct fix for "the map looks too empty", now that there's real tree art to fill
    // it with.
    var tRow = L.promRow1 + 0.62;
    var c0 = Math.max(L.minCol+1, range.c0), c1 = Math.min(L.maxCol-1, range.c1);
    for(var tc = Math.ceil(c0/2)*2; tc <= c1; tc += 2){
      var tp = GEO.isoToContent(L, tc, tRow);
      Assets.blit(c, TREE_ROW_SLOTS[Math.floor(tc/2) % TREE_ROW_SLOTS.length], tp.x, tp.y);
    }
    // lampposts along the main street (the promenade-front seed row every road connects back to)
    for(var lc = Math.ceil(c0/4)*4+2; lc <= c1; lc += 4){
      var lp = GEO.isoToContent(L, lc, L.fieldRow0);
      Assets.blit(c, 'lamp_01', lp.x, lp.y);
    }
    drawLandmarks(c, L, GEO, Assets, range);
  }

  /* ---- fixed one-off landmarks (Neptune's Fountain, the Gdańsk Crane, the Green Gate) -- these
     are city furniture, not player-placed buildings, so they live here as fixed (col,row) spots
     tied to the field's own geometry (the buildable ellipse's centre, and two points along the
     promenade) rather than in GameAPI/saved state. Simple to move later into the planned
     ad-unlocked "decorate the city" tab as player-placed items once that exists -- for now this is
     what makes them actually visible in the game the moment the art landed. Viewport-culled the
     same way trees/lampposts above are. */
  function landmarkSpots(L){
    var e = L.ellipse;
    var spots = [];
    if(e){
      spots.push({ slot:'landmark_fountain_01', col: Math.round(e.cx), row: Math.round(e.cy) });
    }
    var promRow = L.promRow1 - 0.1;
    spots.push({ slot:'landmark_crane_01', col: L.minCol + 4, row: promRow });
    spots.push({ slot:'landmark_greengate_01', col: L.maxCol - 4, row: promRow });
    return spots;
  }
  function drawLandmarks(c, L, GEO, Assets, range){
    landmarkSpots(L).forEach(function(s){
      if(s.col < range.c0-3 || s.col > range.c1+3 || s.row < range.r0-3 || s.row > range.r1+3) return;
      var p = GEO.isoToContent(L, s.col, s.row);
      Assets.blit(c, s.slot, p.x, p.y);
    });
  }

  function drawDynamic(c, L, GameAPI, dt, range){
    var cities = GameAPI.getCities();
    var activeIdx = GameAPI.getActiveCityIdx();
    var city = cities[activeIdx];
    if(!city) return;
    var lifted = GameAPI.getLiftedPlot();
    var entries = [];

    for(var i=0; i<city.plots.length; i++){
      var plot = city.plots[i];
      if(!plot) continue;
      (function(i, plot){
        var anchor = GEO.anchorAt(L, plot.col, plot.row);
        var depth = GEO.depthAt(L, plot.col, plot.row);
        var def = GameAPI.getBuildingDef(plot.key);
        var isLifted = !!(lifted && lifted.cityIdx===activeIdx && lifted.plotIdx===i);
        var active = GameAPI.isRentActive(plot);
        var alpha = !active ? 0.5 : (isLifted ? 0.55 : 1);
        entries.push({ depth: depth, draw: function(){
          Assets.blitBuilding(c, def, anchor.x, anchor.y, alpha, i);
          if(isLifted){
            c.save();
            c.strokeStyle = Assets.PALETTE.gold; c.lineWidth = 2; c.setLineDash([4,3]);
            var w2 = GEO.TW*0.9, h2 = GEO.TH*0.9;
            c.beginPath(); c.moveTo(anchor.x, anchor.y-h2/2); c.lineTo(anchor.x+w2/2, anchor.y); c.lineTo(anchor.x, anchor.y+h2/2); c.lineTo(anchor.x-w2/2, anchor.y); c.closePath();
            c.stroke();
            c.restore();
          }
        }});
      })(i, plot);
    }

    Npc.update(dt);
    Water.update(dt);
    entries = entries.concat(Npc.collectRenderables(GEO, L, Assets));
    entries = entries.concat(Water.collectRenderables(GEO, L, Assets, range));

    entries.sort(function(a,b){ return a.depth - b.depth; });
    entries.forEach(function(e){ e.draw(c); });

    // gulls fly above the entire scene -- always on top, never depth-sorted with the ground/water
    Water.collectSky(GEO, L, Assets).forEach(function(e){ e.draw(c); });
  }

  function drawFrame(ts){
    if(!mounted) return;
    els();
    if(!canvas || !ctx || !deps()){ rafId = requestAnimationFrame(drawFrame); return; }
    ensureLayout();
    ensureRoads(global.GameAPI);
    var rect = resizeCanvas();
    var dt = lastTs ? Math.min(0.12, (ts-lastTs)/1000) : 0;
    lastTs = ts;

    if(global.CityInput && global.CityInput.tick) global.CityInput.tick(dt);

    var d = dpr();
    var k = GEO.wrapScale(view, rect);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(d*k, 0, 0, d*k, 0, 0);
    ctx.translate(view.tx, view.ty);
    ctx.scale(view.scale, view.scale);

    var range = visibleTileRange(rect);
    var placement = placementInfo(global.GameAPI);
    drawVisibleGround(ctx, layout, range, global.GameAPI, !!placement);
    drawDynamic(ctx, layout, global.GameAPI, dt, range);

    rafId = requestAnimationFrame(drawFrame);
  }

  var lastFitW = 0, lastFitH = 0;

  /* where the close-up initial shot should center: the middle of the player's own built plots
     (so the town they've actually built is what greets them), or -- for a brand-new empty city --
     right at the waterfront/promenade edge (not further into the field) so the very first frame
     the player sees already shows the shore, making it obvious there's a draggable map beyond it
     instead of opening on a patch of anonymous grass. */
  function computeFocusCell(GameAPI, L){
    var cities = GameAPI.getCities();
    var city = cities[GameAPI.getActiveCityIdx()];
    var plots = city ? city.plots.filter(Boolean) : [];
    if(plots.length){
      var sc=0, sr=0;
      plots.forEach(function(p){ sc+=p.col; sr+=p.row; });
      return { col: sc/plots.length, row: sr/plots.length };
    }
    return { col: (L.minCol+L.maxCol)/2, row: L.promRow1 + 1 };
  }

  function mount(){
    if(!deps()) return;
    els();
    if(!canvas) return;
    if(!Assets.isBaked()) Assets.bakeAll();
    ensureLayout();
    ensureRoads(global.GameAPI);
    var rect = resizeCanvas();
    var focus = computeFocusCell(global.GameAPI, layout);
    GEO.initialView(view, rect, layout, focus.col, focus.row);
    lastFitW = rect.width; lastFitH = rect.height;
    Npc.start();
    Water.start();
    if(!mounted){
      mounted = true;
      lastTs = 0;
      rafId = requestAnimationFrame(drawFrame);
      if(global.ResizeObserver && !resizeObs){
        /* re-fit if #cityFullWrap changes size for a reason unrelated to the player's own
           pan/zoom (orientation change, keyboard popup, layout shift) -- otherwise the cached
           view would silently desync canvas hit-testing from what's drawn on screen. */
        resizeObs = new ResizeObserver(function(){
          if(!mounted || !wrap) return;
          var r = resizeCanvas();
          if(Math.abs(r.width-lastFitW) > 1 || Math.abs(r.height-lastFitH) > 1){
            GEO.fitView(view, r);
            lastFitW = r.width; lastFitH = r.height;
          }
        });
        resizeObs.observe(wrap);
      }
    }
  }

  function unmount(){
    mounted = false;
    if(rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if(Npc) Npc.stop();
    if(Water) Water.stop();
  }

  // 1 when the current pan/zoom viewport is centered at or over the waterfront, fading linearly
  // to 0 by FADE_ROWS tile-rows deeper into the city -- the one number index.html's audio layer
  // needs to crossfade "by the sea" vs "in the city" ambience as the player pans the map.
  var WATER_FADE_ROWS = 9;
  function getWaterProximity(){
    if(!deps() || !layout || !wrap) return 0;
    var rect = wrap.getBoundingClientRect();
    if(rect.width <= 0 || rect.height <= 0) return 0;
    var world = GEO.screenToWorld(view, rect, rect.left+rect.width/2, rect.top+rect.height/2);
    var iso = GEO.contentToIso(layout, world.x, world.y);
    var rowsPastPromenade = iso.row - layout.promRow1;
    return 1 - Math.max(0, Math.min(1, rowsPastPromenade / WATER_FADE_ROWS));
  }

  function zoomBy(factor){
    if(!deps() || !wrap) return;
    var rect = wrap.getBoundingClientRect();
    GEO.zoomTo(view, rect, rect.left+rect.width/2, rect.top+rect.height/2, view.scale*factor);
  }

  function resetView(){
    if(!deps() || !wrap) return;
    var rect = wrap.getBoundingClientRect();
    GEO.fitView(view, rect);
    lastFitW = rect.width; lastFitH = rect.height;
  }

  global.CityRenderer = {
    mount: mount,
    unmount: unmount,
    zoomBy: zoomBy,
    resetView: resetView,
    isMounted: function(){ return mounted; },
    // exposed for city-input.js (pointer handling lives in its own file) and for tests
    getView: function(){ return view; },
    getGeom: function(){ return layout; },
    getWaterProximity: getWaterProximity,
    getWrapRect: function(){ return wrap ? wrap.getBoundingClientRect() : {left:0, top:0, width:0, height:0}; },
    clampView: function(){ if(deps() && wrap) GEO.clampView(view, wrap.getBoundingClientRect()); }
  };
})(window);
