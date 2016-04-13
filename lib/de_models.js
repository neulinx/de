'use strict';

const _foxx = require('org/arangodb/foxx');
const _joi = require('joi');

class Links extends _foxx.Model {};
Links.prototype.schema = {
  _key: _joi.string(),
  _from: _joi.string(),
  _to: _joi.string(),
  name: _joi.string()
};

class Nodes extends _foxx.Model {};
Nodes.prototype.schema = {
  _id: _joi.string(),
  _key: _joi.string(),
  ref: _joi.string(),
  type: _joi.string(),
  uuid: _joi.string(),
  data: _joi.any()
};

exports.Links = Links;
exports.Nodes = Nodes;