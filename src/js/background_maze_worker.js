/**
 * /js/background_maze_worker.js
 */

const CONFIG = {
    gridSize: 30,
    strokeWidth: 5,
    minSegmentLength: 4,
    maxSegmentLength: 12,
    turnProbability: 0.15,
    chanceToBranch: 0.08,
    colorChangeRate: 15,
    growthSpeed: 1.0, 
    seedDensityArea: 200,
    tileMultiplier: 9,
    baseDensityUnit: 9
};

// Size calculations
const PATTERN_GRID_SIZE = CONFIG.baseDensityUnit * CONFIG.tileMultiplier;
const PATTERN_PIXEL_SIZE = PATTERN_GRID_SIZE * CONFIG.gridSize;

const PALETTE_DARK_BG = ["#2CE1D8", "#FFF9ED", "#fd5b5bff", "#FFF9ED"];
const PALETTE_LIGHT_BG = ["#21A59E", "#02020D", "#bb4040ff", "#02020D"];

const DIRS = {
    N:  { x: 0, y: -1 }, S:  { x: 0, y: 1 },
    E:  { x: 1, y: 0 },  W:  { x: -1, y: 0 },
    NW: { x: -1, y: -1 }, SE: { x: 1, y: 1 },
    // NE: { x: 1, y: -1 },  SW: { x: -1, y: 1 } // Added remaining diagonals for robust support
};

// Internal Canvas
let offscreenCanvas = null;
let ctx = null;

let currentJobId = 0; 
let currentExternalRequestId = 0;

let currentPalette = [];
let currentBackgroundColor = "#000000";
let animationFrameId;

// State Arrays 
let grid, degrees, colorMap;
let totalSeedSlots = 0;

// BATCH QUEUES
let strokeQueue = [];

// --- CRAWLER CLASS --- 
class Crawler {
    constructor(x, y, dir, forceLen, colorIdx) {
        this.x = x; 
        this.y = y; 
        if (grid[x][y] !== undefined) {
            grid[x][y] = true;
            colorMap[x][y] = colorIdx;
        }
        this.dir = dir;
        this.forceLen = forceLen; 
        this.colorIdx = colorIdx;
        this.stepCount = 0; 
        this.currentSegLen = 0;
        this.state = 'THINKING'; 
        const gs = CONFIG.gridSize;
        this.animX = x * gs + (gs/2);
        this.animY = y * gs + (gs/2);
        this.targetX = this.animX;
        this.targetY = this.animY;
    }

    update(crawlerList) {
        if (this.state === 'THINKING') {
            let validMoves = [];
            const cols = PATTERN_GRID_SIZE;
            const rows = PATTERN_GRID_SIZE;
            
            for (let [key, vec] of Object.entries(DIRS)) {
                const tx = (this.x + vec.x + cols) % cols;
                const ty = (this.y + vec.y + rows) % rows;
                
                // 1. Basic Check: Is destination empty?
                if (!grid[tx][ty]) {
                    // 2. Crossing Check for Diagonals
                    // Prevent "X" intersections by ensuring we aren't cutting a corner between two blocks
                    if (Math.abs(vec.x) === 1 && Math.abs(vec.y) === 1) {
                        const n1x = (this.x + vec.x + cols) % cols; // neighbor 1
                        const n1y = this.y;
                        const n2x = this.x;
                        const n2y = (this.y + vec.y + rows) % rows; // neighbor 2
                        
                        // If neighbors are empty, we are safe. If one is filled, safe. 
                        // If BOTH are filled, we are crossing a wall.
                        if (!grid[n1x][n1y] || !grid[n2x][n2y]) {
                            validMoves.push(key);
                        }
                    } else {
                        // Cardinal moves are always safe if destination is empty
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
            } 
            else if (this.currentSegLen > CONFIG.maxSegmentLength) {
                const turns = validMoves.filter(d => d !== this.dir);
                if (turns.length > 0) nextDir = this.pickBestTurn(turns);
                else if (canContinue) {
                    nextDir = this.dir;
                    this.currentSegLen = 0; 
                } else {
                    nextDir = this.pickBestTurn(validMoves);
                }
            } 
            else if (this.currentSegLen < CONFIG.minSegmentLength && canContinue) {
                nextDir = this.dir;
            } 
            else {
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
            if (this.forceLen <= 0 && crawlerList.length >= totalSeedSlots) {
                if (Math.random() < CONFIG.chanceToBranch) {
                    const branchOpts = validMoves.filter(d => d !== nextDir);
                    if (branchOpts.length > 0 && degrees[this.x][this.y] < 3) {
                        const bDir = this.pickBestTurn(branchOpts);
                        degrees[this.x][this.y]++;
                        crawlerList.push(new Crawler(this.x, this.y, bDir, 0, this.colorIdx));
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
            this.targetX = this.animX + (vec.x * gs);
            this.targetY = this.animY + (vec.y * gs);
            this.x = nx;
            this.y = ny;
            this.dir = nextDir;
            this.colorIdx = nextColorIdx;
            this.state = 'MOVING';
            return true;
        }
        if (this.state === 'MOVING') {
            const dx = this.targetX - this.animX;
            const dy = this.targetY - this.animY;
            const distSq = dx*dx + dy*dy;
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
            
            this.queueStroke(this.animX, this.animY, nextX, nextY, this.colorIdx);
            
            this.animX = nextX;
            this.animY = nextY;
            if (reached) {
                const w = PATTERN_PIXEL_SIZE; 
                if (this.animX < 0) this.animX += w;
                else if (this.animX >= w) this.animX -= w;
                if (this.animY < 0) this.animY += w;
                else if (this.animY >= w) this.animY -= w;
                this.state = 'THINKING';
            }
            return true;
        }
    }

    queueStroke(x1, y1, x2, y2, cIdx) {
        if (!strokeQueue[cIdx]) strokeQueue[cIdx] = [];
        strokeQueue[cIdx].push({ x1, y1, x2, y2 });
    }

    pickBestTurn(options) {
        const scored = options.map(opt => {
            let score = 0;
            if (this.isAngle45(this.dir, opt)) score += 10;
            const v = DIRS[opt];
            const cols = PATTERN_GRID_SIZE;
            const rows = PATTERN_GRID_SIZE;
            const tx = (this.x + v.x + cols) % cols;
            const ty = (this.y + v.y + rows) % rows;
            let neighbors = 0;
            for (let n of Object.values(DIRS)) {
                const nx = (tx + n.x + cols) % cols;
                const ny = (ty + n.y + rows) % rows;
                if (nx === this.x && ny === this.y) continue;
                if (grid[nx][ny]) neighbors++;
            }
            if (neighbors === 1) score += 5; 
            return { opt, score };
        });
        scored.sort((a,b) => b.score - a.score);
        if (scored.length > 1 && Math.random() < 0.2) {
            return scored[Math.floor(Math.random() * scored.length)].opt;
        }
        return scored[0].opt;
    }

    isAngle45(d1, d2) {
        if (d1 === d2) return false;
        const v1 = DIRS[d1];
        const v2 = DIRS[d2];
        const diag1 = (Math.abs(v1.x) + Math.abs(v1.y)) === 2;
        const diag2 = (Math.abs(v2.x) + Math.abs(v2.y)) === 2;
        return (diag1 !== diag2);
    }
}

// --- MESSAGE HANDLER ---

self.onmessage = function(e) {
    const data = e.data;

    if (data.type === 'init') {
        const size = PATTERN_PIXEL_SIZE;
        offscreenCanvas = new OffscreenCanvas(size, size);
        ctx = offscreenCanvas.getContext('2d');
        applyTheme(data.theme);
    } 
    else {
        if (typeof data.id !== 'undefined') {
            currentExternalRequestId = data.id;
        }
        currentJobId++; 
        if (data.theme) applyTheme(data.theme);
        startAnimation();
    }
};

function applyTheme(themeName) {
    if (themeName === "light") {
        currentPalette = PALETTE_LIGHT_BG; 
        currentBackgroundColor = "#fffdf8"; 
    } else {
        currentPalette = PALETTE_DARK_BG; 
        currentBackgroundColor = "#02020D"; 
    }
    strokeQueue = new Array(currentPalette.length).fill(0).map(() => []);
}

// --- ANIMATION MANAGER ---

function startAnimation() {
    const jobId = currentJobId;
    const respondingToId = currentExternalRequestId;
    const size = PATTERN_GRID_SIZE;

    // Reset logic
    grid = new Array(size).fill(0).map(() => new Array(size).fill(false));
    degrees = new Array(size).fill(0).map(() => new Array(size).fill(0));
    colorMap = new Array(size).fill(0).map(() => new Array(size).fill(0));
    
    strokeQueue = new Array(currentPalette.length).fill(0).map(() => []);

    // Clear Screen
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = currentBackgroundColor;
    ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    
    self.postMessage({ type: "started", id: respondingToId });

    let crawlers = [];
    const totalCells = size * size;
    const numSeeds = Math.max(2, Math.floor(totalCells / CONFIG.seedDensityArea));
    
    totalSeedSlots = numSeeds;

    let spawned = 0;
    let attempts = 0;
    while(spawned < numSeeds && attempts < numSeeds * 10) {
        attempts++;
        const sx = Math.floor(Math.random() * size);
        const sy = Math.floor(Math.random() * size);
        
        if (!grid[sx][sy]) {
            const keys = Object.keys(DIRS);
            const sDir = keys[Math.floor(Math.random() * keys.length)];
            degrees[sx][sy] = 1;
            crawlers.push(new Crawler(sx, sy, sDir, 4, spawned % currentPalette.length));
            spawned++;
        }
    }

    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    
    function loop() {
        if (currentJobId !== jobId) return;

        let active = false;
        
        // 1. UPDATE
        for (let i = crawlers.length - 1; i >= 0; i--) {
            let c = crawlers[i];
            const keepAlive = c.update(crawlers); 
            if (keepAlive) active = true;
            else crawlers.splice(i, 1);
        }

        // 2. FILLING (Check for gaps)
        if (crawlers.length < totalSeedSlots) {
            if (findAndSpawnFill(crawlers)) active = true;
        }
        if (crawlers.length > 0) active = true;

        if (active) {
            // 3. RENDER
            flushRenderQueues();

            // Gather heads array for light effects
            const heads = crawlers.map(c => ({
                x: c.animX,
                y: c.animY,
                c: currentPalette[c.colorIdx] 
            }));
            
            self.createImageBitmap(offscreenCanvas).then(bitmap => {
                self.postMessage({ 
                    type: 'render', 
                    bitmap: bitmap, 
                    heads: heads, 
                    id: respondingToId 
                }, [bitmap]);
                
                if (currentJobId === jobId) {
                    animationFrameId = requestAnimationFrame(loop);
                }
            });
        } 
        else {
            // FINISHED: Send one final frame with heads: [] to turn off the lights
            self.createImageBitmap(offscreenCanvas).then(bitmap => {
                self.postMessage({ 
                    type: 'render', 
                    bitmap: bitmap, 
                    heads: heads, 
                    id: respondingToId 
                }, [bitmap]);
            });
        }
    }

    loop();
}

function flushRenderQueues() {
    const w = PATTERN_PIXEL_SIZE;
    const buffer = CONFIG.strokeWidth * 2;
    const radius = CONFIG.strokeWidth / 2; // Radius for manual joins
    
    ctx.lineWidth = CONFIG.strokeWidth;
    // We switch to BUTT caps to prevent the browser's internal AA
    // from doubling up at the overlaps.
    ctx.lineCap = 'butt'; 
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';
    
    for(let cIdx = 0; cIdx < currentPalette.length; cIdx++) {
        const strokes = strokeQueue[cIdx];
        if (strokes.length === 0) continue;

        const color = currentPalette[cIdx];
        ctx.strokeStyle = color;
        ctx.fillStyle = color; // Needed for the manual circles

        // 1. Draw the Lines (Butt caps)
        ctx.beginPath();
        for(let i = 0; i < strokes.length; i++) {
            const s = strokes[i];
            
            const x1 = s.x1 + 0.5;
            const y1 = s.y1 + 0.5;
            const x2 = s.x2 + 0.5;
            const y2 = s.y2 + 0.5;

            let wrappedX = 0, wrappedY = 0;
            if (Math.max(x1, x2) > w - buffer) wrappedX = -w;
            else if (Math.min(x1, x2) < buffer) wrappedX = w;
            if (Math.max(y1, y2) > w - buffer) wrappedY = -w;
            else if (Math.min(y1, y2) < buffer) wrappedY = w;
            const isSplit = (wrappedX !== 0 || wrappedY !== 0);

            const add = (dx, dy) => {
                ctx.moveTo(x1 + dx, y1 + dy);
                ctx.lineTo(x2 + dx, y2 + dy);
            };

            add(0, 0); 
            if (isSplit) {
                if (wrappedX !== 0) add(wrappedX, 0);
                if (wrappedY !== 0) add(0, wrappedY);
                if (wrappedX !== 0 && wrappedY !== 0) add(wrappedX, wrappedY);
            }
        }
        ctx.stroke();

        // 2. Manual Round Joins
        // We manually draw a circle at the END of every segment.
        // This covers the 'butt' seam perfectly and creates the round join
        // without the "sausage link" accumulation artifact.
        ctx.beginPath();
        for(let i = 0; i < strokes.length; i++) {
            const s = strokes[i];
            
            // Only need to draw cap at x2,y2 because x1,y1 
            // was presumably covered by the previous frame's x2,y2
            const x2 = s.x2 + 0.5;
            const y2 = s.y2 + 0.5;
            
            // Draw circle at destination
            ctx.moveTo(x2 + radius, y2);
            ctx.arc(x2, y2, radius, 0, Math.PI * 2);

            // Handle wrapping for the caps too
            if (x2 < buffer) {
                ctx.moveTo(x2 + w + radius, y2);
                ctx.arc(x2 + w, y2, radius, 0, Math.PI * 2);
            } else if (x2 > w - buffer) {
                ctx.moveTo(x2 - w + radius, y2);
                ctx.arc(x2 - w, y2, radius, 0, Math.PI * 2);
            }
            if (y2 < buffer) {
                ctx.moveTo(x2 + radius, y2 + w);
                ctx.arc(x2, y2 + w, radius, 0, Math.PI * 2);
            } else if (y2 > w - buffer) {
                ctx.moveTo(x2 + radius, y2 - w);
                ctx.arc(x2, y2 - w, radius, 0, Math.PI * 2);
            }
        }
        ctx.fill();

        strokeQueue[cIdx] = []; 
    }
}

function findAndSpawnFill(crawlerList) {
    // 1. Identify cells that are currently being moved INTO
    // These cells are logically "true" in the grid, but the line
    // has not visually reached them yet.
    const lockedCells = new Set();
    for(let c of crawlerList) {
        if(c.state === 'MOVING') {
            // Using a simple key format "x,y"
            lockedCells.add(`${c.x},${c.y}`);
        }
    }

    let candidates = [];
    let weakCandidates = [];
    const step = 2; 
    const scanHeight = 50; 
    const size = PATTERN_GRID_SIZE;
    const startRow = Math.floor(Math.random() * size);
    
    for (let x = 0; x < size; x += step) {
        for (let i = 0; i < scanHeight; i++) {
            const y = (startRow + i) % size;
            
            if (!grid[x][y]) continue;

            // 2. Skip if this cell is currently "under construction"
            // This prevents the visual disconnect bug.
            if (lockedCells.has(`${x},${y}`)) continue;

            if (degrees[x][y] >= 3) continue;

            let validDirs = [];
            for(let [k, v] of Object.entries(DIRS)) {
                const tx = (x + v.x + size) % size;
                const ty = (y + v.y + size) % size;
                if (!grid[tx][ty]) {
                    // Also apply corner crossing check to spawn logic
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
                let strongDirs = [];
                for(let dir of validDirs) {
                    const v = DIRS[dir];
                    const tx = (x + v.x + size) % size;
                    const ty = (y + v.y + size) % size;
                    // Check one step ahead for "strong" candidate suggestion
                    const ttx = (tx + v.x + size) % size;
                    const tty = (ty + v.y + size) % size;
                    if (!grid[ttx][tty]) strongDirs.push(dir);
                }
                if (strongDirs.length > 0) candidates.push({ x, y, dirs: strongDirs });
                else weakCandidates.push({ x, y, dirs: validDirs });
            }
        }
    }

    let choice = null;
    let chosenDir = null;

    if (candidates.length > 0) {
        choice = candidates[Math.floor(Math.random() * candidates.length)];
        chosenDir = choice.dirs[Math.floor(Math.random() * choice.dirs.length)];
    } 
    else if (weakCandidates.length > 0) {
        choice = weakCandidates[Math.floor(Math.random() * weakCandidates.length)];
        chosenDir = choice.dirs[Math.floor(Math.random() * choice.dirs.length)];
    }

    if (choice) {
        degrees[choice.x][choice.y]++;
        let parentColor = colorMap[choice.x][choice.y];
        const c = new Crawler(choice.x, choice.y, chosenDir, 4, parentColor);
        crawlerList.push(c);
        return true;
    }

    return false;
}