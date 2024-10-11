module.exports = Transform;

function Transform(initial = {}) {
  if (typeof initial.x === 'number' && typeof initial.y === 'number' && typeof initial.scale === 'number') {
    this.x = initial.x;
    this.y = initial.y;
    this.scale = initial.scale;
    return;
  }
  this.x = 0;
  this.y = 0;
  this.scale = 1;
}
