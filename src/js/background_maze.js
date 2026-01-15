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

  const DIRS = {
    N: { x: 0, y: -1 },
    S: { x: 0, y: 1 },
    E: { x: 1, y: 0 },
    W: { x: -1, y: 0 },
    NW: { x: -1, y: -1 },
    SE: { x: 1, y: 1 },
  };

  // ===========================================================================
  // SVG namespace and element references
  // ===========================================================================

  const SVG_NS = "http://www.w3.org/2000/svg";

  const container = document.getElementById("background-maze-div");
  const svg = document.getElementById("background-maze-svg");

  // These elements are created once and reused across regenerations
  let defsElement = null;
  let patternElement = null;
  let patternBackground = null;
  let pathGroup = null;
  let pathElements = [];
  let fillRect = null;
  let glowLayer = null;
  let glowGradients = [];

  // ===========================================================================
  // State management
  // ===========================================================================

  // Visual state machine
  let visualState = "hidden";
  let transitionTimeout = null;

  // Generation state
  let isRunning = false;
  let isPaused = false;
  let isShuttingDown = false;
  let hasRenderedFirstFrame = false;

  // Debounce and scheduling
  let debounceTimeout = null;
  let autoRegenTimeout = null;
  let animationFrameId = null;

  // Theme tracking
  let currentPalette = PALETTE_DARK;
  let currentBackground = BACKGROUND_DARK;

  // Crawler and grid state
  let grid = [];
  let degrees = [];
  let colorMap = [];
  let crawlers = [];
  let totalSeedSlots = 0;

  // Path accumulation buffers, one string per color, flushed each frame
  let pathBuffers = [];

  // ===========================================================================
  // SVG structure initialization
  // ===========================================================================

  function initializeSvgStructure() {
    svg.innerHTML = "";

    defsElement = document.createElementNS(SVG_NS, "defs");
    svg.appendChild(defsElement);

    // Create glow gradients, one per palette color
    glowGradients = [];
    for (let i = 0; i < currentPalette.length; i++) {
      const gradient = document.createElementNS(SVG_NS, "radialGradient");
      gradient.setAttribute("id", `maze-glow-gradient-${i}`);
      updateGlowGradient(gradient, currentPalette[i]);
      defsElement.appendChild(gradient);
      glowGradients.push(gradient);
    }

    // Create pattern element for tiling
    patternElement = document.createElementNS(SVG_NS, "pattern");
    patternElement.setAttribute("id", "maze-pattern");
    patternElement.setAttribute("patternUnits", "userSpaceOnUse");
    patternElement.setAttribute("width", PATTERN_PIXEL_SIZE);
    patternElement.setAttribute("height", PATTERN_PIXEL_SIZE);
    defsElement.appendChild(patternElement);

    // Background rectangle inside pattern
    patternBackground = document.createElementNS(SVG_NS, "rect");
    patternBackground.setAttribute("width", "100%");
    patternBackground.setAttribute("height", "100%");
    patternBackground.setAttribute("fill", currentBackground);
    patternElement.appendChild(patternBackground);

    // Group for all maze paths
    pathGroup = document.createElementNS(SVG_NS, "g");
    pathGroup.setAttribute("id", "maze-paths");
    patternElement.appendChild(pathGroup);

    // Create one path element per color
    pathElements = [];
    for (let i = 0; i < currentPalette.length; i++) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("id", `maze-path-${i}`);
      path.setAttribute("stroke", currentPalette[i]);
      path.setAttribute("stroke-width", CONFIG.strokeWidth);
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("fill", "none");
      path.setAttribute("d", "");
      pathGroup.appendChild(path);
      pathElements.push(path);
    }

    // Full viewport rectangle that uses the pattern
    fillRect = document.createElementNS(SVG_NS, "rect");
    fillRect.setAttribute("id", "maze-fill");
    fillRect.setAttribute("width", "100%");
    fillRect.setAttribute("height", "100%");
    fillRect.setAttribute("fill", "url(#maze-pattern)");
    svg.appendChild(fillRect);

    // Layer for glow effects, rendered on top of the tiled pattern
    glowLayer = document.createElementNS(SVG_NS, "g");
    glowLayer.setAttribute("id", "maze-glow-layer");
    svg.appendChild(glowLayer);
  }

  function updateGlowGradient(gradient, color) {
    gradient.innerHTML = "";

    const stop1 = document.createElementNS(SVG_NS, "stop");
    stop1.setAttribute("offset", "0%");
    stop1.setAttribute("stop-color", color);
    stop1.setAttribute("stop-opacity", "0.8");
    gradient.appendChild(stop1);

    const stop2 = document.createElementNS(SVG_NS, "stop");
    stop2.setAttribute("offset", "100%");
    stop2.setAttribute("stop-color", color);
    stop2.setAttribute("stop-opacity", "0");
    gradient.appendChild(stop2);
  }

  // ===========================================================================
  // Theme handling
  // ===========================================================================

  function getTheme() {
    const val = document.documentElement.getAttribute("data-theme");
    return val === "light" ? "light" : "dark";
  }

  function applyTheme() {
    const theme = getTheme();
    if (theme === "light") {
      currentPalette = PALETTE_LIGHT;
      currentBackground = BACKGROUND_LIGHT;
    } else {
      currentPalette = PALETTE_DARK;
      currentBackground = BACKGROUND_DARK;
    }

    // Update existing SVG elements if they exist
    if (patternBackground) {
      patternBackground.setAttribute("fill", currentBackground);
    }

    for (let i = 0; i < pathElements.length; i++) {
      pathElements[i].setAttribute("stroke", currentPalette[i]);
    }

    for (let i = 0; i < glowGradients.length; i++) {
      updateGlowGradient(glowGradients[i], currentPalette[i]);
    }
  }

  // ===========================================================================
  // Visual state machine
  // ===========================================================================

  function setVisualState(newState) {
    if (isShuttingDown) return;
    if (visualState === newState) return;

    clearTimeout(transitionTimeout);
    visualState = newState;

    switch (newState) {
      case "fading-out":
        svg.classList.remove("loaded");
        transitionTimeout = setTimeout(() => {
          setVisualState("hidden");
        }, FADE_DURATION);
        break;

      case "hidden":
        break;

      case "fading-in":
        svg.classList.add("loaded");
        transitionTimeout = setTimeout(() => {
          setVisualState("visible");
        }, FADE_DURATION);
        break;

      case "visible":
        break;
    }
  }

  // ===========================================================================
  // Scroll handling
  // ===========================================================================

  function updatePatternScroll() {
    if (!patternElement) return;
    const scrollY = window.scrollY;
    const offset = -(scrollY % PATTERN_PIXEL_SIZE);
    patternElement.setAttribute("patternTransform", `translate(0, ${offset})`);
  }

  // ===========================================================================
  // Crawler class
  // ===========================================================================

  class Crawler {
    constructor(x, y, dir, forceLen, colorIdx) {
      this.x = x;
      this.y = y;
      if (grid[x] && grid[x][y] !== undefined) {
        grid[x][y] = true;
        colorMap[x][y] = colorIdx;
      }
      this.dir = dir;
      this.forceLen = forceLen;
      this.colorIdx = colorIdx;
      this.stepCount = 0;
      this.currentSegLen = 0;
      this.state = "THINKING";

      const gs = CONFIG.gridSize;
      this.animX = x * gs + gs / 2;
      this.animY = y * gs + gs / 2;
      this.targetX = this.animX;
      this.targetY = this.animY;
    }

    update() {
      if (this.state === "THINKING") {
        return this.think();
      }
      if (this.state === "MOVING") {
        return this.move();
      }
      return false;
    }

    think() {
      const validMoves = [];
      const cols = PATTERN_GRID_SIZE;
      const rows = PATTERN_GRID_SIZE;

      for (const [key, vec] of Object.entries(DIRS)) {
        const tx = (this.x + vec.x + cols) % cols;
        const ty = (this.y + vec.y + rows) % rows;

        if (!grid[tx][ty]) {
          // Prevent diagonal moves from crossing existing walls
          if (Math.abs(vec.x) === 1 && Math.abs(vec.y) === 1) {
            const n1x = (this.x + vec.x + cols) % cols;
            const n1y = this.y;
            const n2x = this.x;
            const n2y = (this.y + vec.y + rows) % rows;

            if (!grid[n1x][n1y] || !grid[n2x][n2y]) {
              validMoves.push(key);
            }
          } else {
            validMoves.push(key);
          }
        }
      }

      if (validMoves.length === 0) return false;

      let nextDir = null;
      const canContinue = validMoves.includes(this.dir);

      if (this.forceLen > 0) {
        if (canContinue) nextDir = this.dir;
        else if (validMoves.length > 0) nextDir = this.pickBestTurn(validMoves);
        else return false;
      } else if (this.currentSegLen > CONFIG.maxSegmentLength) {
        const turns = validMoves.filter((d) => d !== this.dir);
        if (turns.length > 0) nextDir = this.pickBestTurn(turns);
        else if (canContinue) {
          nextDir = this.dir;
          this.currentSegLen = 0;
        } else {
          nextDir = this.pickBestTurn(validMoves);
        }
      } else if (this.currentSegLen < CONFIG.minSegmentLength && canContinue) {
        nextDir = this.dir;
      } else {
        if (Math.random() < CONFIG.turnProbability && validMoves.length > 1) {
          nextDir = this.pickBestTurn(validMoves);
        } else if (canContinue) {
          nextDir = this.dir;
        } else {
          nextDir = this.pickBestTurn(validMoves);
        }
      }

      this.stepCount++;
      let nextColorIdx = this.colorIdx;
      if (this.stepCount > CONFIG.colorChangeRate) {
        this.stepCount = 0;
        nextColorIdx = (this.colorIdx + 1) % currentPalette.length;
      }

      const vec = DIRS[nextDir];
      const nx = (this.x + vec.x + cols) % cols;
      const ny = (this.y + vec.y + rows) % rows;

      grid[nx][ny] = true;
      degrees[this.x][this.y]++;
      degrees[nx][ny]++;
      colorMap[nx][ny] = nextColorIdx;

      // Branching logic
      if (this.forceLen <= 0 && crawlers.length < totalSeedSlots) {
        if (Math.random() < CONFIG.chanceToBranch) {
          const branchOpts = validMoves.filter((d) => d !== nextDir);
          if (branchOpts.length > 0 && degrees[this.x][this.y] < 3) {
            const bDir = this.pickBestTurn(branchOpts);
            degrees[this.x][this.y]++;
            crawlers.push(
              new Crawler(this.x, this.y, bDir, 0, this.colorIdx),
            );
          }
        }
      }

      if (nextDir !== this.dir) {
        this.currentSegLen = 0;
      } else {
        this.currentSegLen++;
      }
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

    move() {
      const dx = this.targetX - this.animX;
      const dy = this.targetY - this.animY;
      const distSq = dx * dx + dy * dy;
      const speedSq = CONFIG.growthSpeed * CONFIG.growthSpeed;

      let nextX, nextY;
      let reached = false;

      if (distSq <= speedSq) {
        nextX = this.targetX;
        nextY = this.targetY;
        reached = true;
      } else {
        const angle = Math.atan2(dy, dx);
        nextX = this.animX + Math.cos(angle) * CONFIG.growthSpeed;
        nextY = this.animY + Math.sin(angle) * CONFIG.growthSpeed;
      }

      // Accumulate path segment into buffer for batch DOM update
      this.accumulatePathSegment(this.animX, this.animY, nextX, nextY);

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

    accumulatePathSegment(x1, y1, x2, y2) {
      // Add line segment to the appropriate color buffer.
      // We use absolute coordinates with M (move) and L (line) commands.
      // The browser will batch-render all segments when we update the path element.
      const w = PATTERN_PIXEL_SIZE;
      const buffer = CONFIG.strokeWidth * 2;

      const segment = `M${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${
        y2.toFixed(1)
      }`;
      pathBuffers[this.colorIdx] += segment;

      // Handle wrap-around by drawing duplicate segments at pattern edges
      let wrappedX = 0;
      let wrappedY = 0;

      if (Math.max(x1, x2) > w - buffer) wrappedX = -w;
      else if (Math.min(x1, x2) < buffer) wrappedX = w;

      if (Math.max(y1, y2) > w - buffer) wrappedY = -w;
      else if (Math.min(y1, y2) < buffer) wrappedY = w;

      if (wrappedX !== 0) {
        const seg = `M${(x1 + wrappedX).toFixed(1)},${y1.toFixed(1)}L${
          (x2 + wrappedX).toFixed(1)
        },${y2.toFixed(1)}`;
        pathBuffers[this.colorIdx] += seg;
      }

      if (wrappedY !== 0) {
        const seg = `M${x1.toFixed(1)},${(y1 + wrappedY).toFixed(1)}L${
          x2.toFixed(1)
        },${(y2 + wrappedY).toFixed(1)}`;
        pathBuffers[this.colorIdx] += seg;
      }

      if (wrappedX !== 0 && wrappedY !== 0) {
        const seg = `M${(x1 + wrappedX).toFixed(1)},${
          (y1 + wrappedY).toFixed(1)
        }L${(x2 + wrappedX).toFixed(1)},${(y2 + wrappedY).toFixed(1)}`;
        pathBuffers[this.colorIdx] += seg;
      }
    }

    pickBestTurn(options) {
      const scored = options.map((opt) => {
        let score = 0;
        if (this.isAngle45(this.dir, opt)) score += 10;

        const v = DIRS[opt];
        const cols = PATTERN_GRID_SIZE;
        const rows = PATTERN_GRID_SIZE;
        const tx = (this.x + v.x + cols) % cols;
        const ty = (this.y + v.y + rows) % rows;

        let neighbors = 0;
        for (const n of Object.values(DIRS)) {
          const nx = (tx + n.x + cols) % cols;
          const ny = (ty + n.y + rows) % rows;
          if (nx === this.x && ny === this.y) continue;
          if (grid[nx][ny]) neighbors++;
        }
        if (neighbors === 1) score += 5;

        return { opt, score };
      });

      scored.sort((a, b) => b.score - a.score);

      if (scored.length > 1 && Math.random() < 0.2) {
        return scored[Math.floor(Math.random() * scored.length)].opt;
      }
      return scored[0].opt;
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
  // Gap filling for continuous generation
  // ===========================================================================

  function findAndSpawnFill() {
    // Identify cells currently being moved into to avoid visual disconnects
    const lockedCells = new Set();
    for (const c of crawlers) {
      if (c.state === "MOVING") {
        lockedCells.add(`${c.x},${c.y}`);
      }
    }

    const candidates = [];
    const weakCandidates = [];
    const step = 2;
    const scanHeight = 50;
    const size = PATTERN_GRID_SIZE;
    const startRow = Math.floor(Math.random() * size);

    for (let x = 0; x < size; x += step) {
      for (let i = 0; i < scanHeight; i++) {
        const y = (startRow + i) % size;

        if (!grid[x][y]) continue;
        if (lockedCells.has(`${x},${y}`)) continue;
        if (degrees[x][y] >= 3) continue;

        const validDirs = [];
        for (const [k, v] of Object.entries(DIRS)) {
          const tx = (x + v.x + size) % size;
          const ty = (y + v.y + size) % size;

          if (!grid[tx][ty]) {
            if (Math.abs(v.x) === 1 && Math.abs(v.y) === 1) {
              const n1x = (x + v.x + size) % size;
              const n1y = y;
              const n2x = x;
              const n2y = (y + v.y + size) % size;
              if (!grid[n1x][n1y] || !grid[n2x][n2y]) {
                validDirs.push(k);
              }
            } else {
              validDirs.push(k);
            }
          }
        }

        if (validDirs.length > 0) {
          const strongDirs = [];
          for (const dir of validDirs) {
            const v = DIRS[dir];
            const tx = (x + v.x + size) % size;
            const ty = (y + v.y + size) % size;
            const ttx = (tx + v.x + size) % size;
            const tty = (ty + v.y + size) % size;
            if (!grid[ttx][tty]) strongDirs.push(dir);
          }

          if (strongDirs.length > 0) {
            candidates.push({ x, y, dirs: strongDirs });
          } else {
            weakCandidates.push({ x, y, dirs: validDirs });
          }
        }
      }
    }

    let choice = null;
    let chosenDir = null;

    if (candidates.length > 0) {
      choice = candidates[Math.floor(Math.random() * candidates.length)];
      chosenDir = choice.dirs[Math.floor(Math.random() * choice.dirs.length)];
    } else if (weakCandidates.length > 0) {
      choice =
        weakCandidates[Math.floor(Math.random() * weakCandidates.length)];
      chosenDir = choice.dirs[Math.floor(Math.random() * choice.dirs.length)];
    }

    if (choice) {
      degrees[choice.x][choice.y]++;
      const parentColor = colorMap[choice.x][choice.y];
      const c = new Crawler(choice.x, choice.y, chosenDir, 4, parentColor);
      crawlers.push(c);
      return true;
    }

    return false;
  }

  // ===========================================================================
  // Glow effect rendering
  // ===========================================================================

  function updateGlowEffects() {
    // Clear existing glow circles
    glowLayer.innerHTML = "";

    if (crawlers.length === 0) return;

    // Calculate viewport dimensions and tiling
    const viewportWidth = container.clientWidth;
    const viewportHeight = container.clientHeight;
    const scrollY = window.scrollY;
    const offsetY = -(scrollY % PATTERN_PIXEL_SIZE);

    const cols = Math.ceil(viewportWidth / PATTERN_PIXEL_SIZE) + 1;
    const rows = Math.ceil(viewportHeight / PATTERN_PIXEL_SIZE) + 2;

    // Create glow circles for each crawler head across all visible tiles
    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const ox = col * PATTERN_PIXEL_SIZE;
        const oy = row * PATTERN_PIXEL_SIZE + offsetY - PATTERN_PIXEL_SIZE;

        for (const crawler of crawlers) {
          const cx = ox + crawler.animX;
          const cy = oy + crawler.animY;

          // Skip if outside visible area with buffer
          if (
            cx < -GLOW_RADIUS ||
            cx > viewportWidth + GLOW_RADIUS ||
            cy < -GLOW_RADIUS ||
            cy > viewportHeight + GLOW_RADIUS
          ) {
            continue;
          }

          const circle = document.createElementNS(SVG_NS, "circle");
          circle.setAttribute("cx", cx);
          circle.setAttribute("cy", cy);
          circle.setAttribute("r", GLOW_RADIUS);
          circle.setAttribute(
            "fill",
            `url(#maze-glow-gradient-${crawler.colorIdx})`,
          );
          glowLayer.appendChild(circle);
        }
      }
    }
  }

  // ===========================================================================
  // Path buffer flushing
  // ===========================================================================

  function flushPathBuffers() {
    for (let i = 0; i < pathBuffers.length; i++) {
      if (pathBuffers[i].length > 0) {
        const currentD = pathElements[i].getAttribute("d") || "";
        pathElements[i].setAttribute("d", currentD + pathBuffers[i]);
        pathBuffers[i] = "";
      }
    }
  }

  // ===========================================================================
  // Generation control
  // ===========================================================================

  function initializeGeneration() {
    const size = PATTERN_GRID_SIZE;

    // Reset grid state
    grid = new Array(size).fill(0).map(() => new Array(size).fill(false));
    degrees = new Array(size).fill(0).map(() => new Array(size).fill(0));
    colorMap = new Array(size).fill(0).map(() => new Array(size).fill(0));

    // Reset path buffers
    pathBuffers = new Array(currentPalette.length).fill("");

    // Clear existing paths
    for (const pathEl of pathElements) {
      pathEl.setAttribute("d", "");
    }

    // Clear glow layer
    glowLayer.innerHTML = "";

    // Spawn initial crawlers
    crawlers = [];
    const totalCells = size * size;
    const numSeeds = Math.max(
      2,
      Math.floor(totalCells / CONFIG.seedDensityArea),
    );
    totalSeedSlots = numSeeds;

    let spawned = 0;
    let attempts = 0;

    while (spawned < numSeeds && attempts < numSeeds * 10) {
      attempts++;
      const sx = Math.floor(Math.random() * size);
      const sy = Math.floor(Math.random() * size);

      if (!grid[sx][sy]) {
        const keys = Object.keys(DIRS);
        const sDir = keys[Math.floor(Math.random() * keys.length)];
        degrees[sx][sy] = 1;
        const randomColorIdx = Math.floor(
          Math.random() * currentPalette.length,
        );
        crawlers.push(new Crawler(sx, sy, sDir, 4, randomColorIdx));
        spawned++;
      }
    }

    hasRenderedFirstFrame = false;
    isRunning = true;
  }

  function startGeneration() {
    if (isShuttingDown) return;

    applyTheme();
    initializeGeneration();
    updatePatternScroll();

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

    // Always schedule next frame to keep loop alive for glow updates
    animationFrameId = requestAnimationFrame(animationLoop);

    // Skip updates if paused but keep loop running
    if (isPaused) return;

    // Update scroll position for pattern
    updatePatternScroll();

    if (!isRunning) {
      updateGlowEffects();
      return;
    }

    let active = false;

    // Update all crawlers
    for (let i = crawlers.length - 1; i >= 0; i--) {
      const crawler = crawlers[i];
      const keepAlive = crawler.update();

      if (keepAlive) {
        active = true;
      } else {
        crawlers.splice(i, 1);
      }
    }

    // Try to fill gaps if we have room for more crawlers
    if (crawlers.length < totalSeedSlots) {
      if (findAndSpawnFill()) {
        active = true;
      }
    }

    if (crawlers.length > 0) {
      active = true;
    }

    // Flush accumulated path data to DOM
    flushPathBuffers();

    // Update glow effects
    updateGlowEffects();

    // Trigger fade-in on first frame
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

    // Handle generation completion
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

      const waitForHidden = () => {
        if (isShuttingDown) return;
        if (visualState === "hidden") {
          startGeneration();
        } else {
          setTimeout(waitForHidden, 50);
        }
      };

      if (visualState === "hidden") {
        startGeneration();
      } else {
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
  // Event handlers
  // ===========================================================================

  function handleVisibilityChange() {
    if (isShuttingDown) return;

    if (document.visibilityState === "hidden") {
      isPaused = true;
    } else if (document.visibilityState === "visible") {
      isPaused = false;
    }
  }

  function handleScroll() {
    updatePatternScroll();
  }

  function cleanup() {
    isShuttingDown = true;

    clearTimeout(debounceTimeout);
    clearTimeout(autoRegenTimeout);
    clearTimeout(transitionTimeout);

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    resizeObserver.disconnect();
    themeObserver.disconnect();
  }

  // ===========================================================================
  // Observers
  // ===========================================================================

  let lastWidth = 0;
  let lastHeight = 0;

  const resizeObserver = new ResizeObserver(() => {
    if (isShuttingDown) return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    if (w === lastWidth && h === lastHeight) return;
    lastWidth = w;
    lastHeight = h;

    triggerRegeneration();
  });

  const themeObserver = new MutationObserver((mutations) => {
    if (isShuttingDown) return;

    let themeChanged = false;
    for (const mutation of mutations) {
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "data-theme"
      ) {
        themeChanged = true;
        break;
      }
    }

    if (themeChanged) {
      triggerRegeneration();
    }
  });

  // ===========================================================================
  // Initialization
  // ===========================================================================

  applyTheme();
  initializeSvgStructure();

  resizeObserver.observe(container);
  themeObserver.observe(document.documentElement, { attributes: true });

  window.addEventListener("scroll", handleScroll, { passive: true });
  window.addEventListener("pagehide", cleanup);
  window.addEventListener("beforeunload", cleanup);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  startGeneration();
})();
