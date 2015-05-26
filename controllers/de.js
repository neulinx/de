(function () {
  'use strict';
  var Controller, G,
      Foxx = require('org/arangodb/foxx'),
      Joi = require('joi'),
      ArangoError = require('org/arangodb').ArangoError,
      Model = require('models/de_graph'),
      Repo = require('repositories/de_graph'),
      Nodes = applicationContext.collection('nodes'),
      Graph = Gg._graph(applicationContext.collectionName('graph'));
      
  // Documenting and constraining parameters.
  var RootParam = {
    type: Joi.string().allow('_uuid', '_key', '_ref'),
    required: true,
    description: 'Three types of stub location.'
  },
      KeyParam = {
        type: Joi.string(),
        required: true,
        description: 'Identity, name or key.'
      },
      DataParam = {
        type: Joi.any(),
        required: true,
        description: 'Any type of data'
      },
      SParam = {  // What is S? source or selection.
        type: Joi.string().allow('.', '..', '.._'),  // '_' internal data.
        required: true,
        description: 'Location of data: ".", vertex; "..", edge.'
      },
      CParam = {  // What is C? confirmation, create collection on demand.
        type: Joi.string().allow('true', 'false', 'yes', 'no'),
        required: true,
        description: 'Create new collection on demand, whether or no.'
      };


  // Initialize global graph repository.
  G = new Repo.Graph(Nodes, {model: Model.Nodes, graph: Graph});
  G.vertices = Graph[Nodes.name()];
  G.edges = Graph[applicationContext.collectionName('links')];
  G.collection = G.vertices;

  var getNode = function(root, key) {
    if (root === '_uuid')
      return G.firstExample({uuid: key}).get('_id');
    
    if (root === '_key')
      return Nodes.name() + '/' + key;

    var ref;
    if (root === '_ref')
      ref = key;
    else
      ref = root + '/' + key;
    
    return G.firstExample({ref: ref}).get('_id');
  }
  
  // controller methods
  Controller = new foxx.Controller(applicationContext);

  // Fail-fast and avoid defensive programming.
  Controller.allRoutes.errorResponse(ArangoError, 404,
                                     'The route is not viable.');

  // Erlang way, :), pattern match.
  // Create orinal data, referee, and link
  // case 1: create link with existed node:
  //   URL: /g:/_uuid/1234abcdef/branch/leaf?s=..
  //   Data: {key: value}, key = '_uuid' or '_key' or '_ref'
  //   Result: link branch node to data node with label leaf.
  // case 2: create node and customize data in it. s='.' or no s parameter.
  //   URL: /g:/_key/root/branch/leaf?s=.
  //   Data: {_key:.., ref:.., type:.., uuid:.., data:..}
  //   Result: link branch node to leaf node with customized data.
  // case 3: create data in source colleciton and create new reference
  //   URL: /g:/collection/root/branch/leaf?s=source
  //   Data: {_key:.., data...}
  //   Result: create new data item in source collection and link it.
  Controller.post('/g:/:root/:key/*', function(req, res) {
    var node, result,
        stub = getNode(req.params('root'), req.params('key')),
        path = req.suffix.slice(),
        edgeName = path.pop(),
        leaf = G.leafEdge(stub, path),
        data = req.params('data'),
        source = req.params('s');
    
    switch (source) {
    case '..':  // create new edge to link internal nodes.
      for (var key in data) {  // todo: support _key of edge
        var value = data[key];
        node = getNode(key, value);
        result = G.edges.save(leaf._to, node, {name: edgeName});
        break;
      }
      break;
    case undefined:  // if 's' paramter is not present...
    case null:
    case '.':  // create new edge and new '_to' node.
      node = G.nodes.save(data);
      result = G.edges.save(leaf._to, node._id, {name: edgeName});
      break;
    default:  // create new data object in source collection and link it.
      result = G.newData(source, data);
      // todo: add more parameters to cutomize node.
      node = G.nodes.save({ref = result._id});
      result = G.edges.save(leaf._to, node._id, {name: edgeName});
    }

    res.json(result);
  }).pathParam('root', RootParam
              ).pathParam('key', KeyParam
                         ).queryParam('s', SParam
                                     ).bodyParam('data', DataParam);

  // Get referenced object by traversing the graph with edge labels.
  Controller.get('/g:/:root/:key/*', function(req, res) {
    var stub = getNode(req.params('root'), req.params('key')),
        leaf = G.leafEdge(stub, req.suffix),
        selection = req.params('s');
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
      var s = selection.split(re);
      var d = G.getSource(G.byId(leaf._to));
      res.json(_.pick(d, s));
    }
  }).pathParam('root', RootParam
              ).pathParam('key', KeyParam
                         ).queryParam('s', SParam);

  
  // update link, node or data.
  Controller.put('/g:/:root/:key/*', function(req, res) {
    var node, result,
        stub = getNode(req.params('root'), req.params('key')),
        leaf = G.leafEdge(stub, req.suffix),
        data = req.params('data'),
        source = req.params('s');
    
    switch (source) {
    case '..':  // update edge to another node.
      for (var key in data) { // {_uuid: ...} or {_key: ...} or {_ref: ...}
        var value = data[key];
        node = getNode(key, value);
        result = G.edges.update(leaf._id, {_to, node});
        break;
      }
      break;
    case '.._':  // update raw data of edge: {name: newName, _to: newEnd}.
      result = G.edges.update(leaf._id, data);
      break;
      
    case '.':  // update '_to' node of the edge.
      result = G.nodes.update(leaf._to, data);
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
  Controller.delete('/g:/:root/:key/*', function(req, res) {
    var result,
        stub = getNode(req.params('root'), req.params('key')),
        leaf = G.leafEdge(stub, req.suffix),
        source = req.params('s');
    
    switch (source) {
    case '..':  // delete edge.
      result = G.edges.remove(leaf._id);
      break;
    case '.':  // delete '_to' vertex of the edge and the edge self.
      result = G.nodes.remove(leaf._to);
      break;
    default:  // delete data in source collection, vertex and edge.
      var node = G.byId(leaf._to);
      result = G.deleteSource(node);
    }

    res.json(result);
  }).pathParam('root', RootParam
              ).pathParam('key', KeyParam
                         ).queryParam('s', SParam);
  

}());
