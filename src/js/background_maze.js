// deno-lint-ignore-file no-window-prefix no-window
(function () {
  const CONFIG = {
    gridSize: 30,
    strokeWidth: 4,
    minSegmentLength: 4,
    maxSegmentLength: 12,
    turnProbability: 0.15,
    chanceToBranch: 0.08,
    colorChangeRate: 15,
    growthSpeed: 0.75,
    seedDensityArea: 200,
    tileMultiplier: 9,
    baseDensityUnit: 9,
  };

  const GRID = CONFIG.baseDensityUnit * CONFIG.tileMultiplier;
  const TILE = GRID * CONFIG.gridSize;
  const GLOW = 25;
  const FADE = 800;

  const PALETTES = {
    dark: {
      colors: ["#2CE1D8", "#FFF9ED", "#fd5b5b", "#FFF9ED"],
      bg: "#02020D",
    },
    light: {
      colors: ["#4bcac4", "#02020D", "#fd5b5b", "#02020D"],
      bg: "#fffdf8",
    },
  };

  const DIRS = {
    N: { x: 0, y: -1 },
    S: { x: 0, y: 1 },
    E: { x: 1, y: 0 },
    W: { x: -1, y: 0 },
    NW: { x: -1, y: -1 },
    SE: { x: 1, y: 1 },
  };
  const DIR_KEYS = Object.keys(DIRS);
  const DIR_ENTRIES = Object.entries(DIRS);
  const DIR_VECS = Object.values(DIRS);

  const container = document.getElementById("background-maze-div");
  const display = document.getElementById("background-maze-canvas");
  const dCtx = display.getContext("2d");
  const pattern = Object.assign(document.createElement("canvas"), {
    width: TILE,
    height: TILE,
  });
  const pCtx = pattern.getContext("2d");

  let state = "hidden";
  let running = false;
  let paused = false;
  let shutdown = false;
  let firstFrame = false;
  let frameId = null;
  const timeouts = { debounce: null, regen: null, transition: null };

  let palette = PALETTES.dark;
  let glowSprites = [];
  let grid, degrees, colorMap, crawlers, strokes, seedSlots;
  let lastW = 0, lastH = 0;

  const wrap = (v, m) => (v % m + m) % m;

  const validMoves = (x, y) =>
    DIR_ENTRIES.filter(([, v]) => {
      const tx = wrap(x + v.x, GRID), ty = wrap(y + v.y, GRID);
      return !grid[tx][ty] &&
        !(v.x && v.y && grid[wrap(x + v.x, GRID)][y] &&
          grid[x][wrap(y + v.y, GRID)]);
    }).map(([k]) => k);

  const forTiles = (fn) => {
    const off = window.scrollY % TILE;
    for (let c = 0; c <= display.width / TILE + 1; c++) {
      for (let r = 0; r <= display.height / TILE + 1; r++) {
        fn(c * TILE, r * TILE - off);
      }
    }
  };

  function applyTheme() {
    const light =
      document.documentElement.getAttribute("data-theme") === "light";
    palette = light ? PALETTES.light : PALETTES.dark;
    glowSprites = palette.colors.map((color) => {
      const c = Object.assign(document.createElement("canvas"), {
        width: GLOW * 2,
        height: GLOW * 2,
      });
      const x = c.getContext("2d"),
        g = x.createRadialGradient(GLOW, GLOW, 0, GLOW, GLOW, GLOW);
      g.addColorStop(0, color);
      g.addColorStop(1, light ? "rgba(255,255,255,0)" : "rgba(0,0,0,0)");
      x.fillStyle = g;
      x.arc(GLOW, GLOW, GLOW, 0, Math.PI * 2);
      x.fill();
      return c;
    });
  }

  function setVisual(s) {
    if (shutdown || state === s) return;
    clearTimeout(timeouts.transition);
    state = s;
    if (s === "fading-in" || s === "fading-out") {
      display.classList.toggle("loaded", s === "fading-in");
      timeouts.transition = setTimeout(
        () => setVisual(s === "fading-in" ? "visible" : "hidden"),
        FADE,
      );
    }
  }

  class Crawler {
    constructor(x, y, dir, force, color) {
      this.x = x;
      this.y = y;
      this.dir = dir;
      this.force = force;
      this.color = color;
      this.steps = 0;
      this.seg = 0;
      this.moving = false;
      grid[x][y] = true;
      colorMap[x][y] = color;
      this.ax = x * CONFIG.gridSize + CONFIG.gridSize / 2;
      this.ay = y * CONFIG.gridSize + CONFIG.gridSize / 2;
      this.tx = this.ax;
      this.ty = this.ay;
    }

    update() {
      return this.moving ? this.move() : this.think();
    }

    think() {
      const moves = validMoves(this.x, this.y);
      if (!moves.length) return false;

      const dir = this.chooseDir(moves);
      const v = DIRS[dir];
      const nx = wrap(this.x + v.x, GRID), ny = wrap(this.y + v.y, GRID);

      if (++this.steps > CONFIG.colorChangeRate) {
        this.steps = 0;
        this.color = (this.color + 1) % palette.colors.length;
      }

      grid[nx][ny] = true;
      degrees[this.x][this.y]++;
      degrees[nx][ny]++;
      colorMap[nx][ny] = this.color;

      if (
        !this.force && crawlers.length < seedSlots &&
        Math.random() < CONFIG.chanceToBranch && degrees[this.x][this.y] < 3
      ) {
        const opts = moves.filter((d) => d !== dir);
        if (opts.length) {
          degrees[this.x][this.y]++;
          crawlers.push(
            new Crawler(this.x, this.y, this.pickBest(opts), 0, this.color),
          );
        }
      }

      this.seg = dir === this.dir ? this.seg + 1 : 0;
      if (this.force > 0) this.force--;
      this.tx = this.ax + v.x * CONFIG.gridSize;
      this.ty = this.ay + v.y * CONFIG.gridSize;
      this.x = nx;
      this.y = ny;
      this.dir = dir;
      this.moving = true;
      return true;
    }

    chooseDir(moves) {
      const can = moves.includes(this.dir);
      if (this.force > 0) return can ? this.dir : this.pickBest(moves);
      if (this.seg > CONFIG.maxSegmentLength) {
        const turns = moves.filter((d) => d !== this.dir);
        if (turns.length) return this.pickBest(turns);
        if (can) {
          this.seg = 0;
          return this.dir;
        }
      }
      if (this.seg < CONFIG.minSegmentLength && can) return this.dir;
      if (moves.length > 1 && Math.random() < CONFIG.turnProbability) {
        return this.pickBest(moves);
      }
      return can ? this.dir : this.pickBest(moves);
    }

    move() {
      const dx = this.tx - this.ax, dy = this.ty - this.ay;
      const d = Math.hypot(dx, dy);
      const [nx, ny] = d <= CONFIG.growthSpeed ? [this.tx, this.ty] : [
        this.ax + dx / d * CONFIG.growthSpeed,
        this.ay + dy / d * CONFIG.growthSpeed,
      ];

      const buf = CONFIG.strokeWidth * 2;
      const wx = Math.max(this.ax, nx) > TILE - buf
        ? -TILE
        : Math.min(this.ax, nx) < buf
        ? TILE
        : 0;
      const wy = Math.max(this.ay, ny) > TILE - buf
        ? -TILE
        : Math.min(this.ay, ny) < buf
        ? TILE
        : 0;

      const q = strokes[this.color];
      q.push({ x1: this.ax, y1: this.ay, x2: nx, y2: ny });
      if (wx) q.push({ x1: this.ax + wx, y1: this.ay, x2: nx + wx, y2: ny });
      if (wy) q.push({ x1: this.ax, y1: this.ay + wy, x2: nx, y2: ny + wy });
      if (wx && wy) {
        q.push({
          x1: this.ax + wx,
          y1: this.ay + wy,
          x2: nx + wx,
          y2: ny + wy,
        });
      }

      this.ax = nx;
      this.ay = ny;
      if (nx === this.tx && ny === this.ty) {
        this.ax = wrap(this.ax, TILE);
        this.ay = wrap(this.ay, TILE);
        this.moving = false;
      }
      return true;
    }

    pickBest(opts) {
      const scored = opts.map((o) => {
        const v = DIRS[o],
          tx = wrap(this.x + v.x, GRID),
          ty = wrap(this.y + v.y, GRID);
        const neighbors = DIR_VECS.filter((n) => {
          const nx = wrap(tx + n.x, GRID), ny = wrap(ty + n.y, GRID);
          return (nx !== this.x || ny !== this.y) && grid[nx][ny];
        }).length;
        const isDiag = (d) => Math.abs(DIRS[d].x) + Math.abs(DIRS[d].y) === 2;
        return {
          o,
          s: (isDiag(this.dir) !== isDiag(o) ? 10 : 0) +
            (neighbors === 1 ? 5 : 0),
        };
      }).sort((a, b) => b.s - a.s);
      return scored.length > 1 && Math.random() < 0.2
        ? scored[Math.floor(Math.random() * scored.length)].o
        : scored[0].o;
    }
  }

  function spawnFill() {
    const locked = new Set(
      crawlers.filter((c) => c.moving).map((c) => `${c.x},${c.y}`),
    );
    const cands = [], weak = [], start = Math.floor(Math.random() * GRID);

    for (let x = 0; x < GRID; x += 2) {
      for (let i = 0; i < 50; i++) {
        const y = wrap(start + i, GRID);
        if (
          !grid[x][y] || locked.has(`${x},${y}`) || degrees[x][y] >= 3
        ) continue;
        const moves = validMoves(x, y);
        if (!moves.length) continue;
        const strong = moves.filter((dir) => {
          const v = DIRS[dir];
          return !grid[wrap(x + v.x * 2, GRID)][wrap(y + v.y * 2, GRID)];
        });
        (strong.length ? cands : weak).push({
          x,
          y,
          dirs: strong.length ? strong : moves,
        });
      }
    }

    const pool = cands.length ? cands : weak;
    if (!pool.length) return false;
    const { x, y, dirs } = pool[Math.floor(Math.random() * pool.length)];
    degrees[x][y]++;
    crawlers.push(
      new Crawler(
        x,
        y,
        dirs[Math.floor(Math.random() * dirs.length)],
        4,
        colorMap[x][y],
      ),
    );
    return true;
  }

  function flush() {
    pCtx.lineWidth = CONFIG.strokeWidth;
    pCtx.lineCap = pCtx.lineJoin = "round";
    strokes.forEach((q, i) => {
      if (!q.length) return;
      pCtx.strokeStyle = palette.colors[i];
      pCtx.beginPath();
      q.forEach((s) => {
        pCtx.moveTo(s.x1, s.y1);
        pCtx.lineTo(s.x2, s.y2);
      });
      pCtx.stroke();
      strokes[i] = [];
    });
  }

  function render() {
    dCtx.fillStyle = palette.bg;
    dCtx.fillRect(0, 0, display.width, display.height);
    forTiles((x, y) => dCtx.drawImage(pattern, x, y));
    if (!crawlers.length) return;

    dCtx.globalCompositeOperation = palette === PALETTES.light
      ? "source-over"
      : "screen";
    forTiles((ox, oy) =>
      crawlers.forEach((c) => {
        const x = ox + c.ax - GLOW, y = oy + c.ay - GLOW;
        if (
          x > -GLOW * 2 && x < display.width && y > -GLOW * 2 &&
          y < display.height
        ) {
          dCtx.drawImage(glowSprites[c.color], x, y);
        }
      })
    );
    dCtx.globalCompositeOperation = "source-over";
  }

  function init() {
    const make = (v) => Array.from({ length: GRID }, () => Array(GRID).fill(v));
    grid = make(false);
    degrees = make(0);
    colorMap = make(0);
    strokes = palette.colors.map(() => []);
    crawlers = [];
    pCtx.fillStyle = palette.bg;
    pCtx.fillRect(0, 0, TILE, TILE);
    seedSlots = Math.max(2, Math.floor(GRID * GRID / CONFIG.seedDensityArea));

    for (
      let n = 0, tries = 0;
      n < seedSlots && tries < seedSlots * 10;
      tries++
    ) {
      const x = Math.floor(Math.random() * GRID),
        y = Math.floor(Math.random() * GRID);
      if (!grid[x][y]) {
        degrees[x][y] = 1;
        crawlers.push(
          new Crawler(
            x,
            y,
            DIR_KEYS[Math.floor(Math.random() * DIR_KEYS.length)],
            4,
            Math.floor(Math.random() * palette.colors.length),
          ),
        );
        n++;
      }
    }
    firstFrame = false;
    running = true;
  }

  function start() {
    if (shutdown) return;
    applyTheme();
    display.width = container.clientWidth;
    display.height = container.clientHeight;
    init();
    frameId ||= requestAnimationFrame(loop);
  }

  function loop() {
    if (shutdown) return void (frameId = null);
    frameId = requestAnimationFrame(loop);
    if (paused) return;
    if (!running) return render();

    let active = crawlers.length > 0;
    for (let i = crawlers.length - 1; i >= 0; i--) {
      crawlers[i].update() || crawlers.splice(i, 1);
    }
    if (crawlers.length < seedSlots && spawnFill()) active = true;

    flush();
    render();

    if (!firstFrame && active) {
      firstFrame = true;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (state === "hidden" && !shutdown) setVisual("fading-in");
        })
      );
    }

    if (!active && !crawlers.length) {
      running = false;
      timeouts.regen = setTimeout(() => {
        if (shutdown) return;
        setVisual("fading-out");
        schedule(FADE);
      }, 1000);
    }
  }

  function schedule(delay) {
    clearTimeout(timeouts.debounce);
    clearTimeout(timeouts.regen);
    timeouts.debounce = setTimeout(() => {
      if (shutdown) return;
      if (state === "hidden") return start();
      const wait = () =>
        shutdown || (state === "hidden" ? start() : setTimeout(wait, 50));
      wait();
    }, delay);
  }

  function trigger() {
    clearTimeout(timeouts.regen);
    if (state === "visible" || state === "fading-in") setVisual("fading-out");
    schedule(Math.max(300, FADE));
  }

  const cleanup = () => {
    shutdown = true;
    Object.values(timeouts).forEach(clearTimeout);
    frameId && cancelAnimationFrame(frameId);
    resizeObs.disconnect();
    themeObs.disconnect();
  };

  const resizeObs = new ResizeObserver(() => {
    if (shutdown) return;
    const { clientWidth: w, clientHeight: h } = container;
    if (w !== lastW || h !== lastH) {
      lastW = w;
      lastH = h;
      trigger();
    }
  });

  const themeObs = new MutationObserver((m) => {
    if (!shutdown && m.some((x) => x.attributeName === "data-theme")) trigger();
  });

  resizeObs.observe(container);
  themeObs.observe(document.documentElement, { attributes: true });
  window.addEventListener("scroll", render, { passive: true });
  window.addEventListener("pagehide", cleanup);
  window.addEventListener("beforeunload", cleanup);
  document.addEventListener(
    "visibilitychange",
    () => !shutdown && (paused = document.visibilityState === "hidden"),
  );

  start();
})();
