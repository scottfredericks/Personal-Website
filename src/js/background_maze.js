// deno-lint-ignore-file no-window-prefix no-window
(function () {
  // ===========================================================================
  // Configuration
  // ===========================================================================

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

  const GRID_SIZE = CONFIG.baseDensityUnit * CONFIG.tileMultiplier;
  const TILE_SIZE = GRID_SIZE * CONFIG.gridSize;
  const GLOW_RADIUS = 25;
  const FADE_DURATION = 800;
  const RESIZE_DEBOUNCE = 300;
  const REGEN_DELAY = 1000;

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

  // ===========================================================================
  // Canvas setup
  // ===========================================================================

  const container = document.getElementById("background-maze-div");
  const display = document.getElementById("background-maze-canvas");
  const displayCtx = display.getContext("2d");
  const pattern = Object.assign(document.createElement("canvas"), {
    width: TILE_SIZE,
    height: TILE_SIZE,
  });
  const patternCtx = pattern.getContext("2d");

  // ===========================================================================
  // State
  // ===========================================================================

  let visualState = "hidden";
  let isRunning = false;
  let isPaused = false;
  let isShuttingDown = false;
  let hasRenderedFirstFrame = false;

  let debounceTimeout = null;
  let autoRegenTimeout = null;
  let transitionTimeout = null;
  let animationFrameId = null;

  let palette = PALETTES.dark;
  let glowSprites = [];

  let grid, degrees, colorMap, crawlers, strokeQueues;
  let totalSeedSlots = 0;
  let lastWidth = 0;
  let lastHeight = 0;

  // ===========================================================================
  // Utilities
  // ===========================================================================

  const wrap = (v, max) => (v + max) % max;

  function forEachTile(callback) {
    const cols = Math.ceil(display.width / TILE_SIZE) + 1;
    const rows = Math.ceil(display.height / TILE_SIZE) + 1;
    const scrollOffset = window.scrollY % TILE_SIZE;

    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        callback(col * TILE_SIZE, row * TILE_SIZE - scrollOffset);
      }
    }
  }

  function forEachWrap(x1, y1, x2, y2, buffer, callback) {
    const wx = Math.max(x1, x2) > TILE_SIZE - buffer
      ? -TILE_SIZE
      : Math.min(x1, x2) < buffer
      ? TILE_SIZE
      : 0;
    const wy = Math.max(y1, y2) > TILE_SIZE - buffer
      ? -TILE_SIZE
      : Math.min(y1, y2) < buffer
      ? TILE_SIZE
      : 0;

    callback(x1, y1, x2, y2);
    if (wx) callback(x1 + wx, y1, x2 + wx, y2);
    if (wy) callback(x1, y1 + wy, x2, y2 + wy);
    if (wx && wy) callback(x1 + wx, y1 + wy, x2 + wx, y2 + wy);
  }

  function getValidMoves(x, y) {
    return DIR_ENTRIES.filter(([, vec]) => {
      const tx = wrap(x + vec.x, GRID_SIZE);
      const ty = wrap(y + vec.y, GRID_SIZE);
      if (grid[tx][ty]) return false;

      const isDiag = vec.x && vec.y;
      if (
        isDiag && grid[wrap(x + vec.x, GRID_SIZE)][y] &&
        grid[x][wrap(y + vec.y, GRID_SIZE)]
      ) return false;

      return true;
    }).map(([key]) => key);
  }

  // ===========================================================================
  // Theme and visuals
  // ===========================================================================

  function applyTheme() {
    const isLight =
      document.documentElement.getAttribute("data-theme") === "light";
    palette = isLight ? PALETTES.light : PALETTES.dark;

    glowSprites = palette.colors.map((color) => {
      const canvas = Object.assign(document.createElement("canvas"), {
        width: GLOW_RADIUS * 2,
        height: GLOW_RADIUS * 2,
      });
      const ctx = canvas.getContext("2d");
      const grad = ctx.createRadialGradient(
        GLOW_RADIUS,
        GLOW_RADIUS,
        0,
        GLOW_RADIUS,
        GLOW_RADIUS,
        GLOW_RADIUS,
      );
      grad.addColorStop(0, color);
      grad.addColorStop(1, isLight ? "rgba(255,255,255,0)" : "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.arc(GLOW_RADIUS, GLOW_RADIUS, GLOW_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      return canvas;
    });
  }

  function setVisualState(state) {
    if (isShuttingDown || visualState === state) return;
    clearTimeout(transitionTimeout);
    visualState = state;

    if (state === "fading-in" || state === "fading-out") {
      display.classList.toggle("loaded", state === "fading-in");
      transitionTimeout = setTimeout(
        () => setVisualState(state === "fading-in" ? "visible" : "hidden"),
        FADE_DURATION,
      );
    }
  }

  // ===========================================================================
  // Crawler
  // ===========================================================================

  class Crawler {
    constructor(x, y, dir, forceLen, colorIdx) {
      this.x = x;
      this.y = y;
      this.dir = dir;
      this.forceLen = forceLen;
      this.colorIdx = colorIdx;
      this.stepCount = 0;
      this.segLen = 0;
      this.state = "THINKING";

      grid[x][y] = true;
      colorMap[x][y] = colorIdx;

      const center = CONFIG.gridSize / 2;
      this.animX = x * CONFIG.gridSize + center;
      this.animY = y * CONFIG.gridSize + center;
      this.targetX = this.animX;
      this.targetY = this.animY;
    }

    update() {
      return this.state === "THINKING" ? this.think() : this.move();
    }

    think() {
      const moves = getValidMoves(this.x, this.y);
      if (!moves.length) return false;

      const dir = this.chooseDir(moves);
      const vec = DIRS[dir];
      const nx = wrap(this.x + vec.x, GRID_SIZE);
      const ny = wrap(this.y + vec.y, GRID_SIZE);

      if (++this.stepCount > CONFIG.colorChangeRate) {
        this.stepCount = 0;
        this.colorIdx = (this.colorIdx + 1) % palette.colors.length;
      }

      grid[nx][ny] = true;
      degrees[this.x][this.y]++;
      degrees[nx][ny]++;
      colorMap[nx][ny] = this.colorIdx;

      this.tryBranch(moves, dir);

      this.segLen = dir === this.dir ? this.segLen + 1 : 0;
      if (this.forceLen > 0) this.forceLen--;

      this.targetX = this.animX + vec.x * CONFIG.gridSize;
      this.targetY = this.animY + vec.y * CONFIG.gridSize;
      this.x = nx;
      this.y = ny;
      this.dir = dir;
      this.state = "MOVING";
      return true;
    }

    chooseDir(moves) {
      const canContinue = moves.includes(this.dir);

      if (this.forceLen > 0) {
        return canContinue ? this.dir : this.pickBest(moves);
      }

      if (this.segLen > CONFIG.maxSegmentLength) {
        const turns = moves.filter((d) => d !== this.dir);
        if (turns.length) return this.pickBest(turns);
        if (canContinue) {
          this.segLen = 0;
          return this.dir;
        }
      }

      if (this.segLen < CONFIG.minSegmentLength && canContinue) return this.dir;
      if (Math.random() < CONFIG.turnProbability && moves.length > 1) {
        return this.pickBest(moves);
      }

      return canContinue ? this.dir : this.pickBest(moves);
    }

    tryBranch(moves, nextDir) {
      if (this.forceLen > 0 || crawlers.length >= totalSeedSlots) return;
      if (Math.random() >= CONFIG.chanceToBranch) return;
      if (degrees[this.x][this.y] >= 3) return;

      const opts = moves.filter((d) => d !== nextDir);
      if (opts.length) {
        degrees[this.x][this.y]++;
        crawlers.push(
          new Crawler(this.x, this.y, this.pickBest(opts), 0, this.colorIdx),
        );
      }
    }

    move() {
      const dx = this.targetX - this.animX;
      const dy = this.targetY - this.animY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let nx, ny;
      if (dist <= CONFIG.growthSpeed) {
        nx = this.targetX;
        ny = this.targetY;
      } else {
        const angle = Math.atan2(dy, dx);
        nx = this.animX + Math.cos(angle) * CONFIG.growthSpeed;
        ny = this.animY + Math.sin(angle) * CONFIG.growthSpeed;
      }

      forEachWrap(
        this.animX,
        this.animY,
        nx,
        ny,
        CONFIG.strokeWidth * 2,
        (x1, y1, x2, y2) => {
          strokeQueues[this.colorIdx].push({ x1, y1, x2, y2 });
        },
      );

      this.animX = nx;
      this.animY = ny;

      if (nx === this.targetX && ny === this.targetY) {
        this.animX = wrap(this.animX, TILE_SIZE) || this.animX;
        this.animY = wrap(this.animY, TILE_SIZE) || this.animY;
        if (this.animX < 0) this.animX += TILE_SIZE;
        if (this.animY < 0) this.animY += TILE_SIZE;
        if (this.animX >= TILE_SIZE) this.animX -= TILE_SIZE;
        if (this.animY >= TILE_SIZE) this.animY -= TILE_SIZE;
        this.state = "THINKING";
      }
      return true;
    }

    pickBest(options) {
      const scored = options.map((opt) => {
        let score = this.isAngle45(opt) ? 10 : 0;
        const v = DIRS[opt];
        const tx = wrap(this.x + v.x, GRID_SIZE);
        const ty = wrap(this.y + v.y, GRID_SIZE);

        let neighbors = 0;
        for (const n of DIR_VECS) {
          const nx = wrap(tx + n.x, GRID_SIZE);
          const ny = wrap(ty + n.y, GRID_SIZE);
          if ((nx !== this.x || ny !== this.y) && grid[nx][ny]) neighbors++;
        }
        if (neighbors === 1) score += 5;

        return { opt, score };
      });

      scored.sort((a, b) => b.score - a.score);
      return scored.length > 1 && Math.random() < 0.2
        ? scored[Math.floor(Math.random() * scored.length)].opt
        : scored[0].opt;
    }

    isAngle45(other) {
      if (this.dir === other) return false;
      const v1 = DIRS[this.dir], v2 = DIRS[other];
      return (Math.abs(v1.x) + Math.abs(v1.y) === 2) !==
        (Math.abs(v2.x) + Math.abs(v2.y) === 2);
    }
  }

  // ===========================================================================
  // Gap filling
  // ===========================================================================

  function findAndSpawnFill() {
    const locked = new Set(
      crawlers.filter((c) => c.state === "MOVING").map((c) => `${c.x},${c.y}`),
    );

    const candidates = [];
    const weak = [];
    const startRow = Math.floor(Math.random() * GRID_SIZE);

    for (let x = 0; x < GRID_SIZE; x += 2) {
      for (let i = 0; i < 50; i++) {
        const y = wrap(startRow + i, GRID_SIZE);
        if (!grid[x][y] || locked.has(`${x},${y}`) || degrees[x][y] >= 3) {
          continue;
        }

        const moves = getValidMoves(x, y);
        if (!moves.length) continue;

        const strong = moves.filter((dir) => {
          const v = DIRS[dir];
          const tx = wrap(x + v.x, GRID_SIZE);
          const ty = wrap(y + v.y, GRID_SIZE);
          return !grid[wrap(tx + v.x, GRID_SIZE)][wrap(ty + v.y, GRID_SIZE)];
        });

        (strong.length ? candidates : weak).push({
          x,
          y,
          dirs: strong.length ? strong : moves,
        });
      }
    }

    const pool = candidates.length ? candidates : weak;
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

  // ===========================================================================
  // Rendering
  // ===========================================================================

  function flushStrokes() {
    patternCtx.lineWidth = CONFIG.strokeWidth;
    patternCtx.lineCap = "round";
    patternCtx.lineJoin = "round";

    strokeQueues.forEach((queue, i) => {
      if (!queue.length) return;
      patternCtx.strokeStyle = palette.colors[i];
      patternCtx.beginPath();
      queue.forEach((s) => {
        patternCtx.moveTo(s.x1, s.y1);
        patternCtx.lineTo(s.x2, s.y2);
      });
      patternCtx.stroke();
      strokeQueues[i] = [];
    });
  }

  function render() {
    displayCtx.fillStyle = palette.bg;
    displayCtx.fillRect(0, 0, display.width, display.height);

    forEachTile((x, y) => displayCtx.drawImage(pattern, x, y));

    if (!crawlers.length) return;

    const isLight = palette === PALETTES.light;
    displayCtx.globalCompositeOperation = isLight ? "source-over" : "screen";

    forEachTile((ox, oy) => {
      for (const c of crawlers) {
        const cx = ox + c.animX - GLOW_RADIUS;
        const cy = oy + c.animY - GLOW_RADIUS;
        if (
          cx + GLOW_RADIUS * 2 >= 0 && cx <= display.width &&
          cy + GLOW_RADIUS * 2 >= 0 && cy <= display.height
        ) {
          displayCtx.drawImage(glowSprites[c.colorIdx], cx, cy);
        }
      }
    });

    displayCtx.globalCompositeOperation = "source-over";
  }

  // ===========================================================================
  // Generation control
  // ===========================================================================

  function initGeneration() {
    grid = Array.from(
      { length: GRID_SIZE },
      () => Array(GRID_SIZE).fill(false),
    );
    degrees = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
    colorMap = Array.from(
      { length: GRID_SIZE },
      () => Array(GRID_SIZE).fill(0),
    );
    strokeQueues = palette.colors.map(() => []);
    crawlers = [];

    patternCtx.fillStyle = palette.bg;
    patternCtx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    totalSeedSlots = Math.max(
      2,
      Math.floor((GRID_SIZE * GRID_SIZE) / CONFIG.seedDensityArea),
    );

    let spawned = 0, attempts = 0;
    while (spawned < totalSeedSlots && attempts++ < totalSeedSlots * 10) {
      const x = Math.floor(Math.random() * GRID_SIZE);
      const y = Math.floor(Math.random() * GRID_SIZE);
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
        spawned++;
      }
    }

    hasRenderedFirstFrame = false;
    isRunning = true;
  }

  function startGeneration() {
    if (isShuttingDown) return;
    applyTheme();
    display.width = container.clientWidth;
    display.height = container.clientHeight;
    initGeneration();
    animationFrameId ||= requestAnimationFrame(loop);
  }

  // ===========================================================================
  // Main loop
  // ===========================================================================

  function loop() {
    if (isShuttingDown) {
      animationFrameId = null;
      return;
    }
    animationFrameId = requestAnimationFrame(loop);

    if (isPaused) return;
    if (!isRunning) {
      render();
      return;
    }

    let active = false;
    for (let i = crawlers.length - 1; i >= 0; i--) {
      if (crawlers[i].update()) active = true;
      else crawlers.splice(i, 1);
    }

    if (crawlers.length < totalSeedSlots && findAndSpawnFill()) active = true;
    if (crawlers.length) active = true;

    flushStrokes();
    render();

    if (!hasRenderedFirstFrame && active) {
      hasRenderedFirstFrame = true;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (visualState === "hidden" && !isShuttingDown) {
            setVisualState("fading-in");
          }
        })
      );
    }

    if (!active) {
      isRunning = false;
      autoRegenTimeout = setTimeout(() => {
        if (isShuttingDown) return;
        setVisualState("fading-out");
        scheduleRegen(FADE_DURATION);
      }, REGEN_DELAY);
    }
  }

  // ===========================================================================
  // Scheduling
  // ===========================================================================

  function scheduleRegen(delay) {
    clearTimeout(debounceTimeout);
    clearTimeout(autoRegenTimeout);
    debounceTimeout = setTimeout(() => {
      if (isShuttingDown) return;
      if (visualState === "hidden") return startGeneration();
      const wait = () => {
        if (isShuttingDown) return;
        visualState === "hidden" ? startGeneration() : setTimeout(wait, 50);
      };
      wait();
    }, delay);
  }

  function triggerRegen() {
    clearTimeout(autoRegenTimeout);
    if (visualState === "visible" || visualState === "fading-in") {
      setVisualState("fading-out");
    }
    scheduleRegen(Math.max(RESIZE_DEBOUNCE, FADE_DURATION));
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  function cleanup() {
    isShuttingDown = true;
    clearTimeout(debounceTimeout);
    clearTimeout(autoRegenTimeout);
    clearTimeout(transitionTimeout);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    resizeObs.disconnect();
    themeObs.disconnect();
  }

  const resizeObs = new ResizeObserver(() => {
    if (isShuttingDown) return;
    const { clientWidth: w, clientHeight: h } = container;
    if (w === lastWidth && h === lastHeight) return;
    lastWidth = w;
    lastHeight = h;
    triggerRegen();
  });

  const themeObs = new MutationObserver((muts) => {
    if (!isShuttingDown && muts.some((m) => m.attributeName === "data-theme")) {
      triggerRegen();
    }
  });

  // ===========================================================================
  // Init
  // ===========================================================================

  resizeObs.observe(container);
  themeObs.observe(document.documentElement, { attributes: true });

  window.addEventListener("scroll", render, { passive: true });
  window.addEventListener("pagehide", cleanup);
  window.addEventListener("beforeunload", cleanup);
  document.addEventListener("visibilitychange", () => {
    if (!isShuttingDown) isPaused = document.visibilityState === "hidden";
  });

  startGeneration();
})();
