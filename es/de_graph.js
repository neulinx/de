const _foxx = require('org/arangodb/foxx');
const _db = require("org/arangodb").db;
const _g = require('org/arangodb/general-graph');
const _model = require('../lib/de_models');

// graph with model of Nodes.
class Graph extends _foxx.Repository {
  constructor(context) {
    super(undefined, { model: _model.Nodes });

    const g = _g._graph(context.collectionName('graph'));
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
  
  forClient(model, selection) {
    if (typeof model !== 'object') {
      model = this.byId(model);
    }
    let data = this.getSource(model);
    let s = {_gid: model.get('_key')};
    if (selection) {
      // '*' return raw data
      if (selection[0] === '*') return data;
      for (let i = 0; i < selection.length; i++) {
        let k = selection[i];
        if (data.hasOwnProperty(k)) {
          s[k] = data[k];
        }
      }
      return s;
    }
    if (typeof data === 'object') {
      for (let k in data) {
        if (k.charAt(0) !== '_') {
          s[k] = data[k];
        }
      }
      return s;
    }
    // data is not an object, wrap it into object type.
    s.data = data;
    return s;
  }
  
  // sigh: it is more simply beautiful ref = '.' than type = '_self'.
  //       But ref is designed as unique index.
  // get original data.
  getSource(model) {
    if (typeof model !== 'object') {
      model = this.byId(model);
    }

    switch (model.get('type')) {  // support only two types.
      case '_self':     // store simple data in the graph node.
        return model.get('data');
      default:         // store data in other collection by reference.
        return _db._document(model.get('ref'));
    }
  }

  // update source data.
  updateSource(model, newData) {
    if (typeof model !== 'object') {
      model = this.byId(model);
    }
    
    switch (model.get('type')) {
      case '_self':
        let data = model.get('data');
        if (data && typeof data === 'object' &&
            newData && typeof newData === 'object') {
              Object.assign(data, newData);
        }
        else {
          data = newData;
        }
        return this.update(model, { data: data });
      default:
        return _db._update(model.get('ref'), newData);
    }
  }

  // delete source data and referee
  deleteSource(model) {
    if (typeof model !== 'object') {
      model = this.byId(model);
    }
    
    if (model.get('type') !== '_self')
      _db._remove(model.get('ref'));
    return this.remove(model);
  }
    
  // new source data.
  newData(collName, newData) {
    if (collName === '_self') {
      const m = new this.model({ type: '_self', data: newData });
      return this.save(m);
    }

    const collection = _db._collection(collName);
    return collection.save(newData);
  }

};

exports.Graph = Graph;
