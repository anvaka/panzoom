# panzoom

Pan and zoom an SVG scene.

# Demo

 * [Standalone page](https:////anvaka.github.io/panzoom/demo/index.html) - this repository
 * [YASIV](http://www.yasiv.com/#/Search?q=algorithms&category=Books&lang=US) - my hobby project
 * [SVG Tiger](https://jsfiddle.net/uwxcmbyg/) - js fiddle

# Usage

Grab it from npm and use with your favorite bundler:

```
npm install panzoom --save
```

Or download from CDN:

```
https://cdn.rawgit.com/anvaka/panzoom/v1.0.0/dist/panzoom.min.js
```

If you download from CDN the library will be available under `panzoom` global name.

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
var scene = document.getElementById('scene')

// and forward it it to panzoom.
panzoom(scene)

// You can visit https://jsfiddle.net/djL2fazo/ to see this demo in action
```

# license

MIT
