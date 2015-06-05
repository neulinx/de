(function () {
  'use strict';
  var Foxx = require('org/arangodb/foxx');
  var Joi = require('joi');

  var Links = Foxx.Model.extend({
    schema: {
      _key: Joi.string(),
      _from: Joi.string(),
      _to: Joi.string(),
      name: Joi.string()
    }
  });

  var Nodes = Foxx.Model.extend({
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
