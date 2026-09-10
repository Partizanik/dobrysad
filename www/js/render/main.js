/* ---- Dobry Sad city visual layer: boot glue ---------------------------------------------------
   Waits for the game's `dobrySadReady` event (fired once window.GameAPI exists and the save has
   loaded -- see the end of the main script in index.html), then wires up pointer input on the
   city canvas. The canvas element itself is static markup in index.html, so there's nothing to
   create here; index.html's openCityFull()/closeCityFull() call window.CityRenderer.mount()/
   unmount() directly on open/close of the city modal (see the small edit made there). ---------- */
(function(global){
  'use strict';

  function boot(){
    if(global.CityInput) global.CityInput.init();
  }

  /* Script tags execute synchronously in document order, and these render-layer files load
     after the main game script -- which sets up window.GameAPI and dispatches 'dobrySadReady'
     as its very last statement -- so by the time this file runs, GameAPI already exists and the
     DOM is fully parsed (these tags sit right before </body>). Boot immediately in that normal
     case; only fall back to waiting for the event if GameAPI isn't there yet, which future-
     proofs this against a boot sequence that one day becomes asynchronous without this file
     needing to change. */
  if(global.GameAPI){
    boot();
  } else {
    global.document.addEventListener('dobrySadReady', boot, { once: true });
  }
})(window);
