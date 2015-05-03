(function () {
  'use strict';
  var Foxx = require('org/arangodb/foxx'),
      ArangoError = require('org/arangodb').ArangoError,
      joi = require('joi'),
      StubDescription = {
        type: joi.string().required().description(
          'Relative root of the graph'
        ),
        allowMultiple: false
      },
//      actions = require("org/arangodb/actions"),
      controller;

  controller = new Foxx.Controller(applicationContext);

  /** Lists of all View
   *
   * This function simply returns the list of all View.
   */
//  controller.get('/g/:stub/*', function (req, res) {
/*    res.responseCode = actions.HTTP_OK;
    res.contentType = "application/json; charset=utf-8";
    res.body = JSON.stringify({"stub": req.params('stub'), "request": req});
*/
//    res.json({ stub: req.params('stub'), path: req.suffix});
//  }).pathParam('stub', StubDescription);

  controller.get('/g/*', function (req, res) {
    res.json({path: req.suffix});
  });
  
}());

