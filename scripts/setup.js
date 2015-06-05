(function () {
  'use strict';

  var Console = require('console');
  var Gg = require('org/arangodb/general-graph');
  
  var createGraph = function(graph) {
    var g_name = applicationContext.collectionName(graph);
    var v_name = applicationContext.collectionName('nodes');
    var e_name = applicationContext.collectionName('links');
    var existence = Gg._exists(g_name);
    
    if (existence) {
      Console.warn('graph "%s" already exists. Leaving it untouched.', g_name);
      return;
    }

    // create graph
    var g = Gg._create(g_name, [Gg._relation(e_name, v_name, v_name)], []);
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
    var root = {_key:"root",
                type:"_self",
                uuid:"2589C2DB-EAEC-4102-9412-C0896FE07FB6",
                data:"Root of data engine graph."};
    g[v_name].save(root);
    
  };

  createGraph('graph');
  
}());
