/* ---- Dobry Sad city visual layer: sprite/asset registry (isometric) ---------------------------
   Named-slot convention (building_house_01, tree_02, npc_01, dog_01, ...) so future art (hand art
   or generated images) can drop into a slot later with zero renderer changes -- see
   ASSET_MANIFEST below. Every sprite is "baked" once to an offscreen canvas at init time and every
   draw frame afterwards is a single cheap drawImage() blit -- draw() functions here never run
   per-frame, only once per slot (or again if devicePixelRatio changes).

   Buildings are now drawn as extruded iso boxes (three visible faces + a roof) instead of flat
   top-down rectangles, to match the European hand-painted city-builder look (Hay Day / Township)
   the game is targeting. Ground tiles (road/water/promenade/plot grass) are exported as direct
   draw functions rather than cached sprites, since city-renderer.js tiles them edge-to-edge into
   one static background bake instead of blitting them individually per frame.

   Nothing in this file touches window.GameAPI or any game state. -------------------------------- */
(function(global){
  'use strict';

  var PALETTE = {
    bg:'#eef2e3', ink:'#233020', inkDim:'#5b6a4f', line:'#d7dcc1',
    gold:'#a8791f', goldSoft:'#f1dfab',
    coral:'#a94e34', coralSoft:'#f2d3c2',
    leaf:'#3f7a3f', leafDeep:'#26501f',
    blue:'#2e6fa0', blueSoft:'#dbe9f3',
    asphalt:'#4b5058', asphaltDark:'#3a3e45',
    promenade:'#cfc7a8', grass:'#8fb457', grassLight:'#a7c96c'
  };

  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  function shade(hex, amt){
    var n = parseInt(hex.slice(1), 16);
    var r = (n>>16)&255, g = (n>>8)&255, b = n&255;
    r = clamp(Math.round(r+amt), 0, 255); g = clamp(Math.round(g+amt), 0, 255); b = clamp(Math.round(b+amt), 0, 255);
    return 'rgb('+r+','+g+','+b+')';
  }

  function diamondPath(ctx, cx, cy, w, h){
    ctx.beginPath();
    ctx.moveTo(cx, cy-h/2); ctx.lineTo(cx+w/2, cy); ctx.lineTo(cx, cy+h/2); ctx.lineTo(cx-w/2, cy);
    ctx.closePath();
  }

  function ellipseShadow(ctx, cx, cy, w, h, alpha){
    ctx.save();
    ctx.globalAlpha = alpha == null ? 0.26 : alpha;
    ctx.fillStyle = '#0a1a08';
    ctx.beginPath(); ctx.ellipse(cx, cy, w, h, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function mulberry32(a){
    return function(){
      a |= 0; a = a+0x6D2B79F5|0;
      var t = Math.imul(a^a>>>15, 1|a);
      t = t+Math.imul(t^t>>>7, 61|t)^t;
      return ((t^t>>>14)>>>0) / 4294967296;
    };
  }

  /* ---- ground tiles: drawn on demand by city-renderer.js's per-frame viewport-culled ground
     pass, one call per visible grid cell -- these fill edge-to-edge (no anchor/footprint
     bookkeeping needed). ---- */

  /* gravel/sand road, matching the purchased medieval building pack's warm palette instead of the
     old flat city asphalt -- a mid-tone sandy-stone base with scattered pebble flecks (seeded per
     tile so neighbouring road tiles don't repeat identically) and a soft worn centre track. */
  function drawRoadTile(ctx, cx, cy, tw, th, seed){
    var g = ctx.createLinearGradient(cx, cy-th/2, cx, cy+th/2);
    g.addColorStop(0, '#cdb896'); g.addColorStop(1, '#b89b72');
    ctx.fillStyle = g; diamondPath(ctx, cx, cy, tw, th); ctx.fill();
    // worn lighter track down the middle, the way a real gravel path packs down with use
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#e2cfa8';
    diamondPath(ctx, cx, cy, tw*0.42, th*0.42); ctx.fill();
    ctx.restore();
    var rnd = mulberry32((seed||1)*2654435761 >>> 0);
    for(var i=0;i<14;i++){
      var px = cx + (rnd()-0.5)*tw*0.82, py = cy + (rnd()-0.5)*th*0.82;
      var r = tw*(0.012+rnd()*0.02);
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(96,78,52,0.35)' : 'rgba(238,222,190,0.5)';
      ctx.beginPath(); ctx.ellipse(px, py, r, r*0.72, 0, 0, Math.PI*2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(90,72,46,0.28)'; ctx.lineWidth = Math.max(1, tw*0.01);
    diamondPath(ctx, cx, cy, tw*0.97, th*0.97); ctx.stroke();
  }
  function drawWaterTile(ctx, cx, cy, tw, th, seed){
    var g = ctx.createLinearGradient(cx, cy-th/2, cx, cy+th/2);
    g.addColorStop(0, '#82c6e8'); g.addColorStop(1, '#4f9fce');
    ctx.fillStyle = g; diamondPath(ctx, cx, cy, tw, th); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = Math.max(1, tw*0.012);
    var rnd = mulberry32(seed||1);
    for(var i=-1;i<=1;i++){
      var yy = cy + i*th*0.18 + rnd()*4;
      ctx.beginPath(); ctx.moveTo(cx-tw*0.3, yy); ctx.quadraticCurveTo(cx, yy-th*0.09, cx+tw*0.3, yy); ctx.stroke();
    }
  }
  function drawPromenadeTile(ctx, cx, cy, tw, th){
    ctx.fillStyle = PALETTE.promenade; diamondPath(ctx, cx, cy, tw, th); ctx.fill();
    ctx.strokeStyle = 'rgba(110,95,55,0.3)'; ctx.lineWidth = Math.max(1, tw*0.01);
    diamondPath(ctx, cx, cy, tw*0.88, th*0.88); ctx.stroke();
  }
  function drawPlotGroundTile(ctx, cx, cy, tw, th, seed){
    // Every tile gets a real painted ground photo (the Nano Banana grass art), not the flat
    // procedural gradient -- the user explicitly wants the whole field to read as "seeded with
    // that real grass texture", not a rare 1-in-6 accent on an otherwise flat-color field (which
    // is how this used to work). Picked from GROUND_VARIANT_FILES, deterministic per-tile via the
    // same seed city-renderer.js already derives from col/row (so it doesn't flicker between
    // different textures frame to frame).
    //
    // Two things made every tile boundary read as a visible seam/grid, which is what this pass
    // fixes: (1) a stroked outline was drawn around literally every diamond -- an explicit grid
    // line on top of the art, not an artifact of the art itself -- now removed; (2) each tile
    // drew the SAME source photo centered on its own cx/cy with no variation, so any two
    // neighbouring tiles that happened to pick the same one of the only 2 source files (very
    // common with just 2 variants) showed the exact same crop, composed identically, repeated --
    // an obvious regular "wallpaper" pattern rather than a random field. Now each tile also gets
    // a seeded 90-degree rotation and optional mirror before the photo is drawn, so even the same
    // source file lands differently tile to tile and the repeat stops reading as a grid. The clip
    // diamond is also drawn slightly OVERSIZED (1.05x instead of 0.98x) so neighbouring tiles
    // overlap a hair at the seam instead of leaving a 2%-thin gap between them.
    var rnd = mulberry32((seed||1) >>> 0);
    var useVariant = true;
    if(useVariant){
      var file = GROUND_VARIANT_FILES[Math.floor(rnd()*GROUND_VARIANT_FILES.length) % GROUND_VARIANT_FILES.length];
      var img = loadImg(file, GROUND_BASE);
      if(img.complete && img.naturalWidth){
        var rot = Math.floor(rnd()*4) * (Math.PI/2); // 0/90/180/270 -- ground texture has no
        // strong directional light baked in, so a quarter-turn doesn't look "wrong" the way it
        // would on a building or a person, and it's what actually breaks up the repeat.
        var flip = rnd() < 0.5 ? -1 : 1;
        ctx.save();
        diamondPath(ctx, cx, cy, tw*1.05, th*1.05); ctx.clip();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        ctx.scale(flip, 1);
        var iw = tw*1.35, ih = iw * (img.naturalHeight/img.naturalWidth); // slight overscan so the
        // clip never reveals a bare edge if the photo's own aspect doesn't exactly match tw:th
        ctx.drawImage(img, -iw/2, -ih/2, iw, ih);
        ctx.restore();
        return;
      }
    }
    var g = ctx.createRadialGradient(cx, cy, tw*0.06, cx, cy, tw*0.52);
    g.addColorStop(0, PALETTE.grassLight); g.addColorStop(1, PALETTE.grass);
    ctx.fillStyle = g; diamondPath(ctx, cx, cy, tw*0.96, th*0.96); ctx.fill();
    ctx.strokeStyle = 'rgba(60,90,35,0.3)'; ctx.lineWidth = Math.max(1, tw*0.012);
    diamondPath(ctx, cx, cy, tw*0.96, th*0.96); ctx.stroke();
  }
  /* ground patch under a placed building: a warm dirt/path tone, drawn slightly larger than the
     tile so it reads as "a bit of worked ground around the building" rather than a flat color
     swap -- requested so built plots visually stand out from bare grass at a glance. Drawn in the
     ground pass, before the building sprite itself, so it sits underneath/around it. */
  function drawBuildingPad(ctx, cx, cy, tw, th){
    var padW = tw*1.18, padH = th*1.18;
    var g = ctx.createRadialGradient(cx, cy, tw*0.05, cx, cy, padW*0.52);
    g.addColorStop(0, '#d9c295'); g.addColorStop(1, '#c2a76f');
    ctx.fillStyle = g; diamondPath(ctx, cx, cy, padW, padH); ctx.fill();
    ctx.strokeStyle = 'rgba(120,90,45,0.35)'; ctx.lineWidth = Math.max(1, tw*0.014);
    diamondPath(ctx, cx, cy, padW, padH); ctx.stroke();
  }

  /* free-placement feedback while a building is "in hand" (pendingPlacement) or lifted: a soft
     green wash over grass tiles the player could legally drop onto right now, a soft red wash
     over ones they can't (too close to another building, or off the buildable field) -- drawn as
     a thin overlay on top of the ordinary ground tile so the grass texture still reads through. */
  function drawBuildTint(ctx, cx, cy, tw, th, ok){
    // a sky-blue wash for "you can build here" reads clearly against the grass (green-on-green
    // barely shows), red-orange for "too close/out of bounds" -- both with a brighter outline so
    // the eligible area's edge is unambiguous at a glance while panning with a building in hand.
    ctx.save();
    ctx.globalAlpha = ok ? 0.38 : 0.4;
    ctx.fillStyle = ok ? '#3fa9e8' : '#e8503c';
    diamondPath(ctx, cx, cy, tw*0.9, th*0.9); ctx.fill();
    ctx.globalAlpha = ok ? 0.85 : 0.7;
    ctx.strokeStyle = ok ? '#e8f6ff' : '#9c2c1f';
    ctx.lineWidth = Math.max(1, tw*0.022);
    diamondPath(ctx, cx, cy, tw*0.9, th*0.9); ctx.stroke();
    ctx.restore();
  }

  /* ---- empty plot: fence + weeds + a small "build here" signpost, seeded per plot index so
     neighbouring lots don't look identical. ---- */
  function drawEmptyLot(ctx, w, h, opts){
    var seed = (opts && opts.seed) || 1;
    var rnd = mulberry32(seed);
    var cx = w/2, cy = h*0.86;
    ellipseShadow(ctx, cx, cy, w*0.05, h*0.02, 0.001); // no-op keeps signature symmetric w/ buildings
    // fence along the back-left edge of the diamond footprint
    ctx.strokeStyle = '#7a5a34'; ctx.lineWidth = Math.max(1.4, w*0.03); ctx.lineCap = 'round';
    var fx0 = w*0.14, fx1 = w*0.5, fy0 = h*0.58, fy1 = h*0.44;
    ctx.beginPath(); ctx.moveTo(fx0, fy0); ctx.lineTo(fx1, fy1); ctx.stroke();
    for(var p=0; p<=4; p++){
      var t = p/4, px = fx0+(fx1-fx0)*t, py = fy0+(fy1-fy0)*t;
      ctx.beginPath(); ctx.moveTo(px, py+h*0.07); ctx.lineTo(px, py-h*0.05); ctx.stroke();
    }
    // sparse grass tufts + a rock
    for(var i=0;i<4;i++){
      var gx = w*(0.3+rnd()*0.5), gy = h*(0.62+rnd()*0.22);
      ctx.strokeStyle = PALETTE.leaf; ctx.lineWidth = Math.max(1, w*0.016);
      ctx.beginPath(); ctx.moveTo(gx,gy); ctx.lineTo(gx-w*0.02,gy-h*0.05); ctx.moveTo(gx,gy); ctx.lineTo(gx+w*0.02,gy-h*0.05); ctx.stroke();
    }
    ctx.fillStyle = PALETTE.line;
    ctx.beginPath(); ctx.ellipse(w*0.28, h*0.78, w*0.045, h*0.02, 0.2, 0, Math.PI*2); ctx.fill();
    // signpost with a plus-glyph (language-neutral "build here")
    var sx = w*0.68, sy = h*0.66;
    ctx.strokeStyle = PALETTE.coral; ctx.lineWidth = Math.max(1.4, w*0.026);
    ctx.beginPath(); ctx.moveTo(sx, sy+h*0.1); ctx.lineTo(sx, sy-h*0.16); ctx.stroke();
    ctx.fillStyle = '#fbfaf1';
    ctx.fillRect(sx-w*0.09, sy-h*0.3, w*0.18, h*0.14);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1; ctx.strokeRect(sx-w*0.09, sy-h*0.3, w*0.18, h*0.14);
    ctx.strokeStyle = PALETTE.coral; ctx.lineWidth = Math.max(1.6, w*0.024); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx-w*0.045, sy-h*0.23); ctx.lineTo(sx+w*0.045, sy-h*0.23);
    ctx.moveTo(sx, sy-h*0.27); ctx.lineTo(sx, sy-h*0.19);
    ctx.stroke();
  }

  /* ---- generic extruded iso building: 3 visible faces (left/right/front) + a roof (peaked hip
     or flat-with-parapet), windows on both side faces, a door on the front. All archetypes below
     are this same box with different proportions/colors/roof style -- distinct silhouettes, not
     palette-swapped recolors, because wall width/height/story-count/roof shape all vary too. ---- */
  function drawIsoBox(ctx, w, h, opts){
    var footW = opts.footW, wallH = opts.wallH, roofH = opts.roofH || 0;
    var wallColor = opts.wallColor, roofColor = opts.roofColor, stories = opts.stories || 1;
    var roofStyle = opts.roofStyle || 'peak';
    var halfW = footW/2, halfD = footW/2*0.58;
    var baseY = h - 6, cx = w/2;

    ellipseShadow(ctx, cx, baseY+3, footW*0.58, footW*0.22, 0.22);

    var topY = baseY - wallH;
    // left face (away from light -- darkest)
    ctx.fillStyle = shade(wallColor, -32);
    ctx.beginPath();
    ctx.moveTo(cx-halfW, baseY); ctx.lineTo(cx, baseY+halfD*0.6); ctx.lineTo(cx, topY+halfD*0.6); ctx.lineTo(cx-halfW, topY);
    ctx.closePath(); ctx.fill();
    // right face (mid tone)
    ctx.fillStyle = shade(wallColor, -8);
    ctx.beginPath();
    ctx.moveTo(cx+halfW, baseY); ctx.lineTo(cx, baseY+halfD*0.6); ctx.lineTo(cx, topY+halfD*0.6); ctx.lineTo(cx+halfW, topY);
    ctx.closePath(); ctx.fill();
    // front face (brightest, faces the camera)
    ctx.fillStyle = shade(wallColor, 16);
    ctx.beginPath();
    ctx.moveTo(cx-halfW, topY); ctx.lineTo(cx, topY-halfD); ctx.lineTo(cx+halfW, topY); ctx.lineTo(cx, topY+halfD*0.6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = Math.max(1, w*0.012); ctx.stroke();

    if(stories > 1){
      ctx.strokeStyle = 'rgba(0,0,0,0.13)'; ctx.lineWidth = Math.max(1, w*0.01);
      var storyH = wallH/stories;
      for(var st=1; st<stories; st++){
        var yy = baseY - storyH*st;
        ctx.beginPath(); ctx.moveTo(cx-halfW,yy); ctx.lineTo(cx,yy+halfD*0.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx+halfW,yy); ctx.lineTo(cx,yy+halfD*0.6); ctx.stroke();
      }
    }

    drawFaceWindows(ctx, cx, baseY, halfW, halfD, wallH, stories, -1, opts.winColor);
    drawFaceWindows(ctx, cx, baseY, halfW, halfD, wallH, stories, 1, opts.winColor);

    if(roofStyle === 'flat'){
      var parapet = Math.max(8, wallH*0.13);
      ctx.fillStyle = shade(wallColor, -28);
      ctx.beginPath();
      ctx.moveTo(cx-halfW, topY); ctx.lineTo(cx, topY+halfD*0.6); ctx.lineTo(cx, topY-parapet+halfD*0.6); ctx.lineTo(cx-halfW, topY-parapet);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(wallColor, -4);
      ctx.beginPath();
      ctx.moveTo(cx+halfW, topY); ctx.lineTo(cx, topY+halfD*0.6); ctx.lineTo(cx, topY-parapet+halfD*0.6); ctx.lineTo(cx+halfW, topY-parapet);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(roofColor, 18);
      ctx.beginPath();
      ctx.moveTo(cx-halfW, topY-parapet); ctx.lineTo(cx, topY-parapet-halfD); ctx.lineTo(cx+halfW, topY-parapet); ctx.lineTo(cx, topY-parapet+halfD);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = Math.max(1, w*0.012); ctx.stroke();
      var roofApex = topY - parapet - halfD*0.5;
    } else {
      var apexY = topY - halfD - roofH;
      ctx.fillStyle = shade(roofColor, -14);
      ctx.beginPath(); ctx.moveTo(cx-halfW, topY); ctx.lineTo(cx, apexY); ctx.lineTo(cx, topY-halfD*0.02); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(roofColor, 10);
      ctx.beginPath(); ctx.moveTo(cx+halfW, topY); ctx.lineTo(cx, apexY); ctx.lineTo(cx, topY-halfD*0.02); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(roofColor, 28);
      ctx.beginPath(); ctx.moveTo(cx-halfW, topY); ctx.lineTo(cx, topY-halfD); ctx.lineTo(cx+halfW, topY); ctx.lineTo(cx, apexY); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = Math.max(1, w*0.012); ctx.stroke();
      roofApex = apexY;
    }

    // door, centered on the front face
    var doorW = footW*0.16, doorH = Math.min(wallH*0.34, 22);
    ctx.fillStyle = 'rgba(58,36,20,0.92)';
    ctx.fillRect(cx-doorW/2, baseY-2-doorH, doorW, doorH);

    if(opts.accent) opts.accent(ctx, cx, topY, roofApex, halfW, halfD, w, h);
  }

  function drawFaceWindows(ctx, cx, baseY, halfW, halfD, wallH, stories, sign, winColor){
    ctx.fillStyle = winColor || 'rgba(255,244,205,0.95)';
    ctx.strokeStyle = 'rgba(70,50,20,0.45)'; ctx.lineWidth = 1;
    var storyH = wallH/stories;
    for(var s=0; s<stories; s++){
      var y0 = baseY - storyH*s - storyH*0.64;
      for(var i=0;i<2;i++){
        var t = (i+0.5)/2;
        var px = sign*halfW*(1-t);
        var py = y0 - halfD*0.6*(1-t);
        var ww = Math.max(4, halfW*0.18), wh = Math.max(5, storyH*0.32);
        ctx.save(); ctx.translate(cx+px, py);
        ctx.beginPath(); ctx.rect(-ww/2,-wh/2,ww,wh); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    }
  }

  /* ---- accents that make the 5 named charity buildings read as distinct, purposeful places
     rather than recolors of the generic archetypes. ---- */
  function accentCross(ctx, cx, topY, apex, halfW){
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 3; ctx.lineCap='round';
    var fx = cx+halfW*0.15, fy = apex-6;
    ctx.beginPath(); ctx.moveTo(fx-5,fy); ctx.lineTo(fx+5,fy); ctx.moveTo(fx,fy-5); ctx.lineTo(fx,fy+5); ctx.stroke();
  }
  function accentHeart(ctx, cx, topY, apex, halfW, halfD, w, h){
    ctx.fillStyle = '#c0392b';
    var hx = cx, hy = topY - halfD - 4, s = 4.4;
    ctx.beginPath();
    ctx.moveTo(hx, hy+s*0.7);
    ctx.bezierCurveTo(hx-s*1.3, hy-s*0.6, hx-s*0.4, hy-s*1.4, hx, hy-s*0.4);
    ctx.bezierCurveTo(hx+s*0.4, hy-s*1.4, hx+s*1.3, hy-s*0.6, hx, hy+s*0.7);
    ctx.fill();
  }
  function accentPennant(ctx, cx, topY, apex){
    ctx.strokeStyle = PALETTE.inkDim; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(cx, apex); ctx.lineTo(cx, apex-14); ctx.stroke();
    ctx.fillStyle = PALETTE.coral;
    ctx.beginPath(); ctx.moveTo(cx, apex-14); ctx.lineTo(cx+9, apex-10); ctx.lineTo(cx, apex-6); ctx.closePath(); ctx.fill();
  }
  function accentBench(ctx, cx, topY, apex, halfW, halfD, w, h){
    var by = h-8, bx = cx-halfW-6;
    ctx.strokeStyle = '#6b4a28'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx-6,by); ctx.lineTo(bx+6,by); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx-5,by); ctx.lineTo(bx-5,by+5); ctx.moveTo(bx+5,by); ctx.lineTo(bx+5,by+5); ctx.stroke();
  }
  function accentFlowerbox(ctx, cx, topY, apex, halfW, halfD, w, h){
    var fy = topY + halfD*0.15;
    for(var i=-1;i<=1;i+=2){
      ctx.fillStyle = '#7a9c5a';
      ctx.beginPath(); ctx.arc(cx+i*halfW*0.5, fy, 3, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#d8607a';
      ctx.beginPath(); ctx.arc(cx+i*halfW*0.5-2, fy-2, 1.6, 0, Math.PI*2); ctx.arc(cx+i*halfW*0.5+2, fy-2, 1.6, 0, Math.PI*2); ctx.fill();
    }
  }

  /* ---- tree, lamppost ---- */
  function drawTree(ctx, w, h, opts){
    var round = !opts || opts.shape !== 'slim';
    var cx = w/2, baseY = h-4;
    ellipseShadow(ctx, cx, baseY, w*0.32, w*0.12, 0.22);
    ctx.fillStyle = '#6b4a28'; ctx.fillRect(cx-w*0.045, baseY-h*0.32, w*0.09, h*0.32);
    var leafColor = (opts && opts.color) || PALETTE.leaf;
    if(round){
      [[-w*0.16,-0.62,0.24],[w*0.14,-0.7,0.22],[0,-0.86,0.28]].forEach(function(c){
        var g = ctx.createRadialGradient(cx+c[0]-w*c[2]*0.3, baseY+h*c[1]-w*c[2]*0.3, w*c[2]*0.2, cx+c[0], baseY+h*c[1], w*c[2]);
        g.addColorStop(0, shade(leafColor,26)); g.addColorStop(1, shade(leafColor,-10));
        ctx.beginPath(); ctx.arc(cx+c[0], baseY+h*c[1], w*c[2], 0, Math.PI*2); ctx.fillStyle = g; ctx.fill();
      });
    } else {
      ctx.beginPath();
      ctx.moveTo(cx, baseY-h*0.98); ctx.lineTo(cx+w*0.32, baseY-h*0.34); ctx.lineTo(cx-w*0.32, baseY-h*0.34);
      ctx.closePath();
      var g2 = ctx.createLinearGradient(0, baseY-h, 0, baseY-h*0.34);
      g2.addColorStop(0, shade(leafColor,20)); g2.addColorStop(1, shade(leafColor,-14));
      ctx.fillStyle = g2; ctx.fill();
    }
  }
  function drawLamp(ctx, w, h){
    var cx = w*0.5, baseY = h-4;
    ellipseShadow(ctx, cx, baseY, w*0.14, w*0.06, 0.2);
    ctx.fillStyle = '#3c3c3c'; ctx.fillRect(cx-1.4, baseY-h*0.92, 2.8, h*0.9);
    ctx.beginPath(); ctx.arc(cx, baseY-h*0.94, w*0.11, 0, Math.PI*2); ctx.fillStyle = '#ffe9a8'; ctx.fill();
    ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(cx, baseY-h*0.94, w*0.4, 0, Math.PI*2); ctx.fill(); ctx.restore();
  }

  /* ---- ambient life: people, pets, a small iso car ---- */
  function drawPerson(ctx, w, h, clothing, skin){
    var cx = w/2, groundY = h*0.97;
    ellipseShadow(ctx, cx, groundY, w*0.36, h*0.05, 0.22);
    ctx.fillStyle = '#2b2b3a';
    ctx.fillRect(cx-w*0.16, h*0.7, w*0.13, h*0.24); ctx.fillRect(cx+w*0.03, h*0.7, w*0.13, h*0.24);
    ctx.fillStyle = clothing;
    ctx.beginPath();
    var rw=w*0.28, rh=h*0.4, rx=cx-rw, ry=h*0.34, rr=w*0.16;
    ctx.moveTo(rx+rr,ry); ctx.lineTo(rx+2*rw-rr,ry); ctx.arcTo(rx+2*rw,ry,rx+2*rw,ry+rr,rr);
    ctx.lineTo(rx+2*rw,ry+rh-rr); ctx.arcTo(rx+2*rw,ry+rh,rx+2*rw-rr,ry+rh,rr);
    ctx.lineTo(rx+rr,ry+rh); ctx.arcTo(rx,ry+rh,rx,ry+rh-rr,rr);
    ctx.lineTo(rx,ry+rr); ctx.arcTo(rx,ry,rx+rr,ry,rr); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, h*0.2, w*0.24, 0, Math.PI*2); ctx.fillStyle = skin; ctx.fill();
    ctx.strokeStyle = 'rgba(35,48,32,0.25)'; ctx.lineWidth = Math.max(0.6, w*0.02); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, h*0.15, w*0.25, Math.PI, Math.PI*2); ctx.fillStyle = PALETTE.ink; ctx.fill();
  }
  function drawDogCat(ctx, w, h, isCat){
    var cx = w/2, groundY = h*0.9, clr = isCat ? '#9098a0' : '#8a6a4a';
    ellipseShadow(ctx, cx, groundY, w*0.42, h*0.1, 0.2);
    ctx.fillStyle = clr;
    ctx.beginPath(); ctx.ellipse(cx, h*0.58, w*0.42, h*0.26, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx+w*0.34, h*0.42, w*0.18, 0, Math.PI*2); ctx.fill();
    ctx.beginPath();
    if(isCat){ ctx.moveTo(cx+w*0.24,h*0.3); ctx.lineTo(cx+w*0.3,h*0.14); ctx.lineTo(cx+w*0.38,h*0.28); }
    else { ctx.moveTo(cx+w*0.24,h*0.34); ctx.lineTo(cx+w*0.2,h*0.16); ctx.lineTo(cx+w*0.36,h*0.28); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = clr; ctx.lineWidth = Math.max(1.4, w*0.06); ctx.lineCap = 'round';
    ctx.beginPath();
    if(isCat){ ctx.moveTo(cx-w*0.3,h*0.6); ctx.quadraticCurveTo(cx-w*0.5,h*0.32,cx-w*0.36,h*0.14); }
    else { ctx.moveTo(cx-w*0.34,h*0.62); ctx.quadraticCurveTo(cx-w*0.5,h*0.5,cx-w*0.46,h*0.36); }
    ctx.stroke();
  }
  function drawCar(ctx, w, h, color){
    var cy = h*0.6;
    ellipseShadow(ctx, w*0.5, h*0.94, w*0.46, h*0.1, 0.24);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(w*0.06,cy+h*0.24); ctx.lineTo(w*0.16,cy-h*0.16); ctx.lineTo(w*0.84,cy-h*0.16); ctx.lineTo(w*0.94,cy+h*0.24);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(color,-26); ctx.fillRect(w*0.06, cy+h*0.14, w*0.88, h*0.1);
    ctx.fillStyle = '#bcdff5';
    ctx.beginPath(); ctx.moveTo(w*0.28,cy-h*0.14); ctx.lineTo(w*0.34,cy-h*0.32); ctx.lineTo(w*0.66,cy-h*0.32); ctx.lineTo(w*0.72,cy-h*0.14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(w*0.24,cy+h*0.28,h*0.11,0,Math.PI*2); ctx.arc(w*0.76,cy+h*0.28,h*0.11,0,Math.PI*2); ctx.fill();
  }

  /* ---- sea life: gulls -- the "big, alive sea" the waterfront now has real room for (WATER_ROWS
     widened in city-geometry.js). The old procedurally-drawn ferry/tanker/surfer sprites (a
     placeholder look, never matching the purchased hand-painted asset packs used everywhere else
     on the water) were removed per explicit request -- the real hand-painted rowboat/fisherman
     asset (realImageSlot('boat_rowboat_01', ...) below) is what represents small watercraft now.
     Gulls fly above the whole scene and are drawn in their own always-on-top pass by
     city-renderer.js, never depth-sorted with ground objects. ---- */
  function drawSeagull(ctx, w, h, opts){
    var flap = (opts && opts.flap) || 0; // -1..1, subtle wing angle variation across baked variants
    var cy = h*0.55;
    ctx.strokeStyle = '#5b6a4f'; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.2, w*0.08);
    ctx.beginPath();
    ctx.moveTo(w*0.05, cy+h*0.12*flap);
    ctx.quadraticCurveTo(w*0.28, cy-h*0.32, w*0.5, cy);
    ctx.quadraticCurveTo(w*0.72, cy-h*0.32, w*0.95, cy+h*0.12*flap);
    ctx.stroke();
  }

  var CAR_COLORS = [PALETTE.coral, PALETTE.blue, PALETTE.gold, '#8b6bf0', PALETTE.leaf];
  var SKIN_TONES = ['#f1c8a0', '#c98f5e', '#8a5a3a', '#e8b48a'];
  var CLOTHING_TONES = [PALETTE.leaf, PALETTE.blue, PALETTE.coral, PALETTE.gold, '#8b6bf0'];

  /* ---- named-slot manifest: category + world-space footprint (content units) + anchor + a
     draw(ctx, w, h, opts) function authored in a top-left-origin w x h box. Building sizes are
     generous vertically (headroom above the tile) since they're drawn as extruded iso boxes. ---- */
  var ASSET_MANIFEST = {
    plot_empty_01: { category:'plot', anchor:'bottom-center', size:{w:70, h:70}, draw:drawEmptyLot },

    building_house_01: { category:'building', anchor:'bottom-center', size:{w:80, h:150},
      draw:function(ctx,w,h){ drawIsoBox(ctx,w,h,{footW:56,wallH:34,roofH:24,wallColor:'#e7cf9e',roofColor:'#9c3d31'}); } },
    building_house_02: { category:'building', anchor:'bottom-center', size:{w:80, h:150},
      draw:function(ctx,w,h){ drawIsoBox(ctx,w,h,{footW:56,wallH:36,roofH:20,wallColor:'#cdd8c6',roofColor:'#5c6f4a'}); } },
    building_house_03: { category:'building', anchor:'bottom-center', size:{w:80, h:150},
      draw:function(ctx,w,h){ drawIsoBox(ctx,w,h,{footW:54,wallH:32,roofH:26,wallColor:'#f2d3c2',roofColor:'#3f7a3f',winColor:'#dff3ff',accent:accentPennant}); } },
    building_apt_01: { category:'building', anchor:'bottom-center', size:{w:88, h:190},
      draw:function(ctx,w,h){ drawIsoBox(ctx,w,h,{footW:64,wallH:78,roofH:0,roofStyle:'flat',stories:2,wallColor:'#d7a9a0',roofColor:'#8a5a50'}); } },

    building_charity_needyhome: { category:'building', anchor:'bottom-center', size:{w:80, h:150},
      draw:function(ctx,w,h){ drawIsoBox(ctx,w,h,{footW:56,wallH:32,roofH:22,wallColor:'#f1dfab',roofColor:'#7a6a4a',accent:accentHeart}); } },
    building_charity_senior: { category:'building', anchor:'bottom-center', size:{w:84, h:160},
      draw:function(ctx,w,h){ drawIsoBox(ctx,w,h,{footW:60,wallH:40,roofH:18,wallColor:'#dbe9f3',roofColor:'#5a5a8a',accent:accentBench}); } },
    building_charity_orphan: { category:'building', anchor:'bottom-center', size:{w:80, h:150},
      draw:function(ctx,w,h){ drawIsoBox(ctx,w,h,{footW:56,wallH:30,roofH:26,wallColor:'#fbe3b0',roofColor:'#3f9a5a',winColor:'#fff7d8',accent:accentPennant}); } },
    building_charity_hospital: { category:'building', anchor:'bottom-center', size:{w:92, h:200},
      draw:function(ctx,w,h){ drawIsoBox(ctx,w,h,{footW:66,wallH:88,roofH:0,roofStyle:'flat',stories:2,wallColor:'#f3f2ea',roofColor:'#c9c6ba',winColor:'#cdeaf7',accent:accentCross}); } },
    building_charity_hospice: { category:'building', anchor:'bottom-center', size:{w:84, h:160},
      draw:function(ctx,w,h){ drawIsoBox(ctx,w,h,{footW:60,wallH:38,roofH:16,wallColor:'#e6dcf5',roofColor:'#6a4f7e',accent:accentFlowerbox}); } },

    building_generic_01: { category:'building', anchor:'bottom-center', size:{w:80, h:150},
      draw:function(ctx,w,h,opts){ drawIsoBox(ctx,w,h,{footW:56,wallH:34,roofH:0,roofStyle:'flat',wallColor:'#d8c39a',roofColor:'#8a6a44'}); if(opts&&opts.glyph) stampGlyph(ctx,w,h,opts.glyph); } },
    building_generic_care: { category:'building', anchor:'bottom-center', size:{w:80, h:150},
      draw:function(ctx,w,h,opts){ drawIsoBox(ctx,w,h,{footW:56,wallH:34,roofH:20,wallColor:'#f2d3c2',roofColor:'#a94e34'}); if(opts&&opts.glyph) stampGlyph(ctx,w,h,opts.glyph); } },
    building_generic_culture: { category:'building', anchor:'bottom-center', size:{w:80, h:150},
      draw:function(ctx,w,h,opts){ drawIsoBox(ctx,w,h,{footW:56,wallH:34,roofH:20,wallColor:'#e6dcf5',roofColor:'#6a4f9e'}); if(opts&&opts.glyph) stampGlyph(ctx,w,h,opts.glyph); } },
    building_generic_food: { category:'building', anchor:'bottom-center', size:{w:80, h:150},
      draw:function(ctx,w,h,opts){ drawIsoBox(ctx,w,h,{footW:56,wallH:32,roofH:18,wallColor:'#dcefd4',roofColor:'#3f7a3f'}); if(opts&&opts.glyph) stampGlyph(ctx,w,h,opts.glyph); } },
    building_generic_shop: { category:'building', anchor:'bottom-center', size:{w:80, h:150},
      draw:function(ctx,w,h,opts){ drawIsoBox(ctx,w,h,{footW:56,wallH:34,roofH:0,roofStyle:'flat',wallColor:'#dbe9f3',roofColor:'#2e6fa0'}); if(opts&&opts.glyph) stampGlyph(ctx,w,h,opts.glyph); } },

    tree_01: { category:'decoration', anchor:'bottom-center', size:{w:34, h:56}, draw:function(ctx,w,h){ drawTree(ctx,w,h,{shape:'round'}); } },
    tree_02: { category:'decoration', anchor:'bottom-center', size:{w:26, h:48}, draw:function(ctx,w,h){ drawTree(ctx,w,h,{shape:'slim', color:'#4c7a34'}); } },
    lamp_01: { category:'decoration', anchor:'bottom-center', size:{w:14, h:46}, draw:drawLamp },

    npc_01: { category:'npc', anchor:'bottom-center', size:{w:15, h:26}, draw:function(ctx,w,h){ drawPerson(ctx,w,h,CLOTHING_TONES[0],SKIN_TONES[0]); } },
    npc_02: { category:'npc', anchor:'bottom-center', size:{w:15, h:26}, draw:function(ctx,w,h){ drawPerson(ctx,w,h,CLOTHING_TONES[1],SKIN_TONES[1]); } },
    npc_03: { category:'npc', anchor:'bottom-center', size:{w:15, h:26}, draw:function(ctx,w,h){ drawPerson(ctx,w,h,CLOTHING_TONES[2],SKIN_TONES[2]); } },
    npc_04: { category:'npc', anchor:'bottom-center', size:{w:15, h:26}, draw:function(ctx,w,h){ drawPerson(ctx,w,h,CLOTHING_TONES[3],SKIN_TONES[3]); } },
    npc_05: { category:'npc', anchor:'bottom-center', size:{w:15, h:26}, draw:function(ctx,w,h){ drawPerson(ctx,w,h,CLOTHING_TONES[4],SKIN_TONES[0]); } },

    dog_01: { category:'animal', anchor:'bottom-center', size:{w:17, h:13}, draw:function(ctx,w,h){ drawDogCat(ctx,w,h,false); } },
    cat_01: { category:'animal', anchor:'bottom-center', size:{w:16, h:12}, draw:function(ctx,w,h){ drawDogCat(ctx,w,h,true); } },

    car_01: { category:'vehicle', anchor:'center', size:{w:34, h:20}, draw:function(ctx,w,h){ drawCar(ctx,w,h,CAR_COLORS[0]); } },
    car_02: { category:'vehicle', anchor:'center', size:{w:34, h:20}, draw:function(ctx,w,h){ drawCar(ctx,w,h,CAR_COLORS[1]); } },
    car_03: { category:'vehicle', anchor:'center', size:{w:34, h:20}, draw:function(ctx,w,h){ drawCar(ctx,w,h,CAR_COLORS[2]); } },

    seagull_01: { category:'sky', anchor:'center', size:{w:20, h:12}, draw:function(ctx,w,h){ drawSeagull(ctx,w,h,{flap:1}); } },
    seagull_02: { category:'sky', anchor:'center', size:{w:20, h:12}, draw:function(ctx,w,h){ drawSeagull(ctx,w,h,{flap:-0.4}); } }
  };

  // item 9: these procedural drawIsoBox placeholders are the pre-real-art fallback for the
  // 'building' category (dead path today -- every catalog key already resolves to real art via
  // REAL_ART_SLOT/NAMED_CHARITY_SLOT below -- but kept correct in case a future building type
  // ships without bespoke art yet). Doubled in step with REAL_ART_SIZES so a fallback building
  // still reads as the same 2x2 footprint size as every real one, not a mismatched 1x1.
  Object.keys(ASSET_MANIFEST).forEach(function(k){
    var e = ASSET_MANIFEST[k];
    if(e.category === 'building'){ e.size = {w: e.size.w*2, h: e.size.h*2}; }
  });

  /* ---- real hand-painted buildings (purchased asset pack) ------------------------------------
     Drop-in raster art for the 13 catalog buildings, replacing the procedural drawIsoBox for
     these slots. Confirmed via pixel measurement (well/fence ellipse ratio ~2:1) that the pack's
     projection matches our TW/TH=84/42 dimetric exactly, so images are placed with a plain
     uniform scale -- no shear/stretch needed. Images are trimmed to their alpha bounding box
     ahead of time (see /assets/buildings/*.png) so the trimmed bottom edge IS the ground-contact
     line: with anchor:'bottom-center' that lines up with plotAnchor() the same way the procedural
     boxes' baseY did. Loaded lazily via plain Image() -- bakeOne() below tolerates a not-yet-
     loaded image (draws nothing that frame) and the cache entry for that slot is dropped once the
     image finishes loading so the next frame's blit() re-bakes it for real; the renderer's
     continuous rAF loop means this just looks like the building "arriving" a frame or two after
     the scene first mounts, no promise/preload plumbing required. ---- */
  var IMG_BASE = 'assets/buildings/';
  var _imgCache = {};
  var _realSlotFile = {}; // slot name -> source file, so the onload cache-bust below can find it
  function loadImg(file, base){
    var key = (base||IMG_BASE) + file;
    var img = _imgCache[key];
    if(img) return img;
    img = new Image();
    img.onload = function(){
      // the slot(s) referencing this file were baked blank (or not at all) before it loaded --
      // drop any cached bake keyed to this file's slot names so the next blit() re-bakes with
      // the real pixels now available.
      Object.keys(_cache).forEach(function(k){ if(_realSlotFile[k] === key) delete _cache[k]; });
    };
    img.src = key;
    _imgCache[key] = img;
    return img;
  }

  function drawRealBuilding(ctx, w, h, file, accent){
    var img = loadImg(file);
    if(img.complete && img.naturalWidth) ctx.drawImage(img, 0, 0, w, h);
    // accent icons were authored against drawIsoBox's (topY, apex, halfW, halfD) box coordinates;
    // approximate the same landmarks against the trimmed real-art image's own w x h box (roof
    // peak sits at the very top, walls start roughly a quarter of the way down, half-width is
    // about a third of the full (fence-inclusive) sprite width).
    if(accent) accent(ctx, w*0.5, h*0.22, h*0.02, w*0.32, h*0.06, w, h);
  }

  function realBuildingSlot(name, file, accent){
    _realSlotFile[name] = IMG_BASE + file;
    ASSET_MANIFEST[name] = { category:'building', anchor:'bottom-center',
      size: REAL_ART_SIZES[name],
      draw: function(ctx,w,h){ drawRealBuilding(ctx,w,h,file,accent); } };
  }

  /* ---- generic raster sprite registration (Nano Banana generations: trees, people, landmarks,
     boats, carts) -- same lazy-load/re-bake-on-arrival pattern as realBuildingSlot above, just not
     hardcoded to the 'building' category/IMG_BASE/REAL_ART_SIZES the way that one is. Sizes below
     are a first-pass estimate (aspect ratio from the actual cropped art, times a target on-screen
     height chosen to sit sensibly against the existing building/tile scale) -- not yet checked
     against a live render on a real device the way the building pack's 0.155 scale factor was, so
     treat these as a starting point worth eyeballing in-game and adjusting if anything reads too
     big/small next to a building or a walking NPC. */
  function drawRealImage(ctx, w, h, file, base){
    var img = loadImg(file, base);
    if(img.complete && img.naturalWidth) ctx.drawImage(img, 0, 0, w, h);
  }
  function realImageSlot(name, file, base, category, anchor, size){
    _realSlotFile[name] = base + file;
    ASSET_MANIFEST[name] = { category: category, anchor: anchor || 'bottom-center', size: size,
      draw: function(ctx,w,h){ drawRealImage(ctx,w,h,file,base); } };
  }

  var TREES_BASE = 'assets/trees/', PEOPLE_BASE = 'assets/people/', LANDMARKS_BASE = 'assets/landmarks/',
      BOATS_BASE = 'assets/boats/', VEHICLES_BASE = 'assets/vehicles/', GROUND_BASE = 'assets/ground/';

  // height chosen per species (aspect ratio comes from the source crop) -- poplar/spruce/birch are
  // tall and slender, the apple bloom and old bare tree read wider, the willow's little pond base
  // wants to sit lower/wider than a plain trunk-and-canopy tree.
  realImageSlot('tree_apple_01', 'tree_apple.png', TREES_BASE, 'decoration', 'bottom-center', {w:69, h:64});
  realImageSlot('tree_birch_01', 'tree_birch.png', TREES_BASE, 'decoration', 'bottom-center', {w:55, h:78});
  realImageSlot('tree_linden_01', 'tree_linden.png', TREES_BASE, 'decoration', 'bottom-center', {w:50, h:62});
  realImageSlot('tree_poplar_01', 'tree_poplar.png', TREES_BASE, 'decoration', 'bottom-center', {w:43, h:82});
  realImageSlot('tree_willow_01', 'tree_willow.png', TREES_BASE, 'decoration', 'bottom-center', {w:55, h:58});
  realImageSlot('tree_spruce_01', 'tree_spruce.png', TREES_BASE, 'decoration', 'bottom-center', {w:36, h:76});
  realImageSlot('tree_shrub_01', 'tree_shrub.png', TREES_BASE, 'decoration', 'bottom-center', {w:39, h:40});
  realImageSlot('tree_old_bare_01', 'tree_old_bare.png', TREES_BASE, 'decoration', 'bottom-center', {w:67, h:68});

  // people -- sized taller than the old flat npc_01..05 placeholders (15x26) since these carry real
  // painted detail worth actually seeing; group compositions (pram, vendor cart, fisherman's dock
  // platform) get a bit more width/height than a single standing figure.
  realImageSlot('npc_woman_fancy_01', 'npc_woman_fancy.png', PEOPLE_BASE, 'npc', 'bottom-center', {w:21, h:46});
  realImageSlot('npc_woman_peasant_01', 'npc_woman_peasant.png', PEOPLE_BASE, 'npc', 'bottom-center', {w:16, h:44});
  realImageSlot('npc_man_suit_01', 'npc_man_suit.png', PEOPLE_BASE, 'npc', 'bottom-center', {w:25, h:46});
  realImageSlot('npc_man_worker_01', 'npc_man_worker.png', PEOPLE_BASE, 'npc', 'bottom-center', {w:35, h:46});
  realImageSlot('npc_elder_man_01', 'npc_elder_man.png', PEOPLE_BASE, 'npc', 'bottom-center', {w:29, h:48});
  realImageSlot('npc_elder_woman_01', 'npc_elder_woman.png', PEOPLE_BASE, 'npc', 'bottom-center', {w:31, h:46});
  realImageSlot('npc_mother_pram_01', 'npc_mother_pram1.png', PEOPLE_BASE, 'npc', 'bottom-center', {w:45, h:50});
  realImageSlot('npc_mother_pram_02', 'npc_mother_pram2.png', PEOPLE_BASE, 'npc', 'bottom-center', {w:45, h:50});
  realImageSlot('npc_vendor_01', 'npc_vendor.png', PEOPLE_BASE, 'npc', 'bottom-center', {w:56, h:54});
  realImageSlot('npc_newsboy_01', 'npc_newsboy.png', PEOPLE_BASE, 'npc', 'bottom-center', {w:27, h:42});
  realImageSlot('npc_fisherman_01', 'npc_fisherman.png', PEOPLE_BASE, 'npc', 'bottom-center', {w:42, h:50});

  // one-off landmarks -- sized closer to the real-art building scale (REAL_ART_SIZES above runs
  // roughly 65-90 wide, 40-80 tall) since these ARE building-scale structures, not street props.
  realImageSlot('landmark_fountain_01', 'landmark_fountain.png', LANDMARKS_BASE, 'landmark', 'bottom-center', {w:56, h:46});
  realImageSlot('landmark_crane_01', 'landmark_crane.png', LANDMARKS_BASE, 'landmark', 'bottom-center', {w:71, h:100});
  realImageSlot('landmark_greengate_01', 'landmark_greengate.png', LANDMARKS_BASE, 'landmark', 'bottom-center', {w:97, h:78});

  realImageSlot('boat_rowboat_01', 'boat_rowboat.png', BOATS_BASE, 'vessel', 'center', {w:52, h:40});
  realImageSlot('cart_horse_01', 'cart_horse.png', VEHICLES_BASE, 'vehicle', 'center', {w:44, h:38});

  // ambient-transport variety: more horse-cart/vintage-car looks for the road, more rowboat looks
  // plus one larger, rarer houseboat for the water -- sizes keep the same per-category footprint as
  // the _01 slots above (proportioned to each cleaned image's own aspect ratio), except the houseboat
  // which is deliberately ~1.5x bigger since it's a much larger vessel than a rowboat.
  realImageSlot('cart_horse_02', 'cart_horse_02.png', VEHICLES_BASE, 'vehicle', 'center', {w:46, h:41});
  realImageSlot('car_vintage_01', 'car_vintage_01.png', VEHICLES_BASE, 'vehicle', 'center', {w:46, h:38});
  realImageSlot('boat_rowboat_02', 'boat_rowboat_02.png', BOATS_BASE, 'vessel', 'center', {w:52, h:40});
  realImageSlot('boat_rowboat_03', 'boat_rowboat_03.png', BOATS_BASE, 'vessel', 'center', {w:52, h:36});
  realImageSlot('boat_rowboat_04', 'boat_rowboat_04.png', BOATS_BASE, 'vessel', 'center', {w:52, h:36});
  realImageSlot('boat_houseboat_01', 'boat_houseboat_01.png', BOATS_BASE, 'vessel', 'center', {w:78, h:64});

  /* ground-texture variants for drawPlotGroundTile()'s occasional-real-photo tiles (see below) --
     these aren't ASSET_MANIFEST/blit() sprites (ground is drawn raw per-tile every frame, not
     baked-and-cached like an anchored sprite), just plain lazy-loaded images referenced directly. */
  var GROUND_VARIANT_FILES = ['ground_meadow.png', 'ground_grass_rocks.png'];

  /* ---- purchased "Top down sea level creator set": the shoreline foam-wave animation (18 real
     frames) is the one piece of that pack that drops in directly -- the water/sand/island pieces
     are Wang-style autotile atlases meant for that pack's own level editor (GDS), not individual
     sprites, so the game keeps its existing procedural water/sand tiles (already colour-matched
     to the building pack) and gets its "живое море" upgrade from this animated foam line instead,
     blitted along the water/promenade edge by water-life.js. Frames are near-white/translucent
     with no strong colour cast, so they blend over any water tone with no recolouring needed. ---- */
  var SEA_BASE = 'assets/sea/';
  var WAVE_FRAME_SIZE = { w: 109, h: 83.7 }; // pack canvas is 560x430 px, scaled ~0.195 to tile units
  for(var wf=1; wf<=18; wf++){
    (function(n){
      var slot = 'wave_' + (n<10?'0'+n:n);
      var file = 'wave_' + (n<10?'0'+n:n) + '.png';
      _realSlotFile[slot] = SEA_BASE + file;
      ASSET_MANIFEST[slot] = { category:'effect', anchor:'bottom-center', size: WAVE_FRAME_SIZE,
        draw: function(ctx,w,h){
          var img = loadImg(file, SEA_BASE);
          if(img.complete && img.naturalWidth) ctx.drawImage(img, 0, 0, w, h);
        } };
    })(wf);
  }

  // world-space size per file (world units = source px * 0.155). First pass used 0.22 (targeting
  // ~1.2-1.4x tile width like the procedural boxes did) but a live render showed it was much too
  // large: unlike the old boxes, these images each carry their OWN painted yard/fence, so two
  // adjacent plots' fences were overlapping and reading as visual noise, and buildings were wide
  // enough to bridge clean across the street gap between blocks. 0.155 keeps a building's full
  // footprint (house + its yard) close to one tile step (TW=84) so blocks/streets stay legible.
  var REAL_ART_SIZES = {
    real_cottage_01:{w:68.7,h:47.3}, real_cottage_02:{w:79.4,h:51.6}, real_cottage_03:{w:74.4,h:47.6}, real_cottage_04:{w:72.7,h:43.7},
    real_townhouse_01:{w:72.7,h:62.2}, real_townhouse_02:{w:78.1,h:56.0}, real_townhouse_03:{w:78.7,h:55.5}, real_townhouse_04:{w:78.7,h:55.2},
    real_mansion_01:{w:79.4,h:76.0}, real_mansion_02:{w:79.2,h:71.9},
    real_townhall_01:{w:78.9,h:69.6}, real_townhall_02:{w:77.0,h:66.3},
    real_inn_01:{w:74.9,h:64.2}, real_inn_02:{w:74.7,h:58.9},
    real_guildhouse_01:{w:73.3,h:78.0}, real_guildhouse_02:{w:73.2,h:77.8},
    real_bakery_01:{w:71.5,h:65.4}, real_bakery_02:{w:76.0,h:75.0},
    real_restaurant_01:{w:71.6,h:73.0}, real_restaurant_02:{w:66.2,h:65.6},
    real_tavern_01:{w:74.1,h:78.1}, real_tavern_02:{w:77.3,h:75.8},
    real_market_01:{w:74.1,h:39.8}, real_market_02:{w:76.9,h:36.9},
    real_merchant_01:{w:76.0,h:62.5}, real_merchant_02:{w:72.7,h:63.4},
    real_alchemy_01:{w:75.8,h:73.5}, real_alchemy_02:{w:73.9,h:64.6},
    real_church_01:{w:73.5,h:78.7}, real_church_02:{w:74.4,h:76.0},
    real_blacksmith_01:{w:67.3,h:53.5}, real_blacksmith_02:{w:67.3,h:42.5},
    real_woodwork_01:{w:70.7,h:69.9}, real_woodwork_02:{w:74.1,h:65.9},
    real_shieldshop_01:{w:63.5,h:47.7}, real_shieldshop_02:{w:63.2,h:46.2},
    real_weaponsmith_01:{w:77.0,h:68.2}, real_weaponsmith_02:{w:72.5,h:57.4},
    real_flowershop_01:{w:73.9,h:77.7}, real_flowershop_02:{w:72.5,h:66.0}
  };

  /* ---- item 9: buildings occupy a 2x2 footprint on the grid now (see placementDenyReason/
     buildingFootprintCells in index.html), not 1 tile. The anchor point stays the SAME single
     (col,row) tap point -- it's the FRONT corner of the 2x2 block, and since every tile's own
     center-to-center spacing already equals TW/TH, a 2x2 footprint's overall diamond is exactly
     2x as wide and 2x as tall as a 1x1 one, with its frontmost/bottom point unchanged (see the
     placement-logic comment for the geometry). So the only rendering change a 2x2 footprint
     needs is doubling the sprite's own on-screen size -- anchor math, depth-sort, everything
     else in city-renderer.js/city-geometry.js is untouched. People/animals/decor are NOT sized
     relative to buildings (their sizes are separate fixed entries above/below), so this scale-up
     does not drag them along -- that was the whole point of the ask (house grows, people don't). */
  var BUILDING_FOOTPRINT_SCALE = 2;
  Object.keys(REAL_ART_SIZES).forEach(function(k){
    REAL_ART_SIZES[k] = { w: REAL_ART_SIZES[k].w * BUILDING_FOOTPRINT_SCALE, h: REAL_ART_SIZES[k].h * BUILDING_FOOTPRINT_SCALE };
  });

  realBuildingSlot('real_cottage_01', 'cottage_01.png', accentHeart);
  realBuildingSlot('real_cottage_04', 'cottage_04.png', accentHeart);
  realBuildingSlot('real_cottage_02', 'cottage_02.png', null);
  realBuildingSlot('real_cottage_03', 'cottage_03.png', null);
  realBuildingSlot('real_townhouse_01', 'townhouse_01.png', accentPennant);
  realBuildingSlot('real_townhouse_02', 'townhouse_02.png', accentPennant);
  realBuildingSlot('real_townhouse_03', 'townhouse_03.png', accentPennant);
  realBuildingSlot('real_townhouse_04', 'townhouse_04.png', accentPennant);
  realBuildingSlot('real_mansion_01', 'mansion_01.png', accentBench);
  realBuildingSlot('real_mansion_02', 'mansion_02.png', accentBench);
  realBuildingSlot('real_townhall_01', 'townhall_01.png', accentCross);
  realBuildingSlot('real_townhall_02', 'townhall_02.png', accentCross);
  realBuildingSlot('real_inn_01', 'inn_01.png', accentFlowerbox);
  realBuildingSlot('real_inn_02', 'inn_02.png', accentFlowerbox);
  realBuildingSlot('real_guildhouse_01', 'guildhouse_01.png', null);
  realBuildingSlot('real_guildhouse_02', 'guildhouse_02.png', null);
  realBuildingSlot('real_bakery_01', 'bakery_01.png', null);
  realBuildingSlot('real_bakery_02', 'bakery_02.png', null);
  realBuildingSlot('real_restaurant_01', 'restaurant_01.png', null);
  realBuildingSlot('real_restaurant_02', 'restaurant_02.png', null);
  realBuildingSlot('real_tavern_01', 'tavern_01.png', null);
  realBuildingSlot('real_tavern_02', 'tavern_02.png', null);
  realBuildingSlot('real_market_01', 'market_01.png', null);
  realBuildingSlot('real_market_02', 'market_02.png', null);
  realBuildingSlot('real_merchant_01', 'merchant_01.png', null);
  realBuildingSlot('real_merchant_02', 'merchant_02.png', null);
  realBuildingSlot('real_alchemy_01', 'alchemy_01.png', accentCross);
  realBuildingSlot('real_alchemy_02', 'alchemy_02.png', accentCross);
  realBuildingSlot('real_church_01', 'church_01.png', accentFlowerbox);
  realBuildingSlot('real_church_02', 'church_02.png', accentFlowerbox);
  realBuildingSlot('real_blacksmith_01', 'blacksmith_01.png', null);
  realBuildingSlot('real_blacksmith_02', 'blacksmith_02.png', null);
  realBuildingSlot('real_woodwork_01', 'woodwork_01.png', null);
  realBuildingSlot('real_woodwork_02', 'woodwork_02.png', null);
  realBuildingSlot('real_shieldshop_01', 'shieldshop_01.png', null);
  realBuildingSlot('real_shieldshop_02', 'shieldshop_02.png', null);
  realBuildingSlot('real_weaponsmith_01', 'weaponsmith_01.png', null);
  realBuildingSlot('real_weaponsmith_02', 'weaponsmith_02.png', null);
  realBuildingSlot('real_flowershop_01', 'flowershop_01.png', null);
  realBuildingSlot('real_flowershop_02', 'flowershop_02.png', null);

  // catalog key -> ordered list of real-art slots; slotForBuilding() alternates between them by
  // plot index so the same building type doesn't look identical every time it's built twice in
  // one city, while staying deterministic (stable across reloads, no per-frame randomness).
  // every one of the pack's 40 images is used somewhere below -- the first 1-2 entries in each
  // list are the closest thematic fit and are what a first-time build of that type shows; extra
  // entries (church for hospice, flowershop for cafe, woodwork/blacksmith/shieldshop/weaponsmith
  // spread across shelter/mall/foodbank) exist purely so a SECOND, THIRD, etc. build of the same
  // type looks different from the first instead of repeating -- semantic fit matters less for
  // those since the accent icon (or, for the 8 non-named types, the sheer building variety) is
  // what a player actually uses to tell buildings apart, not which craft the sign originally read.
  /* One archetype of real art -> one catalog key, 1:1 -- every one of the 40 purchased building
     images now lives under a building whose name and look actually match (no more pooling
     unrelated art -- e.g. the old "foodbank" mixing merchant+shield-shop+weaponsmith, or "cafe"
     mixing bakery+flower-shop -- into one mechanical building). 18 catalog keys for 18 visual
     archetypes across the 40 files; see BUILDINGS in index.html for the 5 new keys this added
     (chapel/florist/repairshop/clothingpoint/forge) alongside the original 13. */
  var REAL_ART_SLOT = {
    needyhome: ['real_cottage_01', 'real_cottage_02', 'real_cottage_03', 'real_cottage_04'],
    senior: ['real_mansion_01', 'real_mansion_02'],
    orphan: ['real_townhouse_01', 'real_townhouse_02', 'real_townhouse_03', 'real_townhouse_04'],
    hospital: ['real_townhall_01', 'real_townhall_02'],
    hospice: ['real_inn_01', 'real_inn_02'],
    chapel: ['real_church_01', 'real_church_02'],
    shelter: ['real_woodwork_01', 'real_woodwork_02'],
    library: ['real_guildhouse_01', 'real_guildhouse_02'],
    cafe: ['real_bakery_01', 'real_bakery_02'],
    florist: ['real_flowershop_01', 'real_flowershop_02'],
    restaurant: ['real_restaurant_01', 'real_restaurant_02'],
    cinema: ['real_tavern_01', 'real_tavern_02'],
    mall: ['real_market_01', 'real_market_02'],
    repairshop: ['real_blacksmith_01', 'real_blacksmith_02'],
    foodbank: ['real_merchant_01', 'real_merchant_02'],
    clothingpoint: ['real_shieldshop_01', 'real_shieldshop_02'],
    forge: ['real_weaponsmith_01', 'real_weaponsmith_02'],
    mobileclinic: ['real_alchemy_01', 'real_alchemy_02']
  };

  function stampGlyph(ctx, w, h, glyph){
    ctx.font = Math.round(w*0.16)+'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(35,48,32,0.85)';
    ctx.fillText(glyph, w/2, h*0.34);
  }

  /* fam -> generic-building slot, used until every catalog key has bespoke art. The 5 charity
     buildings called out by name in the design brief get their own bespoke slots (below) instead
     of falling through to this. */
  var FAM_GENERIC_SLOT = {
    housing:'building_generic_01', care:'building_generic_care', culture:'building_generic_culture',
    food:'building_generic_food', shop:'building_generic_shop'
  };
  var NAMED_CHARITY_SLOT = {
    needyhome:'building_charity_needyhome', senior:'building_charity_senior',
    orphan:'building_charity_orphan', hospital:'building_charity_hospital', hospice:'building_charity_hospice'
  };

  var BAKE_SCALE = 4; // bake resolution multiplier over world-space size, for crispness when zoomed in
  var _cache = {};
  var _baked = false;

  function bakeOne(slot, cacheKey, opts){
    var entry = ASSET_MANIFEST[slot];
    if(!entry) return null;
    cacheKey = cacheKey || slot;
    var dpr = Math.min(2, (global.devicePixelRatio || 1));
    var pxW = Math.max(2, Math.round(entry.size.w * BAKE_SCALE * dpr));
    var pxH = Math.max(2, Math.round(entry.size.h * BAKE_SCALE * dpr));
    var off = document.createElement('canvas');
    off.width = pxW; off.height = pxH;
    var ctx = off.getContext('2d');
    ctx.scale(pxW/entry.size.w, pxH/entry.size.h);
    try { entry.draw(ctx, entry.size.w, entry.size.h, opts); } catch(err){ /* never let a bad sprite crash the game */ }
    var baked = { canvas: off, w: entry.size.w, h: entry.size.h, anchor: entry.anchor };
    _cache[cacheKey] = baked;
    return baked;
  }

  function bakeAll(){
    Object.keys(ASSET_MANIFEST).forEach(function(slot){ bakeOne(slot); });
    _baked = true;
  }

  function drawFromCache(ctx, baked, anchorX, anchorY, scale, flipX){
    scale = scale || 1;
    var w = baked.w*scale, h = baked.h*scale;
    var dy = baked.anchor === 'center' ? anchorY - h/2 : anchorY - h;
    if(flipX){
      ctx.save(); ctx.translate(anchorX, 0); ctx.scale(-1, 1);
      ctx.drawImage(baked.canvas, -w/2, dy, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(baked.canvas, anchorX - w/2, dy, w, h);
    }
  }

  function blit(ctx, slot, anchorX, anchorY, scale, flipX){
    var baked = _cache[slot] || bakeOne(slot);
    if(!baked) return;
    drawFromCache(ctx, baked, anchorX, anchorY, scale, flipX);
  }

  function footprint(slot){
    var entry = ASSET_MANIFEST[slot];
    return entry ? entry.size : {w:0, h:0};
  }

  function slotForBuilding(def, seed){
    if(!def) return 'building_generic_01';
    if(def.sprite && ASSET_MANIFEST[def.sprite]) return def.sprite;
    var variants = REAL_ART_SLOT[def.key];
    if(variants && variants.length){
      var idx = ((seed|0) % variants.length + variants.length) % variants.length;
      return variants[idx];
    }
    if(NAMED_CHARITY_SLOT[def.key]) return NAMED_CHARITY_SLOT[def.key];
    return FAM_GENERIC_SLOT[def.fam] || 'building_generic_01';
  }

  function blitBuilding(ctx, def, anchorX, anchorY, alpha, seed){
    if(!def){ blit(ctx, 'building_generic_01', anchorX, anchorY); return; }
    var slot = slotForBuilding(def, seed);
    var baked;
    if(slot.indexOf('building_generic') === 0){
      var cacheKey = slot + '::' + def.key;
      baked = _cache[cacheKey] || bakeOne(slot, cacheKey, {glyph: def.icon});
    } else {
      baked = _cache[slot] || bakeOne(slot);
    }
    if(!baked) return;
    if(alpha != null){ ctx.save(); ctx.globalAlpha = alpha; drawFromCache(ctx, baked, anchorX, anchorY); ctx.restore(); }
    else drawFromCache(ctx, baked, anchorX, anchorY);
  }

  /* ---- ground-texture brush tiles: cobblestone/dirt/wood, all drawn procedurally (never from a
     source photo) -- the 3 pieces of purchased reference art for these textures (cobblestone_01,
     dirt_path_01, wood_planks_01) each turned out to be a complete finished "composition" (a fan
     of cobbles radiating from one corner, a directional dirt path with grass verges on both
     sides, floorboards with fixed seam positions) rather than a uniform tileable pattern, so
     repeating any of them edge-to-edge across a painted area would show an obvious seam/repeat at
     every tile boundary (the exact problem item 6's grass-tile treatment solved for real photo
     tiles, but there's no uniform crop to extract from a directional path or a from-the-corner
     fan). Drawing these from scratch, seeded per-tile exactly like drawRoadTile/drawPlotGroundTile
     above, sidesteps the seam problem entirely -- neighbouring tiles never repeat identically, and
     there's no "wrong" crop to worry about. */
  function drawCobbleGroundTile(ctx, cx, cy, tw, th, seed){
    var rnd = mulberry32((seed||1)*2246822519 >>> 0);
    var base = ctx.createLinearGradient(cx, cy-th/2, cx, cy+th/2);
    base.addColorStop(0, '#c9a06a'); base.addColorStop(1, '#a97f4f');
    ctx.fillStyle = base; diamondPath(ctx, cx, cy, tw*1.02, th*1.02); ctx.fill();
    // scattered rounded cobblestones in a loose grid (each nudged/tinted randomly so the grid
    // itself doesn't read as a regular pattern), with a thin mortar-line stroke around each
    var tones = ['#dab88a', '#c9a06a', '#b8905a', '#e6cfa4'];
    var cols = 6, rows = 4;
    for(var gy=0; gy<rows; gy++){
      for(var gx=0; gx<cols; gx++){
        var u = (gx+0.5)/cols - 0.5, v = (gy+0.5)/rows - 0.5;
        var jitterX = (rnd()-0.5)*tw*0.05, jitterY = (rnd()-0.5)*th*0.06;
        var px = cx + u*tw*0.92 + jitterX, py = cy + v*th*0.92 + jitterY;
        var rw = tw*(0.065+rnd()*0.02), rh = th*(0.09+rnd()*0.03);
        ctx.fillStyle = tones[Math.floor(rnd()*tones.length)];
        ctx.beginPath(); ctx.ellipse(px, py, rw, rh, 0, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'rgba(90,66,38,0.35)'; ctx.lineWidth = Math.max(1, tw*0.006);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(80,58,32,0.3)'; ctx.lineWidth = Math.max(1, tw*0.01);
    diamondPath(ctx, cx, cy, tw*0.97, th*0.97); ctx.stroke();
  }
  function drawDirtGroundTile(ctx, cx, cy, tw, th, seed){
    var rnd = mulberry32((seed||1)*3266489917 >>> 0);
    var g = ctx.createLinearGradient(cx, cy-th/2, cx, cy+th/2);
    g.addColorStop(0, '#a9784a'); g.addColorStop(1, '#8a5e37');
    ctx.fillStyle = g; diamondPath(ctx, cx, cy, tw*1.02, th*1.02); ctx.fill();
    // loose cracked-earth speckling, darker and lighter patches mixed, plus a handful of small
    // pebbles -- a uniform "raw dirt" fill, unlike drawRoadTile's packed-gravel worn-track look
    for(var i=0;i<12;i++){
      var px = cx + (rnd()-0.5)*tw*0.84, py = cy + (rnd()-0.5)*th*0.84;
      var r = tw*(0.012+rnd()*0.02);
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(60,40,20,0.32)' : 'rgba(205,175,125,0.35)';
      ctx.beginPath(); ctx.ellipse(px, py, r, r*0.7, 0, 0, Math.PI*2); ctx.fill();
    }
    for(var j=0;j<4;j++){
      var qx = cx + (rnd()-0.5)*tw*0.7, qy = cy + (rnd()-0.5)*th*0.7;
      ctx.fillStyle = '#cdbb9c';
      ctx.beginPath(); ctx.ellipse(qx, qy, tw*0.018, th*0.026, 0, 0, Math.PI*2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(70,48,26,0.3)'; ctx.lineWidth = Math.max(1, tw*0.01);
    diamondPath(ctx, cx, cy, tw*0.97, th*0.97); ctx.stroke();
  }
  function drawWoodGroundTile(ctx, cx, cy, tw, th, seed){
    var rnd = mulberry32((seed||1)*2654435789 >>> 0);
    ctx.save();
    diamondPath(ctx, cx, cy, tw*1.02, th*1.02); ctx.clip();
    var base = ctx.createLinearGradient(cx-tw/2, cy, cx+tw/2, cy);
    base.addColorStop(0, '#b98a54'); base.addColorStop(0.5, '#a97b48'); base.addColorStop(1, '#9c6d3d');
    ctx.fillStyle = base; ctx.fillRect(cx-tw/2, cy-th/2, tw, th);
    // plank seams running across the tile, seeded per-tile so a painted boardwalk doesn't show
    // the exact same seam spacing on every tile
    var planks = 5;
    ctx.strokeStyle = 'rgba(70,46,22,0.45)'; ctx.lineWidth = Math.max(1, tw*0.012);
    for(var i=1;i<planks;i++){
      var t = i/planks + (rnd()-0.5)*0.03;
      var x = cx - tw/2 + t*tw;
      ctx.beginPath(); ctx.moveTo(x, cy-th/2); ctx.lineTo(x, cy+th/2); ctx.stroke();
    }
    // grain speckles along the boards
    for(var k=0;k<8;k++){
      var px = cx + (rnd()-0.5)*tw*0.8, py = cy + (rnd()-0.5)*th*0.8;
      ctx.fillStyle = 'rgba(70,46,22,0.25)';
      ctx.beginPath(); ctx.ellipse(px, py, tw*0.012, th*0.05, Math.PI/2, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(60,40,20,0.35)'; ctx.lineWidth = Math.max(1, tw*0.01);
    diamondPath(ctx, cx, cy, tw*0.97, th*0.97); ctx.stroke();
  }
  var GROUND_PAINT_DRAWERS = { cobble: drawCobbleGroundTile, dirt: drawDirtGroundTile, wood: drawWoodGroundTile };
  // dispatcher city-renderer.js's ground pass calls for any painted tile -- an unrecognized key
  // (e.g. a 'grass' that shouldn't be stored at all, see index.html's paintGroundAt) just falls
  // back to plain grass rather than drawing nothing.
  function drawGroundPaintTile(ctx, cx, cy, tw, th, seed, key){
    var fn = GROUND_PAINT_DRAWERS[key];
    if(fn) fn(ctx, cx, cy, tw, th, seed);
    else drawPlotGroundTile(ctx, cx, cy, tw, th, seed);
  }

  global.CityAssets = {
    PALETTE: PALETTE,
    MANIFEST: ASSET_MANIFEST,
    bakeAll: bakeAll,
    isBaked: function(){ return _baked; },
    blit: blit,
    blitBuilding: blitBuilding,
    footprint: footprint,
    slotForBuilding: slotForBuilding,
    randomSlot: function(category){
      var keys = Object.keys(ASSET_MANIFEST).filter(function(k){ return ASSET_MANIFEST[k].category === category; });
      return keys[Math.floor(Math.random()*keys.length)];
    },
    // ground tiles: drawn directly (not cached sprites) by city-renderer.js's static bake
    drawRoadTile: drawRoadTile,
    drawWaterTile: drawWaterTile,
    drawPromenadeTile: drawPromenadeTile,
    drawPlotGroundTile: drawPlotGroundTile,
    drawGroundPaintTile: drawGroundPaintTile,
    drawBuildingPad: drawBuildingPad,
    drawBuildTint: drawBuildTint,
    seededRandom: mulberry32
  };
})(window);
