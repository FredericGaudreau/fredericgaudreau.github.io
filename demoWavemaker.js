var x;
var y;

var r;
var g;
var b;

let t = 0; // time variable

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
  //   let n = random(1, 42);
  //   for (let i = 0; i < n; i++) {
  //     // draw circles
  //     circle(random(windowWidth), random(windowHeight), 10); // draw point (random)
  //     // circle(mouseX, mouseY, 10); // draw point (mouse)
  //   }

  // circle(random(windowWidth), random(windowHeight), 10); // draw point (random)

  // Wavemaker
  // make a x and y grid of ellipses
  for (let x = 0; x <= windowWidth; x = x + 30) {
    for (let y = 0; y <= windowHeight; y = y + 30) {
      // starting point of each circle depends on mouse position
      const xAngle = map(mouseX, 0, windowWidth, -4 * PI, 4 * PI, true);
      const yAngle = map(mouseY, 0, windowHeight, -4 * PI, 4 * PI, true);
      // and also varies based on the particle's location
      const angle = xAngle * (x / windowWidth) + yAngle * (y / windowHeight);

      // each particle moves in a circle
      const myX = x + 20 * cos(2 * PI * t + angle);
      const myY = y + 20 * sin(2 * PI * t + angle);

      ellipse(myX, myY, 25); // draw particle
    }
  }

  t = t + 0.01; // update time
}
