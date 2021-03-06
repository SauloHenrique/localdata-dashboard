/*jslint nomen: true */
/*globals define: true */

define(function (require) {
  'use strict';

  var settings = require('settings');
  var _ = require('lib/lodash');
  var $ = require('jquery');
  var L = require('lib/leaflet/leaflet');

  var api = {};

  // Return the current hostname.
  // TODO: Should be in util
  api.getBaseURL = function() {
    if (window.location.protocol != "https:") {
      return "https://" + window.location.host;
    }

    return "http://" + window.location.host;
  };

  // Check if the user is authenticated
  api.getUser = function(callback) {
    var url = settings.api.baseurl + "/user";

    $.getJSON(url, function(data) {
      callback(data);
    });
  };

  // Create a new user
  //
  // @param {Object} user Name, email, and password for the user
  // @param {Function} callback Parameters: (error, user)
  api.createUser = function(user, callback) {

    var url = settings.api.baseurl + "/user";

    var request = $.ajax({
      url: url,
      type: "POST",
      data: user,
      dataType: "json"
    });

    request.done(function(user) {
      callback(null, user);
    });

    request.fail(function(jqXHR, textStatus, errorThrown) {
      console.log("Request failed: ", jqXHR);
      callback($.parseJSON(jqXHR.responseText), null);
    });
  };


  // Log a user in
  //
  // @param {Object} user Email and password for the user
  // @param {Function} callback Parameters: (error, user)
  api.logIn = function(user, callback) {

    var url = settings.api.baseurl + "/login";

    var request = $.ajax({
      url: url,
      type: "POST",
      data: user,
      dataType: "json"
    });

    request.done(function(response) {
      console.log(response);
      if(response.name === "BadRequestError") {
        callback(response, null);
        return;
      }
      callback(null, response);
    });

    request.fail(function(jqXHR, textStatus, errorThrown) {
      console.log("Request failed: ", jqXHR);
      callback(jqXHR.responseText, null);
    });

  };

  api.resetPassword = function resetPassword(user, token, done) {
    var url = settings.api.baseurl + '/user/reset';
    var data = {
      reset: {
        email: user.email,
        token: token,
        password: user.password
      }
    };

    $.ajax({
      url: url,
      type: 'POST',
      data: data,
      dataType: 'json'
    }).done(function (response) {
      api.logIn(user, done);
    }).fail(function (jqXHR, textStatus, errorThrown) {
      console.log('Password reset failed.');
      done(JSON.parse(jqXHR.responseText));
    });
  };

  // Create a new survey
  api.createSurvey = function(survey, callback) {
    var url = settings.api.baseurl + "/surveys";

    console.log(url);

    var request = $.ajax({
      url: url,
      type: "POST",
      data: {"surveys": [survey]},
      dataType: "json"
    });

    request.done(function(surveys) {
      callback(surveys.surveys[0]);
    });

    request.fail(function(jqXHR, textStatus) {
      console.log("Request failed: " + textStatus);
    });
  };


  // Find a survey by slug
  // Given a slug (eg 'just-a-surey') Sets settings.surveyId
  api.setSurveyIdFromSlug = function(slug, callback) {
    var url = settings.api.baseurl +  "/slugs/" + slug;
    console.log("Survey slug: " + url);

    // Save ourselves an ajax request
    if (settings.slug === slug && settings.surveyId !== null) {
      return callback();
    }

    // TODO: Display a nice error if the survey wans't found.
    $.getJSON(url, function(data) {
      console.log("Survey Id: " + data.survey);
      settings.slug = slug;
      settings.surveyId = data.survey;
      callback();

    });
  };


  // Generates the URL for the current survey
  // (Current survey is set by setSurveyIdFromSlug, above)
  api.getSurveyURL = function() {
    return settings.api.baseurl + "/surveys/" + settings.surveyId;
  };


  // Generates the URL for the current survey's resposnes
  api.getParcelDataURL = function(parcel_id) {
    return settings.api.baseurl + '/surveys/' + settings.surveyId + '/parcels/' + parcel_id + '/responses';
  };


  // Get the form for the current survey
  api.getForm = function(callback) {
    console.log("API: getting form data");
    var url = api.getSurveyURL() + "/forms";

    $.getJSON(url, function(data){

      // Get only the mobile forms
      var mobileForms = _.filter(data.forms, function(form) {
        if (_.has(form, 'type')) {
          if (form.type === 'mobile'){
            return true;
          }
        }
        return false;
      });

      // Endpoint should give the most recent form first.
      // And that's what we'll use
      settings.formData = mobileForms[0];

      callback();
    });
  };

  // Add a form to a survey
  //
  // @param {Object} form
  // @param {Function} callback Currently takes no parameters
  // @param {Object} options Include a surveyId to save to a different survey
  api.createForm = function(form, callback, options) {
    console.log("API: creating a form");
    var key;

    // Only save the fields we want
    var newForm = {};
    newForm.name = form.name;
    newForm.type = form.type;
    newForm.questions = form.questions;

    // Add the form to the current survey
    // Or, if a custom surveyId is defined in options, use that.
    var surveyId = settings.surveyId;
    if(_.has(options, "surveyId")) {
      surveyId = options.surveyId;
    }

    var url = settings.api.baseurl + '/surveys/' + surveyId + '/forms/';
    var data = { forms: [ newForm ] };

    // Post the form data
    $.post(url, data, function() {}, 'text').error(function(error){
        console.log("Error posting form:", error);
    }).success(function(){
      callback();
    });

  };

  // Deal with the formatting of the geodata API.
  // In the future, this will be more genericized.
  // parcel_id => object_id
  // address => object_location
  api.parseObjectData = function(data) {
    return {
      parcelId: data.parcelId,
      address: data.address,
      polygon: data.polygon,
      centroid: data.centroid
    };
  };


  // Geodata stuff .............................................................
  // Queries to the geodata API, geocoding, and more
  api.getGeoBoundsObjectsURL = function(southwest, northeast) {
    return settings.api.geo + '/parcels?bbox=' + southwest.lng + "," + southwest.lat + "," + northeast.lng + "," + northeast.lat;
  };

  // Geocode an address
  // Take an address string.
  // Add "Detroit" to the end.
  // Return the first result as a lat-lng for convenience.
  // Or Null if Bing is being a jerk / we're dumb.
  /**
   * Geocode an address
   * @param  {String}   address  eg "123 foo street"
   * @param  {String}   region   A region to narrow the search. eg "Detroit, MI"
   * @param  {Function} callback Takes params in the format error, {addressLine, latlng}
   */
  api.codeAddress = function(address, region, callback) {
    // TODO: Can we get the locale from the geolocation feature?
    // If the user-entered address does not include a city, append the survey location.
    var addressWithLocale = address;

    // If there is a comma in the address, assume the user added the city.
    if (address.indexOf(',') === -1) {
      // See if the survey location is part of the user-entered address.
      // Assume survey location is of the form "City, State", "City, State, USA", or "City, State ZIP"
      var addressLower = address.toLocaleLowerCase();
      var locationComponents = region.split(',');
      var containsLocale = false;

      // TODO: Check the tail parts of the survey location.

      // Check the first part of the survey location.
      var city = locationComponents[0].toLocaleLowerCase().trim();
      if (addressLower.length >= city.length && addressLower.substr(addressLower.length - city.length, city.length) === city) {
        containsLocale = true;
        // Add the remaining location components.
        addressWithLocale = addressWithLocale + ', ' + locationComponents.slice(1).join(',');
      }

      if (!containsLocale) {
        addressWithLocale = addressWithLocale + ', ' + region;
      }
    }

    // Strip spaces
    addressWithLocale = addressWithLocale.replace(/^\s+|\s+$/g, '');

    var geocodeEndpoint = 'https://dev.virtualearth.net/REST/v1/Locations/' + addressWithLocale + '?o=json&key=' + settings.BingKey + '&jsonp=?';

    $.ajax({
      url: geocodeEndpoint,
      dataType: 'json',
      success: function (data) {
        if (data.resourceSets.length > 0){
          var result = data.resourceSets[0].resources[0];
          callback(null, {
            addressLine: result.address.addressLine,
            coords: result.point.coordinates
          });
        } else {
          callback({
            type: 'GeocodingError',
            message: 'No geocoding results found'
          });
        }
      },
      error: function(jqXHR, textStatus, errorThrown) {
        console.log(jqXHR, textStatus, errorThrown);
        callback({
          type: 'GeocodingError',
          message: 'Geocoding failed'
        });
      }
    });
  };

  // Get a chunk of responses.
  // If startIndex or count are not provided, get all of the responses.
  // callback(error, responses)
  // Options as follows
  // options: {
  //  startIndex: int,
  //  count: int,
  //  sort: ('asc'|'desc') -- sort by date. defaults to 'asc'
  // }
  api.getResponses = function (options, callback) {
    var url;
    if (options.sort === undefined) {
      options.sort = 'desc';
    }
    if (options.startIndex === undefined || options.count === undefined) {
      url = api.getSurveyURL() + '/responses';
    } else {
      url = api.getSurveyURL() + '/responses?startIndex=' + options.startIndex + '&count=' + options.count + '&sort=' + options.sort;
    }

    $.getJSON(url, function (data) {
      if (_.isArray(data.responses)) {
        callback(null, data.responses);
      } else {
        callback({
          type: 'APIError',
          message: 'Received an invalid response from the API'
        });
      }
    });
  };

  // Get all the responses in a given bounding box
  // Take a map bounds object
  // Find the objects in the bounds
  // Feed those objects to the callback
  api.getResponsesInBounds = function(bounds, callback) {
    var southwest = bounds.getSouthWest();
    var northeast = bounds.getNorthEast();

    // Given the bounds, generate a URL to ge the responses from the API.
    var serializedBounds = southwest.lat + "," + southwest.lng + "," + northeast.lat + "," + northeast.lng;
    var url = api.getSurveyURL() + "/responses/in/" + serializedBounds;

    // Give the callback the responses.
    $.getJSON(url, function(data){
      if(data.responses) {
        callback(data.responses);
      }
    });
  };

  // Add a 100% buffer to a bounds object.
  // Makes parcels render faster when the map is moved
  var addBuffer = function(bounds) {
    var sw = bounds.getSouthWest();
    var ne = bounds.getNorthEast();

    var lngDiff = ne.lng - sw.lng;
    var latDiff = ne.lat - sw.lat;

    var lngMod = lngDiff / 2;
    var latMod = latDiff / 2;

    var newSW = new L.LatLng(sw.lat - latMod, sw.lng - lngMod);
    var newNE = new L.LatLng(ne.lat + latMod, ne.lng + lngMod);

    return new L.LatLngBounds(newSW, newNE);
  };

  // Get all the objects in the map bounds from the GeoAPI
  // Take a map bounds object
  // Find the parcels in the bounds
  // Feed those objects to the callback
  api.getObjectsInBounds = function(bounds, callback) {
    var bufferedBounds = addBuffer(bounds);
    var southwest = bufferedBounds.getSouthWest();
    var northeast = bufferedBounds.getNorthEast();

    // Given the bounds, generate a URL to ge the responses from the API.
    var url = api.getGeoBoundsObjectsURL(southwest, northeast);
    console.log(url);

    // Give the callback the responses.
    $.getJSON(url, function(data){
      if(data) {
        callback(data);
      }
    });
  };

  return api;
});
