(function () {
  'use strict';
  var Foxx = require('org/arangodb/foxx'),
      Joi = require('joi'),
      Links, Nodes;

  Links = Foxx.Model.extend({
    schema: {
      _key: Joi.string(),
      _from: Joi.string(),
      _to: Joi.string(),
      name: Joi.string() 
    }
  });

  Nodes = Foxx.Model.extend({
    schema: {
      _id: Joi.string(),
      _key: Joi.string(),
      ref: Joi.string(),
      type: Joi.string(),
      uuid: Joi.string(),
      data: Joi.any()
    }
  });

  
  exports.Links = Links;
  exports.Nodes = Nodes;
}());
