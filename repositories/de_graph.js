(function () {
  'use strict';

  var _ = require('underscore');
  var Foxx = require('org/arangodb/foxx');
  var Db = require("org/arangodb").db;
  var Gg = require('org/arangodb/general-graph');
  var Model = require('models/de_graph');

  
  // graph with model of Nodes.
  var Graph = Foxx.Repository.extend({
    links: null,
    nodes: null,
    // todo: add (*) support for inEdges, outEdges, neighbours.
    nextLink: function(stub, name) {
      var query = {_from: stub};
      if (name !== '.') query.name = name;
      // collection is faster than graph
      return this.links.firstExample(query);
    },

    prevLink: function(stub, name) {
      var query = {_to: stub};
      if (name !== '.') query.name = name;
      return this.links.firstExample(query);
    },

    // "." anonymous, any; ".." in neighbor
    // stub+path as: /nodes/root/a/b/./c/../d/../../e/././f
    lastLink: function(stub, path) {
      var i, to, link,
          backward = false,
          next = stub;
      for (i = 0; path && i < path.length && next; i++) {
        if (backward) {
          if (path[i] === '..') {  // "../../xxx" => ".././../xxx"
            link = this.prevLink(next, '.');
            next = link._from;
          } else {
            link = this.prevlink(next, path[i]);
            next = link._from;
            backward = false;
          }
        } else if (path[i] === '..') {
          backward = true;
        } else {
          link = this.nextLink(next, path[i]);
          next = link._to;
        }
      }
      return link;
    },

    // sigh: it is more simply beautiful ref = '.' than type = '_self'.
    //       But ref is designed as unique index.
    // get original data.
    getSource: function(model, selection) {
      var result;
      switch (model.get('type')) {  // support only two types.
      case '_self':     // store simple data in the graph node.
        result = model.get('data');
        break;
      default:         // store data in other collection by reference.
        result = Db._document(model.get('ref'));
      }
      if (selection)
        return _.pick(result, selection);
      return result;
    },

    // update source data.
    updateSource: function(model, newData) {
      switch (model.get('type')) {
      case '_self':
        var data = model.get('data');
        if (data && typeof data === 'object')
          _.extend(data, newData);
        else
          data = newData;
        return this.update(model, {data: data});
      default:
        return Db._update(model.get('ref'), newData);
      }
    },

    // delete source data and referee
    deleteSource: function(model) {
      if (model.get('type') !== '_self')
        Db._remove(model.get('ref'));
      return this.remove(model);
    },
    
    // new source data.
    newData: function(collName, newData) {
      if (collName === '_self') {
        var m = new this.model({type: '_self', data: newData});
        return this.save(m);
      }

      var collection = Db._collection(collName);
      return collection.save(newData);
    }

  });

  var initGraph = function(context) {
    var G, g,
        Nodes = context.collection('nodes');
    
    if (!Nodes)
      return null;

    g = Gg._graph(context.collectionName('graph'));
    G = new Graph(Nodes, {model: Model.Nodes, graph: g});
    G.nodes = g[Nodes.name()];
    G.links = g[context.collectionName('links')];
    G.collection = G.nodes;

    G.nodesName = G.nodes.name;
    G.nodeSave = G.nodes.save;
    G.nodeUpdate = G.nodes.update;
    G.nodeRemove = G.nodes.remove;
    G.linksName = G.links.name;
    G.linkSave = G.links.save;
    G.linkUpdate = G.links.update;
    G.linkRemove = G.links.remove;
    
    return G;
  };

  exports.initGraph = initGraph;
}());

