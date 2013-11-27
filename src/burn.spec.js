describe('Burn', function() {
  //Let's create a minimal simple Firebase mock
  //We'll mock firebase events just using an isolate scope to curry events
  var burnScope;
  var bases;
  beforeEach(module('burnbase', function($provide) {
    $provide.factory('Firebase', function($rootScope) {
      bases = {};
      burnScope = $rootScope.$new(true);

      var Firebase = function(url) {
        url = url || '';
        if (bases[url]) {
          return bases[url];
        }

        var self = {
          once: function(action, fn) {
            return firebaseListener(action, fn, true);
          },
          on: function(action, fn) {
            return firebaseListener(action, fn);
          },
          off: noop, //no need to mock off(), don't really need to test that it works
          set: noop,
          update: noop,
          child: function(path) {
            return new Firebase(url + '/' + path);
          }
        };
        bases[url] = self;
        angular.forEach(['once', 'on', 'off', 'set', 'update', 'child'], function(method) {
          spyOn(self, method).andCallThrough();
        });

        return self;

        function firebaseListener(eventType, callback, once) {
          var unbind = burnScope.$on(eventType, function(e, path, key, value) {
            if (path == url) {
              if (once) unbind();
              callback({
                name: function() { return key; },
                val: function() { return value; }
              });
            }
          });
        }
      };

      return Firebase;

    });
  }));
  function fireEmit(event, path, name, value) {
    burnScope.$emit(event, path, name, value);
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
    it('primitive remote should return primitive', function() {
      expect(burnMerge(2,1)).toEqual(2);
      expect(burnMerge('apple', {object:'here'})).toEqual('apple');
    });

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
      expect(parsed(context)).toBe(context.foo);
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

  describe('makeObjectReporter', function() {
  });

  describe('data', function() {
    var ref, $rootScope, burny, context, initialValue;
    function setup(localVal) {
      inject(function(Firebase, _$rootScope_, Burn) {
        context = {data: localVal};
        initialValue = localVal || {};
        ref = new Firebase('url');

        spyOn(window, 'burnMerge').andCallThrough();
        spyOn(window, 'burnCopy').andCallThrough();

        burny = Burn(context, 'data', ref);
        $rootScope = _$rootScope_;
        spyOn($rootScope, '$watch').andCallThrough();
      });
    }
    function setupAndInit(localVal) {
      setup(localVal);
      fireEmit('value', 'url');
      $timeout.flush();

      //Firebase intially sends a 'child_added' event every time you add a .on() listener,
      //we mock that here.
      initialAdd('url', localVal);
      function initialAdd(url, value) {
        if (isObject(value)) {
          angular.forEach(value, function(value, key) {
            if (isObject(value)) {
              fireEmit('child_added', url, key, value);
              initialAdd(url + '/' + key, value);
            }
          });
        }
      }
    }

    it('should resolve ready() promise when value is given from firebase, and set isReady', function() {
      var done = false;
      setup();
      burny.ready().then(function() {
        expect(burny.isReady).toBe(true);
        done = true;
      });
      fireEmit('value', 'url');
      $timeout.flush();
      expect(done).toBe(true);
    });

    it('should merge remote into local and then push it to firebase', function() {
      setup({banana: 'yellow', mango: 'blue'});
      var remoteValue = { banana: 'not yellow', elephant: true };

      fireEmit('value', 'url', '', remoteValue);
      $timeout.flush();

      expect(bases['url/banana'].set).toHaveBeenCalledWith('not yellow');
      expect(bases['url/elephant'].set).toHaveBeenCalledWith(true);
    });
    
    it('should send an update when a child changes', function() {
      setupAndInit({a:1});
      
      context.data.b = 2;
      $rootScope.$apply();
      expect(bases['url/b'].set).toHaveBeenCalledWith(2);
    });

    it('should start watching for firebase events on init', function() {
      setup();
      expect(ref.on).not.toHaveBeenCalled();

      fireEmit('value', 'url');
      $timeout.flush();

      expect(ref.on).toHaveBeenCalled();
    });

    describe('root-level events with value', function() {
      it('should work with primitive then change to object', function() {
        setupAndInit(1);
        expect(context.data).toBe(1);
        fireEmit('value', 'url', 'url', {a: 'b'});
        expect(context.data).toEqual({ a:'b' });
      });
      it('should work with undefined and then change to primitive', function() {
        setupAndInit(undefined);
        expect(context.data).toBeUndefined();
        fireEmit('value', 'url', 'url', 5);
        expect(context.data).toEqual(5);
      });
      it('should work with undefined and then change to object', function() {
        setupAndInit(undefined);
        expect(context.data).toBeUndefined();
        fireEmit('value', 'url', 'url', { fun:'monkeys' });
        expect(context.data).toEqual({ fun:'monkeys' });
      });
      it('should be able to change back to null or undefined', function() {
        setupAndInit({ a:'b' });
        expect(context.data).toEqual({ a:'b' });
        fireEmit('value', 'url', 'url', null);
        expect(context.data).toBe(null);
      });
      it('should reassign primitives', function() {
        setupAndInit('apple');
        expect(context.data).toBe('apple');
        fireEmit('value', 'url', 'url', 5);
        expect(context.data).toBe(5);
      });
      it('should reassign objects', function() {
        setupAndInit({b: 2});
        expect(context.data).toEqual({b:2});
        fireEmit('value', 'url', 'url', 'foo');
        expect(context.data).toEqual('foo');
      });
    });

    describe('child_added', function() {
      it('should add basic child', function() {
        setupAndInit({a: 1});
        expect(context.data.b).toBeUndefined();
        fireEmit('child_added', 'url', 'b', 2);
        $timeout.flush();
        expect(context.data.b).toBe(2);
      });
      it('when child already exists should override local child', function() {
        setupAndInit({a: 1, b: 2});
        fireEmit('child_added', 'url', 'b', 3);
        $timeout.flush();
        expect(context.data.b).toBe(3);
      });
      it('should add a new listener if a child added is object', function() {
        setupAndInit({a: 2});
        expect(bases['url/b']).toBeUndefined();
        fireEmit('child_added', 'url', 'b', {nested: true});
        expect(bases['url/b'].on).toHaveBeenCalled();
      });
      it('nested object should only change the values where changes happen', function() {
        var data = { a:{ b:{ c:3 } } };
        setupAndInit(data);
        expect(context.data).toBe(data); //check if ref is still same

        fireEmit('child_added', 'url/a', 'deep', {'key':'value'});
        expect(data.a).toEqual({ b:{c:3}, deep:{key:'value'} });
        expect(context.data).toBe(data); //check if ref is still same
      });
    });

    describe('child_changed', function() {
      it('should change a child', function() {
        var data = { banana:'yellow' };
        setupAndInit(data);
        expect(context.data).toEqual({banana: 'yellow'});
        fireEmit('child_changed', 'url', 'banana', 'golden');
        expect(data.banana).toBe('golden');
        expect(context.data).toBe(data);
      });
      it('should work for nested object', function() {
        var data = { elephant:'grey', babboon:{ legs:'brown', eyes:'black' } };
        setupAndInit(data);
        fireEmit('child_changed', 'url/babboon', 'legs', 'red');
        expect(data.babboon.legs).toBe('red');
      });
      it('should only invoke change if value is not an object', function() {
        var data = { person:{ hat:'blue', shirt:'red', pants:'black' } };
        setupAndInit(data);
        fireEmit('child_changed', 'url', 'person', {should:'not appaer'});
        expect(data.person).toEqual({ hat:'blue', shirt:'red', pants:'black' });

        fireEmit('child_changed', 'url/person', 'hat', 'magenta');
        expect(data.person).toEqual({ hat:'magenta', shirt:'red', pants:'black' });
      });
    });

    describe('child_removed', function() {
      it('should remove a child', function() {
        var data = { a:1, b:2 };
        setupAndInit(data);
        fireEmit('child_removed', 'url', 'a');
        expect(data).toEqual({ b:2 });
        expect(context.data).toBe(data);
      });
      it('should splice an array', function() {
        var data = { apples: [1, 2, 3] };
        setupAndInit(data);
        spyOn(data.apples, 'splice').andCallThrough();
        fireEmit('child_removed', 'url/apples', 0);
        expect(data.apples.splice).toHaveBeenCalledWith(0,1);
        expect(data.apples).toEqual([2,3]);
      });
      it('should unbind for object and all child objects\' listeners when removed', function() {
        var data = { a:{ val:1, b:{ val:2, c:{ val:3, d:{ val:4 } } } } };
        setupAndInit(data);
        angular.forEach(bases, function(b) {
          expect(b.off).not.toHaveBeenCalled();
        });
        fireEmit('child_removed', 'url/a/b', 'c', data.a.b.c);
        expect(data).toEqual({ a:{ val:1, b:{ val:2 } } });
        expect(bases['url/a'].off).not.toHaveBeenCalled();
        expect(bases['url/a/b'].off).toHaveBeenCalled();
        expect(bases['url/a/b/c'].off).toHaveBeenCalled();
        expect(bases['url/a/b/c/d'].off).toHaveBeenCalled();
      });
    });
  });
});
