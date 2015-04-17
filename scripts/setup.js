(function () {
  'use strict';

  var console = require("console");
  var db = require("org/arangodb").db;
  var gm = require("org/arangodb/general-graph");
  var createGraph = function(graph) {
/*    var g_name = applicationContext.graphName(graph),
        v_name = applicationContext.vertexCollection(graph),
        e_name = applicationContext.edgeCollection(graph);
*/
    var g_name = "de_graph", v_name = "de_node", e_name = "de_link";
    var existence = gm._exists(g_name) || db._exists(v_name) || db._exists(e_name);
    if (existence && applicationContext.isProduction) {
      console.warn("collections of graph '%s' already exists. Leaving it untouched.", g_name);
    } else {
      gm._create(g_name, [gm._relation(e_name, v_name, v_name)], []);
    };
  };

  createGraph("de");
  
}());
