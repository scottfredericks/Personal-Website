// deno-lint-ignore-file no-window-prefix no-window

// Creates a continuously generating maze pattern that tiles seamlessly across the viewport.
// Crawlers traverse a grid, drawing strokes that accumulate on a pattern canvas. The pattern
// is then tiled across the display canvas with glow effects rendered at crawler head positions.

(function () {
  // Grid and rendering parameters
  const CONFIG = {
    gridSize: 30, // Pixels per grid cell
    strokeWidth: 4, // Line thickness
    minSegmentLength: 4, // Minimum steps before allowing a turn
    maxSegmentLength: 12, // Maximum steps before forcing a turn
    turnProbability: 0.15, // Chance to turn when not forced
    chanceToBranch: 0.08, // Chance to spawn a new crawler at current position
    colorChangeRate: 15, // Steps between color transitions
    growthSpeed: 0.75, // Pixels moved per frame during animation
    seedDensityArea: 200, // Grid cells per initial crawler
    tileMultiplier: 9,
    baseDensityUnit: 9,
  };

  // Derived dimensions
  const GRID = CONFIG.baseDensityUnit * CONFIG.tileMultiplier; // Grid cells per tile edge
  const TILE = GRID * CONFIG.gridSize; // Tile size in pixels
  const GLOW = 25; // Glow effect radius
  const FADE = 800; // Fade transition duration in ms

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

  // Canvas setup: display canvas is visible and viewport-sized, pattern canvas is offscreen
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
  let running = false; // Whether crawlers are actively generating
  let paused = false; // Paused when tab is not visible
  let shutdown = false; // Set on page unload to stop all activity
  let firstFrame = false; // Tracks whether we've rendered at least one frame
  let frameId = null; // requestAnimationFrame handle
  const timeouts = { debounce: null, regen: null, transition: null };

  // Theme and rendering resources
  let palette = PALETTES.dark;
  let glowSprites = []; // Pre-rendered glow images, one per palette color

  // Generation state, reset on each new maze
  let grid, degrees, colorMap, crawlers, strokes, seedSlots;
  let lastW = 0, lastH = 0; // Tracks container size to detect resize

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

  // Iterates over tile positions needed to cover the display, accounting for scroll offset
  const forTiles = (fn) => {
    const off = window.scrollY % TILE;
    for (let c = 0; c <= display.width / TILE + 1; c++) {
      for (let r = 0; r <= display.height / TILE + 1; r++) {
        fn(c * TILE, r * TILE - off);
      }
    }
  };

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

  // Composites the tiled pattern and glow effects onto the display canvas
  function render() {
    dCtx.fillStyle = palette.bg;
    dCtx.fillRect(0, 0, display.width, display.height);
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
          x > -GLOW * 2 && x < display.width && y > -GLOW * 2 &&
          y < display.height
        ) {
          dCtx.drawImage(glowSprites[c.color], x, y);
        }
      })
    );
    dCtx.globalCompositeOperation = "source-over";
  }

  // Resets all generation state for a new maze
  function init() {
    const make = (v) => Array.from({ length: GRID }, () => Array(GRID).fill(v));
    grid = make(false); // Tracks which cells are occupied
    degrees = make(0); // Connection count per cell (for limiting junctions)
    colorMap = make(0); // Stores color index at each cell for branch inheritance
    strokes = palette.colors.map(() => []);
    crawlers = [];

    pCtx.fillStyle = palette.bg;
    pCtx.fillRect(0, 0, TILE, TILE);
    seedSlots = Math.max(2, Math.floor(GRID * GRID / CONFIG.seedDensityArea));

    // Spawn initial crawlers at random positions
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

  // Entry point for starting or restarting generation
  function start() {
    if (shutdown) return;
    applyTheme();
    display.width = container.clientWidth;
    display.height = container.clientHeight;
    init();
    frameId ||= requestAnimationFrame(loop);
  }

  // Main animation loop
  function loop() {
    if (shutdown) return void (frameId = null);
    frameId = requestAnimationFrame(loop);
    if (paused) return;

    // When not running, just render the static completed maze
    if (!running) return render();

    // Update all crawlers, removing dead ones
    let active = crawlers.length > 0;
    for (let i = crawlers.length - 1; i >= 0; i--) {
      crawlers[i].update() || crawlers.splice(i, 1);
    }

    // Try to fill gaps when crawler count drops below target
    if (crawlers.length < seedSlots && spawnFill()) active = true;

    flush();
    render();

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

    // Schedule regeneration when maze completes
    if (!active && !crawlers.length) {
      running = false;
      timeouts.regen = setTimeout(() => {
        if (shutdown) return;
        setVisual("fading-out");
        schedule(FADE);
      }, 1000);
    }
  }

  // Schedules a new generation after the specified delay, waiting for hidden state
  function schedule(delay) {
    clearTimeout(timeouts.debounce);
    clearTimeout(timeouts.regen);
    timeouts.debounce = setTimeout(() => {
      if (shutdown) return;
      if (state === "hidden") return start();

      // Poll until fade-out completes and we reach hidden state
      const wait = () =>
        shutdown || (state === "hidden" ? start() : setTimeout(wait, 50));
      wait();
    }, delay);
  }

  // Initiates fade-out and schedules regeneration, used for resize and theme changes
  function trigger() {
    clearTimeout(timeouts.regen);
    if (state === "visible" || state === "fading-in") setVisual("fading-out");
    schedule(Math.max(300, FADE));
  }

  // Cleanup on page unload
  const cleanup = () => {
    shutdown = true;
    Object.values(timeouts).forEach(clearTimeout);
    frameId && cancelAnimationFrame(frameId);
    resizeObs.disconnect();
    themeObs.disconnect();
  };

  // Observe container resize to trigger regeneration
  const resizeObs = new ResizeObserver(() => {
    if (shutdown) return;
    const { clientWidth: w, clientHeight: h } = container;
    if (w !== lastW || h !== lastH) {
      lastW = w;
      lastH = h;
      trigger();
    }
  });

  // Observe theme attribute changes
  const themeObs = new MutationObserver((m) => {
    if (!shutdown && m.some((x) => x.attributeName === "data-theme")) trigger();
  });

  // Initialize observers and event listeners
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
