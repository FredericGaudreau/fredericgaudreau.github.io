var x;
var y;

var r;
var g;
var b;

function setup() {
  createCanvas(windowWidth-10, windowHeight-20); // create canvas with window width and height as dimensions
  
  // x = width / 2; // set starting x position - center of canvas
  // y = width / 2; // set starting y position - center of canvas
  x = width / 20; // set starting x position 
  y = width / 20; // set starting y position

  r = random(0, 255);
  g = random(0, 255);
  b = random(0, 255);

  background(300); // uncomment pour avoir un fond blanc
  // background(32); // uncomment pour avoir un fond noir

  // speed(2); // set speed - ne fonctionne pas
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  // randomly move line
  var randomValue = random(); // random value between 0 and 1
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

  stroke(r, g, b); // set stroke color

  point(x, y); // draw point
}
