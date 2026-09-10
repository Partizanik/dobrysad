/* ---- Dobry Sad city visual layer: isometric geometry/coordinate math --------------------------
   Pure math, no DOM, no GameAPI calls. Replaces the old flat top-down grid with a proper 2:1
   isometric projection (Hay Day / Township-style): tiles are diamonds, buildings sit taller than
   their tile and occlude correctly via depth-sorting.

   Free-placement field: the city is now one big buildable grass field (see index.html's
   FIELD_COLS/FIELD_ROWS/FIELD_WATER_ROWS/FIELD_PROMENADE_ROWS -- GameAPI.getCityGridDims() is
   the single source of truth, mirrored here only as a fallback), with a waterfront + promenade
   band along the top edge. Unlike the old fixed 30-plot block layout, WHERE each building sits is
   chosen by the player (see index.html's onPlotTap/canBuildAt) -- this file no longer bakes a
   static tiles map at all, since "which tile is a road" now depends on live building positions,
   not just the grid shape. Instead: tileTypeAt() classifies any (col,row) on demand (water /
   promenade / field), and computeRoadTiles() derives a road network fresh from the current set of
   built (col,row) positions, so city-renderer.js can viewport-cull both (necessary for a field
   this large -- see BUILD_HEADROOM/MAX_SCALE below, unchanged) instead of baking the whole
   district once like the old fixed-size version did. ------------------------------------------ */
(function(global){
  'use strict';

  var TW = 84, TH = 42;              // tile width/height in content-space units (2:1 iso)
  var BUILD_HEADROOM = 190;          // extra top padding so tall buildings never clip the fit view
  var MIN_SCALE = 0.5, MAX_SCALE = 3.2;
  // how close the view starts when the fullscreen city first opens -- a Hay Day/Township-style
  // close-up on the player's own street, not a zoomed-out view of the whole (huge) field. The
  // player can always pinch or hit the reset button to zoom back out to fitView's full-field shot.
  var INITIAL_SCALE = 2.1;

  function isoToLocal(col, row){
    return { x: (col - row) * (TW/2), y: (col + row) * (TH/2) };
  }
  function localToIso(x, y){
    // exact inverse of isoToLocal
    var col = (x/(TW/2) + y/(TH/2)) / 2;
    var row = (y/(TH/2) - x/(TW/2)) / 2;
    return { col: col, row: row };
  }

  /* Build (once per grid-shape change) the district's static geometry: field bounds, the
     water/promenade band depth, and the content-space origin/size. Cached by city-renderer.js
     exactly like the old buildLayout(cols,rows) was. dims = {cols, rows, waterRows,
     promenadeRows} -- comes from GameAPI.getCityGridDims() so the renderer's idea of "what's a
     legal building tile" can never drift from index.html's own game-rule copy of the same
     numbers (see canBuildAt() there). */
  function buildLayout(dims){
    var cols = dims.cols, rows = dims.rows;
    var waterRows = dims.waterRows != null ? dims.waterRows : 5;
    var promenadeRows = dims.promenadeRows != null ? dims.promenadeRows : 1;
    var minCol = 0, maxCol = cols-1, minRow = 0, maxRow = rows-1;
    var waterRow0 = 0, waterRow1 = waterRows-1;
    var promRow0 = waterRows, promRow1 = waterRows+promenadeRows-1;
    var fieldRow0 = waterRows+promenadeRows, fieldRow1 = maxRow;

    // bounding box of the projected district, in local iso-projection units (before origin shift)
    var corners = [
      isoToLocal(minCol, minRow), isoToLocal(maxCol+1, minRow),
      isoToLocal(minCol, maxRow+1), isoToLocal(maxCol+1, maxRow+1)
    ];
    var lx = Math.min.apply(null, corners.map(function(p){ return p.x; }));
    var hx = Math.max.apply(null, corners.map(function(p){ return p.x; }));
    var ly = Math.min.apply(null, corners.map(function(p){ return p.y; }));
    var hy = Math.max.apply(null, corners.map(function(p){ return p.y; }));

    var originX = -lx;
    var originY = -ly + BUILD_HEADROOM;

    return {
      cols: cols, rows: rows,
      minCol: minCol, maxCol: maxCol, minRow: minRow, maxRow: maxRow,
      waterRow0: waterRow0, waterRow1: waterRow1, promRow0: promRow0, promRow1: promRow1,
      fieldRow0: fieldRow0, fieldRow1: fieldRow1,
      originX: originX, originY: originY,
      contentW: (hx-lx), contentH: (hy-ly) + BUILD_HEADROOM
    };
  }

  function isoToContent(layout, col, row){
    var p = isoToLocal(col, row);
    return { x: p.x + layout.originX, y: p.y + layout.originY };
  }

  /* the exact center of the diamond tile at (col,row), in content-space. */
  function centerAt(layout, col, row){
    return isoToContent(layout, col, row);
  }

  /* ground-anchor (bottom-center) content-space point for a building/prop sitting at (col,row) --
     what city-renderer.js/CityAssets.blit() treat as the sprite's anchor. */
  function anchorAt(layout, col, row){
    var c = centerAt(layout, col, row);
    return { x: c.x, y: c.y + TH/2 };
  }

  /* inverse of isoToContent -- content-space point back to fractional (col,row). Used by the
     audio layer (index.html) to work out how close the current pan/zoom viewport center is to
     the waterfront, so ambience can crossfade between "by the sea" and "in the city" as the
     player's finger moves the map. */
  function contentToIso(layout, x, y){
    return localToIso(x - layout.originX, y - layout.originY);
  }

  /* 'water' | 'promenade' | 'field' for any (col,row) inside the district bounds, else null.
     Pure classification -- doesn't know or care whether a 'field' tile is actually occupied by a
     building or is a road; that's layered on top by computeRoadTiles()/city-renderer.js. */
  function tileTypeAt(layout, col, row){
    if(col < layout.minCol || col > layout.maxCol || row < layout.minRow || row > layout.maxRow) return null;
    if(row <= layout.waterRow1) return 'water';
    if(row <= layout.promRow1) return 'promenade';
    return 'field';
  }

  /* depth key for painter's-algorithm sorting -- draw ascending. Works for any point in content
     space (buildings, npcs mid-stride, decorations), not just tile centers. */
  function depthAt(layout, col, row){ return col + row; }

  function wrapScale(view, wrapRect){
    if(wrapRect.width <= 0 || wrapRect.height <= 0) return 1;
    return Math.min(wrapRect.width / view.contentW, wrapRect.height / view.contentH);
  }

  function screenToWorld(view, wrapRect, clientX, clientY){
    var k = wrapScale(view, wrapRect);
    var localX = (clientX - wrapRect.left) / k;
    var localY = (clientY - wrapRect.top) / k;
    return { x: (localX - view.tx) / view.scale, y: (localY - view.ty) / view.scale };
  }

  /* world/content-space -> the nearest (col,row) cell, rounded, with NO bounds/legality check --
     free placement means "is this a legal spot to build on" is a game rule (index.html's
     canBuildAt(), reached through GameAPI.tapPlot()), not a geometry concern. city-input.js just
     resolves the tap to a cell and forwards it unconditionally. */
  function worldToFieldCell(layout, worldX, worldY){
    var iso = localToIso(worldX - layout.originX, worldY - layout.originY);
    return { col: Math.round(iso.col), row: Math.round(iso.row) };
  }

  /* ---- dynamic road network: grows a connected network from a promenade-front "main street"
     (one field-row deep, spanning the built district's column range) by connecting each building
     to the nearest already-road tile with a simple L-shaped (Manhattan) path. Recomputed by
     city-renderer.js only when the building set actually changes (cheap signature check), not
     every frame -- this is plain graph-growing over at most ~30 buildings (the per-city cap),
     so no pathfinding sophistication is needed even though the field itself can be huge. Returns
     a plain {"col,row": true} membership map. ---------------------------------------------------- */
  function computeRoadTiles(layout, buildings){
    var roads = {};
    if(!buildings || !buildings.length) return roads;
    function mark(c,r){ roads[c+','+r] = true; }
    function carveH(c0,c1,r){ var lo=Math.min(c0,c1), hi=Math.max(c0,c1); for(var c=lo;c<=hi;c++) mark(c,r); }
    function carveV(r0,r1,c){ var lo=Math.min(r0,r1), hi=Math.max(r0,r1); for(var r=lo;r<=hi;r++) mark(c,r); }

    var seedRow = layout.fieldRow0;
    var minC = buildings[0].col, maxC = buildings[0].col;
    buildings.forEach(function(b){ if(b.col<minC) minC=b.col; if(b.col>maxC) maxC=b.col; });
    carveH(minC, maxC, seedRow);

    buildings.forEach(function(b){
      var best = null, bestDist = Infinity;
      Object.keys(roads).forEach(function(k){
        var parts = k.split(','), rc = +parts[0], rr = +parts[1];
        var d = Math.abs(rc-b.col) + Math.abs(rr-b.row);
        if(d < bestDist){ bestDist = d; best = { col: rc, row: rr }; }
      });
      if(!best) return;
      // approach along the building's own row, then up/down the target's column -- reads as a
      // short driveway off the growing street network rather than a path cutting corners.
      carveH(b.col, best.col, b.row);
      carveV(b.row, best.row, best.col);
    });
    return roads;
  }

  function clampView(view){
    var margin = 60;
    view.tx = Math.max(-(view.contentW*view.scale)+margin, Math.min(view.contentW-margin, view.tx));
    view.ty = Math.max(-(view.contentH*view.scale)+margin, Math.min(view.contentH-margin, view.ty));
  }

  function fitView(view, wrapRect){
    var k = wrapScale(view, wrapRect);
    var localW = wrapRect.width / k, localH = wrapRect.height / k;
    view.scale = Math.max(MIN_SCALE, Math.min(1, 0.94));
    view.tx = (localW - view.contentW*view.scale) / 2;
    view.ty = (localH - view.contentH*view.scale) / 2;
    clampView(view);
  }

  /* close-up starting shot for a freshly-opened city: same idea as fitView (compute local-space
     size from the wrap's on-screen rect) but at INITIAL_SCALE and centered on the player's own
     built district (or, for a brand-new empty city, the street just past the promenade) instead
     of shrinking the whole field into view. (focusCol,focusRow) is in iso grid coordinates. */
  function initialView(view, wrapRect, layout, focusCol, focusRow){
    var k = wrapScale(view, wrapRect);
    var localW = wrapRect.width / k, localH = wrapRect.height / k;
    view.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, INITIAL_SCALE));
    var focus = isoToContent(layout, focusCol, focusRow);
    view.tx = localW/2 - focus.x*view.scale;
    view.ty = localH/2 - focus.y*view.scale;
    clampView(view);
  }

  function zoomTo(view, wrapRect, screenX, screenY, newScaleRaw){
    var k = wrapScale(view, wrapRect);
    var localX = (screenX - wrapRect.left) / k, localY = (screenY - wrapRect.top) / k;
    var contentX = (localX - view.tx) / view.scale, contentY = (localY - view.ty) / view.scale;
    var newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScaleRaw));
    view.tx = localX - newScale*contentX;
    view.ty = localY - newScale*contentY;
    view.scale = newScale;
    clampView(view);
  }

  global.CityGeometry = {
    TW: TW, TH: TH, BUILD_HEADROOM: BUILD_HEADROOM,
    MIN_SCALE: MIN_SCALE, MAX_SCALE: MAX_SCALE, INITIAL_SCALE: INITIAL_SCALE,
    buildLayout: buildLayout,
    isoToContent: isoToContent,
    centerAt: centerAt,
    anchorAt: anchorAt,
    tileTypeAt: tileTypeAt,
    contentToIso: contentToIso,
    depthAt: depthAt,
    wrapScale: wrapScale,
    screenToWorld: screenToWorld,
    worldToFieldCell: worldToFieldCell,
    computeRoadTiles: computeRoadTiles,
    clampView: clampView,
    fitView: fitView,
    initialView: initialView,
    zoomTo: zoomTo
  };
})(window);
