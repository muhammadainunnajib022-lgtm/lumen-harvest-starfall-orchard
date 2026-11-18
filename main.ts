import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const GAME_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lumen Harvest — Starfall Orchard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #070b1e; color: #eaf2ff; font-family: Verdana, Geneva, sans-serif;
    display: flex; flex-direction: column; align-items: center; min-height: 100vh; }
  h1 { margin: 14px 0 2px; font-size: 26px; letter-spacing: 2px; color: #ffd76a; }
  p.sub { color: #9fb4dd; font-size: 13px; margin-bottom: 10px; }
  #wrap { position: relative; }
  canvas { background: linear-gradient(#0b1030, #131b45 55%, #1d2b52);
    border: 3px solid #2c3f7d; border-radius: 10px; display: block; }
  #hud { display: flex; gap: 18px; justify-content: center; font-size: 15px;
    margin: 8px 0; flex-wrap: wrap; }
  #hud b { color: #ffd76a; }
  #help { font-size: 12px; color: #9fb4dd; max-width: 760px; text-align: center;
    line-height: 1.6; padding: 0 12px 18px; }
  #overlay { position: absolute; inset: 0; display: flex; align-items: center;
    justify-content: center; text-align: center; background: rgba(4,7,20,0.72);
    border-radius: 10px; }
  #overlay .card { background: #101736; border: 2px solid #ffd76a; border-radius: 12px;
    padding: 26px 30px; max-width: 520px; }
  #overlay h2 { color: #ffd76a; margin-bottom: 10px; font-size: 24px; }
  #overlay p { font-size: 14px; line-height: 1.6; color: #dbe6ff; }
  #overlay button { margin-top: 16px; font-size: 17px; padding: 10px 26px;
    background: #ffd76a; color: #1a1405; border: 0; border-radius: 8px;
    cursor: pointer; font-weight: bold; }
</style>
</head>
<body>
<h1>LUMEN HARVEST</h1>
<p class="sub">Starfall Orchard &mdash; an original arcade catcher &middot; catch stars, dodge meteors</p>
<div id="hud">
  <span>Score <b id="score">0</b></span><span>Best <b id="best">0</b></span>
  <span>Lives <b id="lives">3</b></span><span>Level <b id="level">1</b></span>
  <span>Combo <b id="combo">x1</b></span><span>Goal <b>500</b></span>
</div>
<div id="wrap">
  <canvas id="game" width="760" height="520"></canvas>
  <div id="overlay"><div class="card">
    <h2 id="ovTitle">LUMEN HARVEST</h2>
    <p id="ovText">Night falls over the orchard and the stars are dropping.
    Catch star shards to score, grab golden comets for bonuses, and dodge
    the void meteors. Reach 500 points to win. You have 3 lives.</p>
    <p style="margin-top:8px">Move: Arrow keys / WASD or mouse &middot; Space: dash<br>
    P: pause &middot; M: mute &middot; R: restart &middot; Enter: start</p>
    <button id="ovBtn">START GAME</button>
  </div></div>
</div>
<p id="help">Star shard +10 (combo multiplies) &middot; Golden comet +50 and +1 life (max 5)
&middot; Void meteor &minus;1 life &middot; Every 100 points the fall gets faster.
Best score is saved on this computer only. No network, no downloads.</p>
<script>
(function () {
  'use strict';
  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var W = cv.width, H = cv.height;
  var scoreEl = document.getElementById('score'), bestEl = document.getElementById('best');
  var livesEl = document.getElementById('lives'), levelEl = document.getElementById('level');
  var comboEl = document.getElementById('combo');
  var overlay = document.getElementById('overlay');
  var ovTitle = document.getElementById('ovTitle'), ovText = document.getElementById('ovText');
  var ovBtn = document.getElementById('ovBtn');
  var state = 'menu'; // menu | playing | paused | over | win
  var score = 0, lives = 3, level = 1, combo = 1, comboTimer = 0;
  var best = 0, dash = 0, dashCd = 0, spawnT = 0, elapsed = 0, muted = false;
  var items = [], stars = [], parts = [];
  try { best = parseInt(localStorage.getItem('lumenHarvestBest') || '0', 10) || 0; } catch (e) { best = 0; }
  bestEl.textContent = best;
  var player = { x: W / 2, y: H - 56, w: 96, h: 20, vx: 0, speed: 420 };
  var keys = {};
  var audio = null;
  function beep(freq, dur, type, vol) {
    if (muted) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      var o = audio.createOscillator(), g = audio.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.12, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
      o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + dur);
    } catch (e) { /* sound is optional */ }
  }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pickType() {
    var r = Math.random();
    if (r < 0.62) return 'star';
    if (r < 0.82) return 'meteor';
    if (r < 0.93) return 'comet';
    return 'heart';
  }
  function spawn() {
    var t = pickType();
    var it = { type: t, x: rand(24, W - 24), y: -24, vy: rand(90, 150) + level * 22,
      vx: rand(-30, 30), r: t === 'comet' ? 13 : (t === 'meteor' ? 16 : 11),
      rot: rand(0, 6.28), vr: rand(-2, 2) };
    items.push(it);
  }
  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      parts.push({ x: x, y: y, vx: rand(-160, 160), vy: rand(-190, 40),
        life: rand(0.3, 0.8), max: 0.8, color: color, r: rand(2, 5) });
    }
  }
  function initStars() {
    stars = [];
    for (var i = 0; i < 90; i++) {
      stars.push({ x: rand(0, W), y: rand(0, H), r: rand(0.6, 2.2), tw: rand(0, 6.28) });
    }
  }
  function reset() {
    score = 0; lives = 3; level = 1; combo = 1; comboTimer = 0;
    items = []; parts = []; dash = 0; dashCd = 0; spawnT = 0; elapsed = 0;
    player.x = W / 2; player.vx = 0;
    updateHud();
  }
  function updateHud() {
    scoreEl.textContent = score; livesEl.textContent = lives;
    levelEl.textContent = level; comboEl.textContent = 'x' + combo;
    bestEl.textContent = best;
  }
  function saveBest() {
    if (score > best) {
      best = score;
      try { localStorage.setItem('lumenHarvestBest', String(best)); } catch (e) {}
    }
  }
  function showOverlay(title, text, btn) {
    ovTitle.textContent = title; ovText.textContent = text; ovBtn.textContent = btn;
    overlay.style.display = 'flex';
  }
  function hideOverlay() { overlay.style.display = 'none'; }
  function startGame() {
    reset(); state = 'playing'; hideOverlay(); beep(520, 0.15, 'triangle', 0.14);
  }
  function endGame(won) {
    state = won ? 'win' : 'over'; saveBest(); updateHud();
    if (won) { beep(880, 0.4, 'triangle', 0.16); beep(1174, 0.5, 'triangle', 0.14); }
    else beep(160, 0.5, 'sawtooth', 0.12);
    showOverlay(won ? 'YOU WIN!' : 'GAME OVER',
      won ? 'The orchard glows again! You harvested ' + score + ' points and saved the starlight. Best: ' + best + '. Play again to beat it.'
          : 'The meteors got you. Final score: ' + score + '. Best: ' + best + '. Press Enter or click below to try again.',
      won ? 'PLAY AGAIN' : 'TRY AGAIN');
  }
  function drawStar(x, y, r, color) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = color;
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var ang = i * Math.PI / 5 - Math.PI / 2;
      var rad = (i % 2 === 0) ? r : r * 0.45;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(ang) * rad, Math.sin(ang) * rad);
    }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    // twinkling background stars + moon
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(elapsed + s.tw));
      ctx.fillStyle = '#cfe0ff'; ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(668, 62, 30, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#0b1030'; ctx.beginPath(); ctx.arc(656, 54, 26, 0, 6.283); ctx.fill();
    // ground / orchard
    ctx.fillStyle = '#1c3a24'; ctx.fillRect(0, H - 26, W, 26);
    ctx.fillStyle = '#2c5a34';
    for (var gx = 20; gx < W; gx += 64) {
      ctx.beginPath(); ctx.moveTo(gx, H - 26); ctx.lineTo(gx + 10, H - 52); ctx.lineTo(gx + 20, H - 26); ctx.fill();
    }
    // items
    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.rot);
      if (it.type === 'star') drawStar(0, 0, it.r, '#ffd76a');
      else if (it.type === 'comet') drawStar(0, 0, it.r, '#7df9ff');
      else if (it.type === 'heart') {
        ctx.fillStyle = '#ff5d8f'; ctx.beginPath();
        ctx.arc(-5, -3, 7, 0, 6.283); ctx.arc(5, -3, 7, 0, 6.283);
        ctx.moveTo(-11, 0); ctx.lineTo(0, 12); ctx.lineTo(11, 0); ctx.fill();
      } else {
        ctx.fillStyle = '#8a93b8'; ctx.beginPath(); ctx.arc(0, 0, it.r, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(-5, -4, 3, 0, 6.283); ctx.arc(5, -4, 3, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#3a2c1e'; ctx.fillRect(-it.r, it.r - 4, it.r * 2, 5);
      }
      ctx.restore();
    }
    // particles
    for (var k = 0; k < parts.length; k++) {
      var p = parts[k];
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // player basket
    var px = player.x;
    ctx.fillStyle = dash > 0 ? '#ffe9a8' : '#ffd76a';
    ctx.fillRect(px - player.w / 2, player.y, player.w, 8);
    ctx.fillStyle = '#a86f1d';
    ctx.beginPath(); ctx.moveTo(px - player.w / 2, player.y + 8);
    ctx.lineTo(px - player.w / 2 + 12, player.y + player.h);
    ctx.lineTo(px + player.w / 2 - 12, player.y + player.h);
    ctx.lineTo(px + player.w / 2, player.y + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7df9ff';
    ctx.beginPath(); ctx.arc(px, player.y - 4, 7, 0, 6.283); ctx.fill();
    if (state === 'paused') {
      ctx.fillStyle = 'rgba(4,7,20,0.6)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffd76a'; ctx.font = 'bold 34px Verdana';
      ctx.textAlign = 'center'; ctx.fillText('PAUSED', W / 2, H / 2);
      ctx.font = '16px Verdana'; ctx.fillStyle = '#eaf2ff';
      ctx.fillText('Press P to resume', W / 2, H / 2 + 34);
    }
  }
  function update(dt) {
    elapsed += dt;
    if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) combo = 1; }
    if (dash > 0) dash -= dt;
    if (dashCd > 0) dashCd -= dt;
    var sp = player.speed * (dash > 0 ? 1.9 : 1);
    if (keys['arrowleft'] || keys['a']) player.vx = -sp;
    else if (keys['arrowright'] || keys['d']) player.vx = sp;
    else player.vx *= 0.82;
    player.x += player.vx * dt;
    if (player.x < player.w / 2) player.x = player.w / 2;
    if (player.x > W - player.w / 2) player.x = W - player.w / 2;
    spawnT -= dt;
    var interval = Math.max(0.28, 0.85 - level * 0.06);
    if (spawnT <= 0) { spawn(); spawnT = interval; }
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      it.y += it.vy * dt; it.x += it.vx * dt; it.rot += it.vr * dt;
      if (it.x < 12 || it.x > W - 12) it.vx *= -1;
      var caught = it.y + it.r >= player.y && it.y - it.r <= player.y + player.h &&
        Math.abs(it.x - player.x) <= player.w / 2 + it.r * 0.5;
      if (caught) {
        if (it.type === 'meteor') {
          lives--; combo = 1; comboTimer = 0;
          burst(it.x, it.y, '#ff4d4d', 18); beep(140, 0.3, 'sawtooth', 0.14);
          if (lives <= 0) { updateHud(); endGame(false); return; }
        } else if (it.type === 'comet') {
          score += 50; burst(it.x, it.y, '#7df9ff', 16); beep(1046, 0.2, 'triangle', 0.14);
        } else if (it.type === 'heart') {
          if (lives < 5) lives++;
          score += 20; burst(it.x, it.y, '#ff5d8f', 14); beep(784, 0.2, 'sine', 0.14);
        } else {
          score += 10 * combo; combo = Math.min(combo + 1, 5); comboTimer = 4;
          burst(it.x, it.y, '#ffd76a', 10); beep(660 + combo * 60, 0.12, 'sine', 0.12);
        }
        items.splice(i, 1);
        var nl = Math.floor(score / 100) + 1;
        if (nl !== level) { level = nl; beep(880, 0.25, 'triangle', 0.14); }
        if (score >= 500) { updateHud(); endGame(true); return; }
        updateHud();
      } else if (it.y > H + 30) {
        if (it.type === 'star') { combo = 1; comboTimer = 0; }
        items.splice(i, 1);
      }
    }
    for (var p = parts.length - 1; p >= 0; p--) {
      parts[p].x += parts[p].vx * dt; parts[p].y += parts[p].vy * dt;
      parts[p].vy += 260 * dt; parts[p].life -= dt;
      if (parts[p].life <= 0) parts.splice(p, 1);
    }
  }
  var last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!last) last = ts;
    var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    if (state === 'playing') update(dt);
    draw();
  }
  document.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    keys[k] = true;
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].indexOf(k) >= 0) e.preventDefault();
    if (k === 'enter' && state !== 'playing') startGame();
    else if (k === 'r') startGame();
    else if (k === 'p' && (state === 'playing' || state === 'paused')) {
      state = state === 'playing' ? 'paused' : 'playing';
    } else if (k === 'm') muted = !muted;
    else if (k === ' ' && state === 'playing' && dashCd <= 0) { dash = 0.22; dashCd = 1.1; }
  });
  document.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
  cv.addEventListener('mousemove', function (e) {
    var r = cv.getBoundingClientRect();
    player.x = (e.clientX - r.left) * (W / r.width);
  });
  ovBtn.addEventListener('click', startGame);
  initStars(); updateHud(); requestAnimationFrame(loop);
})();
</script>
</body>
</html>`;

// The grader runs main.ts with the repository mounted read-only at /bot
// and a writable output directory at $MAKEFUN_OUTPUT_DIR, so write the
// game there when it is set; locally, write it next to main.ts.
const OUT = process.env.MAKEFUN_OUTPUT_DIR || ROOT;
mkdirSync(join(OUT, "game"), { recursive: true });
writeFileSync(join(OUT, "game", "index.html"), GAME_HTML, "utf8");
console.log("Wrote game/index.html (" + GAME_HTML.length + " chars). Open it in Chrome to play.");
