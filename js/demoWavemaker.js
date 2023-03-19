let r, g, b;
let t = 0;

function setup() {
  createCanvas(windowWidth, windowHeight);
  setStartingColors();
  background(255);
}

function setStartingColors() {
  r = random(0, 255);
  g = random(0, 255);
  b = random(0, 255);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  updateColors();
  drawWavemaker();
  t += 0.01;
}

function updateColors() {
  g = constrain(g + random(-15, 15), 0, 255);
  b = constrain(b + random(-15, 15), 0, 255);
  r = constrain(r + random(-15, 15), 0, 255);
}

function drawWavemaker() {
  for (let x = 0; x <= windowWidth; x += 30) {
    for (let y = 0; y <= windowHeight; y += 30) {
      const xAngle = map(mouseX, 0, windowWidth, -4 * PI, 4 * PI, true);
      const yAngle = map(mouseY, 0, windowHeight, -4 * PI, 4 * PI, true);
      const angle = xAngle * (x / windowWidth) + yAngle * (y / windowHeight);
      const myX = x + 20 * cos(2 * PI * t + angle);
      const myY = y + 20 * sin(2 * PI * t + angle);
      noStroke();
      fill(r, g, b);
      ellipse(myX, myY, 25);
    }
  }
}

function loop() {
  updateColors();
  drawWavemaker();
  t += 0.01;
  requestAnimationFrame(loop);
}

loop();
