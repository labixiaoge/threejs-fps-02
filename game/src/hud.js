// RUSTLINE DEPOT — the DOM HUD. It never touches the simulation; main.js
// pushes numbers in and reads callbacks out. Health, armour, ammo, money,
// round timer and score, alive counts, kill feed, hit marker, damage
// vignette, plant/defuse progress, round banners, the buy menu and a live
// 2D minimap drawn from the world's own wall list.
import { WEAPONS, ARMOR_PRICE } from './weapon.js';

const COPY = {
  start: {
    title: 'RUSTLINE DEPOT',
    copy: 'Round-based tactical FPS. Lead Vanguard: plant the charge at Site A or Site B, or eliminate the Sentinel squad. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'RUSTLINE DEPOT',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundEnd: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  matchEnd: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const healthNum = $('health-num');
  const healthBar = $('health-bar');
  const armorNum = $('armor-num');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammoWeapon = $('ammo-weapon');
  const moneyEl = $('money');
  const timerEl = $('timer');
  const scoreEl = $('score');
  const aliveV = $('alive-v');
  const aliveS = $('alive-s');
  const feedEl = $('feed');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const bannerEl = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const progressEl = $('progress');
  const progressLabel = $('progress-label');
  const progressFill = $('progress-fill');
  const vignette = $('vignette');
  const toastEl = $('toast');
  const buyEl = $('buy');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const kdEl = $('kd');
  const minimap = $('minimap');
  const mapCtx = minimap.getContext('2d');

  let hitTimer = 0;
  let bannerTimer = 0;
  let toastTimer = 0;
  let last = {};
  let buyHandler = null;

  function setText(el, value, key) {
    if (last[key] !== value) {
      last[key] = value;
      el.textContent = value;
    }
  }

  return {
    setHealth(hp, armor) {
      setText(healthNum, String(Math.ceil(hp)), 'hp');
      setText(armorNum, String(Math.ceil(armor)), 'armor');
      healthBar.style.width = `${Math.max(0, hp)}%`;
      healthBar.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve, weaponName) {
      setText(ammoMag, String(mag), 'mag');
      setText(ammoReserve, `/ ${reserve}`, 'reserve');
      setText(ammoWeapon, weaponName, 'weapon');
    },
    setMoney(m) {
      setText(moneyEl, `$${m}`, 'money');
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      const mm = Math.floor(s / 60);
      const ss = String(s % 60).padStart(2, '0');
      const label = phase === 'buy' ? 'BUY' : phase === 'fuse' ? 'FUSE' : 'ROUND';
      setText(timerEl, `${label} ${mm}:${ss}`, 'timer');
      timerEl.classList.toggle('urgent', phase !== 'buy' && s <= 10);
    },
    setScore(v, s, round, maxRounds) {
      setText(scoreEl, `ROUND ${round} / ${maxRounds}   ${v} — ${s}`, 'score');
    },
    setAlive(v, s) {
      const dots = (n, cls) => Array.from({ length: 5 }, (_, i) => `<i class="${cls}${i < n ? ' on' : ''}"></i>`).join('');
      const html = dots(v, 'dot-v') + '<span class="vs">VS</span>' + dots(s, 'dot-s');
      if (last.alive !== html) {
        last.alive = html;
        aliveV.innerHTML = dots(v, 'dot-v');
        aliveS.innerHTML = dots(s, 'dot-s');
      }
    },
    setKd(kills, deaths) {
      setText(kdEl, `${kills} K / ${deaths} D`, 'kd');
    },
    feed(killer, victim, headshot, killerTeam) {
      const row = document.createElement('div');
      row.className = 'feed-row';
      row.innerHTML = `<span class="${killerTeam === 'vanguard' ? 'team-v' : 'team-s'}">${killer}</span> <span class="feed-arrow">▸</span> <span>${victim}</span>${headshot ? ' <span class="feed-hs">(headshot)</span>' : ''}`;
      feedEl.prepend(row);
      while (feedEl.children.length > 5) feedEl.removeChild(feedEl.lastChild);
      setTimeout(() => row.classList.add('fade'), 4200);
      setTimeout(() => row.remove(), 5000);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      if (killed) hitmarker.classList.add('kill');
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    setCrosshairGap(px) {
      crosshair.style.setProperty('--gap', `${px}px`);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 180);
    },
    banner(text, sub, ms = 2600) {
      bannerTitle.textContent = text;
      bannerSub.textContent = sub;
      bannerEl.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => bannerEl.classList.remove('on'), ms);
    },
    hideBanner() {
      clearTimeout(bannerTimer);
      bannerEl.classList.remove('on');
    },
    showProgress(label, frac) {
      progressEl.hidden = false;
      progressLabel.textContent = label;
      progressFill.style.width = `${Math.round(frac * 100)}%`;
    },
    hideProgress() {
      progressEl.hidden = true;
    },
    toast(text, ms = 3200) {
      toastEl.textContent = text;
      toastEl.classList.add('on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('on'), ms);
    },
    clearToast() {
      clearTimeout(toastTimer);
      toastEl.classList.remove('on');
    },
    showBuy(money, owned) {
      buyMoney.textContent = `$${money}`;
      buyList.innerHTML = '';
      const items = [
        ...Object.values(WEAPONS).filter((w) => w.price > 0),
        { id: 'armor', name: 'Plated Armour', price: ARMOR_PRICE, damage: 0, mag: 0, reserve: 0, desc: 'Absorbs half of each hit' },
      ];
      for (const item of items) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'buy-item';
        const has = owned.has(item.id) || (item.id === 'armor' && owned.has('armor'));
        b.disabled = has || money < item.price;
        b.innerHTML = `<span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc ?? `${item.damage} dmg · ${item.mag} rnd mag · ${item.gap}s`}</span><span class="buy-price">${has ? 'OWNED' : '$' + item.price}</span>`;
        b.addEventListener('click', () => buyHandler && buyHandler(item.id));
        buyList.appendChild(b);
      }
      buyEl.hidden = false;
    },
    hideBuy() {
      buyEl.hidden = true;
    },
    onBuy(handler) {
      buyHandler = handler;
    },
    drawMinimap(walls, sites, entities) {
      const W = minimap.width;
      const H = minimap.height;
      const sx = W / 62;
      const sy = H / 48;
      mapCtx.clearRect(0, 0, W, H);
      mapCtx.fillStyle = 'rgba(20,22,26,0.92)';
      mapCtx.fillRect(0, 0, W, H);
      mapCtx.fillStyle = '#6d7278';
      for (const w of walls) {
        mapCtx.fillRect((w.x - w.w / 2 + 31) * sx, (w.z - w.d / 2 + 24) * sy, Math.max(1, w.w * sx), Math.max(1, w.d * sy));
      }
      mapCtx.font = 'bold 13px monospace';
      mapCtx.textAlign = 'center';
      mapCtx.textBaseline = 'middle';
      for (const key of Object.keys(sites)) {
        const s = sites[key];
        mapCtx.fillStyle = key === 'A' ? '#f0a830' : '#35c4b5';
        mapCtx.fillText(key, (s.center.x + 31) * sx, (s.center.z + 24) * sy);
      }
      for (const e of entities) {
        const x = (e.x + 31) * sx;
        const y = (e.z + 24) * sy;
        mapCtx.beginPath();
        mapCtx.arc(x, y, e.me ? 4 : 3, 0, Math.PI * 2);
        mapCtx.fillStyle = e.dead ? 'rgba(120,120,120,0.6)' : e.team === 'vanguard' ? '#f0a830' : '#35c4b5';
        mapCtx.fill();
        if (e.me) {
          mapCtx.beginPath();
          mapCtx.arc(x, y, 6.5, 0, Math.PI * 2);
          mapCtx.strokeStyle = '#ece7db';
          mapCtx.lineWidth = 1.5;
          mapCtx.stroke();
        }
      }
    },
    showOverlay(mode, data = {}) {
      const text = COPY[mode];
      title.textContent = data.title ?? text.title;
      copy.textContent = data.copy ?? text.copy;
      play.textContent = data.action ?? text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
