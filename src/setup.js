/*globals require, applicationContext */

const _console = require('console');
const _g = require('org/arangodb/general-graph');
  
const createGraph = function(graph) {
  const g_name = applicationContext.collectionName(graph);
  const v_name = applicationContext.collectionName('nodes');
  const e_name = applicationContext.collectionName('links');
  const existence = _g._exists(g_name);
    
  if (existence) {
    _console.warn('graph "%s" already exists. Leaving it untouched.', g_name);
    return;
  }

  // create graph
  const g = _g._create(g_name, [_g._relation(e_name, v_name, v_name)], []);
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
  const root = {_key: "root",
                type: "_solo",
                uuid: "2589C2DB-EAEC-4102-9412-C0896FE07FB6",
                data: {name: "root",
                       description: "Root of data engine graph.",
                       createTime: Date.now()
                      }
              };
  g[v_name].save(root);
    
};

createGraph('graph');
  
