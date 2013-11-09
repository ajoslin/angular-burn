describe('Burn', function() {
  //Let's create a minimal simple Firebase mock
  //We'll mock firebase events just using an isolate scope to curry events
  var burnScope;
  beforeEach(module('burnbase', function($provide) {
    $provide.factory('Firebase', function($rootScope) {

      var Firebase = function(url) {
        url = url || '';
        burnScope = $rootScope.$new(true);

        var self = {
          once: function(action, fn) {
            return firebaseListener(action, fn, true);
          },
          on: function(action, fn) {
            return firebaseListener(action, fn);
          },
          off: noop, //no need to mock off(), don't really need to test that it works
          set: function(val) {
            burnScope[url] = val;
          },
          update: function(val) {
            burnScope[url] = angular.extend(burnScope[url] || {}, val);
          },
          child: function(path) {
            return new Firebase(url + path);
          }
        };
        angular.forEach(['once', 'on', 'off', 'set', 'update', 'child'], function(method) {
          spyOn(self, method).andCallThrough();
        });

        return self;

        function firebaseListener(eventType, callback, once) {
          var unbind = burnScope.$on(eventType, function(e, key, value) {
            if (once) unbind();
            callback({
              name: function() { return key; },
              val: function() { return value; }
            });
          });
        }
      };

      return Firebase;

    });
  }));
  function firebaseEmit(event, name, value) {
    burnScope.$emit(event, name, value);
    burnScope.$apply();
  }

  var Burn, $timeout;
  beforeEach(inject(function(_Burn_, _$timeout_) {
    Burn = _Burn_;
    $timeout = _$timeout_;
  }));

  describe('misc', function() {
    it('should throw error if no context given', function() {
      expect(function() {
        Burn(null, '', '');
      }).toThrow();
    });
    it('should throw error if no name is given', inject(function($rootScope) {
      expect(function() {
        Burn($rootScope.$new(), null, '');
      }).toThrow();
    }));
    it('should throw error if no object or string ref given', function() {
      expect(function() {
        Burn({}, '', null);
      }).toThrow();
      expect(function() {
        Burn({}, '', 1);
      }).toThrow();
    });
    it('should allow object and string', function() {
      Burn({}, 'name', 'url');
    });
    it('should return an object with properties', function() {
      var burny = Burn({}, 'name', 'url');
      expect(burny.destroy).toBeDefined();
      expect(burny.ready).toBeDefined();
      expect(burny.ready().then).toBeDefined();
    });
    it('should call $on("$destroy", destroy) if given context has $on', function() {
      var $on = jasmine.createSpy('$on');
      var burny = Burn({$on: $on}, 'name', 'url');
      expect($on).toHaveBeenCalledWith('$destroy', burny.destroy);
    });
  });

  describe('burnMerge', function() {
    it('arrays should concat local into remote', function() {
      expect(burnMerge([1,2], [3,4])).toEqual([3,4,1,2]);
    });

    it('objects should merge remote into local', function() {
      expect(burnMerge({ a:1, b:2, c:3 }, { c:4, d:5 }))
      .toEqual({ a:1, b:2, c:3, d:5 });
    });

    it('undefined remote should return local', function() {
      var local = {};
      expect(burnMerge(null, local)).toBe(local);
    });

    it('equal things should return local', function() {
      var local = {};
      expect(burnMerge({}, local)).toBe(local);
    });
  });
  
  describe('burnCopy', function() {
    it('primitives should return themselves', function() {
      expect(burnCopy(4)).toBe(4);
    });
    it('arrays should return themselves', function() {
      var array = [1,2];
      var copied = burnCopy(array);
      expect(copied).toBe(array);
    });
    it('objects should be an anulgaar.copy with no $-attrs', function() {
      var obj = {banana: true, $elephant: 4};
      var copied = burnCopy(obj);
      expect(copied).toEqual({banana: true});
    });
  });

  describe('parsePath', function() {
    var context = {foo: {}};
    var name = 'foo';
    var parse = function(path) {
      var parsedFn;
      inject(function($parse) {
        parsedFn = parsePath($parse, name, path);
      });
      return parsedFn;
    };
    it('should just return context for empty path', function() {
      var parsed = parse([]);
      expect(parsed(context)).toBe(context[name]);
    });
    it('should set a shallow prop with spaces', function() {
      var parsed = parse(['s p a c e s']);
      parsed.assign(context, 1);
      expect(context).toEqual({foo: {'s p a c e s': 1} });
    });
    it('should allow a deep object', function() {
      context.foo.banana = 6;
      var parsed = parse(['banana']);
      expect(parsed(context)).toBe(6);
    });
  });

  describe('Burn', function() {
    var ref, $rootScope, burny, context, initialValue;
    function setup(localVal) {
      inject(function(Firebase, _$rootScope_, Burn) {
        context = {name: localVal || {}};
        initialValue = localVal || {};
        ref = new Firebase('url');

        spyOn(window, 'burnMerge').andCallThrough();
        spyOn(window, 'burnCopy').andCallThrough();

        burny = Burn(context, 'name', ref);
        $rootScope = _$rootScope_;
        spyOn($rootScope, '$watch').andCallThrough();
      });
    }

    it('should resolve ready() promise when value is given from firebase, and set isReady', function() {
      var done = false;
      setup();
      burny.ready().then(function() {
        expect(burny.isReady).toBe(true);
        done = true;
      });
      firebaseEmit('value');
      $timeout.flush();
      expect(done).toBe(true);
    });

    it('should merge remote into local and then push it to firebase', function() {
      setup({banana: 'yellow', mango: 'blue'});
      var remoteValue = { banana: 'note yellow', elephant: true };

      firebaseEmit('value', 'url', remoteValue);
      $timeout.flush();

      expect(ref.update).toHaveBeenCalledWith( burnMerge(remoteValue, initialValue) );
    });
    
    it('should start a watcher on rootScope to push to firebase whenever context changes', function() {
      setup({a: 1});
      
      expect(ref.update.callCount).toBe(0);
      firebaseEmit('value');
      $timeout.flush();
      
      expect($rootScope.$watch).toHaveBeenCalled();
      expect(ref.update.callCount).toBe(1);
      context.name.b = 2;
      $rootScope.$apply();
      expect(ref.update.callCount).toBe(2);
    });

    it('should start watching for firebase events on init', function() {
      setup();
      expect(ref.on).not.toHaveBeenCalled();

      firebaseEmit('value');
      $timeout.flush();

      expect(ref.on).toHaveBeenCalled();
    });
  });
});
