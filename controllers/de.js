/*globals require, applicationContext */

'use strict';
const Version = 'v1';
function API(path) {
  return '/' + Version + path;
};

const Foxx = require('org/arangodb/foxx');
const Joi = require('joi');
const ArangoError = require('org/arangodb').ArangoError;
const Repo = require('repositories/de_graph');
const Model = require('models/de_graph');

// Documenting and constraining parameters.
const RootParam = {
  type: Joi.string().allow('_uuid', '_key', '_ref', '_path'),
  required: true,
  description: 'Three types of stub location.'
};
const KeyParam = {
  type: Joi.string(),
  required: true,
  description: 'Identity, name or key.'
};
const DataParam = {
  type: Joi.any(),
  required: true,
  description: 'Any type of data'
};
const SParam = {  // What is S? source or selection.
  type: Joi.string().allow('.', '..', '.._'),  // '_' internal data.
  description: 'Location of data: ".", vertex; "..", edge.'
};
const LinkParam = {
  type: Model.Links,
  required: true,
  description: 'Edge of graph data.'
};
const NodeParam = {
  type: Model.Nodes,
  required: true,
  description: 'Vertex of graph data.'
};


// Initialize global graph repository.
let G;
if (applicationContext.collection('nodes')) {
  G = new Repo.Graph(applicationContext);
}

function getNode(root, key) {
  if (root === '_uuid') {
    return G.firstExample({ uuid: key }).get('_id');
  }

  if (root === '_key') {
    return G.nodesName() + '/' + key;
  }

  const ref = root + '/' + key;
  return G.firstExample({ ref: ref }).get('_id');
};

function getNodeByData(data, stub, leaf) {
  // get first key only!
  let key = Object.getOwnPropertyNames(data)[0];
  let value = data[key];

  if (key === '_ref') {
    return G.firstExample({ ref: value }).get('_id');
  }

  if (key === '_path') {
    const path = value.split('/');
    let link;
    switch (path[0]) {
      case '':  // "/a/b/c"
        const root = getNode(path[1], path[2]);
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
const Controller = new Foxx.Controller(applicationContext);

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
  let leaf, node, result;
  const stub = getNode(req.params('root'), req.params('key'));
  const path = req.suffix.slice();
  const linkName = path.pop();
  const link = G.lastLink(stub, path);
  const data = req.params('data');
  const source = req.params('s');

  leaf = link ? link._to : stub;

  switch (source) {
    case '..':  // create new edge to link internal nodes.
      node = getNodeByData(data, stub, leaf);
      result = G.linkSave(leaf, node, { name: linkName });
      break;
    case undefined:  // if 's' paramter is not present...
    case null:
    case '.':  // create new edge and new '_to' node.
      node = G.nodeSave(data);
      result = G.linkSave(leaf, node._id, { name: linkName });
      break;
    default:  // create new data object in source collection and link it.
      result = G.newData(source, data);
      // todo: add more parameters to cutomize node.
      node = G.nodeSave({ ref: result._id });
      result = G.linkSave(leaf, node._id, { name: linkName });
  }

  res.json(result);
}).pathParam('root', RootParam
  ).pathParam('key', KeyParam
    ).queryParam('s', SParam
      ).bodyParam('data', DataParam);

// The backdoor for raw data operation of edge and vertex.
Controller.post(API('/g/._'), function (req, res) {
  const n = req.params('node');
  res.json(G.save(n).forClient());
}).bodyParam('node', NodeParam);

Controller.post(API('/g/.._'), function (req, res) {
  const e = req.params('link').forDB();
  const d = { name: e.name };
  if (e._key) { d._key = e._key; }
  res.json(G.linkSave(e._from, e._to, d));
}).bodyParam('link', LinkParam);
  
// Get referenced object by traversing the graph with edge labels.
Controller.get(API('/g/:root/:key/*'), function (req, res) {
  const stub = getNode(req.params('root'), req.params('key'));
  const selection = req.params('s');
  if (req.suffix.length < 1) {
    const node = G.byId(stub);
    if (selection === '.') {
      return res.json(node.forClient());
    }
    const s = selection ? selection.split(/\s*,\s*/) : null;
    return res.json(G.getSource(node), s);
  }

  const leaf = G.lastLink(stub, req.suffix);
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
      const re = /\s*,\s*/;  // split with ',' and trim space.
      const ss = selection.split(re);
      res.json(G.getSource(G.byId(leaf._to), ss));
  }
}).pathParam('root', RootParam
  ).pathParam('key', KeyParam
    ).queryParam('s', SParam);

  
// update link, node or data.
Controller.put(API('/g/:root/:key/*'), function (req, res) {
  let node, result, leaf;
  const stub = getNode(req.params('root'), req.params('key'));
  const data = req.params('data');
  const source = req.params('s');
    
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
Controller.delete(API('/g/:root/:key/*'), function (req, res) {
  let node, result, leaf;
  const stub = getNode(req.params('root'), req.params('key'));
  const source = req.params('s');

  if (req.suffix.length < 1) {
    if (source === '.') {
      result = G.nodeRemove(stub);
    } else {
      node = G.byId(stub);
      result = G.deleteSource(node);
    }
    return res.json({ success: result });
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

  res.json({ success: result });
}).pathParam('root', RootParam
  ).pathParam('key', KeyParam
    ).queryParam('s', SParam);
   
