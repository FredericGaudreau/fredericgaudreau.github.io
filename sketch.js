var x;
var y;

var r;
var g;
var b;

// let t = 0; // time variable

function setup() {
  createCanvas(windowWidth, windowHeight);

  r = random(0, 255); // set starting red value
  g = random(0, 255); // set starting green value
  b = random(0, 255); // set starting blue value

  background(255); // uncomment pour avoir un fond blanc
  // background(0); // uncomment pour avoir un fond noir
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
  r += random(-10, 10);
  g += random(-10, 10);
  b += random(-10, 10);

  // don't let values go outside 0-255 range
  r = constrain(r, 0, 255);
  g = constrain(g, 0, 255);
  b = constrain(b, 0, 255);

  // if mouse pressed, change color
  // if (mouseIsPressed) {
  //   r = random(0, 255);
  //   g = random(0, 255);
  //   b = random(0, 255);
  // }

  //décommenter pour avoir des "ronds"
  noStroke();
  fill(r, g, b);

  // décommenter pour avoir des "bulles"
  // stroke(r, g, b); // set stroke color
  // strokeWeight(100); // set stroke weight
  // noStroke();

  // randomize the number of circles for each draw
  let n = random(1, 42);
  for (let i = 0; i < n; i++) {
    // draw circles
    circle(random(windowWidth), random(windowHeight), 10); // draw point (random)
    // circle(mouseX, mouseY, 10); // draw point (mouse)
  }
  
  // circle(random(windowWidth), random(windowHeight), 10); // draw point (random)

  // Wavemaker
  // // make a x and y grid of ellipses
  // for (let x = 0; x <= width; x = x + 30) {
  //   for (let y = 0; y <= height; y = y + 30) {
  //     // starting point of each circle depends on mouse position
  //     const xAngle = map(mouseX, 0, width, -4 * PI, 4 * PI, true);
  //     const yAngle = map(mouseY, 0, height, -4 * PI, 4 * PI, true);
  //     // and also varies based on the particle's location
  //     const angle = xAngle * (x / width) + yAngle * (y / height);

  //     // each particle moves in a circle
  //     const myX = x + 20 * cos(2 * PI * t + angle);
  //     const myY = y + 20 * sin(2 * PI * t + angle);

  //     ellipse(myX, myY, 10); // draw particle
  //   }
  // }

  // t = t + 0.01; // update time
}

// faire plusieurs exemples de <canvas> avec p5js pour github pages
//if random value then choix1 else choix2 etc...
