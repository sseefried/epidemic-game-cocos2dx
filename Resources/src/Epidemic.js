// Add some useful debugging functionality to "cc" object.

cc.logProperties = function(obj) {
  var v;
  for (v in obj) {
    cc.log(v);
  }
};

cc.logObject = function(obj) {
  var i, props = Util.propertiesOf(obj), p;
  for (i in props) {
    p = props[i];
    cc.log(p + ": " + obj[p]);
  }
};

//
// Utility functions
//
var Util = {
  propertiesOf: function(o) {
  var p, a = [];
  for (p in o) {
    if (o.hasOwnProperty(p)) {
      a.push(p);
    }
  }
  return a;
  }
};


var Antibiotics = { Penicillin: 50, Ciprofloxacin: 200 };
var Condition = { continuing: 0, failed: 1, success: 2, antibioticUnlocked: 3 };

var GameLayer = (function () {
  var that, // 'that' is assigned the value 'this' at initialization time so that methods
            // from the super class can be called.
      helloLabel, space, // "space" is the Chipmunk physics space
      debugNode, size, spaceDim, gameState,
      averageGermSize,
      averageDoublingPeriod = 3, // in seconds
      stepsInSecond = 30,
     resistanceIncrease = 1.1;

  // private functions
  var resistanceString = function(r) {
      return "(" + Math.round(r*100.0) + "%)";
  };

  var initGameState = function(startingGerms) {
    var i, props = Util.propertiesOf(Antibiotics);
    gameState = { score: 0,
                  step: 0,
                  resistances: {},
                  condition: Condition.continuing,
                  germShapes: [], nextGermId: 0 };
    for (i in props) {
      gameState.resistances[props[i]] = 0.10; // initial resistance chance of 0.10
    }

    // FIXME: Create some antibiotic labels and attach the resistance to them.
  };
    
  //
  // Creates a beaker of (width, height) centered at (x,y) with wallWidth
  //
  var createBeaker = function(o) {
    var baseBody   = cp.StaticBody(),
        leftBody   = cp.StaticBody(),
        rightBody  = cp.StaticBody(),
        baseShape  = cp.BoxShape(baseBody, o.width, o.wallWidth),
        leftShape  = cp.BoxShape(leftBody, o.wallWidth, o.height - o.wallWidth),
        rightShape = cp.BoxShape(rightBody, o.wallWidth, o.height - o.wallWidth);

    baseBody.setPos(cp.v(o.x, o.y));
    leftBody.setPos(cp.v(o.x - (o.width - o.wallWidth)/2, o.y + o.height/2));
    rightBody.setPos(cp.v(o.x + (o.width - o.wallWidth)/2, o.y  + o.height/2 ));

    space.addStaticShape(baseShape);
    space.addStaticShape(leftShape);
    space.addStaticShape(rightShape);
  };

  var growthRateForSteps = function(t) {
    return(Math.pow(2,1/t));
  };
  
  var randomMultiplyTime = function(t) {
    // +1 is because it cannot be zero
    return(Math.round(Math.random() * 2 * averageDoublingPeriod * stepsInSecond) + 2);
  };
  
  var antibioticResistances = function() {
    var i, resistances = {}, props = Util.propertiesOf(Antibiotics);
    for (i in props) {
      resistances[props[i]] = (Math.random() < gameState.resistances[props[i]]) ? true : false;
    };
    return resistances;
  };
  
  var multiplyGerms = function() {
    var pos, i, shapes = gameState.germShapes, count = 0, userData, s, b, t, r, deleted, toDelete = [];

    for (i in shapes) {
      count += 1;
      s = shapes[i];
      b = s.body;
      userData = b.getUserData();

      if (b.getPos().y > size.height*5/6) {
        gameState.condition = Condition.failed;
      }

//        cc.log("i: " + i + " step: " + this.gameState.step + " multiplyAt: " + userData.multiplyAt + " germId: " + userData.germId);
      if (gameState.step === userData.multiplyAt) {
        cc.log("Splitting germ " + i);
        pos = b.getPos();
        r = s.getRadius()/2; // half the size it is now

        space.removeBody(b);
        space.removeShape(s);
        toDelete.push(i);

        createGerm({x: pos.x, y: pos.y, r: r, resistances: userData.resistances});
        createGerm({x: pos.x + size.width/500, y: pos.y, r: r, resistances: userData.resistances});
      }
    }

    deleted = 0;
    for (i in toDelete) {
      gameState.germShapes.splice(toDelete[i] - deleted,1);
      deleted += 1;
    }

  };

  var growGerms = function() {
    var i, germs = gameState.germShapes, body, userData;


    var replaceWithLarger = function(i, shape) {
      var body     = shape.body,
          userData = body.getUserData(),
          r        = shape.getRadius() * userData.growthRate,
          newShape = cp.CircleShape(body, r, cp.vzero);
      space.removeShape(shape);
      space.addShape(newShape);
      // Remove the old shape and put the new one into this.gameState.germShapes
      gameState.germShapes.splice(i, 1, newShape);
    };

    for (i in germs) {
      replaceWithLarger(i, germs[i]);
    }
  };

  var createGerm = function(o) {
    var mass  = 1,
        body  = cp.Body(mass, cp.momentForCircle(mass, 0, o.r, cp.vzero)),
        shape = cp.CircleShape(body, o.r, cp.vzero),
        t = randomMultiplyTime(),
        germData = { germId: (gameState.nextGermId += 1),
                     createdAt: gameState.step,
                     multiplySteps: t,
                     multiplyAt: gameState.step + t,
                     growthRate: growthRateForSteps(t),
                     resistances: (o.resistances || antibioticResistances())};
    body.setPos(cp.v(o.x, o.y));
    body.setUserData(germData);
    gameState.germShapes.push(shape);
    space.addShape(shape);
    space.addBody(body);
    
  };
  
  // debug function to check states of germs
  var checkInvariant = function() {
    var i, ss, u;
//      cc.log("Checking invariant " + this.gameState.step);
    for (i in (ss = gameState.germShapes) ) {
      u = ss[i].body.getUserData();
      if (gameState.step > u.multiplyAt) {
        cc.log("Germ at index " + i + " has multiplyAt " + u.multiplyAt +
                ". Current step is " + gameState.step);
        cc.logObject(u);
        gameState.condition = Condition.failed;
      }
    }
  };

  var createGerms = function(n) {
    var i, s = size;
    for (i=0; i < n; i++) {
      createGerm({x: s.width/2 + s.width/2*(Math.random() - 0.5),
                       y: s.height/2,
                r: averageGermSize * (0.8 + Math.random() * 0.4)});
    }
  };

  var startLevel = function(startingGerms) {
    initGameState();
    createGerms(startingGerms);
  };


  var initPhysics = function() {
    var body,shape;
    space = cp.Space();
    space.iterations = 100;
    space.gravity = cp.v(0, -9.8*(size.height/spaceDim.height));
//       this.enableCollisionEvents(true);
    debugNode = cc.PhysicsDebugNode.create(space);
    debugNode.setVisible = true;
    super.addChild(debugNode, 0);
  };

  //
  // Events
  //
  var enableEvents = function(enabled) {
    if( 'touches' in sys.capabilities ) {
//      cc.logProperties(this);
      that.setTouchEnabled(true);
    } else if( 'mouse' in sys.capabilities ) {
      that.setMouseEnabled(true);
    }
  };
  
  // onTouchesBegan is one of the events enabled by "enableEvents"
  var onTouchesBegan = function(touches, event) {
    var i, loc;
    for (i in touches) {
      loc = touches[i].getLocation();
      cc.log("(" + loc.x + "," + loc.y + ")");
    }
  };
  
  var update = function(dt) {
    space.step(1/stepsInSecond);
    gameState.step += 1;
    //      cc.log("Start " + this.gameState.step);
    multiplyGerms();

    // FIXME: Update score
    //      this.checkInvariant();

    switch (gameState.condition) {
        case Condition.continuing:
          growGerms();
          break;
        case Condition.failed:
          that.unschedule(this.update);
          break;
        case Condition.success:
          //successMessage();
          //clickToStartNewGame();
          break;
    }
    //      cc.log("Finish " + this.gameState.step);
  };

  return cc.Layer.extend({
    // public functions
    ctor:function() {
        this._super();
        cc.associateWithNative( this, cc.Layer );
    },

    init:function () {
      that = this;

      that._super();

      enableEvents();

      size = cc.Director.getInstance().getWinSize();
      // Initialise space dimensions
      spaceDim = { height: 30 };
      spaceDim.width = (spaceDim.height / size.height * size.width);

      helloLabel = cc.LabelTTF.create("Epidemic", "Helvetica", 38);
      // position the label on the center of the screen
      helloLabel.setPosition(cc.p(size.width / 2, size.height - 40));
      // add the label as a child to this layer
      that.addChild(helloLabel, 5);

      initPhysics();
      // schedule the "update" function (see below) to run.
      that.schedule(update, 1/stepsInSecond);
      averageGermSize = size.height * 1/40;
      createBeaker({x:         size.width/2,
                    y:         size.height/6,
                    width:     size.width*0.8,
                    height:    size.height*2/3,
                    wallWidth: size.height/40});

      startLevel(1);
      return true;
    }
  });
})();

var GameScene = cc.Scene.extend({
    ctor:function() {
        this._super();
        cc.associateWithNative( this, cc.Scene );
    },

    onEnter:function () {
        this._super();
        var layer = new GameLayer();
        this.addChild(layer);
        layer.init();
    }
});
