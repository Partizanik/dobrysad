/* Dobry Sad — Stage 2A simple city.
   This is a self-contained replacement layer. The legacy canvas city remains available in code
   but is deliberately not used by this layer. */
(function(global){
  'use strict';

  var COLS = 12, ROWS = 10;
  var CATALOG = [
    {key:'help_home', name:'Дом помощи', size:{w:2,h:2}, materialCost:{wood:12,stone:6}, foodConsumption:0.08, waterConsumption:0.05, goodProduction:1.2},
    {key:'medical_center', name:'Медицинский центр', size:{w:3,h:3}, materialCost:{wood:16,stone:20,iron:10,glass:6}, foodConsumption:0.16, waterConsumption:0.12, goodProduction:2.8},
    {key:'school', name:'Школа', size:{w:3,h:3}, materialCost:{wood:20,stone:12,iron:6,glass:8}, foodConsumption:0.14, waterConsumption:0.10, goodProduction:2.4},
    {key:'animal_shelter', name:'Приют для животных', size:{w:3,h:3}, materialCost:{wood:18,stone:10,iron:4,glass:3}, foodConsumption:0.12, waterConsumption:0.10, goodProduction:2.0},
    {key:'social_kitchen', name:'Социальная кухня', size:{w:2,h:2}, materialCost:{wood:10,stone:8,iron:3,glass:2}, foodConsumption:0.10, waterConsumption:0.08, goodProduction:1.6},
    {key:'support_center', name:'Центр поддержки', size:{w:3,h:3}, materialCost:{wood:14,stone:14,iron:8,glass:7}, foodConsumption:0.15, waterConsumption:0.11, goodProduction:2.5}
  ];
  var BY_KEY = {};
  CATALOG.forEach(function(def){ BY_KEY[def.key] = def; });

  var state = {v:1, buildings:[], nextId:1};
  var ui = {modal:null, grid:null, selectedKey:null, movingId:null, selectedId:null, preview:null, context:null};

  function cloneCost(cost){ return Object.assign({}, cost || {}); }
  function definitionFor(key){ return BY_KEY[key] || null; }
  function buildingFor(id){ return state.buildings.filter(function(b){ return b.id===id; })[0] || null; }
  function normalizeBuilding(raw){
    if(!raw || typeof raw !== 'object') return null;
    var def = definitionFor(raw.key);
    if(!def || typeof raw.x!=='number' || typeof raw.y!=='number') return null;
    var building = {
      id: typeof raw.id==='number' ? raw.id : state.nextId++, key:def.key,
      x:Math.floor(raw.x), y:Math.floor(raw.y), size:{w:def.size.w,h:def.size.h},
      materialCost:cloneCost(def.materialCost), foodConsumption:def.foodConsumption,
      waterConsumption:def.waterConsumption, goodProduction:def.goodProduction,
      active:typeof raw.active==='boolean' ? raw.active : false
    };
    return building;
  }
  function load(saved){
    state = {v:1, buildings:[], nextId:1};
    if(!saved || typeof saved!=='object') return;
    (Array.isArray(saved.buildings) ? saved.buildings : []).forEach(function(raw){
      var building = normalizeBuilding(raw);
      if(building && canPlace(building.x, building.y, building.size, building.id)){
        state.buildings.push(building);
        state.nextId = Math.max(state.nextId, building.id+1);
      }
    });
  }
  function serialize(){
    return {v:1, nextId:state.nextId, buildings:state.buildings.map(function(b){
      return {id:b.id,key:b.key,x:b.x,y:b.y,size:{w:b.size.w,h:b.size.h},materialCost:cloneCost(b.materialCost),foodConsumption:b.foodConsumption,waterConsumption:b.waterConsumption,goodProduction:b.goodProduction,active:b.active};
    })};
  }
  function overlaps(aX,aY,aSize,b){
    return aX < b.x+b.size.w && aX+aSize.w > b.x && aY < b.y+b.size.h && aY+aSize.h > b.y;
  }
  function canPlace(x,y,size,ignoreId){
    if(!size || x<0 || y<0 || x+size.w>COLS || y+size.h>ROWS) return false;
    return !state.buildings.some(function(b){ return b.id!==ignoreId && overlaps(x,y,size,b); });
  }
  function affordable(def, warehouse){
    return Object.keys(def.materialCost).every(function(key){ return (warehouse[key]||0) >= def.materialCost[key]; });
  }
  function deduct(def, warehouse){ Object.keys(def.materialCost).forEach(function(key){ warehouse[key] -= def.materialCost[key]; }); }
  function place(key,x,y,warehouse){
    var def = definitionFor(key);
    if(!def || !canPlace(x,y,def.size) || !affordable(def,warehouse)) return null;
    deduct(def,warehouse);
    var building = normalizeBuilding({id:state.nextId++,key:key,x:x,y:y});
    state.buildings.push(building);
    return building;
  }
  function move(id,x,y){
    var building = buildingFor(id);
    if(!building || !canPlace(x,y,building.size,id)) return false;
    building.x=x; building.y=y;
    return true;
  }
  function remove(id){
    var index = state.buildings.findIndex(function(b){ return b.id===id; });
    if(index<0) return false;
    state.buildings.splice(index,1);
    return true;
  }
  function notifyChanged(){
    if(ui.context && ui.context.onChanged) ui.context.onChanged();
  }
  function injectStyle(){
    if(document.getElementById('simpleCityStyle')) return;
    var style = document.createElement('style'); style.id='simpleCityStyle';
    style.textContent = '.simple-city-modal{position:fixed;inset:0;z-index:40;background:rgba(16,27,20,.7);display:flex;align-items:center;justify-content:center;padding:12px}.simple-city-card{width:min(760px,100%);max-height:94vh;overflow:auto;background:#fffaf0;border-radius:20px;padding:14px;color:#233020;box-shadow:0 20px 55px rgba(0,0,0,.35)}.simple-city-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.simple-city-head h2{font-size:18px;margin:0}.simple-city-close,.simple-city-actions button,.simple-city-catalog button{border:1px solid #d8cbb6;border-radius:10px;background:#fff;padding:8px 10px;font:inherit;font-weight:700;cursor:pointer}.simple-city-catalog{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:12px 0}.simple-city-catalog button{font-size:11px;text-align:left}.simple-city-catalog button.selected{outline:2px solid #4b8b4f;background:#e4f3df}.simple-city-catalog button:disabled{opacity:.5}.simple-city-grid{position:relative;display:grid;grid-template-columns:repeat(12,1fr);grid-template-rows:repeat(10,1fr);aspect-ratio:1.2;background:#dcefd4;border:2px solid #8cbf87;border-radius:14px;overflow:hidden;touch-action:manipulation}.simple-city-cell{border:1px solid rgba(73,118,70,.22);min-width:0}.simple-city-building,.simple-city-preview{z-index:2;border-radius:9px;margin:2px;padding:4px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:10px;font-weight:800;line-height:1.12;cursor:pointer;box-shadow:0 2px 0 rgba(0,0,0,.16)}.simple-city-building{background:#f6d98f;border:2px solid #a77335}.simple-city-building.paused{background:#ded9d0;border-color:#8b8580}.simple-city-building.selected{outline:3px solid #4b8b4f}.simple-city-preview{pointer-events:none;background:rgba(75,139,79,.38);border:2px dashed #2f6b3f}.simple-city-preview.invalid{background:rgba(190,70,50,.34);border-color:#b53c2b}.simple-city-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}.simple-city-note{font-size:11px;color:#6d665c;margin:8px 0 0}.simple-city-status{font-size:11px;margin-top:8px;min-height:16px}';
    document.head.appendChild(style);
  }
  function labelFor(def){ return def.name+' · '+def.size.w+'×'+def.size.h; }
  function render(){
    if(!ui.modal || !ui.context) return;
    var warehouse = ui.context.getWarehouse();
    ui.modal.innerHTML = '';
    var card = document.createElement('section'); card.className='simple-city-card';
    var head = document.createElement('div'); head.className='simple-city-head';
    head.innerHTML='<h2>Город добра</h2><button class="simple-city-close">Закрыть</button>';
    head.querySelector('button').onclick=close; card.appendChild(head);
    var catalog = document.createElement('div'); catalog.className='simple-city-catalog';
    CATALOG.forEach(function(def){
      var button=document.createElement('button'); button.textContent=labelFor(def)+'\n'+Object.keys(def.materialCost).map(function(k){return k+': '+def.materialCost[k];}).join(' · ');
      button.className=ui.selectedKey===def.key?'selected':''; button.disabled=!affordable(def,warehouse);
      button.onclick=function(){ ui.selectedKey=def.key; ui.movingId=null; ui.preview=null; render(); }; catalog.appendChild(button);
    });
    card.appendChild(catalog);
    var grid=document.createElement('div'); grid.className='simple-city-grid'; ui.grid=grid;
    grid.addEventListener('pointermove',function(event){
      var cell=event.target&&event.target.closest?event.target.closest('.simple-city-cell'):null;
      if(cell) updatePreview(Number(cell.dataset.x),Number(cell.dataset.y));
    });
    for(var y=0;y<ROWS;y++) for(var x=0;x<COLS;x++){
      var cell=document.createElement('div'); cell.className='simple-city-cell'; cell.dataset.x=x; cell.dataset.y=y;
      cell.onmouseenter=(function(px,py){ return function(){ updatePreview(px,py); }; })(x,y);
      cell.onclick=(function(px,py){ return function(){ confirmPlacement(px,py); }; })(x,y);
      grid.appendChild(cell);
    }
    state.buildings.forEach(function(building){
      var def=definitionFor(building.key), el=document.createElement('button');
      el.className='simple-city-building'+(building.active?'':' paused')+(ui.selectedId===building.id?' selected':'');
      el.style.gridColumn=(building.x+1)+' / span '+building.size.w; el.style.gridRow=(building.y+1)+' / span '+building.size.h;
      el.textContent=def.name+(building.active?'':' · пауза');
      el.onclick=function(e){ e.stopPropagation(); ui.selectedId=building.id; ui.selectedKey=null; ui.movingId=null; ui.preview=null; render(); };
      grid.appendChild(el);
    });
    card.appendChild(grid);
    var actions=document.createElement('div'); actions.className='simple-city-actions';
    if(ui.selectedId!==null){
      var moveButton=document.createElement('button'); moveButton.textContent='Переместить'; moveButton.onclick=function(){ui.movingId=ui.selectedId;ui.selectedKey=null;ui.preview=null;render();}; actions.appendChild(moveButton);
      var deleteButton=document.createElement('button'); deleteButton.textContent='Удалить без возврата ресурсов'; deleteButton.onclick=function(){remove(ui.selectedId);ui.selectedId=null;ui.movingId=null;notifyChanged();render();}; actions.appendChild(deleteButton);
    }
    if(ui.selectedKey || ui.movingId!==null){ var cancel=document.createElement('button'); cancel.textContent='Отменить размещение'; cancel.onclick=function(){ui.selectedKey=null;ui.movingId=null;ui.preview=null;render();}; actions.appendChild(cancel); }
    card.appendChild(actions);
    var status=document.createElement('div'); status.className='simple-city-status';
    status.textContent=ui.selectedKey?'Выберите свободную клетку для размещения.':ui.movingId!==null?'Выберите новое свободное место.':'Выберите здание или уже размещённый объект.'; card.appendChild(status);
    var note=document.createElement('p'); note.className='simple-city-note'; note.textContent='Зелёный контур — можно поставить; красный — место занято или выходит за границы. Активные здания расходуют food и water, а затем производят Good.'; card.appendChild(note);
    ui.modal.appendChild(card);
  }
  function updatePreview(x,y){
    var def=ui.selectedKey?definitionFor(ui.selectedKey):(ui.movingId!==null?definitionFor(buildingFor(ui.movingId).key):null);
    if(!def || !ui.grid) return;
    ui.preview={x:x,y:y,size:def.size,valid:canPlace(x,y,def.size,ui.movingId)};
    var old=ui.grid.querySelector('.simple-city-preview'); if(old) old.remove();
    var preview=document.createElement('div'); preview.className='simple-city-preview'+(ui.preview.valid?'':' invalid');
    preview.style.gridColumn=(x+1)+' / span '+def.size.w; preview.style.gridRow=(y+1)+' / span '+def.size.h; ui.grid.appendChild(preview);
  }
  function confirmPlacement(x,y){
    var warehouse=ui.context.getWarehouse();
    if(ui.selectedKey){ if(place(ui.selectedKey,x,y,warehouse)){ui.selectedKey=null;ui.preview=null;notifyChanged();render();} return; }
    if(ui.movingId!==null && move(ui.movingId,x,y)){ui.movingId=null;ui.preview=null;notifyChanged();render();}
  }
  function open(context){
    injectStyle(); ui.context=context; ui.selectedKey=null; ui.movingId=null; ui.selectedId=null; ui.preview=null;
    if(!ui.modal){ ui.modal=document.createElement('div'); ui.modal.className='simple-city-modal'; document.body.appendChild(ui.modal); }
    ui.modal.style.display='flex'; render();
  }
  function close(){ if(ui.modal) ui.modal.style.display='none'; }
  function refresh(){ if(ui.modal && ui.modal.style.display!=='none') render(); }
  function tick(warehouse, now){
    if(!global.DobrySadEconomy) return {produced:0,hasPausedBuilding:false};
    var result=global.DobrySadEconomy.tickBuildings([{plots:state.buildings}],warehouse,BY_KEY,now);
    refresh(); return result;
  }

  global.SimpleCity = {CATALOG:CATALOG, load:load, serialize:serialize, open:open, close:close, tick:tick, canPlace:canPlace, place:place, move:move, remove:remove, getState:function(){return state;}};
})(window);
