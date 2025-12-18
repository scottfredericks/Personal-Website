/**
 * /js/background_maze_worker.js
 */

const CONFIG = {
    gridSize: 30,
    strokeWidth: 5,
    
    // MOVEMENT RULES 
    minSegmentLength: 4,
    maxSegmentLength: 12,
    turnProbability: 0.15,
    chanceToBranch: 0.08,
    colorChangeRate: 15,
    
    // VISUAL SETTINGS
    growthSpeed: 9.0, 
    
    // DENSITY: 1 seed per (14 * 14) cells (approx 196 sq pixels unit)
    seedDensityArea: 196 
};

const PALETTE_DARK_BG = ["#2CE1D8", "#FFF9ED", "#E45143", "#FFF9ED"];
const PALETTE_LIGHT_BG = ["#2CE1D8", "#02020D", "#E45143", "#02020D"];

const DIRS = {
    N:  { x: 0, y: -1 }, S:  { x: 0, y: 1 },
    E:  { x: 1, y: 0 },  W:  { x: -1, y: 0 },
    NW: { x: -1, y: -1 }, SE: { x: 1, y: 1 }
};

let canvas = null;
let ctx = null;
let cols, rows;
let currentJobId = 0; 
let currentPalette = [];
let currentBackgroundColor = "#000000";
let animationFrameId;

// State Arrays
let grid, degrees, colorMap;

// --- CRAWLER CLASS ---

class Crawler {
    constructor(x, y, dir, forceLen, colorIdx) {
        // Logical Grid Position
        this.x = x; 
        this.y = y; 
        
        if (isValid(x,y)) {
            grid[x][y] = true;
            colorMap[x][y] = colorIdx;
        } else {
            return;
        }

        this.dir = dir;
        this.forceLen = forceLen; 
        this.colorIdx = colorIdx;
        this.stepCount = 0; 
        this.currentSegLen = 0;

        // Visual State
        this.state = 'THINKING'; 
        const gs = CONFIG.gridSize;
        
        // Exact pixel coordinates
        this.animX = x * gs + (gs/2);
        this.animY = y * gs + (gs/2);
        this.targetX = this.animX;
        this.targetY = this.animY;
        
        // Initialize anchor to allow continuous drawing from spawn point
        this.prevX = this.animX;
        this.prevY = this.animY;
    }

    update(crawlerList) {
        
        /** PHASE 1: THINKING (Pathfinding) **/
        if (this.state === 'THINKING') {
            let validMoves = [];
            for (let [key, vec] of Object.entries(DIRS)) {
                const tx = this.x + vec.x;
                const ty = this.y + vec.y;
                if (isValid(tx, ty) && !grid[tx][ty]) validMoves.push(key);
            }

            if (validMoves.length === 0) return false; 

            let nextDir = null;
            const canContinue = validMoves.includes(this.dir);

            if (this.forceLen > 0) {
                if (canContinue) nextDir = this.dir;
                else return false;
            } 
            else if (this.currentSegLen > CONFIG.maxSegmentLength) {
                const turns = validMoves.filter(d => d !== this.dir);
                if (turns.length === 0) return false;
                nextDir = this.pickBestTurn(turns);
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

            // Commit Grid Move
            const vec = DIRS[nextDir];
            const nx = this.x + vec.x;
            const ny = this.y + vec.y;

            grid[nx][ny] = true;
            degrees[this.x][this.y]++;
            degrees[nx][ny]++;

            // Color Update
            this.stepCount++;
            let nextColorIdx = this.colorIdx;
            if (this.stepCount > CONFIG.colorChangeRate) {
                this.stepCount = 0;
                nextColorIdx = (this.colorIdx + 1) % currentPalette.length;
            }
            colorMap[nx][ny] = nextColorIdx;

            // Branching
            if (this.forceLen <= 0 && Math.random() < CONFIG.chanceToBranch) {
                const branchOpts = validMoves.filter(d => d !== nextDir);
                if (branchOpts.length > 0 && degrees[this.x][this.y] < 3) {
                    const bDir = this.pickBestTurn(branchOpts);
                    degrees[this.x][this.y]++;
                    crawlerList.push(new Crawler(this.x, this.y, bDir, 0, this.colorIdx));
                }
            }

            if (nextDir !== this.dir) this.currentSegLen = 0;
            else this.currentSegLen++;
            if (this.forceLen > 0) this.forceLen--;

            // Set Visual Targets
            const gs = CONFIG.gridSize;
            
            // Anchor is where we started THIS visual step
            this.anchorX = this.animX; 
            this.anchorY = this.animY;
            
            this.targetX = nx * gs + (gs/2);
            this.targetY = ny * gs + (gs/2);
            
            // Continuation logic for 'round' vs 'butt' logic (optional)
            // For now, we rely on coordinate precision to look good.
            const isContinuation = (nextDir === this.dir && nextColorIdx === this.colorIdx);
            this.isContinuation = isContinuation;

            // Advance Logical Head
            this.x = nx;
            this.y = ny;
            this.dir = nextDir;
            this.colorIdx = nextColorIdx;
            
            this.state = 'MOVING';
            return true;
        }

        /** PHASE 2: MOVING (Rendering) **/
        if (this.state === 'MOVING') {
            const dx = this.targetX - this.animX;
            const dy = this.targetY - this.animY;
            const dist = Math.sqrt(dx*dx + dy*dy);

            // Did we arrive?
            if (dist <= CONFIG.growthSpeed) {
                this.animX = this.targetX;
                this.animY = this.targetY;
                
                this.drawSegment(this.anchorX, this.anchorY, this.targetX, this.targetY);
                this.state = 'THINKING';
            } else {
                // Move Interpolation
                const angle = Math.atan2(dy, dx);
                this.animX += Math.cos(angle) * CONFIG.growthSpeed;
                this.animY += Math.sin(angle) * CONFIG.growthSpeed;
                
                this.drawSegment(this.anchorX, this.anchorY, this.animX, this.animY);
            }
            return true;
        }
    }

    drawSegment(x1, y1, x2, y2) {
        ctx.strokeStyle = currentPalette[this.colorIdx];
        ctx.lineWidth = CONFIG.strokeWidth;
        ctx.lineCap = 'round'; // Round looks best for connections
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    pickBestTurn(options) {
        const scored = options.map(opt => {
            let score = 0;
            if (this.isAngle45(this.dir, opt)) score += 10; // Original logic preferred 45 degree turns
            
            const v = DIRS[opt];
            const tx = this.x + v.x;
            const ty = this.y + v.y;
            let neighbors = 0;
            for (let n of Object.values(DIRS)) {
                const nx = tx + n.x;
                const ny = ty + n.y;
                if (nx === this.x && ny === this.y) continue;
                if (isValid(nx,ny) && grid[nx][ny]) neighbors++;
            }
            if (neighbors === 1) score += 5; // Good spacing
            if (neighbors > 1) score -= 5;   // Crowded
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
        canvas = data.canvas;
        ctx = canvas.getContext('2d', { alpha: false });
        applyTheme(data.theme);
    } 
    else {
        currentJobId++; 
        if (data.width) resize(data.width, data.height);
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
}

function resize(w, h) {
    if (!canvas) return;
    cols = Math.ceil(w / CONFIG.gridSize);
    rows = Math.ceil(h / CONFIG.gridSize);
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
    }
}

function isValid(x, y) {
    return x >= 0 && y >= 0 && x < cols && y < rows;
}

// --- ANIMATION MANAGER ---

function startAnimation() {
    const jobId = currentJobId;

    // Reset Logic
    grid = new Array(cols).fill(0).map(() => new Array(rows).fill(false));
    degrees = new Array(cols).fill(0).map(() => new Array(rows).fill(0));
    colorMap = new Array(cols).fill(0).map(() => new Array(rows).fill(0));
    
    // Clear Visuals
    ctx.fillStyle = currentBackgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.lineWidth = CONFIG.strokeWidth;
    ctx.lineCap = "round";

    // Inform Main thread that we have reset the canvas
    self.postMessage("started");

    let crawlers = [];

    // SEEDING
    const totalCells = cols * rows;
    const numSeeds = Math.max(2, Math.floor(totalCells / CONFIG.seedDensityArea));
    
    let spawned = 0;
    let attempts = 0;
    while(spawned < numSeeds && attempts < numSeeds * 10) {
        attempts++;
        const sx = Math.floor(Math.random() * cols);
        const sy = Math.floor(Math.random() * rows);
        
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

        // 1. Process Active Crawlers
        for (let i = crawlers.length - 1; i >= 0; i--) {
            let c = crawlers[i];
            const keepAlive = c.update(crawlers); 
            if (keepAlive) active = true;
            else crawlers.splice(i, 1);
        }

        // 2. Spawn Fillers (Original Logic)
        // Check random band, collect candidates, shuffle, pick one.
        if (Math.random() < 0.25) { 
            let resurrected = findAndSpawnFill(crawlers);
            if (resurrected) active = true;
        }

        if (active) {
            animationFrameId = requestAnimationFrame(loop);
        }
    }

    loop();
}

/**
 * ORIGINAL SPONTANEOUS FILL LOGIC
 * Scans a random vertical band, collects all candidates, 
 * shuffles them, and picks ONE.
 */
function findAndSpawnFill(crawlerList) {
    let candidates = [];
    const step = 2; 

    // Random vertical band scan
    const scanHeight = 30; // Check a chunk of rows
    const startRow = Math.floor(Math.random() * (rows - scanHeight));
    const safeStart = Math.max(0, startRow);
    const safeEnd = Math.min(rows, safeStart + scanHeight);

    for (let x = 0; x < cols; x += step) {
        for (let y = safeStart; y < safeEnd; y += step) {
            if (!isValid(x,y)) continue;
            
            if (grid[x][y] && degrees[x][y] < 3) {
                let hasFreeNeighbor = false;
                for(let v of Object.values(DIRS)) {
                    const tx = x + v.x;
                    const ty = y + v.y;
                    if (isValid(tx, ty) && !grid[tx][ty]) {
                        hasFreeNeighbor = true;
                        break;
                    }
                }
                if (hasFreeNeighbor) candidates.push({x, y});
            }
        }
    }

    if (candidates.length === 0) return false;

    // Fisher-Yates Shuffle
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    // Pick first valid after shuffle
    for (let cand of candidates) {
        let validDirs = [];
        for(let [k, v] of Object.entries(DIRS)) {
            const tx = cand.x + v.x;
            const ty = cand.y + v.y;
            if (isValid(tx, ty) && !grid[tx][ty]) {
                validDirs.push(k);
            }
        }

        if (validDirs.length > 0) {
            const dir = validDirs[Math.floor(Math.random() * validDirs.length)];
            degrees[cand.x][cand.y]++;
            let parentColor = colorMap[cand.x][cand.y];
            crawlerList.push(new Crawler(cand.x, cand.y, dir, 0, parentColor));
            return true;
        }
    }
    return false;
}