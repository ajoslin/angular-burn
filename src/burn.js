
var burnModule = angular.module('burnbase', []);
var copy = angular.copy;
var equals = angular.equals;
var extend = angular.extend;
var forEach = angular.forEach;
var isArray = angular.isArray;
var isDate = angular.isDate;
var isDefined = angular.isDefined;
var isFunction = angular.isFunction;
var isNumber = angular.isNumber;
var isObject = angular.isObject;
var isString = angular.isString;
var noop = angular.noop;

burnModule.factory('Firebase', ['$window', function($window) {
  return $window.Firebase;
}]);

burnModule.factory('Burn', ['$parse', '$rootScope', 'Firebase', '$q',
function($parse, $rootScope, Firebase, $q) {

  return Burn;

  function Burn(context, name, ref) {
    var self = {};
    if (!isObject(context)) {
      throw new Error('Expected object `context` as first parameter, instead got an "' +
                      typeof context + '"!');
    }
    if (!name) {
      throw new Error("Expected key `name` of `context` as second parameter string!");
    }
    if (!isString(ref) && !isObject(ref)) {
      throw new Error('Expected either firebase url or firebase reference as third paramater, ' +
                      'got "' + typeof ref + '"!');

    }
    var unbindWatch = noop; //reassigned once initial value arrives to unbind a $watch

    //Resolved once initial value comes down
    var readyDeferred = $q.defer();

    if (isString(ref)) {
      ref = new Firebase(ref);
    }

    ref.once('value', function(snap) {
      $rootScope.$evalAsync(function() {
        init(snap.val());
      });
    });

    context.$on && context.$on('$destroy', destroy);
    self.destroy = destroy;
    self.isReady = false;
    self.ready = function() {
      return readyDeferred.promise;
    };

    return self;

    function destroy() {
      ref.off();
      unbindWatch();
    }

    function init(remoteValue) {
      var merged = burnMerge(remoteValue, context[name]);
      if (isObject(merged)) {
        extend(context[name], merged);
      } else {
        context[name] = merged;
      }

      firebaseBindRef();
      var watchFn = makeObjectReporterFn(context, name, onLocalChange);

      $rootScope.$watch(watchFn, noop);

      function onLocalChange(path, newValue) {
        var childRef = path.length ? ref.child(path.join('/')) : ref;

        //Update objects instead of just setting (not sure why, angularFire does this so we do too)
        if (isObject(newValue) && !isArray(newValue)) {
          childRef.update(newValue);
        } else {
          childRef.set(newValue);
        }
      }

      self.isReady = true;
      readyDeferred.resolve();
    }

    function firebaseBindRef(path) {
      path = path || [];
      var watchRef = path.length ? ref.child(path.join('/')) : ref;
      listen('child_added');
      listen('child_removed');
      listen('child_changed');
      if (!path.length) {
        //listen to value on the top-level, incase we have a primitive at the top-level 
        //(eg if our top-value is 1, child_* events will never happen)
        listen('value');
      }
      function listen(type) {
        watchRef.on(type, function(snap) {
          var key = snap.name();
          var value = snap.val();
          var childRef = watchRef.child(key);
          switch(type) {
            case 'child_added':
              //For objects, watch each child
              if (isObject(value)) {
                firebaseBindRef( path.concat(key) );
              }
              invokeChange(type, path, key, value);
              break;
            case 'child_removed':
              invokeChange(type, path, key, value);
              //Unbind all child changes
              firebaseUnbindRef(path, key, value);
              break;
            case 'child_changed':
              //Only call changes at their root
              if (!isObject(value)) {
                invokeChange(type, path, key, value);
              }
              break;
            case 'value': 
              //Three cases in which we need to reassign the top level:
              //1) if top level is a primitive (eg changing 1 to 2 or string to string)
              //2) if top level was a primitive and we are changing to object, reassign
              //3) if top level was an object and we are changing to primitive, reassign
              if (!isObject(value) || !isObject(context[name])) {
                $rootScope.$evalAsync(function() {
                  context[name] = value;
                });
              }
              break;
          }
        });
      }
    }
    function firebaseUnbindRef(path, key, value) {
      //Unbind this ref, then if the value removed is an object, unbind anything watching
      //all of the object's child key/value pairs.
      //Eg if we remove an object { a: 1, b: { c: { d: 'e' } } }, it should call .off()
      //on the parent, a/b, a/b, and a/b/c
      if (isObject(value)) {
        forEach(value, function(childValue, childKey) {
          firebaseUnbindRef(path.concat(key), childKey, childValue);
        });
      }
      path.length && ref.child(path.join('/')).off();
    }
    function invokeChange(type, path, key, value) {
      $rootScope.$evalAsync(function() {
        var changeContext;
        switch(type) {
          case 'child_removed':
            changeContext = parsePath($parse, name, path)(context);
            if (isArray(changeContext)) {
              changeContext.splice(key, 1);
            }  else if (changeContext) {
              delete changeContext[key];
            }
            break;
          case 'child_added':
            changeContext = parsePath($parse, name, path)(context);
            if (changeContext) {
              changeContext[key] = value;
            }
            break;
          case 'child_changed':
            //We use $parse instead of changeContext[key] = value here because $parse
            //will create non-existant children on the way for us
            path = path.concat(key);
            parsePath($parse, name, path).assign(context, value);
        }
      });
    }
  }

}]);

function parsePath($parse, name, path) {
  //turn ['key with spaces',  '123bar'] into 'name["key with spaces"]["123bar"]'
  var expr = name;
  for (var i=0, ii=path.length; i<ii; i++) {
    if (isNumber(path[i])) {
      expr += '[' + path[i] + ']';
    } else {
      //We're sure to escape keys with quotes in them, 
      //so eg ['quote"key"'] turns into 'context["quote\"key]'
      expr += '["' + path[i].replace(/"/g, '\\"') + '"]';
    }
  }
  return $parse(expr);
}

//burnCopy: copy a value and remove $-prefixed attrs
function burnCopy(value) {
  //Do nothing for arrays and primitives
  if (!isArray(value) && isObject(value)) {
    var cloned = {};
    for (var key in value) {
      if (value.hasOwnProperty(key) && key.charAt(0) !== '$' && isDefined(value[key])) {
        cloned[key] = value[key];
      }
    }
    return cloned;
  }
  return value;
}

function burnMerge(remote, local) {
  var merged;
  if (equals(remote, local)) {
    return local;
  } else if (isArray(remote) && isArray(local)) {
    return local.concat(remote);
  } else if (isObject(remote) && isObject(local)) {
    merged = local;
    for (var key in remote) {
      merged[key] = remote[key];
    }
    return merged;
  } else if ((remote === undefined || remote === null) && isDefined(local)) {
    return local;
  } else {
    //Eg if remote is a primitive this will fire
    return remote;
  }
}
function makeObjectReporterFn(object, name, callback) {
  var savedObject = {};

  return function() {
    compare(savedObject, object, name, []);
  };

  function reportChange(path, newValue) {
    path.shift(); //first item in path is the `name`, we don't need this
    callback(path, newValue);
  }

  function compare(oldObject, newObject, key, path) {
    var newValue = newObject[key];
    var oldValue = oldObject[key];
    var childKey;

    if (!isObject(newValue)) {
      if (newValue !== oldValue) {
        oldObject[key] = newValue;
        reportChange(path.concat(key), newValue);
      }
    } else if (isArray(newValue)) {
      if (!isArray(oldValue)) {
        //if new value is array and old wasn't, just copy the whole array and update 
        reportChange(path.concat(key), newValue);
        oldObject[key] = oldValue = newValue.slice();
        return; 
      }

      //If old array is bigger, report deletion
      if (oldValue.length > newValue.length) {
        for (i=newValue.length,ii=oldValue.length; i<ii; i++) {
          reportChange(path.concat(key, i), null);
        }
      }
      oldValue.length = newValue.length;
      //copy the items to oldValue and look for changes
      for (var i=0, ii=newValue.length; i<ii; i++) {
        compare(oldValue, newValue, i, path.concat(key));
      }
    } else {
      if (!isObject(oldValue) || isArray(oldValue)) {
        //if new value is object and old wasn't, just copy the whole object and update 
        reportChange(path.concat(key), newValue);
        oldObject[key] = copy(newValue);
        return;
      }
      //Copy newValue to oldValue and look for changes
      for (childKey in newValue) {
        if (newValue.hasOwnProperty(childKey) ) {
          compare(oldValue, newValue, childKey, path.concat(key));
        }
      }
      for (childKey in oldValue) {
        if (!newValue.hasOwnProperty(childKey)) {
          delete oldValue[childKey];
          reportChange(path.concat(key, childKey), null);
        }
      }
    }
  }
}
