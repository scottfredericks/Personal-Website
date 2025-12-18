/**
 * ==========================================
 * ALGORITHMIC CONFIGURATION
 * ==========================================
 */
const CONFIG = {
    gridSize: 30,             // Size of grid cells in pixels
    strokeWidth: 5,           // Line thickness
    
    // Movement Rules
    minSegmentLength: 4,      // Minimum steps before turning is allowed
    maxSegmentLength: 12,     // Forced turn after this many steps
    turnProbability: 0.15,    // Chance to turn significantly
    chanceToBranch: 0.08,     // Chance to spawn a child crawler
    
    // Visuals
    colorChangeRate: 15       // Steps before switching color index
};

// --- PALETTES ---

// Palette for Dark Background (#02020D)
// Uses Light Colors: Teal, Bone, Red, Bone
const PALETTE_DARK_BG = [
    "#2CE1D8",
    "#FFF9ED",
    "#E45143",
    "#FFF9ED",
];

// Palette for Light Background (#FFF9ED)
// Uses Dark Colors: Dark Teal, Dark Blue, Dark Red, Dark Blue
const PALETTE_LIGHT_BG = [
    "#2CE1D8",
    "#02020D",
    "#E45143",
    "#02020D",
];

// Coordinate offsets for hexagonal/8-way movement
const DIRS = {
    N:  { x: 0, y: -1 },
    S:  { x: 0, y: 1 },
    E:  { x: 1, y: 0 },
    W:  { x: -1, y: 0 },
    NW: { x: -1, y: -1 },
    SE: { x: 1, y: 1 }
};

const canvas = document.getElementById('background-maze-canvas');
// 'alpha: false' tells browser the background is opaque, speeding up rendering
const ctx = canvas.getContext('2d', { alpha: false });

// --- Global State ---
let cols, rows;
let grid = [];      
let degrees = [];   
let colorMap = [];  
let paths = [];     

// State for Rendering
let currentPalette = [];
let currentBackgroundColor = "#000000";

/**
 * ==========================================
 * INITIALIZATION
 * ==========================================
 */

function setup() {
    // 1. Detect Theme
    // Check attribute. If null, it means we are using the default :root (Dark).
    const themeAttr = document.documentElement.getAttribute("data-theme");
    const isLightMode = (themeAttr === "light");

    // 2. Set Colors based on mode
    if (isLightMode) {
        // CSS BG is Light (#fffdf8), so we need the DARK palette for lines
        currentPalette = PALETTE_LIGHT_BG; 
        currentBackgroundColor = "#fffdf8"; 
    } else {
        // CSS BG is Dark (#02020D), so we need the LIGHT palette for lines
        // This is the default
        currentPalette = PALETTE_DARK_BG; 
        currentBackgroundColor = "#02020D"; 
    }

    // 3. Resize and Generate
    const w = window.innerWidth;
    const h = window.innerHeight;
    
    cols = Math.floor(w / CONFIG.gridSize);
    rows = Math.floor(h / CONFIG.gridSize);
    
    canvas.width = cols * CONFIG.gridSize;
    canvas.height = rows * CONFIG.gridSize;

    generateAndDraw();
}

/**
 * Main Logic Controller
 */
function generateAndDraw() {
    // 1. Reset Data Structures
    grid = new Array(cols).fill(0).map(() => new Array(rows).fill(false));
    degrees = new Array(cols).fill(0).map(() => new Array(rows).fill(0));
    colorMap = new Array(cols).fill(0).map(() => new Array(rows).fill(0));
    
    // Prepare drawing buckets based on CURRENT palette
    paths = currentPalette.map(() => new Path2D());
    
    let crawlers = [];
    
    // 2. Random Start Seed
    const startX = Math.floor(Math.random() * cols);
    const startY = Math.floor(Math.random() * rows);
    const keys = Object.keys(DIRS);
    const startDir = keys[Math.floor(Math.random() * keys.length)];

    degrees[startX][startY] = 1;
    crawlers.push(new Crawler(startX, startY, startDir, 4, 0));

    // 3. SYNCHRONOUS GENERATION LOOP
    let active = true;
    
    while(active) {
        while (crawlers.length > 0) {
            for (let i = crawlers.length - 1; i >= 0; i--) {
                let c = crawlers[i];
                c.step(crawlers); 
                if (!c.alive) {
                    crawlers.splice(i, 1);
                }
            }
        }
        let resurrected = findAndSpawnFill(crawlers);
        if (!resurrected) active = false;
    }

    // 4. Batch Draw
    drawPaths();
}

/**
 * ==========================================
 * CRAWLER AGENT
 * ==========================================
 */
class Crawler {
    constructor(x, y, dir, forceLen, colorIdx) {
        this.x = x;
        this.y = y;
        this.dir = dir;
        this.forceLen = forceLen;   
        this.colorIdx = colorIdx;
        this.stepCount = 0;         
        this.currentSegLen = 0;     
        this.alive = true;
        
        grid[x][y] = true;
        colorMap[x][y] = colorIdx;
    }

    step(crawlerList) {
        // 1. Identification
        let validMoves = [];
        for (let [key, vec] of Object.entries(DIRS)) {
            const tx = this.x + vec.x;
            const ty = this.y + vec.y;
            if (tx >= 0 && ty >= 0 && tx < cols && ty < rows && !grid[tx][ty]) {
                    validMoves.push(key);
            }
        }

        if (validMoves.length === 0) {
            this.alive = false;
            return;
        }

        // 2. Decision
        let nextDir = null;
        const canContinue = validMoves.includes(this.dir);

        if (this.forceLen > 0) {
            if (canContinue) nextDir = this.dir;
            else { this.alive = false; return; }
        } 
        else {
            if (this.currentSegLen > CONFIG.maxSegmentLength) {
                const turns = validMoves.filter(d => d !== this.dir);
                if (turns.length === 0) { this.alive = false; return; }
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
        }

        // 3. Execution
        const vec = DIRS[nextDir];
        const nx = this.x + vec.x;
        const ny = this.y + vec.y;

        grid[nx][ny] = true;
        degrees[this.x][this.y]++;
        degrees[nx][ny]++;

        const gs = CONFIG.gridSize;
        const half = gs / 2;
        
        // Use the path bucket corresponding to current color index
        const p = paths[this.colorIdx];
        p.moveTo(this.x * gs + half, this.y * gs + half);
        p.lineTo(nx * gs + half, ny * gs + half);

        // 4. State Update
        this.stepCount++;
        if (this.stepCount > CONFIG.colorChangeRate) {
            this.stepCount = 0;
            // Cycle through current palette length
            this.colorIdx = (this.colorIdx + 1) % currentPalette.length;
        }
        
        colorMap[nx][ny] = this.colorIdx;

        // 5. Branching
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

        this.x = nx;
        this.y = ny;
        this.dir = nextDir;
    }

    pickBestTurn(options) {
        const scored = options.map(opt => {
            let score = 0;
            if (this.isAngle45(this.dir, opt)) score += 10;
            
            const v = DIRS[opt];
            const tx = this.x + v.x;
            const ty = this.y + v.y;
            
            let neighbors = 0;
            for (let n of Object.values(DIRS)) {
                const nx = tx + n.x;
                const ny = ty + n.y;
                if (nx === this.x && ny === this.y) continue;
                if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && grid[nx][ny]) {
                    neighbors++;
                }
            }
            if (neighbors === 1) score += 5; 
            if (neighbors > 1) score -= 5;
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

/**
 * ==========================================
 * FILL LOGIC
 * ==========================================
 */
function findAndSpawnFill(crawlerList) {
    let candidates = [];
    for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
            if (grid[x][y] && degrees[x][y] < 3) {
                let hasFreeNeighbor = false;
                for(let v of Object.values(DIRS)) {
                    const tx = x + v.x;
                    const ty = y + v.y;
                    if (tx >= 0 && ty >= 0 && tx < cols && ty < rows && !grid[tx][ty]) {
                        hasFreeNeighbor = true;
                        break;
                    }
                }
                if (hasFreeNeighbor) candidates.push({x, y});
            }
        }
    }

    if (candidates.length === 0) return false;

    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    for (let cand of candidates) {
        let validDirs = [];
        for(let [k, v] of Object.entries(DIRS)) {
            const tx = cand.x + v.x;
            const ty = cand.y + v.y;
            if (tx >= 0 && ty >= 0 && tx < cols && ty < rows && !grid[tx][ty]) {
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

/**
 * ==========================================
 * RENDERER
 * ==========================================
 */
function drawPaths() {
    // Fill with dynamic background color
    ctx.fillStyle = currentBackgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.lineWidth = CONFIG.strokeWidth;
    ctx.lineCap = "round";

    // Draw lines using dynamic palette
    for(let i = 0; i < currentPalette.length; i++) {
        ctx.strokeStyle = currentPalette[i];
        ctx.stroke(paths[i]);
    }
}

// --- EVENT LISTENERS ---

// 1. Debounce Window Resize
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(setup, 200);
});

// 2. Watch for Theme Changes (Instant Update)
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.type === "attributes" && mutation.attributeName === "data-theme") {
            // Re-run setup immediately to use new palette and background
            setup();
        }
    });
});
observer.observe(document.documentElement, { attributes: true });

// Start
setup();