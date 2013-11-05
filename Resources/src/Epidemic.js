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
  },
  pointInBoundingBox:function(pt, box) {
    return ((box.x <= pt.x && pt.x <= box.x + box.width) &&
            (box.y <= pt.y && pt.y <= box.y + box.height));
  }

};

//var Antibiotics = { Penicillin: 50, Ciprofloxacin: 200 };
var Antibiotics = { Penicillin: 1, Ciprofloxacin: 5 };
var Condition = { level: 0, failed: 1, success: 2, antibioticUnlocked: 3 };

//
// A word on the gameState object
//
// The progression through the game can be thought of as a finite state machine (FSM)
// You are either
//   a) playing a level
//   b) looking at a success message
//   c) looking at a failure message
//   d) looking at a "antibiotic unlocked" message
//
// The current state in the FSM is denoted by the "condition" field of
// the gameState object. This is the macro-state of the game.
//
// The sub-state of each FSM-state is stored in the field "subState". This object is
// different for each substate [ a) - d) above ]
//
var GameLayer = (function () {
  var that, // 'that' is assigned the value 'this' at initialization time so that methods
            // from the super class can be called.
      titleLabel, space, // "space" is the Chipmunk physics space
      debugNode, size, spaceDim, gameState,
      averageGermSize,
      averageDoublingPeriod = 3, // in seconds
      stepsInSecond = 30,
      resistanceIncrease = 1.1;

  // private functions
  var resistanceString = function(r) {
      return "(" + Math.round(r*100.0) + "%)";
  };

  var cleanUpOldGameState = function() {
    if (gameState) {
      if (gameState.condition === Condition.success ||
          gameState.condition === Condition.failure) {
        that.removeChild(gameState.subState.messageNode);
      }
    }
  };

  var initGameState = function(startingGerms) {
    var i, props = Util.propertiesOf(Antibiotics);
    cleanUpOldGameState();
    gameState = { score: 0,
                  currentLevel: 1,
                  antibiotics: {},
                  condition: Condition.level,
                  subState: {}
                };
    for (i in props) {
      // initial resistance chance of 0.10
      gameState.antibiotics[props[i]] = { enabled: false, resistance: 0.10 } ;
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
    return(Math.round(Math.random() * 2 * averageDoublingPeriod * stepsInSecond) + 1);
  };
  
  var antibioticResistances = function() {
    var i, resistances = {}, props = Util.propertiesOf(Antibiotics);
    for (i in props) {
      resistances[props[i]] = (Math.random() < gameState.antibiotics[props[i]].resistance) ? true : false;
    };
    return resistances;
  };
  
  var multiplyGerms = function() {
    var pos, i, subState = gameState.subState,
        shapes = subState.germShapes, count = 0, userData, s, b, t, r, deleted, toDelete = [];

    for (i in shapes) {
      count += 1;
      s = shapes[i];
      b = s.body;
      userData = b.getUserData();

      if (b.getPos().y > size.height*5/6) {
        gameState.condition = Condition.failed;
      }

      if (subState.step === userData.multiplyAt) {
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
      shapes.splice(toDelete[i] - deleted,1);
      deleted += 1;
    }

  };

  var growGerms = function() {
    var i, germs = gameState.subState.germShapes, body, userData;
    var replaceWithLarger = function(i, shape) {
      var body     = shape.body,
          userData = body.getUserData(),
          r        = shape.getRadius() * userData.growthRate,
          newShape = cp.CircleShape(body, r, cp.vzero);
      space.removeShape(shape);
      space.addShape(newShape);
      // Remove the old shape and put the new one into gameState.germShapes
      germs.splice(i, 1, newShape);
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
        subState = gameState.subState,
        germData = { germId: (subState.nextGermId += 1),
                     multiplyAt: subState.step + t,
                     growthRate: growthRateForSteps(t),
                     resistances: (o.resistances || antibioticResistances())};
    body.setPos(cp.v(o.x, o.y));
    body.setUserData(germData);
    subState.germShapes.push(shape);
    space.addShape(shape);
    space.addBody(body);
  };
  
  // debug function to check states of germs
  var checkInvariant = function() {
    var i, ss, u, ls = gameState.subState;
    for (i in (ss = ls.germShapes) ) {
      u = ss[i].body.getUserData();
      if (ls.step > u.multiplyAt) {
        cc.log("Germ at index " + i + " has multiplyAt " + u.multiplyAt +
                ". Current step is " + ls.step);
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

  var initLevel = function(startingGerms) {
    cleanUpOldGameState();
    gameState.subState = { germShapes: [],
                             nextGermId: 0,
                             step: 0 };
    createGerms(startingGerms);
    that.schedule(update,1/stepsInSecond);
  };


  var initPhysics = function() {
    var body,shape;
    space = cp.Space();
    space.iterations = 100;
    space.gravity = cp.v(0, -9.8*(size.height/spaceDim.height));

    // that.enableCollisionEvents(true);
    debugNode = cc.PhysicsDebugNode.create(space);
    debugNode.setVisible = true;
    that.addChild(debugNode, 0);
  };

  //
  // Events
  //
  var enableEvents = function(enabled) {
    if( 'touches' in sys.capabilities ) {
      that.setTouchEnabled(true);
    } else if( 'mouse' in sys.capabilities ) {
      that.setMouseEnabled(true);
    }
  };
  
  var removeGermWithId = function(germId) {
    var i, ss = gameState.subState.germShapes, b, u;
    for (i in ss) {
      b = ss[i].body;
      u = b.getUserData();
      if (germId === u.germId) {
        space.removeBody(b);
        space.removeShape(ss[i]);
        ss.splice(i,1);
        break;
      }
    }
  };

  // onTouchesBegan is one of the events enabled by "enableEvents"
  var touchHandler = function(touches, event) {
    var i, loc, shape, ss, boundingBox;
    if (gameState.condition === Condition.level) {
      for (i in touches) {
        loc = touches[i].getLocation();
        // See if there is collision with germ
        shape = space.pointQueryFirst(cp.v(loc.x, loc.y), cp.ALL_LAYERS, cp.NO_GROUP);
        if (shape) {
          u = shape.body.getUserData()
          removeGermWithId(u.germId);
          gameState.score += 1;
        }
      
        // FIXME: Check antibiotic is being pressed

      }
    } else if (gameState.condition === Condition.success) {

      initLevel(gameState.currentLevel += 1);
      gameState.condition = Condition.level;

    } else if (gameState.condition === Condition.failed) {
      for (i in (ss = gameState.subState.germShapes)) {
        space.removeBody(ss[i].body);
        space.removeShape(ss[i]);
      }
      initGameState();
      initLevel(gameState.currentLevel);
      gameState.condition = Condition.level;
    } else if (gameState.condition === Condition.antibioticUnlocked) {
      for (i in touches) {
        loc = touches[i].getLocation();
        boundingBox = gameState.subState.clickNode.getBoundingBox();
        if ( Util.pointInBoundingBox(loc, boundingBox) ) {
          that.removeChild(gameState.subState.parentNode);
          // FIXME: show antibiotic labels.
          gameState.condition = Condition.level;
          gameState.subState = gameState.subState.levelState;
          cc.logProperties(gameState.subState);
        }
      }
    }
  };
  
  var checkAndEnableAntibiotics = function() {
    var i, props = Util.propertiesOf(Antibiotics), el, message,
        parentNode, enabledMessageNode, clickNode, ab;
    for (i in props) {
      ab = gameState.antibiotics[props[i]];
      if (!ab.enabled && gameState.score >= Antibiotics[props[i]]) {
        ab.enabled = true;

        parentNode = cc.Node();
        message = ("Antibiotic "+ props[i] +" enabled!\n" +
             "The percentage next to the antibiotic is the germ\'s natural chance of immunity.\n" +
             "Each use of an antibiotic will increase the chance of immunity\n" +
             "in subsequent levels. Use sparingly!");

        enabledMessageNode = cc.LabelTTF.create(message, "Helvetica", size.width/50);
        enabledMessageNode.setPosition(cc.p(size.width/2, size.height*10/16));

        clickNode = cc.LabelTTF.create("Tap here to continue", "Helvetica", size.width/60);
        clickNode.setPosition(cc.p(size.width/2, size.height*7/16));

        parentNode.addChild(enabledMessageNode);
        parentNode.addChild(clickNode);
        
        that.addChild(parentNode,0);

        gameState.condition = Condition.antibioticUnlocked;
        gameState.subState = { parentNode: parentNode, clickNode: clickNode,
                               // save the level state
                               levelState: gameState.subState } ;
      }
    }
  };
  
  var failureMessage = function() {
    var node, label, touchLabel;
    node = cc.Node();

    label = cc.LabelTTF.create("Infected!", "Helvetica", 40);
    label.setPosition(cc.p(size.width/2, size.height/2));
    label.setColor(cc.RED); // or { r: <0-255>, g: <0-255>, b: <0-255> }

    touchLabel = cc.LabelTTF.create("Touch to continue", "Helvetica", 20);
    touchLabel.setPosition(cc.p(size.width/2, size.height*7/16));

    node.addChild(label);
    node.addChild(touchLabel);
    that.addChild(node,0);
    
    gameState.subState = { messageNode: node } ;
  };

  var successMessage = function() {
    var node, label, touchLabel;

    node = cc.Node();
    label = cc.LabelTTF.create("Epidemic averted!", "Helvetica", 40);
    label.setPosition(cc.p(size.width/2, size.height/2));
    label.setColor(cc.GREEN); // or { r: <0-255>, g: <0-255>, b: <0-255> }
    touchLabel = cc.LabelTTF.create("Touch to continue", "Helvetica", 20);
    touchLabel.setPosition(cc.p(size.width/2, size.height*7/16));

    node.addChild(label);
    node.addChild(touchLabel);
    that.addChild(node,0);
    
    gameState.subState = { messageNode: node } ;
  };

  var update = function(dt) {
    checkAndEnableAntibiotics();
    switch (gameState.condition) {
      case Condition.level:
        if (gameState.subState.germShapes.length === 0) {
          gameState.condition = Condition.success;
        } else {
          space.step(1/stepsInSecond);
          gameState.subState.step += 1;
          multiplyGerms();
          growGerms();
        }
        break;
      case Condition.failed:
        that.unschedule(update);
        failureMessage();
        break;
      case Condition.success:
        that.unschedule(update);
        successMessage();
        break;
      case Condition.antibioticUnlocked:
        break;
    }
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
      spaceDim = { height: 30 }; // 30m in height
      spaceDim.width = (spaceDim.height / size.height * size.width);

      titleLabel = cc.LabelTTF.create("Epidemic", "Helvetica", 38);
      // position the label on the center of the screen
      titleLabel.setPosition(cc.p(size.width / 2, size.height - 40));
      // add the label as a child to this layer
      that.addChild(titleLabel, 0);

      initPhysics();
      averageGermSize = size.height * 1/40;
      createBeaker({x:         size.width/2,
                    y:         size.height/6,
                    width:     size.width*0.8,
                    height:    size.height*2/3,
                    wallWidth: size.height/40});

      initGameState(); // initialise the global game state
      initLevel(1);
      return true;
    },
    onTouchesBegan: touchHandler
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
