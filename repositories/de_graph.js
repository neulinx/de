(function () {
  'use strict';

  var _ = require('underscore'),
      Foxx = require('org/arangodb/foxx'),
      Db = require("org/arangodb").db;
  
  // graph with model of Nodes.
  var Graph = Foxx.Repository.extend({
    edges: null,
    vertices: null,
    // todo: add (*) support for inEdges, outEdges, neighbours.
    nextEdge: function(stub, name) {
      var query = {_from: stub};
      if (name !== '.') query.name = name;
      // collection is faster than graph
      return this.edges.firstExample(query);
    },

    prevEdge: function(stub, name) {
      var query = {_to: stub};
      if (name !== '.') query.name = name;
      return this.edges.firstExample(query);
    },

    // "." anonymous, any; ".." in neighbor
    // stub+path as: /nodes/root/a/b/./c/../d/../../e/././f
    leafEdge: function(stub, path) {
      var i, to, edge,
          backward = false,
          next = stub;
      for (i = 0; i < path.length && next; i++) {
        if (backward) {
          if (path[i] === '..') {  // "../../xxx" => ".././../xxx"
            edge = this.prevEdge(next, '.');
            next = edge._from;
          } else {
            edge = this.prevEdge(next, path[i]);
            next = edge._from;
            backward = false;
          }
        } else if (path[i] === '..') {
          backward = true;
        } else {
          edge = this.nextEdge(next, path[i]);
          next = edge._to;
        }
      }
      return edge;
    }
    
    // get original data.
    getSource: function(model) {
      switch (model.get('type')) {  // support only two types.
      case '.':     // store simple data in the graph node.
        return model.get('data');
      default:         // store data in other collection by reference.
        return Db._document(model.get('ref'));
      }
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

  exports.Graph = Graph;
}());

