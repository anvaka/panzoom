

class Transform {
  constructor(useAspect) {
    this.x = 0;
    this.y = 0;
    this.scale = 1;
    if ( !useAspect ) {
      this.scaleX = 1;
      this.scaleY = 1;
    }
  }
}


module.exports = Transform;