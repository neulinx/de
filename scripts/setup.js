(function () {
  'use strict';

  var console = require("console");
  var db = require("org/arangodb").db;
  var createCollection = function(collection) {
    var name = applicationContext.collectionName(collection);
    if (db._collection(name) === null) {
      db._create(name);
    } else if (applicationContext.isProduction) {
      console.warn("collection '%s' already exists. Leaving it untouched.", name);
    }
  };

  
}());
