
var burnModule = angular.module('burnbase', []),
  isString = angular.isString,
  equals = angular.equals,
  noop = angular.noop,
  copy = angular.copy,
  isDefined = angular.isDefined,
  isArray = angular.isArray,
  extend = angular.extend,
  isObject = angular.isObject;

burnModule.factory('Firebase', ['$window', function($window) {
  return $window.Firebase;
}]);

burnModule.factory('Burn', ['$parse', '$timeout', '$rootScope', 'Firebase', '$q',
function($parse, $timeout, $rootScope, Firebase, $q) {

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
      $timeout(function() {
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
      extend(context[name], merged);

      firebaseRefListen();

      unbindWatch = $rootScope.$watch(function() {
        return context[name];
      }, sendToFirebase, true);

      function sendToFirebase(newValue) {
        //TODO find good way of only sending changes up, to save bandwidth and transfer time

        //Remove $-prefixed attrs
        newValue = burnCopy(newValue);
        //Update objects instead of just setting (not sure why, angularFire does this so I do)
        if (isObject(newValue) && !isArray(newValue)) {
          ref.update(newValue);
        } else {
          ref.set(newValue);
        }
      }

      self.isReady = true;
      readyDeferred.resolve();
    }

    function firebaseRefListen(path) {
      path = path || [];
      var watchRef = path.length ? ref.child(path.join('/')) : ref;
      listen('child_added');
      listen('child_removed');
      listen('child_changed');
      function listen(type) {
        watchRef.on(type, function(snap) {
          var key = snap.name();
          var value = snap.val();
          var childRef = watchRef.child(key);
          switch(type) {
            case 'child_added':
              //For objects, watch each child
              if (isObject(value)) {
                firebaseRefListen( path.concat(key) );
              }
              invokeChange(type, path, key, value);
              break;
            case 'child_removed':
              invokeChange(type, path, key, value);
              //Unbind all child changes
              watchRef.child(key).off();
              break;
            case 'child_changed':
              //Only call changes at their root
              if (!isObject(value)) {
                invokeChange(type, path, key, value);
              }
          }
        });
      }
    }
    function invokeChange(type, path, key, value) {
      $rootScope.$evalAsync(function() {
        var pathParsed, changeContext;
        switch(type) {
          case 'child_removed':
            changeContext = parsePath($parse, name, path)(context);
            if (isArray(changeContext)) {
              changeContext.splice(key, 1);
            //Only delete if exists
            }  else if (changeContext) {
              delete changeContext[key];
            }
            break;
          case 'child_added':
            changeContext = parsePath($parse, name, path)(context);
            //Only add if not exists
            if (changeContext && !changeContext[key]) {
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
  //turn ['key with spaces',  '123bar'] into 'name["key with spaces"]["123bar"]
  var expr = name;
  for (var i=0, ii=path.length; i<ii; i++) {
    if (angular.isNumber(path[i])) {
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
  } else if (remote === null && isDefined(local)) {
    return local;
  }
}
