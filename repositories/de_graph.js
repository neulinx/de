'use strict';

const _ = require('underscore');
const Foxx = require('org/arangodb/foxx');
const Db = require("org/arangodb").db;
const Gg = require('org/arangodb/general-graph');
const Model = require('models/de_graph');

// graph with model of Nodes.
class Graph extends Foxx.Repository {
  constructor(context) {
    super(undefined, { model: Model.Nodes });

    const g = Gg._graph(context.collectionName('graph'));
    const nodesName = context.collectionName('nodes');
    const linksName = context.collectionName('links');
    const nodes = g[nodesName];
    const links = g[linksName];

    this.graph = g;
    this.collection = nodes;
    this.nodes = nodes;
    this.links = links;
    this.nodesName = nodes.name;
    this.nodeSave = nodes.save;
    this.nodeUpdate = nodes.update;
    this.nodeRemove = nodes.remove;
    this.linksName = links.name;
    this.linkSave = links.save;
    this.linkUpdate = links.update;
    this.linkRemove = links.remove;
  }
  
  // todo: add (*) support for inEdges, outEdges, neighbours.
  nextLink(stub, name) {
    const query = { _from: stub };
    if (name !== '.') query.name = name;
    // collection is faster than graph
    return this.links.firstExample(query);
  }

  prevLink(stub, name) {
    const query = { _to: stub };
    if (name !== '.') query.name = name;
    return this.links.firstExample(query);
  }

  // "." anonymous, any; ".." in neighbor
  // stub+path as: /nodes/root/a/b/./c/../d/../../e/././f
  lastLink(stub, path) {
    let link, backward = false, next = stub;
    for (let i = 0; path && i < path.length && next; i++) {
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
  }

  // sigh: it is more simply beautiful ref = '.' than type = '_self'.
  //       But ref is designed as unique index.
  // get original data.
  getSource(model, selection) {
    let result;
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
  }

  // update source data.
  updateSource(model, newData) {
    switch (model.get('type')) {
      case '_self':
        let data = model.get('data');
        if (data && typeof data === 'object')
          _.extend(data, newData);
        else
          data = newData;
        return this.update(model, { data: data });
      default:
        return Db._update(model.get('ref'), newData);
    }
  }

  // delete source data and referee
  deleteSource(model) {
    if (model.get('type') !== '_self')
      Db._remove(model.get('ref'));
    return this.remove(model);
  }
    
  // new source data.
  newData(collName, newData) {
    if (collName === '_self') {
      const m = new this.model({ type: '_self', data: newData });
      return this.save(m);
    }

    const collection = Db._collection(collName);
    return collection.save(newData);
  }

};

exports.Graph = Graph;
