let rColor;
let gColor;
let bColor;

function setup() {
  createCanvas(windowWidth, windowHeight);
  rColor = random(0, 255);
  gColor = random(0, 255);
  bColor = random(0, 255);
  background(255);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
//slow transition between colors
  rColor = lerp(rColor, random(0, 255), 0.15);
  gColor = lerp(gColor, random(0, 255), 0.15);
  bColor = lerp(bColor, random(0, 255), 0.15);

  // rColor = random(0, 255);
  // gColor = random(0, 255);
  // bColor = random(0, 255);

  noStroke();
  fill(rColor, gColor, bColor);

  let n = random(1, 42);
  for (let i = 0; i < n; i++) {
    circle(random(windowWidth), random(windowHeight), 25);
  }
}