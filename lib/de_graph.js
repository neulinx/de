'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

const _foxx = require('org/arangodb/foxx');
const _db = require('org/arangodb').db;
const _g = require('org/arangodb/general-graph');
const _model = require('../lib/de_models');
const _fs = require('fs');
const _log = require('console').warn;

// graph with model of Nodes.
class Graph extends _foxx.Repository {
  constructor(context) {
    super(undefined, { model: _model.Nodes });

    const g = _g._graph(context.collectionName('graph'));
    const nodesName = context.collectionName('nodes');
    const linksName = context.collectionName('links');
    const nodes = g[nodesName];
    const links = g[linksName];

    this.context = context;
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

    let dataPath = context.manifest.files.data || 'data';
    this.dataPath = context.path(dataPath);
  }

  validatePath(path) {
    if (path.charAt(0) !== '/' || path.includes('/..')) {
      throw new Error('Invalid path or file name.');
    }
    return this.dataPath + path;
  }

  fileRead(path) {
    return _fs.read(this.validatePath(path));
  }

  fileExists(path) {
    return _fs.isFile(this.validatePath(path));
  }

  fileUpdate(path, content) {
    if (this.context.isProduction) {
      throw new Error('File cannot be changed in production mode.');
    }
    path = this.validatePath(path);
    if (!_fs.isFile(path)) {
      throw new Error('File is not existed.');
    }
    return _fs.write(path, content);
  }

  fileCreate(path, content) {
    if (this.context.isProduction) {
      throw new Error('File cannot be created in production mode.');
    }
    path = this.validatePath(path);
    if (_fs.isFile(path)) {
      throw new Error('File is already existed.');
    }
    return _fs.write(path, content);
  }

  fileDelete(path) {
    if (this.context.isProduction) {
      throw new Error('File cannot be deleted in production mode.');
    }
    path = this.validatePath(path);
    if (!_fs.isFile(path)) {
      throw new Error('File is not existed.');
    }
    return _fs.remove(path);
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
    let link,
        backward = false,
        next = stub;
    for (let i = 0; path && i < path.length && next; i++) {
      if (backward) {
        if (path[i] === '..') {
          // "../../xxx" => ".././../xxx"
          link = this.prevLink(next, '.');
          next = link._from;
        } else {
          link = this.prevLink(next, path[i]);
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
    let s = { _gid: model.get('_key') };
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

  // sigh: it is more simply beautiful ref = '.' than type = '_solo'.
  //       But ref is designed as unique index.
  // get original data.
  getSource(model) {
    if (typeof model !== 'object') {
      model = this.byId(model);
    }

    switch (model.get('type')) {// support only two types.
      case '_solo':
        // store simple data in the graph node.
        return model.get('data');
      case '_file':
        return this.fileRead(model.get('ref'));
      default:
        // store data in other collection by reference.
        return _db._document(model.get('ref'));
    }
  }

  // update source data.
  updateSource(model, newData) {
    if (typeof model !== 'object') {
      model = this.byId(model);
    }

    switch (model.get('type')) {
      case '_solo':
        let data = model.get('data');
        try {
          newData = JSON.parse(newData);
        } catch (e) {};
        if (data && typeof data === 'object' && newData && typeof newData === 'object') {
          _extends(data, newData);
        } else {
          data = newData;
        }
        return this.update(model, { data: data });
      case '_file':
        let fileName = model.get('ref');
        const result = this.fileUpdate(fileName, newData);
        return { "success": result };
      default:
        return _db._update(model.get('ref'), JSON.parse(newData));
    }
  }

  // delete source data and referee
  deleteSource(model) {
    if (typeof model !== 'object') {
      model = this.byId(model);
    }

    let type = model.get('type');
    if (type === '_file') {
      let fileName = model.get('ref');
      this.fileDelete(fileName);
    } else if (type !== '_solo') {
      _db._remove(model.get('ref'));
    }

    return this.remove(model);
  }

  // new source data.
  newSource(collName, data) {
    if (collName === '_solo') {
      try {
        data = JSON.parse(data);
      } catch (e) {};
      const m = new this.model({ type: '_solo', data: data });
      return this.save(m).forDB();
    }

    const collection = _db._collection(collName);
    return collection.save(JSON.parse(data));
  }

};

exports.Graph = Graph;