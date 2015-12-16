'use strict';
const Foxx = require('org/arangodb/foxx');
const Joi = require('joi');

class Links extends Foxx.Model {
};
Links.prototype.schema = {
  _key: Joi.string(),
  _from: Joi.string(),
  _to: Joi.string(),
  name: Joi.string()
};

class Nodes extends Foxx.Model {
};
Nodes.prototype.schema = {
  _id: Joi.string(),
  _key: Joi.string(),
  ref: Joi.string(),
  type: Joi.string(),
  uuid: Joi.string(),
  data: Joi.any()
};

exports.Links = Links;
exports.Nodes = Nodes;
