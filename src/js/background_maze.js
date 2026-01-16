// deno-lint-ignore-file no-window no-window-prefix

// Animated maze background generator
//
// Creates a continuously generating maze pattern that tiles seamlessly across the viewport.
// Crawlers traverse a grid, drawing strokes that accumulate on a pattern canvas. The pattern
// is then tiled across the display canvas with glow effects rendered at crawler head positions.
// The canvas is fixed-position and viewport-sized. During generation, tiles are rendered based
// on scroll position. After generation completes, a GPU-efficient pattern fill is used and
// the animation loop stops entirely.

(function () {
  // Grid and rendering parameters
  const CONFIG = {
    gridSize: 30, // Pixels per grid cell
    strokeWidth: 3, // Line thickness
    minSegmentLength: 3, // Minimum steps before allowing a turn
    maxSegmentLength: 8, // Maximum steps before forcing a turn
    turnProbability: 0.15, // Chance to turn when not forced
    chanceToBranch: 0.08, // Chance to spawn a new crawler at current position
    colorChangeRate: 15, // Steps between color transitions
    growthSpeed: 0.75, // Pixels moved per frame during animation
    seedDensityArea: 60, // Grid cells per initial crawler
    tileMultiplier: 12, // Tile size in grid cells
    baseDensityUnit: 6,
    spawnJitter: 0.8, // 0 = periodic grid, 1 = random within cells
  };

  // Derived dimensions
  const GRID = CONFIG.baseDensityUnit * CONFIG.tileMultiplier; // Grid cells per tile edge
  const TILE = GRID * CONFIG.gridSize; // Tile size in pixels
  const GLOW = 12; // Glow effect radius
  const FADE = 1000; // Fade transition duration in ms

  // Theme color schemes
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

  // Movement directions including diagonals for maze variety
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

  // Canvas setup: display canvas is viewport-sized, pattern canvas is offscreen
  const container = document.getElementById("background-maze-div");
  const display = document.getElementById("background-maze-canvas");
  const dCtx = display.getContext("2d");
  const pattern = Object.assign(document.createElement("canvas"), {
    width: TILE,
    height: TILE,
  });
  const pCtx = pattern.getContext("2d");

  // Visual and generation state
  let state = "hidden"; // Visual state: hidden, fading-in, visible, fading-out
  let paused = false; // Paused when tab is not visible
  let shutdown = false; // Set on page unload to stop all activity
  let firstFrame = false; // Tracks whether we've rendered at least one frame
  let frameId = null; // requestAnimationFrame handle
  let staticMode = false; // True when generation complete and using pattern fill
  let cachedPattern = null; // CanvasPattern for efficient static rendering
  let lastScrollY = -1; // Track scroll position to detect changes
  let generation = 0; // Increments on each new maze to invalidate stale callbacks
  const timeouts = { regen: null, transition: null };

  // Theme and rendering resources
  let palette = PALETTES.dark;
  let glowSprites = []; // Pre-rendered glow images, one per palette color

  // Generation state, reset on each new maze
  let grid, degrees, colorMap, crawlers, strokes, seedSlots;

  // Cached canvas dimensions
  let canvasWidth = 0;
  let canvasHeight = 0;

  // Wraps a value into the range [0, m) handling negative values
  const wrap = (v, m) => (v % m + m) % m;

  // Returns array of valid direction keys from the given grid position.
  // Filters out occupied cells and prevents diagonal moves that would cross existing walls.
  const validMoves = (x, y) =>
    DIR_ENTRIES.filter(([, v]) => {
      const tx = wrap(x + v.x, GRID), ty = wrap(y + v.y, GRID);

      // Reject if target cell is already occupied
      if (grid[tx][ty]) return false;

      // For diagonal moves, check that we wouldn't cross between two adjacent filled cells.
      // This prevents visual "X" patterns where lines would appear to cross.
      if (
        v.x && v.y && grid[wrap(x + v.x, GRID)][y] &&
        grid[x][wrap(y + v.y, GRID)]
      ) return false;

      return true;
    }).map(([k]) => k);

  // Iterates over tile positions needed to cover the viewport, accounting for scroll offset
  const forTiles = (fn) => {
    const scrollOffset = wrap(window.scrollY, TILE);
    const cols = Math.ceil(canvasWidth / TILE) + 1;
    const rows = Math.ceil(canvasHeight / TILE) + 2; // Extra row for scroll coverage
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        fn(c * TILE, r * TILE - scrollOffset);
      }
    }
  };

  // Updates canvas pixel dimensions to match viewport
  function syncCanvasSize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width <= 0 || height <= 0) return false;
    let changed = false;
    if (canvasWidth !== width) {
      canvasWidth = width;
      display.width = width;
      changed = true;
    }
    if (canvasHeight !== height) {
      canvasHeight = height;
      display.height = height;
      changed = true;
    }
    return changed;
  }

  // Updates palette and regenerates glow sprites for the current theme
  function applyTheme() {
    const light =
      document.documentElement.getAttribute("data-theme") === "light";
    palette = light ? PALETTES.light : PALETTES.dark;

    // Pre-render a radial gradient sprite for each color to avoid creating gradients per frame
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

    // Invalidate cached pattern when theme changes
    cachedPattern = null;
  }

  // Transitions the visual state, managing CSS class and scheduling next state
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

  // Crawler represents a single maze-drawing agent that traverses the grid
  class Crawler {
    constructor(x, y, dir, force, color) {
      this.x = x;
      this.y = y;
      this.dir = dir;
      this.force = force; // Forced steps remaining before allowing turns
      this.color = color; // Current palette index
      this.steps = 0; // Steps since last color change
      this.seg = 0; // Steps in current direction
      this.moving = false; // Whether currently animating between cells

      grid[x][y] = true;
      colorMap[x][y] = color;

      // Animation position starts at cell center
      this.ax = x * CONFIG.gridSize + CONFIG.gridSize / 2;
      this.ay = y * CONFIG.gridSize + CONFIG.gridSize / 2;
      this.tx = this.ax;
      this.ty = this.ay;
    }

    update() {
      return this.moving ? this.move() : this.think();
    }

    // Decides next direction and updates grid state
    think() {
      const moves = validMoves(this.x, this.y);
      if (!moves.length) return false;

      const dir = this.chooseDir(moves);
      const v = DIRS[dir];
      const nx = wrap(this.x + v.x, GRID), ny = wrap(this.y + v.y, GRID);

      // Cycle colors periodically
      if (++this.steps > CONFIG.colorChangeRate) {
        this.steps = 0;
        this.color = (this.color + 1) % palette.colors.length;
      }

      // Mark cell as occupied and update connection degrees
      grid[nx][ny] = true;
      degrees[this.x][this.y]++;
      degrees[nx][ny]++;
      colorMap[nx][ny] = this.color;

      // Possibly spawn a branch crawler if we're not in forced movement,
      // have room for more crawlers, and pass the random chance check.
      // Limit to 3 connections per cell to prevent overly dense junctions.
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

      // Reset segment length on direction change, otherwise increment
      this.seg = dir === this.dir ? this.seg + 1 : 0;
      if (this.force > 0) this.force--;

      // Set animation target to the center of the next cell in pixel coordinates
      this.tx = this.ax + v.x * CONFIG.gridSize;
      this.ty = this.ay + v.y * CONFIG.gridSize;
      this.x = nx;
      this.y = ny;
      this.dir = dir;
      this.moving = true;
      return true;
    }

    // Selects direction based on segment length constraints and randomness
    chooseDir(moves) {
      const can = moves.includes(this.dir);

      // During forced movement (initial steps), prefer continuing straight
      if (this.force > 0) return can ? this.dir : this.pickBest(moves);

      // Force a turn if segment is too long
      if (this.seg > CONFIG.maxSegmentLength) {
        const turns = moves.filter((d) => d !== this.dir);
        if (turns.length) return this.pickBest(turns);
        // If no turns available, reset segment and continue straight
        if (can) {
          this.seg = 0;
          return this.dir;
        }
      }

      // Require minimum segment length before allowing turns
      if (this.seg < CONFIG.minSegmentLength && can) return this.dir;

      // Random chance to turn for visual variety
      if (moves.length > 1 && Math.random() < CONFIG.turnProbability) {
        return this.pickBest(moves);
      }

      return can ? this.dir : this.pickBest(moves);
    }

    // Animates toward target position, queueing stroke segments
    move() {
      const dx = this.tx - this.ax, dy = this.ty - this.ay;
      const d = Math.hypot(dx, dy);

      // Move by growthSpeed or snap to target if close enough
      const [nx, ny] = d <= CONFIG.growthSpeed ? [this.tx, this.ty] : [
        this.ax + dx / d * CONFIG.growthSpeed,
        this.ay + dy / d * CONFIG.growthSpeed,
      ];

      // Queue stroke with wrap-around duplicates for seamless tiling.
      // When a stroke is near a tile edge, we draw copies offset by TILE
      // so the line appears continuous when tiles are placed adjacent.
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

      // When animation completes, wrap position to stay within tile bounds
      if (nx === this.tx && ny === this.ty) {
        this.ax = wrap(this.ax, TILE);
        this.ay = wrap(this.ay, TILE);
        this.moving = false;
      }
      return true;
    }

    // Scores directions preferring 45-degree turns and cells with few neighbors
    pickBest(opts) {
      const scored = opts.map((o) => {
        const v = DIRS[o],
          tx = wrap(this.x + v.x, GRID),
          ty = wrap(this.y + v.y, GRID);

        // Count how many neighboring cells are already filled
        const neighbors = DIR_VECS.filter((n) => {
          const nx = wrap(tx + n.x, GRID), ny = wrap(ty + n.y, GRID);
          return (nx !== this.x || ny !== this.y) && grid[nx][ny];
        }).length;

        // Prefer 45-degree turns (cardinal to diagonal or vice versa) for aesthetics
        const isDiag = (d) => Math.abs(DIRS[d].x) + Math.abs(DIRS[d].y) === 2;
        const angle45Bonus = isDiag(this.dir) !== isDiag(o) ? 10 : 0;

        // Prefer directions leading to cells with exactly one neighbor (extends existing paths)
        const neighborBonus = neighbors === 1 ? 5 : 0;

        return { o, s: angle45Bonus + neighborBonus };
      }).sort((a, b) => b.s - a.s);

      // Usually pick the best, but occasionally pick randomly for variety
      return scored.length > 1 && Math.random() < 0.2
        ? scored[Math.floor(Math.random() * scored.length)].o
        : scored[0].o;
    }
  }

  // Attempts to spawn a new crawler from an existing path to fill gaps
  function spawnFill() {
    // Don't spawn from cells that are mid-animation to avoid visual glitches
    const locked = new Set(
      crawlers.filter((c) => c.moving).map((c) => `${c.x},${c.y}`),
    );
    const cands = [], weak = [], start = Math.floor(Math.random() * GRID);

    // Scan for cells that can support new branches
    for (let x = 0; x < GRID; x += 2) {
      for (let i = 0; i < 50; i++) {
        const y = wrap(start + i, GRID);

        // Skip empty cells, locked cells, and cells with too many connections
        if (
          !grid[x][y] || locked.has(`${x},${y}`) || degrees[x][y] >= 3
        ) continue;

        const moves = validMoves(x, y);
        if (!moves.length) continue;

        // Strong candidates have room to grow at least two cells in the chosen direction,
        // which helps ensure the new crawler won't immediately dead-end
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

    // Prefer strong candidates, fall back to weak ones
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

  // Draws all queued strokes to the pattern canvas
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

  // Renders the maze during active generation using manual tiling
  function renderActive() {
    if (canvasWidth <= 0 || canvasHeight <= 0) return;

    dCtx.fillStyle = palette.bg;
    dCtx.fillRect(0, 0, canvasWidth, canvasHeight);
    forTiles((x, y) => dCtx.drawImage(pattern, x, y));

    if (!crawlers.length) return;

    // Glow uses screen blend on dark theme for additive light effect
    dCtx.globalCompositeOperation = palette === PALETTES.light
      ? "source-over"
      : "screen";
    forTiles((ox, oy) =>
      crawlers.forEach((c) => {
        const x = ox + c.ax - GLOW, y = oy + c.ay - GLOW;
        if (
          x > -GLOW * 2 && x < canvasWidth && y > -GLOW * 2 &&
          y < canvasHeight
        ) {
          dCtx.drawImage(glowSprites[c.color], x, y);
        }
      })
    );
    dCtx.globalCompositeOperation = "source-over";
  }

  // Renders the maze in static mode using GPU-efficient pattern fill
  function renderStatic() {
    if (canvasWidth <= 0 || canvasHeight <= 0) return;

    // Create cached pattern if needed
    if (!cachedPattern) {
      cachedPattern = dCtx.createPattern(pattern, "repeat");
    }

    // Calculate scroll offset for pattern alignment
    const scrollOffset = wrap(window.scrollY, TILE);

    // Use pattern fill with transform for scroll offset
    dCtx.save();
    dCtx.translate(0, -scrollOffset);
    dCtx.fillStyle = cachedPattern;
    dCtx.fillRect(0, scrollOffset, canvasWidth, canvasHeight);
    dCtx.restore();
  }

  // Handles scroll events in static mode
  function onScroll() {
    if (shutdown || paused || !staticMode) return;

    // Only re-render if scroll position actually changed
    const currentScrollY = window.scrollY;
    if (currentScrollY !== lastScrollY) {
      lastScrollY = currentScrollY;
      renderStatic();
    }
  }

  // Enters static mode after generation completes
  function enterStaticMode() {
    staticMode = true;
    lastScrollY = window.scrollY;

    // Stop the animation loop
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }

    // Do one final render with the pattern
    renderStatic();

    // Listen for scroll to update pattern position
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // Exits static mode when regeneration is needed
  function exitStaticMode() {
    if (!staticMode) return;
    staticMode = false;
    cachedPattern = null;
    window.removeEventListener("scroll", onScroll);
  }

  // Resets all generation state for a new maze
  function init() {
    exitStaticMode();
    generation++;

    const make = (v) => Array.from({ length: GRID }, () => Array(GRID).fill(v));
    grid = make(false); // Tracks which cells are occupied
    degrees = make(0); // Connection count per cell (for limiting junctions)
    colorMap = make(0); // Stores color index at each cell for branch inheritance
    strokes = palette.colors.map(() => []);
    crawlers = [];

    pCtx.fillStyle = palette.bg;
    pCtx.fillRect(0, 0, TILE, TILE);
    seedSlots = Math.max(2, Math.floor(GRID * GRID / CONFIG.seedDensityArea));

    // Spawn initial crawlers with jittered grid positions
    const cols = Math.ceil(Math.sqrt(seedSlots));
    const rows = Math.ceil(seedSlots / cols);
    const cellW = Math.floor(GRID / cols);
    const cellH = Math.floor(GRID / rows);
    const jitter = CONFIG.spawnJitter;

    let n = 0;
    for (let row = 0; row < rows && n < seedSlots; row++) {
      for (let col = 0; col < cols && n < seedSlots; col++) {
        // Center of this grid region
        const centerX = Math.floor((col + 0.5) * cellW);
        const centerY = Math.floor((row + 0.5) * cellH);

        // Add random offset scaled by jitter
        const offsetX = Math.floor((Math.random() - 0.5) * cellW * jitter);
        const offsetY = Math.floor((Math.random() - 0.5) * cellH * jitter);

        const x = wrap(centerX + offsetX, GRID);
        const y = wrap(centerY + offsetY, GRID);

        if (!grid[x][y]) {
          grid[x][y] = true;
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
    }

    firstFrame = false;
  }

  // Entry point for starting or restarting generation
  function start() {
    if (shutdown) return;
    applyTheme();
    syncCanvasSize();
    init();
    frameId ||= requestAnimationFrame(loop);
  }

  // Initiates fade-out and schedules regeneration for theme changes
  function trigger() {
    clearTimeout(timeouts.regen);
    if (state === "visible" || state === "fading-in") setVisual("fading-out");

    const expectedGeneration = generation;
    timeouts.regen = setTimeout(() => {
      if (shutdown || generation !== expectedGeneration) return;
      if (state === "hidden") return start();

      // Poll until fade-out completes and we reach hidden state
      const wait = () => {
        if (shutdown || generation !== expectedGeneration) return;
        if (state === "hidden") return start();
        setTimeout(wait, 50);
      };
      wait();
    }, Math.max(300, FADE));
  }

  // Main animation loop - only runs during active generation
  function loop() {
    if (shutdown) return void (frameId = null);
    frameId = requestAnimationFrame(loop);
    if (paused) return;

    // Update all crawlers, removing dead ones
    let active = crawlers.length > 0;
    for (let i = crawlers.length - 1; i >= 0; i--) {
      crawlers[i].update() || crawlers.splice(i, 1);
    }

    // Try to fill gaps when crawler count drops below target
    if (crawlers.length < seedSlots && spawnFill()) active = true;

    flush();
    renderActive();

    // Trigger fade-in after first successful render.
    // Double requestAnimationFrame ensures the browser has
    // painted the canvas before we start the opacity transition.
    if (!firstFrame && active) {
      firstFrame = true;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (state === "hidden" && !shutdown) setVisual("fading-in");
        })
      );
    }

    // Generation complete - switch to static mode
    if (!active && !crawlers.length) {
      enterStaticMode();

      // Schedule regeneration after delay
      const expectedGeneration = generation;
      timeouts.regen = setTimeout(() => {
        if (shutdown || generation !== expectedGeneration) return;
        setVisual("fading-out");
        trigger();
      }, 1000);
    }
  }

  // Clears all pending timeouts
  function clearAllTimeouts() {
    Object.values(timeouts).forEach(clearTimeout);
  }

  // Pauses activity when page is hidden, used for bfcache compatibility
  function pause() {
    paused = true;
    clearAllTimeouts();
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  }

  // Resumes activity, reinitializing state if needed
  function resume() {
    paused = false;
    syncCanvasSize();

    if (staticMode) {
      // In static mode, just re-render
      renderStatic();
    } else {
      // Restart animation loop
      frameId ||= requestAnimationFrame(loop);
    }
  }

  // Full cleanup for permanent page unload
  function cleanup() {
    shutdown = true;
    clearAllTimeouts();
    exitStaticMode();
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    resizeObs.disconnect();
    themeObs.disconnect();
  }

  // Handles resize by updating dimensions and re-rendering
  function handleResize() {
    if (shutdown || paused) return;
    if (syncCanvasSize()) {
      // Invalidate cached pattern on resize
      cachedPattern = null;
      if (staticMode) {
        renderStatic();
      } else {
        renderActive();
      }
    }
  }

  // Observe container for size changes
  const resizeObs = new ResizeObserver(() => handleResize());

  // Observe theme attribute changes
  const themeObs = new MutationObserver((m) => {
    if (!shutdown && m.some((x) => x.attributeName === "data-theme")) trigger();
  });

  // Initialize observers
  resizeObs.observe(container);
  themeObs.observe(document.documentElement, { attributes: true });

  // Handle page visibility changes for tab switching
  document.addEventListener("visibilitychange", () => {
    if (shutdown) return;
    if (document.visibilityState === "hidden") {
      pause();
    } else {
      resume();
    }
  });

  // Handle bfcache: pagehide fires when navigating away
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) {
      // Page is being cached, just pause without full cleanup
      pause();
    } else {
      // Page is being discarded, do full cleanup
      cleanup();
    }
  });

  // Handle bfcache: pageshow fires when page is shown, including from cache
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      // Page was restored from bfcache, reset state and restart
      shutdown = false;
      state = "hidden";
      staticMode = false;
      cachedPattern = null;
      display.classList.remove("loaded");

      // Reconnect observers in case they were disconnected
      resizeObs.observe(container);
      themeObs.observe(document.documentElement, { attributes: true });

      // Get fresh dimensions and restart
      syncCanvasSize();
      start();
    }
  });

  // Initial setup
  syncCanvasSize();
  start();
})();
