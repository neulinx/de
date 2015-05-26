(function () {
  'use strict';

  var Console = require('console'),
      Gg = require('org/arangodb/general-graph');
  
  var createGraph = function(graph) {
    var g_name = applicationContext.collectionName(graph),
        v_name = applicationContext.collectionName('nodes'),
        e_name = applicationContext.collectionName('links'),
        existence = Gg._exists(g_name);
    
    if (existence) {
      Console.warn('graph '%s' already exists. Leaving it untouched.', g_name);
      return;
    }
    
    // create graph
    var g = Gg._create(g_name, [gm._relation(e_name, v_name, v_name)], []);
    // create index
    g[e_name].ensureIndex({type: 'hash', fields: ['name']});
    g[v_name].ensureIndex({type: 'hash',
                           unique: true,
                           sparse: true,
                           fields: ['ref']});
    g[v_name].ensureIndex({type: 'hash',
                           unique: true,
                           sparse: true,
                           fields: ['uuid']});
  };

  createGraph('graph');
  
}());
