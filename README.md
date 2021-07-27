# panzoom [![build status](https://github.com/anvaka/panzoom/actions/workflows/tests.yaml/badge.svg)](https://github.com/anvaka/panzoom/actions/workflows/tests.yaml)

Extensible, mobile friendly pan and zoom framework (supports DOM and SVG).

# Demo

 * [Regular DOM object](https://anvaka.github.io/panzoom/demo/dom.html)
 * [Standalone page](https://anvaka.github.io/panzoom/demo/index.html) - this repository
 * [SVG Tiger](https://jsfiddle.net/anvaka/9twnb7zr/) - js fiddle

# Usage

Grab it from npm and use with your favorite bundler:

```
npm install panzoom --save
```

Or download from CDN:

``` html
<script src='https://unpkg.com/panzoom@9.4.0/dist/panzoom.min.js'></script>
```

If you download from CDN the library will be available under `panzoom` global name.

## Pan and zoom DOM subtree

``` js
// just grab a DOM element
var element = document.querySelector('#scene')

// And pass it to panzoom
panzoom(element)
```

## SVG panzoom example

``` html
<!-- this is your html file with svg -->
<body>
  <svg>
    <!-- this is the draggable root -->
    <g id='scene'> 
      <circle cx='10' cy='10' r='5' fill='pink'></circle>
    </g>
  </svg>
</body>
```

``` js
// In the browser panzoom is already on the
// window. If you are in common.js world, then 
// var panzoom = require('panzoom')

// grab the DOM SVG element that you want to be draggable/zoomable:
var element = document.getElementById('scene')

// and forward it it to panzoom.
panzoom(element)
```

If require a dynamic behavior (e.g. you want to make an `element` not 
draggable anymore, or even completely delete an SVG element) make sure to call
`dispose()` method:

``` js
var instance = panzoom(element)
// do work
// ...
// then at some point you decide you don't need this anymore:
instance.dispose()
```

This will make sure that all event handlers are cleared and you are not leaking
memory

## Events notification

The library allows to subscribe to transformation changing events. E.g. when
user starts/ends dragging the `element`, the `element` will fire `panstart`/`panend`
events. Here is example of all supported events:

``` js
var instance = panzoom(element);
instance.on('panstart', function(e) {
  console.log('Fired when pan is just started ', e);
  // Note: e === instance.
});

instance.on('pan', function(e) {
  console.log('Fired when the `element` is being panned', e);
});

instance.on('panend', function(e) {
  console.log('Fired when pan ended', e);
});

instance.on('zoom', function(e) {
  console.log('Fired when `element` is zoomed', e);
});

instance.on('zoomend', function(e) {
  console.log('Fired when zoom animation ended', e);
});

instance.on('transform', function(e) {
  // This event will be called along with events above.
  console.log('Fired when any transformation has happened', e);
});
```

See [JSFiddle](https://jsfiddle.net/uwxcmbyg/609/) console for a demo.

## Ignore mouse wheel

Sometimes zooming interferes with scrolling. If you want to alleviate it you
can provide a custom filter, which will allow zooming only when modifier key is
down. E.g.

``` js
panzoom(element, {
  beforeWheel: function(e) {
    // allow wheel-zoom only if altKey is down. Otherwise - ignore
    var shouldIgnore = !e.altKey;
    return shouldIgnore;
  }
});
```

See [JSFiddle](https://jsfiddle.net/Laxq9jLu/) for the demo. The tiger will be
zoomable only when `Alt` key is down.


## Ignore mouse down

If you want to disable panning or filter it by pressing a specific key, use the
`beforeMouseDown()` option. E.g.

``` js
panzoom(element, {
  beforeMouseDown: function(e) {
    // allow mouse-down panning only if altKey is down. Otherwise - ignore
    var shouldIgnore = !e.altKey;
    return shouldIgnore;
  }
});
```

## Ignore keyboard events

By default, panzoom will listen to keyboard events, so that users can navigate the scene
with arrow keys and `+`, `-` signs to zoom out. If you don't want this behavior you can
pass the `filterKey()` predicate that returns truthy value to prevent panzoom's default
behavior:

``` js
panzoom(element, {
  filterKey: function(/* e, dx, dy, dz */) {
    // don't let panzoom handle this event:
    return true;
  }
});
```

## Zoom Speed

You can adjust how fast it zooms, by passing optional `zoomSpeed` argument:

``` js
panzoom(element, {
  zoomSpeed: 0.065 // 6.5% per mouse wheel event
});
```

## Pinch Speed

On touch devices zoom is achieved by "pinching" and depends on distance between
two fingers. We try to match the zoom speed with pinch, but if you find
that too slow (or fast), you can adjust it:

``` js
panzoom(element, {
  pinchSpeed: 2 // zoom two times faster than the distance between fingers
});
```

## Get current transform (scale, offset)

To get the current zoom (scale) level use the `getTransform()` method:

```
console.log(instance.getTransform()); // prints {scale: 1.2, x: 10, y: 10}
```

## Fixed transform origin when zooming

By default when you use mouse wheel or pinch to zoom, `panzoom` uses mouse
coordinates to determine the central point of the zooming operation.

If you want to override this behavior and always zoom into `center` of the
screen pass `transformOrigin` to the options:

``` js
panzoom(element, {
  // now all zoom operations will happen based on the center of the screen
  transformOrigin: {x: 0.5, y: 0.5}
});
```

You specify `transformOrigin` as a pair of `{x, y}` coordinates. Here are some examples:

``` js
// some of the possible values:
let topLeft = {x: 0, y: 0};
let topRight = {x: 1, y: 0};
let bottomLeft = {x: 0, y: 1};
let bottomRight = {x: 1, y: 1};
let centerCenter = {x: 0.5, y: 0.5};

// now let's use it:
panZoom(element, {
  transformOrigin: centerCenter
});
```

To get or set new transform origin use the following API:

``` js
let instance = panzoom(element, {
  // now all zoom operations will happen based on the center of the screen
  transformOrigin: {x: 0.5, y: 0.5}
});

let origin = instance.getTransformOrigin(); // {x: 0.5, y: 0.5}

instance.setTransformOrigin({x: 0, y: 0}); // now it is topLeft
instance.setTransformOrigin(null); // remove transform origin
```

## Min Max Zoom

You can set min and max zoom, by passing optional `minZoom` and `maxZoom` argument:

``` js
var instance = panzoom(element, {
  maxZoom: 1,
  minZoom: 0.1
});
```

You can later get the values using `getMinZoom()` and `getMaxZoom()`

``` js
assert(instance.getMaxZoom() === 1);
assert(instance.getMinZoom() === 0.1);
```

## Disable Smooth Scroll

You can disable smooth scroll, by passing optional `smoothScroll` argument:

``` js
panzoom(element, {
  smoothScroll: false
});
```

With this setting the momentum is disabled.

## Pause/resume the panzoom

You can pause and resume the panzoom by calling the following methods:

``` js
var element = document.getElementById('scene');
var instance = panzoom(element);

instance.isPaused(); //  returns false
instance.pause();    //  Pauses event handling
instance.isPaused(); //  returns true now
instance.resume();   //  Resume panzoom
instance.isPaused(); //  returns false again
```

## Script attachment

If you want to quickly play with panzoom without using javascript, you can configure it via
`script` tag:

``` html
<!-- this is your html file -->
<!DOCTYPE html>
<html>
<head>
  <script src='https://unpkg.com/panzoom@9.4.0/dist/panzoom.min.js'
    query='#scene' name='pz'></script>
</head>
<body>
  <svg>
    <!-- this is the draggable root -->
    <g id='scene'> 
      <circle cx='10' cy='10' r='5' fill='pink'></circle>
    </g>
  </svg>
</body>
</html>
```

Most importantly, you can see `query` attribute that points to CSS selector. Once the element is found 
panzoom is attached to this element. The controller will become available under `window.pz` name. And you
can pass additional options to the panzoom via attributes prefixed with `pz-`.

Here is a demo: [Script based attributes](https://anvaka.github.io/panzoom/demo/attach-via-script.html)

## Adjust Double Click Zoom

You can adjust the double click zoom multiplier, by passing optional `zoomDoubleClickSpeed` argument.

When double clicking, zoom is multiplied by `zoomDoubleClickSpeed`, which means that a value of 1 will disable double click zoom completely. 

``` js
panzoom(element, {
  zoomDoubleClickSpeed: 1, 
});
```

## Set Initial Position And Zoom

You can set the initial position and zoom, by chaining the `zoomAbs` function with x position, y position and zoom as arguments:

``` js
panzoom(element, {
  maxZoom: 1,
  minZoom: 0.1,
  initialX: 300,
  initialY: 500,
  initialZoom: 0.5
});
```

## Handling touch events

The library will handle `ontouch` events very aggressively, it will `preventDefault`, and
`stopPropagation` for the touch events inside container. [Sometimes](https://github.com/anvaka/panzoom/issues/12) this is not a desirable behavior.

If you want to take care about this yourself, you can pass `onTouch` callback to the options object:

``` js
panzoom(element, {
  onTouch: function(e) {
    // `e` - is current touch event.

    return false; // tells the library to not preventDefault.
  }
});
```

Note: if you don't `preventDefault` yourself - make sure you test the page behavior on iOS devices.
Sometimes this may cause page to [bounce undesirably](https://stackoverflow.com/questions/23862204/disable-ios-safari-elastic-scrolling). 


## Handling double click events

By default panzoom will prevent default action on double click events - this is done to avoid
accidental text selection (which is default browser action on double click). If you prefer to
allow default action, you can pass `onDoubleClick()` callback to options. If this callback
returns false, then the library will not prevent default action:

``` js
panzoom(element, {
  onDoubleClick: function(e) {
    // `e` - is current double click event.

    return false; // tells the library to not preventDefault, and not stop propagation
  }
});
```

## Bounds on Panzoom

By default panzoom will not prevent Image from Panning out of the Container. `bounds` (boolean) and 
`boundsPadding` (number)  can be defined so that it doesn't fall out. Default value for `boundsPadding` is `0.05` .
 

``` js
panzoom(element, {
  bounds: true,
  boundsPadding: 0.1
});
```

## Triggering Pan 

To Pan the object using Javascript use `moveTo(<number>,<number>)` function. It expects x, y value to where to move.

``` js
instance.moveTo(0, 0);
```

To pan in a smooth way use `smoothMoveTo(<number>,<number>)`:

``` js
instance.smoothMoveTo(0, 0);
```


## Triggering Zoom

To Zoom the object using Javascript use `zoomTo(<number>,<number>,<number>)` function. It expects x, y value as coordinates of where to zoom. It also expects the zoom factor as the third argument. If zoom factor is greater than 1, apply zoom IN. If zoom factor is less than 1, apply zoom OUT.

``` js
instance.zoomTo(0, 0, 2);
```

To zoom in a smooth way use `smoothZoom(<number>,<number>,<number>)`:

``` js
instance.smoothZoom(0, 0, 0.5);
```

# license

MIT
