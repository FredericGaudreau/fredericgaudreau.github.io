var x;
var y;

var r;
var g;
var b;

function setup() {
  createCanvas(windowWidth, windowHeight);


  // createCanvas(windowWidth, windowHeight); // create canvas with window width and height as dimensions

  // x = windowWidth / 2; // set starting x position - center of canvas
  // y = windowHeight / 2; // set starting y position - center of canvas
  // x = width / 20; // set starting x position - left side of canvas
  // y = width / 20; // set starting y position - upper side of canvas
  // x = random(0, windowWidth * 0.99); // set starting x position - random
  // y = random(0, windowHeight * 0.97); // set starting y position - random

  r = random(0, 255); // set starting red value
  g = random(0, 255); // set starting green value
  b = random(0, 255); // set starting blue value

  background(300); // uncomment pour avoir un fond blanc
  // background(32); // uncomment pour avoir un fond noir

}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight); // resize canvas to window width and height
}

function draw() {
  // var randomValue = random(0, 1);
  // randomly move lines
  // if (randomValue < 0.25) {
  //   x--;
  // } else if (randomValue < 0.5) {
  //   x++;
  // } else if (randomValue < 0.75) {
  //   y--;
  // } else {
  //   y++;
  // }

  // // wrap around left and right sides
  // if (x < 0) {
  //   x = windowWidth;
  // } else if (x > windowWidth) {
  //   x = 0;
  // }

  // // wrap around top and bottom sides
  // if (y < 0) {
  //   y = windowHeight;
  // } else if (y > windowHeight) {
  //   y = 0;
  // }

  // randomly change color
  r += random(-1, 1);
  g += random(-1, 1);
  b += random(-1, 1);



  // don't let values go outside 0-255 range
  r = constrain(r, 0, 255);
  g = constrain(g, 0, 255);
  b = constrain(b, 0, 255);

  // if mouse pressed, change color
  if (mouseIsPressed) {
    r = random(0, 255);
    g = random(0, 255);
    b = random(0, 255);
  }
  stroke(r, g, b); // set stroke color

  // ellipse(x, y, 10, 10); // draw point

  // point(y, x); // draw point (mirrored)

  // nuage de points randoms

  // for (var i = 0; i < 100; i++) {
  //   point(random(0, windowWidth), random(0, windowHeight)); // draw point (random)
  //   // point(random(0, windowWidth), random(0, windowHeight)); // draw point (random)
  // }

  ellipse(random(windowHeight), random(windowWidth), 10, 10); // draw point (random)
  ellipse(mouseX, mouseY, 10, 10); // draw point (mouse)
}