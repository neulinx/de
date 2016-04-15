'use strict';

/*globals require, applicationContext */

const _version = 'v1';
function API(path) {
  return '/' + _version + path;
};

const _foxx = require('org/arangodb/foxx');
const _joi = require('joi');
const _arangoError = require('org/arangodb')._arangoError;
const _repo = require('../lib/de_graph');
const _model = require('../lib/de_models');

const _log = require('console').log;
const _handlebars = require('handlebars');

// Documenting and constraining parameters.
const RootParam = {
  type: _joi.string().allow('_uuid', '_key', '_ref', '_path'),
  required: true,
  description: 'Three types of stub location.'
};
const KeyParam = {
  type: _joi.string(),
  required: true,
  description: 'Identity, name or key.'
};
const DataParam = {
  type: _joi.any(),
  required: true,
  description: 'plain text or json'
};
const SParam = { // What is S? source or selection.
  type: _joi.string().allow('.', '..', '.._'), // '_' internal data.
  description: 'Location of data: ".", vertex; "..", edge.'
};
const RenderParam = {
  type: _joi.any(),
  description: 'Render template by data.'
};
const LinkParam = {
  type: _model.Links,
  required: true,
  description: 'Edge of graph data.'
};
const NodeParam = {
  type: _model.Nodes,
  required: true,
  description: 'Vertex of graph data.'
};

// Initialize global graph repository.
let G;
if (applicationContext.collection('nodes')) {
  G = new _repo.Graph(applicationContext);
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
  if (data._ref) {
    return G.firstExample({ ref: data._ref }).get('_id');
  }

  if (data._path) {
    return getNodeByPath(data._path, stub, leaf);
  }

  if (data._uuid) {
    return G.firstExample({ uuid: data._uuid }).get('_id');
  }

  if (data._key) {
    return G.nodesName() + '/' + data._key;
  }

  throw new Error('Unknown data format.');
}

function getNodeByPath(location, root, leaf) {
  let path = location.split('/');
  let link;
  if (!leaf) {
    // treat ./a/b/c same as a/b/c
    leaf = root;
  }
  switch (path[0]) {
    case '':
      // "/a/b/c", stub changed.
      root = getNode(path[1], path[2]);
      if (path.length < 4) {
        return root;
      }
      link = G.lastLink(root, path.slice(3));
      break;
    case '.':
      // "./a/b/c"
      link = G.lastLink(leaf, path.slice(1));
      break;
    default:
      // "a/b/c"
      link = G.lastLink(root, path);
  }
  return link._to;
}

function render(res, path, leaf, root) {
  let data = G.getSource(leaf);
  data._gid = leaf.split('/')[1];
  let tplNode = data;
  if (path) {
    tplNode = G.getSource(getNodeByPath(path, root, leaf));
  }
  let ct = tplNode._contentType;
  let tpl = _handlebars.compile(tplNode._template);
  let output = tpl(data);
  if (ct) {
    res.set("Content-Type", ct);
  }
  return res.send(output);
}

_handlebars.registerHelper('locate', function () {
  let path = arguments[0];
  let key, options, isBlock;
  if (arguments.length === 2) {
    options = arguments[1];
    isBlock = true;
  } else if (arguments.length === 3) {
    options = arguments[2];
    key = arguments[1];
  } else {
    throw new Error('Unknown "locate" command!');
  }
  let leaf = getNode('_key', this._gid);
  let root = getNode('_key', options.data.root._gid);
  let node = getNodeByPath(path, root, leaf);
  let context;
  if (isBlock) {
    context = G.forClient(node);
    return options.fn(context);
  }
  context = G.getSource(node);
  return context[key];
});

// controller methods
const Controller = new _foxx.Controller(applicationContext);

// Fail-fast and avoid defensive programming.
// In development phase, produce detailed error description.
if (applicationContext.isProduction) {
  Controller.allRoutes.errorResponse(_arangoError, 404, 'The route is not viable.');
  Controller.allRoutes.errorResponse(TypeError, 404, 'The route is not viable.');
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
// case 4: render template in the body by current node.
//   URL: /g/_key/root/branch/leaf?r
//   Data: text of handlerbars template.
//   Result: compile the template and render with the node.
Controller.post(API('/g/:root/:key/*'), function (req, res) {
  let leaf, node, result;
  const stub = getNode(req.params('root'), req.params('key'));
  const rt = req.params('r');
  if (rt !== void 0) {
    if (req.suffix.length < 1) {
      leaf = stub;
    } else {
      leaf = G.lastLink(stub, req.suffix)._to;
    }
    const tpl = _handlebars.compile(req.rawBody());
    const output = tpl(G.forClient(leaf));
    if (rt) {
      res.set("Content-Type", rt);
    }
    return res.send(output);
  }
  const path = req.suffix.slice();
  const linkName = path.pop();
  const link = G.lastLink(stub, path);
  const source = req.params('s');
  const data = req.body();
  leaf = link ? link._to : stub;

  switch (source) {
    case '..':
      // create new edge to link internal nodes.
      node = getNodeByData(data, stub, leaf);
      result = G.linkSave(leaf, node, { name: linkName });
      break;
    case undefined: // if 's' paramter is not present...
    case null:
    case '.':
      // create new edge and new '_to' node.
      node = G.nodeSave(data);
      result = G.linkSave(leaf, node._id, { name: linkName });
      break;
    default:
      // create new data object in source collection and link it.
      result = G.newData(source, data);
      // todo: add more parameters to cutomize node.
      node = G.nodeSave({ ref: result._id });
      result = G.linkSave(leaf, node._id, { name: linkName });
  }

  res.json(result);
}).pathParam('root', RootParam).pathParam('key', KeyParam).queryParam('s', SParam).queryParam('r', RenderParam);
// ).bodyParam('data', DataParam);

// The backdoor for raw data operation of edge and vertex.
Controller.post(API('/g/._'), function (req, res) {
  const n = req.params('node');
  res.json(G.save(n).forClient());
}).bodyParam('node', NodeParam);

Controller.post(API('/g/.._'), function (req, res) {
  const e = req.params('link').forDB();
  const d = { name: e.name };
  if (e._key) {
    d._key = e._key;
  }
  res.json(G.linkSave(e._from, e._to, d));
}).bodyParam('link', LinkParam);

// Get referenced object by traversing the graph with edge labels.
Controller.get(API('/g/:root/:key/*'), function (req, res) {
  const stub = getNode(req.params('root'), req.params('key'));
  const selection = req.params('s');
  const r = req.params('r');

  if (req.suffix.length < 1) {
    // render template
    if (r !== void 0) {
      return render(res, r, stub, stub);
    }
    let node = G.byId(stub);
    if (selection === '.') {
      // vertex
      return res.json(node.forClient());
    }
    // data
    const s = selection ? selection.split(/\s*,\s*/) : null;
    return res.json(G.forClient(node, s));
  }

  const leaf = G.lastLink(stub, req.suffix);
  // I hate defensive programming    if (!leaf)
  //      throw new _arangoError();
  if (r !== void 0) {
    return render(res, r, leaf._to, stub);
  }

  switch (selection) {
    case '.':
      // return node data
      res.json(G.byId(leaf._to).forClient());
      break;
    case '..':
      // return link data
      res.json(leaf);
      break;
    case undefined:
    case null:
      // return original data
      res.json(G.forClient(leaf._to));
      break;
    default:
      // pick selected attributes by "s=a,b,c".
      const re = /\s*,\s*/; // split with ',' and trim space.
      const ss = selection.split(re);
      res.json(G.forClient(leaf._to, ss));
  }
}).pathParam('root', RootParam).pathParam('key', KeyParam).queryParam('s', SParam).queryParam('r', RenderParam);

// update link, node or data.
Controller.put(API('/g/:root/:key/*'), function (req, res) {
  let result, leaf;
  const stub = getNode(req.params('root'), req.params('key'));
  const data = req.params('data');
  const source = req.params('s');

  // update stub node directly.
  if (req.suffix.length < 1) {
    if (source === '.') {
      return res.json(G.nodeUpdate(stub, data));
    }
    return res.json(G.updateSource(stub, data));
  }

  leaf = G.lastLink(stub, req.suffix);
  switch (source) {
    case '..':
      // update edge name only
      result = G.linkUpdate(leaf._id, data);
      break;
    case '.':
      // update '_to' node of the edge.
      result = G.nodeUpdate(leaf._to, data);
      break;
    default:
      // update data in source collection.
      // exception: _key or _id of data must not be changed.
      result = G.updateSource(leaf._to, data);
  }

  res.json(result);
}).pathParam('root', RootParam).pathParam('key', KeyParam).queryParam('s', SParam).bodyParam('data', DataParam);

// delete link, node or data.
Controller.delete(API('/g/:root/:key/*'), function (req, res) {
  let result, leaf;
  const stub = getNode(req.params('root'), req.params('key'));
  const source = req.params('s');

  if (req.suffix.length < 1) {
    if (source === '.') {
      result = G.nodeRemove(stub);
    } else {
      result = G.deleteSource(stub);
    }
    return res.json({ success: result });
  }

  leaf = G.lastLink(stub, req.suffix);
  switch (source) {
    case '..':
      // delete edge.
      result = G.linkRemove(leaf._id);
      break;
    case '.':
      // delete '_to' vertex of the edge and the edge self.
      result = G.nodeRemove(leaf._to);
      break;
    default:
      // delete data in source collection, vertex and edge.
      result = G.deleteSource(leaf._to);
  }

  res.json({ success: result });
}).pathParam('root', RootParam).pathParam('key', KeyParam).queryParam('s', SParam);