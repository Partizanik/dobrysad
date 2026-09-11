/* ---- Dobry Sad city visual layer: touch gestures on the canvas --------------------------------
   Mobile-first gesture set, per spec: one finger pans, two fingers pinch-zoom (anchored under the
   fingers), double-tap zooms in (anchored under the tap), and a single tap on an empty/occupied
   plot builds/lifts/moves it exactly as before. Motion must read as a native map control, not as
   dragging an HTML element -- so every gesture only ever mutates the shared `view` object that
   city-renderer.js turns into a canvas transform each frame; nothing here ever touches DOM layout,
   and single-finger pans/flicks get real momentum (an exponential-decay inertia tick) instead of
   stopping dead the instant the finger lifts, and double-tap zooms ease in over ~260ms instead of
   snapping, both driven by CityRenderer's own rAF loop via tick(dt) rather than a second timer.

   Tap resolution is pure coordinate math (screenToWorld -> worldToFieldCell) -- a single <canvas>
   has no child elements for setPointerCapture()'s click-retargeting to confuse, so the old
   SVG-era pointer-capture bug class is structurally impossible here. Whether the tapped cell is
   actually buildable (in bounds, not water, not too close to another building) is a game rule,
   not a geometry concern -- this file just resolves the tap to a (col,row) and hands it to
   GameAPI.tapPlot() unconditionally; index.html decides whether to accept it. */
(function(global){
  'use strict';

  var TAP_SLOP = 8;
  var DOUBLE_TAP_MS = 300, DOUBLE_TAP_SLOP = 34, TAP_RESOLVE_DELAY = DOUBLE_TAP_MS - 20;
  var INERTIA_DECAY = 0.0025;   // exponential decay factor per second (smaller = stops sooner)
  var INERTIA_MIN_SPEED = 6;    // local px/sec, below which inertia just stops
  var DOUBLE_TAP_ZOOM = 1.7;
  var TWEEN_MS = 260;

  var pointers = {};
  var pinchStartDist = null, pinchStartScale = 1, pinchStartMid = null;
  var tapCandidate = null;
  var pendingTapTimer = null;
  var lastTapUp = null; // { x, y, time }
  var canvas = null;

  var velTracker = null; // {x,y,t} samples for the active single-finger drag
  var inertia = null;    // {vx, vy} in local(px)/sec, ticked down each frame
  var tween = null;      // {anchorX, anchorY, fromScale, toScale, t0, dur}

  /* ---- ground-texture brush: while GameAPI.getPendingGroundBrush() is armed, a single-finger
     gesture paints instead of panning -- every tile the finger crosses gets GameAPI.paintGroundAt()
     called on it, exactly once per NEW cell entered (lastPaintCell dedupes redundant calls while
     the finger sits still or re-crosses the same tile). Two-finger pinch/pan is untouched either
     way (that code path never looks at brushStroke), so the player can still zoom/pan out to see
     more of the map mid-stroke without that finger being mistaken for a paint gesture. */
  var brushStroke = null; // {pointerId} while a paint drag is in progress, else null
  var lastPaintCell = null; // {col,row} last painted this stroke

  function groundBrushActive(){
    var GameAPI = global.GameAPI;
    return !!(GameAPI && GameAPI.getPendingGroundBrush && GameAPI.getPendingGroundBrush());
  }

  function paintAtClient(clientX, clientY){
    var CR = global.CityRenderer, GEO = global.CityGeometry, GameAPI = global.GameAPI;
    if(!CR || !GEO || !GameAPI || !GameAPI.paintGroundAt) return;
    var layout = CR.getGeom(); if(!layout) return;
    var view = CR.getView(), rect = CR.getWrapRect();
    var world = GEO.screenToWorld(view, rect, clientX, clientY);
    var cell = GEO.worldToFieldCell(layout, world.x, world.y);
    if(lastPaintCell && lastPaintCell.col===cell.col && lastPaintCell.row===cell.row) return;
    lastPaintCell = cell;
    GameAPI.paintGroundAt(GameAPI.getActiveCityIdx(), cell.col, cell.row);
  }

  function dist(a, b){ return Math.hypot(a.x-b.x, a.y-b.y); }
  function pointerDist(){
    var ids = Object.keys(pointers);
    if(ids.length < 2) return null;
    return dist(pointers[ids[0]], pointers[ids[1]]);
  }
  function easeOutCubic(t){ return 1 - Math.pow(1-t, 3); }

  function resolveTap(clientX, clientY){
    var CR = global.CityRenderer, GEO = global.CityGeometry, GameAPI = global.GameAPI;
    if(!CR || !GEO || !GameAPI) return;
    var layout = CR.getGeom();
    if(!layout) return;
    var view = CR.getView(), rect = CR.getWrapRect();
    var world = GEO.screenToWorld(view, rect, clientX, clientY);
    var cell = GEO.worldToFieldCell(layout, world.x, world.y);
    GameAPI.tapPlot(GameAPI.getActiveCityIdx(), cell.col, cell.row);
  }

  function startDoubleTapZoom(clientX, clientY){
    var CR = global.CityRenderer;
    if(!CR) return;
    inertia = null;
    var view = CR.getView();
    var toScale = Math.max(global.CityGeometry.MIN_SCALE, Math.min(global.CityGeometry.MAX_SCALE, view.scale*DOUBLE_TAP_ZOOM));
    tween = { anchorX: clientX, anchorY: clientY, fromScale: view.scale, toScale: toScale, t0: performance.now(), dur: TWEEN_MS };
  }

  function onPointerDown(e){
    var CR = global.CityRenderer;
    if(!CR) return;
    try { canvas.setPointerCapture(e.pointerId); } catch(err){}
    inertia = null; // any new touch cancels in-flight momentum immediately, like a native map
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if(ids.length === 2){
      brushStroke = null; // a second finger landing mid-stroke hands off to pinch/pan instead
      pinchStartDist = pointerDist();
      pinchStartScale = CR.getView().scale;
      var a = pointers[ids[0]], b = pointers[ids[1]];
      pinchStartMid = { x: (a.x+b.x)/2, y: (a.y+b.y)/2 };
      tapCandidate = null;
      if(pendingTapTimer){ clearTimeout(pendingTapTimer); pendingTapTimer = null; }
    } else if(ids.length === 1){
      if(groundBrushActive()){
        brushStroke = { pointerId: e.pointerId };
        lastPaintCell = null;
        tapCandidate = null; velTracker = null;
        if(pendingTapTimer){ clearTimeout(pendingTapTimer); pendingTapTimer = null; }
        paintAtClient(e.clientX, e.clientY);
      } else {
        tapCandidate = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
        velTracker = { x: e.clientX, y: e.clientY, t: performance.now() };
      }
    }
  }

  function onPointerMove(e){
    if(!pointers[e.pointerId]) return;
    var CR = global.CityRenderer, GEO = global.CityGeometry;
    var prev = pointers[e.pointerId];
    var ids = Object.keys(pointers);
    if(ids.length >= 2){
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var d = pointerDist();
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var mid = { x: (a.x+b.x)/2, y: (a.y+b.y)/2 };
      var rect = CR.getWrapRect();
      if(d && pinchStartDist){
        GEO.zoomTo(CR.getView(), rect, mid.x, mid.y, pinchStartScale*(d/pinchStartDist));
      }
      // two-finger pan: shift by the midpoint's own movement so pinch + pan compose naturally
      if(pinchStartMid){
        var k = GEO.wrapScale(CR.getView(), rect);
        var view0 = CR.getView();
        view0.tx += (mid.x - pinchStartMid.x) / k;
        view0.ty += (mid.y - pinchStartMid.y) / k;
        GEO.clampView(view0, rect);
      }
      pinchStartMid = mid;
    } else if(brushStroke && brushStroke.pointerId === e.pointerId){
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      paintAtClient(e.clientX, e.clientY);
    } else {
      var dxPx = e.clientX - prev.x, dyPx = e.clientY - prev.y;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var rect2 = CR.getWrapRect();
      var k2 = GEO.wrapScale(CR.getView(), rect2);
      var view = CR.getView();
      view.tx += dxPx / k2; view.ty += dyPx / k2;
      GEO.clampView(view, rect2);
      if(velTracker){
        var now = performance.now(), dt = Math.max(1, now - velTracker.t);
        // exponential moving average so one jittery sample can't dominate the flick velocity
        var ivx = (e.clientX - velTracker.x) / (dt/1000), ivy = (e.clientY - velTracker.y) / (dt/1000);
        velTracker.vx = velTracker.vx == null ? ivx : velTracker.vx*0.7 + ivx*0.3;
        velTracker.vy = velTracker.vy == null ? ivy : velTracker.vy*0.7 + ivy*0.3;
        velTracker.x = e.clientX; velTracker.y = e.clientY; velTracker.t = now;
      }
      if(tapCandidate && tapCandidate.pointerId === e.pointerId){
        if(Math.hypot(e.clientX-tapCandidate.x, e.clientY-tapCandidate.y) > TAP_SLOP) tapCandidate.moved = true;
      }
    }
  }

  function onPointerEnd(e){
    if(brushStroke && brushStroke.pointerId === e.pointerId){
      brushStroke = null; lastPaintCell = null;
      delete pointers[e.pointerId];
      if(Object.keys(pointers).length < 2){ pinchStartDist = null; pinchStartMid = null; }
      return;
    }
    var wasSingle = Object.keys(pointers).length === 1;
    if(tapCandidate && tapCandidate.pointerId === e.pointerId && !tapCandidate.moved && wasSingle){
      var now = performance.now();
      var isDouble = lastTapUp && (now - lastTapUp.time) < DOUBLE_TAP_MS &&
        Math.hypot(e.clientX-lastTapUp.x, e.clientY-lastTapUp.y) < DOUBLE_TAP_SLOP;
      if(isDouble){
        if(pendingTapTimer){ clearTimeout(pendingTapTimer); pendingTapTimer = null; }
        lastTapUp = null;
        startDoubleTapZoom(e.clientX, e.clientY);
      } else {
        lastTapUp = { x: e.clientX, y: e.clientY, time: now };
        var cx = e.clientX, cy = e.clientY;
        if(pendingTapTimer) clearTimeout(pendingTapTimer);
        pendingTapTimer = setTimeout(function(){ pendingTapTimer = null; resolveTap(cx, cy); }, TAP_RESOLVE_DELAY);
      }
    } else if(wasSingle && velTracker && velTracker.vx != null){
      var speed = Math.hypot(velTracker.vx, velTracker.vy);
      if(speed > INERTIA_MIN_SPEED) inertia = { vx: velTracker.vx, vy: velTracker.vy };
    }
    velTracker = null;
    delete pointers[e.pointerId];
    if(Object.keys(pointers).length < 2){ pinchStartDist = null; pinchStartMid = null; }
    if(tapCandidate && tapCandidate.pointerId === e.pointerId) tapCandidate = null;
  }

  function onWheel(e){
    var CR = global.CityRenderer, GEO = global.CityGeometry;
    e.preventDefault();
    inertia = null; tween = null;
    var rect = CR.getWrapRect();
    GEO.zoomTo(CR.getView(), rect, e.clientX, e.clientY, CR.getView().scale*(e.deltaY < 0 ? 1.12 : 0.89));
  }

  /* advanced once per rendered frame by city-renderer.js's own rAF loop -- keeps momentum/zoom
     easing perfectly in step with drawing instead of running a second, independently-timed loop. */
  function tick(dt){
    var CR = global.CityRenderer, GEO = global.CityGeometry;
    if(!CR || !GEO) return;
    if(tween){
      var t = Math.min(1, (performance.now() - tween.t0) / tween.dur);
      var eased = easeOutCubic(t);
      var scale = tween.fromScale + (tween.toScale - tween.fromScale)*eased;
      GEO.zoomTo(CR.getView(), CR.getWrapRect(), tween.anchorX, tween.anchorY, scale);
      if(t >= 1) tween = null;
      return; // don't also apply inertia mid-tween
    }
    if(inertia){
      var view = CR.getView();
      view.tx += inertia.vx*dt; view.ty += inertia.vy*dt;
      GEO.clampView(view, CR.getWrapRect());
      var decay = Math.pow(INERTIA_DECAY, dt);
      inertia.vx *= decay; inertia.vy *= decay;
      if(Math.hypot(inertia.vx, inertia.vy) < INERTIA_MIN_SPEED) inertia = null;
    }
  }

  function init(){
    canvas = document.getElementById('cityFullCanvas');
    if(!canvas) return;
    canvas.style.touchAction = 'none'; // let us own every gesture; no native scroll/zoom fighting ours
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerEnd);
    canvas.addEventListener('pointerleave', function(e){ if(pointers[e.pointerId]) onPointerEnd(e); });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', function(e){ e.preventDefault(); }); // avoid a stray native dblclick zoom on desktop
  }

  global.CityInput = { init: init, tick: tick };
})(window);
