var x;
var y;

var r;
var g;
var b;

function setup() {
  createCanvas(500, 500);

  x = width / 2;
  y = width / 2;

  r = random(0, 255);
  g = random(0, 255);
  b = random(0, 255);

  background(32);
}

function draw() {
  // randomly move line
  var randomValue = random();
  if (randomValue < 0.25) {
    x--;
  } else if (randomValue < 0.5) {
    x++;
  } else if (randomValue < 0.75) {
    y--;
  } else {
    y++;
  }

  // wrap around left and right sides
  if (x < 0) {
    x = width;
  } else if (x > width) {
    x = 0;
  }

  // wrap around top and bottom sides
  if (y < 0) {
    y = height;
  } else if (y > height) {
    y = 0;
  }

  // randomly change color
  r += random(-1, 1);
  g += random(-1, 1);
  b += random(-1, 1);

  // don't let values go outside 0-255 range
  r = constrain(r, 0, 255);
  g = constrain(g, 0, 255);
  b = constrain(b, 0, 255);

  stroke(r, g, b);

  point(x, y);
}
