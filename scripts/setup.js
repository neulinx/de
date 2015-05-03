(function () {
  'use strict';

  var console = require("console");
  var db = require("org/arangodb").db;
  var gm = require("org/arangodb/general-graph");
  var createGraph = function(graph) {
    var g_name = applicationContext.collectionName("test");
    console.warn("Connection name is '%s'", g_name);
/*        v_name = applicationContext.vertexCollection(graph),
        e_name = applicationContext.edgeCollection(graph);
*/
    var v_name = "de_node", e_name = "de_link";
    var existence = gm._exists(graph); // || db._exists(v_name) || db._exists(e_name);
    if (existence && applicationContext.isProduction) {
      console.warn("graph '%s' already exists. Leaving it untouched.", graph);
    } else {
      gm._create(graph, [gm._relation(e_name, v_name, v_name)], []);
    };
  };

  createGraph("de_graph");
  
}());
