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
    growthSpeed: 1.0,
    seedDensityArea: 200,
    tileMultiplier: 9,
    baseDensityUnit: 9,
  };

  const PATTERN_GRID_SIZE = CONFIG.baseDensityUnit * CONFIG.tileMultiplier;
  const PATTERN_PIXEL_SIZE = PATTERN_GRID_SIZE * CONFIG.gridSize;

  const PALETTE_DARK = ["#2CE1D8", "#FFF9ED", "#fd5b5b", "#FFF9ED"];
  const PALETTE_LIGHT = ["#4bcac4", "#02020D", "#fd5b5b", "#02020D"];
  const BACKGROUND_DARK = "#02020D";
  const BACKGROUND_LIGHT = "#fffdf8";

  const FADE_DURATION = 800;
  const RESIZE_DEBOUNCE_TIME = 300;
  const AUTO_REGEN_DELAY = 1000;
  const GLOW_RADIUS = 25;
  const GLOW_SPRITE_SIZE = GLOW_RADIUS * 2;

  const DIRS = {
    N: { x: 0, y: -1 },
    S: { x: 0, y: 1 },
    E: { x: 1, y: 0 },
    W: { x: -1, y: 0 },
    NW: { x: -1, y: -1 },
    SE: { x: 1, y: 1 },
  };

  // ===========================================================================
  // Canvas setup
  // ===========================================================================

  const container = document.getElementById("background-maze-div");
  const displayCanvas = document.getElementById("background-maze-canvas");
  const displayCtx = displayCanvas.getContext("2d");

  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = PATTERN_PIXEL_SIZE;
  patternCanvas.height = PATTERN_PIXEL_SIZE;
  const patternCtx = patternCanvas.getContext("2d");

  // Pre-rendered glow sprites, one per palette color
  let glowSprites = [];

  // ===========================================================================
  // State management
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

  let currentPalette = PALETTE_DARK;
  let currentBackground = BACKGROUND_DARK;
  let isLightTheme = false;

  let grid = [];
  let degrees = [];
  let colorMap = [];
  let crawlers = [];
  let totalSeedSlots = 0;

  let lastWidth = 0;
  let lastHeight = 0;

  // Stroke queue for batched drawing, indexed by color
  let strokeQueues = [];

  // ===========================================================================
  // Utility functions
  // ===========================================================================

  function create2dArray(size, fillValue) {
    return Array.from({ length: size }, () => Array(size).fill(fillValue));
  }

  function isDiagonalBlocked(x, y, vec) {
    const cols = PATTERN_GRID_SIZE;
    const rows = PATTERN_GRID_SIZE;
    const n1x = (x + vec.x + cols) % cols;
    const n2y = (y + vec.y + rows) % rows;
    return grid[n1x][y] && grid[x][n2y];
  }

  function getValidMoves(x, y) {
    const validMoves = [];
    const cols = PATTERN_GRID_SIZE;
    const rows = PATTERN_GRID_SIZE;

    for (const [key, vec] of Object.entries(DIRS)) {
      const tx = (x + vec.x + cols) % cols;
      const ty = (y + vec.y + rows) % rows;

      if (grid[tx][ty]) continue;

      const isDiagonal = Math.abs(vec.x) === 1 && Math.abs(vec.y) === 1;
      if (!isDiagonal || !isDiagonalBlocked(x, y, vec)) {
        validMoves.push(key);
      }
    }
    return validMoves;
  }

  function clearAllTimeouts() {
    clearTimeout(debounceTimeout);
    clearTimeout(autoRegenTimeout);
    clearTimeout(transitionTimeout);
  }

  // ===========================================================================
  // Glow sprite generation
  // ===========================================================================

  function createGlowSprite(color) {
    const canvas = document.createElement("canvas");
    canvas.width = GLOW_SPRITE_SIZE;
    canvas.height = GLOW_SPRITE_SIZE;
    const ctx = canvas.getContext("2d");

    const cx = GLOW_RADIUS;
    const cy = GLOW_RADIUS;

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, GLOW_RADIUS);
    gradient.addColorStop(0, color);
    gradient.addColorStop(
      1,
      isLightTheme ? "rgba(255,255,255,0)" : "rgba(0,0,0,0)",
    );

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, GLOW_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    return canvas;
  }

  function regenerateGlowSprites() {
    glowSprites = currentPalette.map((color) => createGlowSprite(color));
  }

  // ===========================================================================
  // Theme handling
  // ===========================================================================

  function applyTheme() {
    isLightTheme =
      document.documentElement.getAttribute("data-theme") === "light";
    currentPalette = isLightTheme ? PALETTE_LIGHT : PALETTE_DARK;
    currentBackground = isLightTheme ? BACKGROUND_LIGHT : BACKGROUND_DARK;
    regenerateGlowSprites();
  }

  // ===========================================================================
  // Visual state machine
  // ===========================================================================

  function setVisualState(newState) {
    if (isShuttingDown || visualState === newState) return;

    clearTimeout(transitionTimeout);
    visualState = newState;

    if (newState === "fading-out" || newState === "fading-in") {
      displayCanvas.classList.toggle("loaded", newState === "fading-in");
      const nextState = newState === "fading-in" ? "visible" : "hidden";
      transitionTimeout = setTimeout(
        () => setVisualState(nextState),
        FADE_DURATION,
      );
    }
  }

  // ===========================================================================
  // Canvas sizing
  // ===========================================================================

  function updateCanvasSize() {
    const w = container.clientWidth;
    const h = container.clientHeight;

    if (displayCanvas.width !== w || displayCanvas.height !== h) {
      displayCanvas.width = w;
      displayCanvas.height = h;
    }
  }

  // ===========================================================================
  // Crawler class
  // ===========================================================================

  class Crawler {
    constructor(x, y, dir, forceLen, colorIdx) {
      this.x = x;
      this.y = y;
      this.dir = dir;
      this.forceLen = forceLen;
      this.colorIdx = colorIdx;
      this.stepCount = 0;
      this.currentSegLen = 0;
      this.state = "THINKING";

      if (grid[x]?.[y] !== undefined) {
        grid[x][y] = true;
        colorMap[x][y] = colorIdx;
      }

      const gs = CONFIG.gridSize;
      this.animX = x * gs + gs / 2;
      this.animY = y * gs + gs / 2;
      this.targetX = this.animX;
      this.targetY = this.animY;
    }

    update() {
      return this.state === "THINKING" ? this.think() : this.move();
    }

    think() {
      const validMoves = getValidMoves(this.x, this.y);
      if (validMoves.length === 0) return false;

      const nextDir = this.chooseDirection(validMoves);
      this.stepCount++;

      let nextColorIdx = this.colorIdx;
      if (this.stepCount > CONFIG.colorChangeRate) {
        this.stepCount = 0;
        nextColorIdx = (this.colorIdx + 1) % currentPalette.length;
      }

      const vec = DIRS[nextDir];
      const cols = PATTERN_GRID_SIZE;
      const rows = PATTERN_GRID_SIZE;
      const nx = (this.x + vec.x + cols) % cols;
      const ny = (this.y + vec.y + rows) % rows;

      grid[nx][ny] = true;
      degrees[this.x][this.y]++;
      degrees[nx][ny]++;
      colorMap[nx][ny] = nextColorIdx;

      this.tryBranch(validMoves, nextDir);

      this.currentSegLen = nextDir !== this.dir ? 0 : this.currentSegLen + 1;
      if (this.forceLen > 0) this.forceLen--;

      const gs = CONFIG.gridSize;
      this.targetX = this.animX + vec.x * gs;
      this.targetY = this.animY + vec.y * gs;
      this.x = nx;
      this.y = ny;
      this.dir = nextDir;
      this.colorIdx = nextColorIdx;
      this.state = "MOVING";
      return true;
    }

    chooseDirection(validMoves) {
      const canContinue = validMoves.includes(this.dir);

      if (this.forceLen > 0) {
        return canContinue ? this.dir : this.pickBestTurn(validMoves);
      }

      if (this.currentSegLen > CONFIG.maxSegmentLength) {
        const turns = validMoves.filter((d) => d !== this.dir);
        if (turns.length > 0) return this.pickBestTurn(turns);
        if (canContinue) {
          this.currentSegLen = 0;
          return this.dir;
        }
        return this.pickBestTurn(validMoves);
      }

      if (this.currentSegLen < CONFIG.minSegmentLength && canContinue) {
        return this.dir;
      }

      if (Math.random() < CONFIG.turnProbability && validMoves.length > 1) {
        return this.pickBestTurn(validMoves);
      }

      return canContinue ? this.dir : this.pickBestTurn(validMoves);
    }

    tryBranch(validMoves, nextDir) {
      if (this.forceLen > 0 || crawlers.length >= totalSeedSlots) return;
      if (Math.random() >= CONFIG.chanceToBranch) return;

      const branchOpts = validMoves.filter((d) => d !== nextDir);
      if (branchOpts.length > 0 && degrees[this.x][this.y] < 3) {
        degrees[this.x][this.y]++;
        crawlers.push(
          new Crawler(
            this.x,
            this.y,
            this.pickBestTurn(branchOpts),
            0,
            this.colorIdx,
          ),
        );
      }
    }

    move() {
      const dx = this.targetX - this.animX;
      const dy = this.targetY - this.animY;
      const distSq = dx * dx + dy * dy;
      const speedSq = CONFIG.growthSpeed * CONFIG.growthSpeed;

      let nextX, nextY, reached;

      if (distSq <= speedSq) {
        nextX = this.targetX;
        nextY = this.targetY;
        reached = true;
      } else {
        const angle = Math.atan2(dy, dx);
        nextX = this.animX + Math.cos(angle) * CONFIG.growthSpeed;
        nextY = this.animY + Math.sin(angle) * CONFIG.growthSpeed;
        reached = false;
      }

      this.queueStroke(this.animX, this.animY, nextX, nextY);
      this.animX = nextX;
      this.animY = nextY;

      if (reached) {
        const w = PATTERN_PIXEL_SIZE;
        if (this.animX < 0) this.animX += w;
        else if (this.animX >= w) this.animX -= w;
        if (this.animY < 0) this.animY += w;
        else if (this.animY >= w) this.animY -= w;
        this.state = "THINKING";
      }
      return true;
    }

    queueStroke(x1, y1, x2, y2) {
      const w = PATTERN_PIXEL_SIZE;
      const buffer = CONFIG.strokeWidth * 2;

      const wrappedX = Math.max(x1, x2) > w - buffer
        ? -w
        : Math.min(x1, x2) < buffer
        ? w
        : 0;
      const wrappedY = Math.max(y1, y2) > w - buffer
        ? -w
        : Math.min(y1, y2) < buffer
        ? w
        : 0;

      strokeQueues[this.colorIdx].push({ x1, y1, x2, y2 });

      if (wrappedX !== 0) {
        strokeQueues[this.colorIdx].push({
          x1: x1 + wrappedX,
          y1,
          x2: x2 + wrappedX,
          y2,
        });
      }
      if (wrappedY !== 0) {
        strokeQueues[this.colorIdx].push({
          x1,
          y1: y1 + wrappedY,
          x2,
          y2: y2 + wrappedY,
        });
      }
      if (wrappedX !== 0 && wrappedY !== 0) {
        strokeQueues[this.colorIdx].push({
          x1: x1 + wrappedX,
          y1: y1 + wrappedY,
          x2: x2 + wrappedX,
          y2: y2 + wrappedY,
        });
      }
    }

    pickBestTurn(options) {
      const scored = options.map((opt) => {
        let score = this.isAngle45(this.dir, opt) ? 10 : 0;

        const v = DIRS[opt];
        const cols = PATTERN_GRID_SIZE;
        const rows = PATTERN_GRID_SIZE;
        const tx = (this.x + v.x + cols) % cols;
        const ty = (this.y + v.y + rows) % rows;

        let neighbors = 0;
        for (const n of Object.values(DIRS)) {
          const nx = (tx + n.x + cols) % cols;
          const ny = (ty + n.y + rows) % rows;
          if (!(nx === this.x && ny === this.y) && grid[nx][ny]) neighbors++;
        }
        if (neighbors === 1) score += 5;

        return { opt, score };
      });

      scored.sort((a, b) => b.score - a.score);

      return scored.length > 1 && Math.random() < 0.2
        ? scored[Math.floor(Math.random() * scored.length)].opt
        : scored[0].opt;
    }

    isAngle45(d1, d2) {
      if (d1 === d2) return false;
      const v1 = DIRS[d1];
      const v2 = DIRS[d2];
      const diag1 = Math.abs(v1.x) + Math.abs(v1.y) === 2;
      const diag2 = Math.abs(v2.x) + Math.abs(v2.y) === 2;
      return diag1 !== diag2;
    }
  }

  // ===========================================================================
  // Gap filling
  // ===========================================================================

  function findAndSpawnFill() {
    const lockedCells = new Set(
      crawlers.filter((c) => c.state === "MOVING").map((c) => `${c.x},${c.y}`),
    );

    const candidates = [];
    const weakCandidates = [];
    const size = PATTERN_GRID_SIZE;
    const startRow = Math.floor(Math.random() * size);

    for (let x = 0; x < size; x += 2) {
      for (let i = 0; i < 50; i++) {
        const y = (startRow + i) % size;

        if (!grid[x][y] || lockedCells.has(`${x},${y}`) || degrees[x][y] >= 3) {
          continue;
        }

        const validDirs = getValidMoves(x, y);
        if (validDirs.length === 0) continue;

        const strongDirs = validDirs.filter((dir) => {
          const v = DIRS[dir];
          const tx = (x + v.x + size) % size;
          const ty = (y + v.y + size) % size;
          const ttx = (tx + v.x + size) % size;
          const tty = (ty + v.y + size) % size;
          return !grid[ttx][tty];
        });

        if (strongDirs.length > 0) {
          candidates.push({ x, y, dirs: strongDirs });
        } else {
          weakCandidates.push({ x, y, dirs: validDirs });
        }
      }
    }

    const pool = candidates.length > 0 ? candidates : weakCandidates;
    if (pool.length === 0) return false;

    const choice = pool[Math.floor(Math.random() * pool.length)];
    const chosenDir =
      choice.dirs[Math.floor(Math.random() * choice.dirs.length)];

    degrees[choice.x][choice.y]++;
    crawlers.push(
      new Crawler(
        choice.x,
        choice.y,
        chosenDir,
        4,
        colorMap[choice.x][choice.y],
      ),
    );
    return true;
  }

  // ===========================================================================
  // Rendering
  // ===========================================================================

  function flushStrokeQueues() {
    patternCtx.lineWidth = CONFIG.strokeWidth;
    patternCtx.lineCap = "round";
    patternCtx.lineJoin = "round";

    for (let i = 0; i < strokeQueues.length; i++) {
      const queue = strokeQueues[i];
      if (queue.length === 0) continue;

      patternCtx.strokeStyle = currentPalette[i];
      patternCtx.beginPath();

      for (const s of queue) {
        patternCtx.moveTo(s.x1, s.y1);
        patternCtx.lineTo(s.x2, s.y2);
      }

      patternCtx.stroke();
      strokeQueues[i] = [];
    }
  }

  function renderDisplay() {
    const w = displayCanvas.width;
    const h = displayCanvas.height;
    const scrollOffset = window.scrollY % PATTERN_PIXEL_SIZE;

    // Clear and draw tiled pattern
    displayCtx.fillStyle = currentBackground;
    displayCtx.fillRect(0, 0, w, h);

    const cols = Math.ceil(w / PATTERN_PIXEL_SIZE) + 1;
    const rows = Math.ceil(h / PATTERN_PIXEL_SIZE) + 1;

    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        displayCtx.drawImage(
          patternCanvas,
          col * PATTERN_PIXEL_SIZE,
          row * PATTERN_PIXEL_SIZE - scrollOffset,
        );
      }
    }

    // Draw glow effects
    renderGlowEffects(scrollOffset);
  }

  function renderGlowEffects(scrollOffset) {
    if (crawlers.length === 0) return;

    const w = displayCanvas.width;
    const h = displayCanvas.height;
    const patSize = PATTERN_PIXEL_SIZE;

    const cols = Math.ceil(w / patSize) + 1;
    const rows = Math.ceil(h / patSize) + 1;

    displayCtx.globalCompositeOperation = isLightTheme
      ? "source-over"
      : "screen";

    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const ox = col * patSize;
        const oy = row * patSize - scrollOffset;

        for (const crawler of crawlers) {
          const cx = ox + crawler.animX - GLOW_RADIUS;
          const cy = oy + crawler.animY - GLOW_RADIUS;

          // Skip if completely outside viewport
          if (
            cx + GLOW_SPRITE_SIZE < 0 ||
            cx > w ||
            cy + GLOW_SPRITE_SIZE < 0 ||
            cy > h
          ) {
            continue;
          }

          displayCtx.drawImage(glowSprites[crawler.colorIdx], cx, cy);
        }
      }
    }

    displayCtx.globalCompositeOperation = "source-over";
  }

  // ===========================================================================
  // Generation control
  // ===========================================================================

  function initializeGeneration() {
    const size = PATTERN_GRID_SIZE;

    grid = create2dArray(size, false);
    degrees = create2dArray(size, 0);
    colorMap = create2dArray(size, 0);
    strokeQueues = currentPalette.map(() => []);

    // Clear pattern canvas
    patternCtx.fillStyle = currentBackground;
    patternCtx.fillRect(0, 0, PATTERN_PIXEL_SIZE, PATTERN_PIXEL_SIZE);

    crawlers = [];
    const numSeeds = Math.max(
      2,
      Math.floor((size * size) / CONFIG.seedDensityArea),
    );
    totalSeedSlots = numSeeds;

    let spawned = 0;
    let attempts = 0;
    const dirKeys = Object.keys(DIRS);

    while (spawned < numSeeds && attempts < numSeeds * 10) {
      attempts++;
      const sx = Math.floor(Math.random() * size);
      const sy = Math.floor(Math.random() * size);

      if (!grid[sx][sy]) {
        degrees[sx][sy] = 1;
        crawlers.push(
          new Crawler(
            sx,
            sy,
            dirKeys[Math.floor(Math.random() * dirKeys.length)],
            4,
            Math.floor(Math.random() * currentPalette.length),
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
    updateCanvasSize();
    initializeGeneration();
    if (!animationFrameId) {
      animationFrameId = requestAnimationFrame(animationLoop);
    }
  }

  // ===========================================================================
  // Animation loop
  // ===========================================================================

  function animationLoop() {
    if (isShuttingDown) {
      animationFrameId = null;
      return;
    }

    animationFrameId = requestAnimationFrame(animationLoop);

    if (isPaused) return;

    if (!isRunning) {
      renderDisplay();
      return;
    }

    let active = false;

    for (let i = crawlers.length - 1; i >= 0; i--) {
      if (crawlers[i].update()) {
        active = true;
      } else {
        crawlers.splice(i, 1);
      }
    }

    if (crawlers.length < totalSeedSlots && findAndSpawnFill()) {
      active = true;
    }

    if (crawlers.length > 0) active = true;

    flushStrokeQueues();
    renderDisplay();

    if (!hasRenderedFirstFrame && active) {
      hasRenderedFirstFrame = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (visualState === "hidden" && !isShuttingDown) {
            setVisualState("fading-in");
          }
        });
      });
    }

    if (!active) {
      isRunning = false;
      autoRegenTimeout = setTimeout(() => {
        if (isShuttingDown) return;
        setVisualState("fading-out");
        scheduleRegeneration(FADE_DURATION);
      }, AUTO_REGEN_DELAY);
    }
  }

  // ===========================================================================
  // Regeneration scheduling
  // ===========================================================================

  function scheduleRegeneration(delay) {
    clearTimeout(debounceTimeout);
    clearTimeout(autoRegenTimeout);

    debounceTimeout = setTimeout(() => {
      if (isShuttingDown) return;

      if (visualState === "hidden") {
        startGeneration();
      } else {
        const waitForHidden = () => {
          if (isShuttingDown) return;
          if (visualState === "hidden") startGeneration();
          else setTimeout(waitForHidden, 50);
        };
        waitForHidden();
      }
    }, delay);
  }

  function triggerRegeneration() {
    clearTimeout(autoRegenTimeout);
    if (visualState === "visible" || visualState === "fading-in") {
      setVisualState("fading-out");
    }
    scheduleRegeneration(Math.max(RESIZE_DEBOUNCE_TIME, FADE_DURATION));
  }

  // ===========================================================================
  // Event handlers and observers
  // ===========================================================================

  function cleanup() {
    isShuttingDown = true;
    clearAllTimeouts();
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    resizeObserver.disconnect();
    themeObserver.disconnect();
  }

  const resizeObserver = new ResizeObserver(() => {
    if (isShuttingDown) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === lastWidth && h === lastHeight) return;
    lastWidth = w;
    lastHeight = h;
    updateCanvasSize();
    triggerRegeneration();
  });

  const themeObserver = new MutationObserver((mutations) => {
    if (isShuttingDown) return;
    if (mutations.some((m) => m.attributeName === "data-theme")) {
      triggerRegeneration();
    }
  });

  // ===========================================================================
  // Initialization
  // ===========================================================================

  applyTheme();
  updateCanvasSize();

  resizeObserver.observe(container);
  themeObserver.observe(document.documentElement, { attributes: true });

  window.addEventListener("scroll", () => renderDisplay(), { passive: true });
  window.addEventListener("pagehide", cleanup);
  window.addEventListener("beforeunload", cleanup);
  document.addEventListener("visibilitychange", () => {
    if (!isShuttingDown) {
      isPaused = document.visibilityState === "hidden";
    }
  });

  startGeneration();
})();
