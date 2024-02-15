let kinetic = require('../lib/kinetic');
let test = require('tap').test;

test('it exists', (t) => {
  let kineticScroller = kinetic(getPoint, getTarget, scroll);
  kineticScroller.start();
  kineticScroller.stop();
  t.ok(kineticScroller, 'it exists');
  t.end();

  function getPoint() {
    return {x: 0, y: 0};
  }

  function getTarget() {
    return {x: 0, y: 0};
  }

  function scroll() {
  }
});