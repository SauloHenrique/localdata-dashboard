/*jslint nomen: true */
/*globals define: true */

define([
  'jquery',
  'lib/lodash',
  'backbone',
  'settings'
],

function($, _, Backbone, settings) {
  'use strict';

  var Zones = {};

  // Zone model
  Zones.Model = Backbone.Model.extend({
  });


  // Zone collection
  Zones.Collection = Backbone.Collection.extend({
    model: Zones.Model
  });


  return Zones;

}); // End Forms module
