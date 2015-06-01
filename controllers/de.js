/*globals require, applicationContext */

(function () {
  'use strict';
  var Version = 'v1';
  var API = function (path) {
    return '/' + Version + path;
  };
  
  var Controller, G;
  var Foxx = require('org/arangodb/foxx');
  var Joi = require('joi');
  var ArangoError = require('org/arangodb').ArangoError;
  var Repo = require('repositories/de_graph');
  var Model = require('models/de_graph');

  // Documenting and constraining parameters.
  var RootParam = {
    type: Joi.string().allow('_uuid', '_key', '_ref', '_path'),
    required: true,
    description: 'Three types of stub location.'
  };
  var  KeyParam = {
    type: Joi.string(),
    required: true,
    description: 'Identity, name or key.'
  };
  var DataParam = {
    type: Joi.any(),
    required: true,
    description: 'Any type of data'
  };
  var SParam = {  // What is S? source or selection.
    type: Joi.string().allow('.', '..', '.._'),  // '_' internal data.
    description: 'Location of data: ".", vertex; "..", edge.'
  };
  var LinkParam = {
    type: Model.Links,
    required: true,
    description: 'Edge of graph data.'
  };
  var NodeParam = {
    type: Model.Nodes,
    required: true,
    description: 'Vertex of graph data.'
  };


  // Initialize global graph repository.
  G = Repo.initGraph(applicationContext);

  var getNode = function (root, key) {
    if (root === '_uuid') {
      return G.firstExample({uuid: key}).get('_id');
    }
    
    if (root === '_key') {
      return G.nodesName() + '/' + key;
    }
    
    var ref = root + '/' + key;
    return G.firstExample({ref: ref}).get('_id');
  };

  var getNodeByData = function (data, stub, leaf) {
    var key, value, link;

    // get first key only!
    key = Object.getOwnPropertyNames(data)[0];
    value = data[key];

    if (key === '_ref') {
      return G.firstExample({ref: value}).get('_id');
    }

    if (key === '_path') {
      var path = value.split('/');
      switch (path[0]) {
      case '':  // "/a/b/c"
        var root = getNode(path[1], path[2]);
        link = G.lastLink(root, path.slice(3));
        break;
      case '.':  // "./a/b/c"
        link = G.lastLink(leaf, path.slice(1));
        break;
      default:  // "a/b/c"
        link = G.lastLink(stub, path);
      }
      return link._to;
    }
      
    return getNode(key, value);
  };
  
  // controller methods
  Controller = new Foxx.Controller(applicationContext);

  // Fail-fast and avoid defensive programming.
  // In development phase, produce detailed error description.
  if (applicationContext.isProduction) {
    Controller.allRoutes.errorResponse(ArangoError, 404,
                                       'The route is not viable.');
    Controller.allRoutes.errorResponse(TypeError, 404,
                                       'The route is not viable.');
  }

  // Erlang way, :), pattern match.
  // Create orinal data, referee, and link
  // case 1: create link with existed node:
  //   URL: /g/_uuid/1234abcdef/branch/leaf?s=..
  //   Data: {key: value}, key = '_uuid' or '_key' or '_ref'
  //   Result: link branch node to data node with label leaf.
  // case 2: create node and customize data in it. s='.' or no s parameter.
  //   URL: /g/_key/root/branch/leaf?s=.
  //   Data: {_key:.., ref:.., type:.., uuid:.., data:..}
  //   Result: link branch node to leaf node with customized data.
  // case 3: create data in source colleciton and create new reference
  //   URL: /g/collection/root/branch/leaf?s=source
  //   Data: {_key:.., data...}
  //   Result: create new data item in source collection and link it.
  Controller.post(API('/g/:root/:key/*'), function (req, res) {
    var leaf, node, result;
    var stub = getNode(req.params('root'), req.params('key'));
    var path = req.suffix.slice();
    var linkName = path.pop();
    var link = G.lastLink(stub, path);
    var data = req.params('data');
    var source = req.params('s');
    
    leaf = link ? link._to : stub;
    
    switch (source) {
    case '..':  // create new edge to link internal nodes.
      node = getNodeByData(data, stub, leaf);
      result = G.linkSave(leaf, node, {name: linkName});
      break;
    case undefined:  // if 's' paramter is not present...
    case null:
    case '.':  // create new edge and new '_to' node.
      node = G.nodeSave(data);
      result = G.linkSave(leaf, node._id, {name: linkName});
      break;
    default:  // create new data object in source collection and link it.
      result = G.newData(source, data);
      // todo: add more parameters to cutomize node.
      node = G.nodeSave({ref: result._id});
      result = G.linkSave(leaf, node._id, {name: linkName});
    }

    res.json(result);
  }).pathParam('root', RootParam
   ).pathParam('key', KeyParam
   ).queryParam('s', SParam
   ).bodyParam('data', DataParam);

  // The backdoor for raw data operation of edge and vertex.
  Controller.post(API('/g/._'), function (req, res) {
    var n = req.params('node');
    res.json(G.save(n).forClient());
  }).bodyParam('node', NodeParam);
  
  Controller.post(API('/g/.._'), function (req, res) {
    var e = req.params('link').forDB();
    var d = {name: e.name};
    if (e._key) { d._key = e._key; }
    res.json(G.linkSave(e._from, e._to, d));
  }).bodyParam('link', LinkParam);
  
  // Get referenced object by traversing the graph with edge labels.
  Controller.get(API('/g/:root/:key/*'), function (req, res) {
    var stub = getNode(req.params('root'), req.params('key'));
    var selection = req.params('s');
    if (req.suffix.length < 1) {
      var node = G.byId(stub);
      if (selection === '.') {
        return res.json(node.forClient());
      }
      var s = selection ? selection.split(/\s*,\s*/) : null;
      return res.json(G.getSource(node), s);
    }
                      
    var leaf = G.lastLink(stub, req.suffix);
    // I hate defensive programming    if (!leaf)
    //      throw new ArangoError();
    
    switch (selection) {
    case '.':  // return node data
      res.json(G.byId(leaf._to).forClient());
      break;
    case '..':  // return link data
      res.json(leaf);
      break;
    case undefined:
    case null:  // return original data
      res.json(G.getSource(G.byId(leaf._to)));
      break;
    default:  // pick selected attributes by "s=a,b,c".
      var re = /\s*,\s*/;  // split with ',' and trim space.
      var ss = selection.split(re);
      res.json(G.getSource(G.byId(leaf._to), ss));
    }
  }).pathParam('root', RootParam
   ).pathParam('key', KeyParam
   ).queryParam('s', SParam);

  
  // update link, node or data.
  Controller.put(API('/g/:root/:key/*'), function (req, res) {
    var node, result, leaf;
    var stub = getNode(req.params('root'), req.params('key'));
    var data = req.params('data');
    var source = req.params('s');
    
    // update stub node directly.
    if (req.suffix.length < 1) {
      if (source === '.') {
        return res.json(G.nodeUpdate(stub, data));
      }
      node = G.byId(stub);
      return res.json(G.updateSource(node, data));
    }

    leaf = G.lastLink(stub, req.suffix);
    switch (source) {
    case '..':  // update edge name only
      result = G.linkUpdate(leaf._id, data);
      break;
    case '.':  // update '_to' node of the edge.
      result = G.nodeUpdate(leaf._to, data);
      break;
    default:  // update data in source collection.
      node = G.byId(leaf._to);
      // exception: _key or _id of data must not be changed.
      result = G.updateSource(node, data);
    }

    res.json(result);
  }).pathParam('root', RootParam
   ).pathParam('key', KeyParam
   ).queryParam('s', SParam
   ).bodyParam('data', DataParam);


  // delete link, node or data.
  Controller.del(API('/g/:root/:key/*'), function (req, res) {
    var node, result, leaf;
    var stub = getNode(req.params('root'), req.params('key'));
    var source = req.params('s');
    
    if (req.suffix.length < 1) {
      if (source === '.') {
        result = G.nodeRemove(stub);
      } else {
        node = G.byId(stub);
        result = G.deleteSource(node);
      }
      return res.json({success: result});
    }

    leaf = G.lastLink(stub, req.suffix);
    switch (source) {
    case '..':  // delete edge.
      result = G.linkRemove(leaf._id);
      break;
    case '.':  // delete '_to' vertex of the edge and the edge self.
      result = G.nodeRemove(leaf._to);
      break;
    default:  // delete data in source collection, vertex and edge.
      node = G.byId(leaf._to);
      result = G.deleteSource(node);
    }

    res.json({success: result});
  }).pathParam('root', RootParam
   ).pathParam('key', KeyParam
   ).queryParam('s', SParam);
  
}());
