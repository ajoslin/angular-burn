//TODO onerror
//TODO test $-props
//TODO test .destroy()
//TODO test and document errors
//TODO find where $$hashKey could happen
//TODO find set-undefined error
//TODO avoid submit on first load
//TODO merging
//TODO test filter
//TODO use scopes
//TODO add errors
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

burnModule.factory('Burn', ['$parse', '$rootScope', 'Firebase', '$q', '$timeout',
function($parse, $rootScope, Firebase, $q, $timeout) {

  return Burn;

  function Burn(options) {
    options || (options = {});
    var scope = options.scope;
    var name = options.name;
    var ref = options.ref;
    var filterRef = options.filterRef;
    var self = {};

    forEach(['scope', 'name', 'ref'], function(key) {
      if (!options[key]) {
        throw new Error('Expected options.% to exist!'.replace('%', key));
      }
    });

    //Resolved once initial value comes down
    var readyDeferred = $q.defer();

    if (isString(ref)) {
      ref = new Firebase(ref);
    }
    if (isString(filterRef)) {
      filterRef = new Firebase(filterRef);
    }

    if (filterRef) {
      self.$allowedKeys = {};
      setupFilterRef();
    } else {
      //No filterRef? listen to the root
      firebaseBindRef([], onRootValue);
    }

    scope.$on && scope.$on('$destroy', destroy);
    self.destroy = destroy;
    self.isReady = false;
    self.ready = function() {
      return readyDeferred.promise;
    };

    var reporter = makeObjectReporter(scope, name, onLocalChange);
    var unbindWatch = $rootScope.$watch(reporter.compare, noop);

    return self;

    function destroy() {
      filterRef && filterRef.off();
      self.$allowedKeys = {};
      firebaseUnbindRef([], scope[name]);
      ref.off();
      unbindWatch && unbindWatch();
      reporter.destroy();
      delete scope[name];
    }

    function setupFilterRef() {
      //Top level is always an object if we're filtered
      scope[name] || (scope[name] = {});
      filterRef.on('value', function(snap) {
        var filterValue = snap.val();
        if (filterValue) {
          forEach(filterValue, function(isAllowed, key) {
            if (isAllowed && !self.$allowedKeys[key]) {
              self.$allowedKeys[key] = true;
              setWhitelistedKey(key, true);
            }
          });
        } else {
          //If the filter ref has no keys in it, then we have no keys allowed, and 
          //just set ready to true
          setReady();
        }
      });
      filterRef.on('child_removed', function(snap) {
        var key = snap.name();
        if (self.$allowedKeys[key]) {
          setWhitelistedKey(key, false);
          delete self.$allowedKeys[key];
        }
      });
    }

    function onLocalChange(path, newValue) {
      var childRef = path.length ? ref.child(path.join('/')) : ref;

      newValue = burnCopy(newValue);

      //Update objects instead of just setting (not sure why, angularFire does this so we do too)
      if (isObject(newValue) && !isArray(newValue)) {
        childRef.update(newValue, callback);
      } else {
        childRef.set(newValue, callback);
      }
      function callback(error) {
        error && $rootScope.$emit('burn:error', self, {
          path: path,
          value: newValue,
          error: error
        });
      }
    }

    function setWhitelistedKey(key, isAllowed) {
      if (isAllowed) {
        firebaseBindRef([key], onFilteredPropValue(key));
      } else {
        var value = scope[name] && scope[name][key];
        invokeChange('child_removed', [], key, value, true);
        firebaseUnbindRef([key], value);
      }
    }

    //listen to value on the top-level, if we have a primitive at the root
    //Three cases in which we need to reassign the top level:
    //1) if top level is a primitive (eg  1 to 2 or string to string)
    //2) if top level was a primitive and now we are to object, reassign
    //3) if top level was object and now we are to primitive, reassign
    function onRootValue(value) {
      if (!self.isReady) {
        //First time value comes, merge it in and push it
        scope[name] = burnMerge(value, scope[name]);
        onLocalChange([], scope[name]);
        setReady();
      } else if (!isObject(value) || !isObject(scope[name])) {
        scope[name] = value;
        reporter.savedScope[name] = copy(value);
      }
    }
    
    //listen to value for each filtered key. same rules as top level,
    //except we're one key down
    function onFilteredPropValue(key) {
      return function onValue(value) {
        if (!isObject(value) || !isObject(scope[name] && scope[name][key])) {
          $rootScope.$evalAsync(function() {
            scope[name][key] = value;
            reporter.savedScope[name][key] = copy(value);
            setReady();
          });
        }
      };
    }

    function setReady() {
      if (!self.isReady) {
        $timeout(function() {
          self.isReady = true;
          readyDeferred.resolve();
        });
      }
    }

    function firebaseBindRef(path, onValue) {
      path || (path = []);
      var watchRef = path.length ? ref.child(path.join('/')) : ref;
      listen('child_added');
      listen('child_removed');
      listen('child_changed');
      if (onValue) {
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
              invokeChange(type, path, key, value, true);
              break;
            case 'child_changed':
              //Only call changes at their root, so if we aren't at the root
              if (!isObject(value)) {
                invokeChange(type, path, key, value, true);
              }
              break;
            case 'child_removed':
              firebaseUnbindRef(path.concat(key), value);
              invokeChange(type, path, key, value, true);
              break;
            case 'value': 
              (onValue || noop)(value);
          }
        });
      }
    }
    function firebaseUnbindRef(path, value) {
      path || (path = []);
      var childRef = path.length ? ref.child(path.join('/')) : ref;
      //Unbind this ref, then if the value removed is an object, unbind anything watching
      //all of the object's child key/value pairs.
      //Eg if we remove an object { a: 1, b: { c: { d: 'e' } } }, it should call .off()
      //on the parent, a/b, a/b, and a/b/c
      if (isObject(value)) {
        forEach(value, function(childValue, childKey) {
          firebaseUnbindRef(path.concat(childKey), childValue);
        });
      }
      childRef.off();
    }
    function invokeChange(type, path, key, value, remember) {
      // console.log('invokeChange', type, path, key, value, remember);
      $rootScope.$evalAsync(function() {
        var parsed = parsePath($parse, name, path);
        var changeScope;
        switch(type) {
          case 'child_removed':
            remove(parsed(scope), key, value);
            if (remember)
              remove(parsed(reporter.savedScope), key, copy(value));
            break;
          case 'child_added':
          case 'child_changed':
            set(parsed(scope), key, value);
            if (remember) 
              set(parsed(reporter.savedScope), key, copy(value));
        }
      });
    }
  }
  function remove(scope, key, value) {
    if (isArray(scope)) {
      scope.splice(key, 1);
    }  else if (scope) {
      delete scope[key];
    }
  }
  function set(scope, key, value) {
    scope && (scope[key] = value);
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
      //so eg ['quote"key"'] turns into 'scope["quote\"key]'
      expr += '["' + path[i].replace(/"/g, '\\"') + '"]';
    }
  }
  return $parse(expr);
}

//burnCopy: copy a value and remove $-prefixed attrs
function burnCopy(value) {
  //Do nothing for arrays and primitives
  if (isObject(value)) {
    var cloned = isArray(value) ? new Array(value.length) : {};
    for (var key in value) {
      if (value.hasOwnProperty(key) && key.charAt(0) !== '$' && isDefined(value[key])) {
        if (isObject(value[key])) {
          cloned[key] = burnCopy(value[key]);
        } else {
          cloned[key] = value[key];
        }
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
var BURN_COMPARE_MAX_DEPTH = 6;
function makeObjectReporter(object, name, callback) {
  var savedScope = {};
  savedScope[name] = copy(object[name]);

  function compareFn() {
    compare(savedScope, object, name, [], BURN_COMPARE_MAX_DEPTH);
  }
  function destroy() {
    savedScope && (delete savedScope[name]);
    savedScope = null;
  }

  return {
    savedScope: savedScope,
    compare: compareFn,
    destroy: destroy,
  };

  function reportChange(path, newValue) {
    if (newValue === undefined) newValue = null;
    path.shift(); //first item in path is the `name`, we don't need this
    // console.log('reportChange', name, path.length ? path.join('/') : '', newValue);
    callback(path, newValue);
  }

  function compare(oldObject, newObject, key, path, depth) {
    if (key.charAt && key.charAt(0) === '$') {
      return;
    }
    depth--;
    if (!depth) {
      if ( !equals(oldObject[key], newObject[key]) ) {
        oldObject[key] = copy(newObject[key]);
        return reportChange(path.concat(key), newObject[key]);
      }
    }


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
        compare(oldValue, newValue, i, path.concat(key), depth);
      }
    } else {
      if (!isObject(oldValue) || isArray(oldValue)) {
        //if new value is object and old wasn't, just copy the whole object and update 
        reportChange(path.concat(key), newValue);
        oldObject[key] = oldValue = copy(newValue);
      }
      //Copy newValue to oldValue and look for changes
      for (childKey in newValue) {
        if (newValue.hasOwnProperty(childKey) ) {
          compare(oldValue, newValue, childKey, path.concat(key), depth);
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
