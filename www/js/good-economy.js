/* Dobry Sad — Stage 1 economy model.
   Kept independent from the current UI so the city can move to this model gradually. */
(function(global){
  'use strict';

  var RESOURCE_KEYS = ['wood', 'stone', 'iron', 'glass', 'food', 'water'];

  function numberOrZero(value){
    return typeof value === 'number' && isFinite(value) && value > 0 ? value : 0;
  }

  function nonNegativeOrDefault(value, fallback){
    return typeof value === 'number' && isFinite(value) && value >= 0 ? value : fallback;
  }

  function migrateWarehouse(source){
    source = source && typeof source === 'object' ? source : {};
    var migrated = {};
    RESOURCE_KEYS.forEach(function(key){ migrated[key] = numberOrZero(source[key]); });
    // Saves made before Stage 1 stored the glass-garden harvest as sand. Preserve all of it.
    migrated.glass += numberOrZero(source.sand);
    return migrated;
  }

  function buildingDefaults(definition){
    var people = numberOrZero(definition && definition.people);
    return {
      materialCost: Object.assign({}, (definition && definition.cost) || {}),
      foodConsumption: people ? people * 0.03 : 0.03,
      waterConsumption: people ? people * 0.02 : 0.02,
      goodProduction: people ? people * 0.4 : 0.4,
      active: false
    };
  }

  function ensureBuildingEconomy(building, definition){
    if(!building || typeof building !== 'object') return null;
    var defaults = buildingDefaults(definition);
    if(!building.materialCost || typeof building.materialCost !== 'object') building.materialCost = defaults.materialCost;
    building.foodConsumption = nonNegativeOrDefault(building.foodConsumption, defaults.foodConsumption);
    building.waterConsumption = nonNegativeOrDefault(building.waterConsumption, defaults.waterConsumption);
    building.goodProduction = nonNegativeOrDefault(building.goodProduction, defaults.goodProduction);
    if(typeof building.active !== 'boolean') building.active = false;
    return building;
  }

  function tickBuildings(cities, warehouse, definitionsByKey, now){
    var produced = 0;
    var hasPausedBuilding = false;
    (cities || []).forEach(function(city){
      (city && city.plots || []).forEach(function(building){
        if(!building) return;
        var definition = definitionsByKey && definitionsByKey[building.key];
        if(!definition) return;
        ensureBuildingEconomy(building, definition);
        var rentalActive = !definition.rentable || (building.rentUntil && building.rentUntil > now);
        var canRun = rentalActive && warehouse.food >= building.foodConsumption && warehouse.water >= building.waterConsumption;
        building.active = !!canRun;
        if(!canRun){ hasPausedBuilding = true; return; }
        warehouse.food = Math.max(0, warehouse.food - building.foodConsumption);
        warehouse.water = Math.max(0, warehouse.water - building.waterConsumption);
        produced += building.goodProduction;
      });
    });
    return { produced: produced, hasPausedBuilding: hasPausedBuilding };
  }

  global.DobrySadEconomy = {
    RESOURCE_KEYS: RESOURCE_KEYS,
    migrateWarehouse: migrateWarehouse,
    buildingDefaults: buildingDefaults,
    ensureBuildingEconomy: ensureBuildingEconomy,
    tickBuildings: tickBuildings
  };
})(window);
