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


//(function () {
//  var helloLabel, space, debugNode, size, spaceDim, gameState,
//      averageGermSize,
//      averageDoublingPeriod = 3, // in seconds
//      stepsinSecond = 30,
//      resistanceINcrease = 1.1;

var GameLayer = cc.Layer.extend({
    isMouseDown:false,
    helloLabel:null,
    space:null,               // the Chipmunk physics engine "space"
    debugNode:null,
    size:null,
    spaceDim: { height: 30 }, // in metres. width field added in init function
    gameState: null,
    averageGermSize: null,       // as fraction of height
    averageDoublingPeriod: 3, // in seconds
    stepsInSecond: 30,
    resistanceIncrease: 1.1,
    
    
    ctor:function() {
        this._super();
        cc.associateWithNative( this, cc.Layer );
    },

    init:function () {
        this._super();

        this.enableEvents();

        this.size = cc.Director.getInstance().getWinSize();
        // Initialise space dimensions
        this.spaceDim.width = (this.spaceDim.height / this.size.height * this.size.width);

        this.helloLabel = cc.LabelTTF.create("Epidemic", "Helvetica", 38);
        // position the label on the center of the screen
        this.helloLabel.setPosition(cc.p(this.size.width / 2, this.size.height - 40));
        // add the label as a child to this layer
        this.addChild(this.helloLabel, 5);

        this.initPhysics();
        // schedule the "update" function (see below) to run.
        this.schedule(this.update, 1/this.stepsInSecond);
        this.averageGermSize = this.size.height * 1/40;
        this.createBeaker({x:         this.size.width/2,
                           y:         this.size.height/6,
                           width:     this.size.width*0.8,
                           height:    this.size.height*2/3,
                           wallWidth: this.size.height/40});

        this.startLevel(1);
        return true;
    },

    resistanceString:function(r) {
      return "(" + Math.round(r*100.0) + "%)";
    },

    initGameState:function(startingGerms) {
      var i, props = Util.propertiesOf(Antibiotics);
      this.gameState = { score: 0,
                         step: 0,
                         resistances: {},
                         condition: Condition.continuing,
                         germShapes: [], nextGermId: 0 };
      for (i in props) {
        this.gameState.resistances[props[i]] = 0.10; // initial resistance chance of 0.10
      }

    // FIXME: Create some antibiotic labels and attach the resistance to them.
    },
    
    //
    // Creates a beaker of (width, height) centered at (x,y) with wallWidth
    //
    createBeaker:function(o) {

    var baseBody   = cp.StaticBody(),
        leftBody   = cp.StaticBody(),
        rightBody  = cp.StaticBody(),
        baseShape  = cp.BoxShape(baseBody, o.width, o.wallWidth),
        leftShape  = cp.BoxShape(leftBody, o.wallWidth, o.height - o.wallWidth),
        rightShape = cp.BoxShape(rightBody, o.wallWidth, o.height - o.wallWidth);

      baseBody.setPos(cp.v(o.x, o.y));
      leftBody.setPos(cp.v(o.x - (o.width - o.wallWidth)/2, o.y + o.height/2));
      rightBody.setPos(cp.v(o.x + (o.width - o.wallWidth)/2, o.y  + o.height/2 ));

      this.space.addStaticShape(baseShape);
      this.space.addStaticShape(leftShape);
      this.space.addStaticShape(rightShape);
    },
    growthRateForSteps:function(t) {
      return(Math.pow(2,1/t));
    },
    
    randomMultiplyTime:function(t) {
       // +1 is because it cannot be zero
      return(Math.round(Math.random() * 2 * this.averageDoublingPeriod * this.stepsInSecond) + 2);
    },
    
    antibioticResistances: function() {
      var i, resistances = {}, props = Util.propertiesOf(Antibiotics);
      for (i in props) {
        resistances[props[i]] = (Math.random() < this.gameState.resistances[props[i]]) ? true : false;
      };
      return resistances;
    },
    
    multiplyGerms:function() {
      var pos, i, shapes = this.gameState.germShapes, count = 0, userData, s, b, t, r, deleted, toDelete = [];


      for (i in shapes) {
        count += 1;
        s = shapes[i];
        b = s.body;
        userData = b.getUserData();

        if (b.getPos().y > this.size.height*5/6) {
          this.gameState.condition = Condition.failed;
        }

//        cc.log("i: " + i + " step: " + this.gameState.step + " multiplyAt: " + userData.multiplyAt + " germId: " + userData.germId);
        if (this.gameState.step === userData.multiplyAt) {
          cc.log("Splitting germ " + i);
          pos = b.getPos();
          r = s.getRadius()/2; // half the size it is now

          this.space.removeBody(b);
          this.space.removeShape(s);
          toDelete.push(i);

          this.createGerm({x: pos.x, y: pos.y, r: r, resistances: userData.resistances});
          this.createGerm({x: pos.x + this.size.width/500, y: pos.y, r: r, resistances: userData.resistances});
        }
      }

      deleted = 0;
      for (i in toDelete) {
        this.gameState.germShapes.splice(toDelete[i] - deleted,1);
        deleted += 1;
      }

    },

    growGerms:function() {
      var i, germs = this.gameState.germShapes, body, userData,
             space = this.space, gameState = this.gameState;

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
    },

    createGerm:function(o) {
      var mass  = 1,
          body  = cp.Body(mass, cp.momentForCircle(mass, 0, o.r, cp.vzero)),
          shape = cp.CircleShape(body, o.r, cp.vzero),
          t = this.randomMultiplyTime(),
          germData = { germId: (this.gameState.nextGermId += 1),
                       createdAt: this.gameState.step,
                       multiplySteps: t,
                       multiplyAt: this.gameState.step + t,
                       growthRate: this.growthRateForSteps(t),
                       resistances: (o.resistances || this.antibioticResistances())};
      body.setPos(cp.v(o.x, o.y));
      body.setUserData(germData);
      this.gameState.germShapes.push(shape);

      this.space.addShape(shape);
      this.space.addBody(body);
      
    },
    
    // debug function to check states of germs
    checkInvariant:function() {
      var i, ss, u;
//      cc.log("Checking invariant " + this.gameState.step);
      for (i in (ss = this.gameState.germShapes) ) {
        u = ss[i].body.getUserData();
        if (this.gameState.step > u.multiplyAt) {
          cc.log("Germ at index " + i + " has multiplyAt " + u.multiplyAt +
                  ". Current step is " + this.gameState.step);
          cc.logObject(u);
          this.gameState.condition = Condition.failed;
        }
      }
    },

    createGerms:function(n) {
      var i, s = this.size;
      for (i=0; i < n; i++) {
        this.createGerm({x: s.width/2 + s.width/2*(Math.random() - 0.5),
                         y: s.height/2,
                  r: this.averageGermSize * (0.8 + Math.random() * 0.4)});
      }
    },

    startLevel:function(startingGerms) {
      this.initGameState();
      this.createGerms(startingGerms);
    },

    update:function(dt) {
      this.space.step(1/this.stepsInSecond);
      this.gameState.step += 1;
//      cc.log("Start " + this.gameState.step);
      this.multiplyGerms();
      // FIXME: Update score
//      this.checkInvariant();

      switch (this.gameState.condition) {
          case Condition.continuing:
            this.growGerms();
            break;
          case Condition.failed:
            this.unschedule(this.update);
            break;
          case Condition.success:
            //successMessage();
            //clickToStartNewGame();
            break;
      }
//      cc.log("Finish " + this.gameState.step);
    },

    initPhysics:function() {
      var body,shape;
      this.space = cp.Space();
      this.space.iterations = 100;
      this.space.gravity = cp.v(0, -9.8*(this.size.height/this.spaceDim.height));
//       this.enableCollisionEvents(true);
      this.debugNode = cc.PhysicsDebugNode.create(this.space);
      this.debugNode.setVisible = true;
      this.addChild(this.debugNode, 0);
    },

    //
    // Events
    //
    enableEvents:function(enabled) {
      if( 'touches' in sys.capabilities )
        this.setTouchEnabled(true);
      else if( 'mouse' in sys.capabilities )
        this.setMouseEnabled(true);
    },
    
    // onTouchesBegan is one of the events enabled by "enableEvents"
    onTouchesBegan:function(touches, event) {
      var i, loc;
      for (i in touches) {
        loc = touches[i].getLocation();
        cc.log("(" + loc.x + "," + loc.y + ")");
      }
    }
});

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
