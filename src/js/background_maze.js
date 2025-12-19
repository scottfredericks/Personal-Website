/**
 * /js/background_maze.js
 */

(function() {
    const htmlCanvas = document.getElementById('background-maze-canvas');
    const ctx = htmlCanvas.getContext('2d', { alpha: true }); 
    const FADE_OUT_DURATION = 800; 
    const RESIZE_DEBOUNCE_TIME = 300; 

    // We do NOT use transferControlToOffscreen anymore.
    const worker = new Worker('/js/background_maze_worker.js'); 
    
    let pendingTimeout;
    let isFirstLoad = true;
    let currentRequestId = 0;

    // Dimensions
    let lastWidth = 0;
    let lastHeight = 0;

    // Rendering State
    let currentBitmap = null; 
    let currentHeads = []; 
    let isRendering = false;

    // Theme state
    let currentTheme = 'dark'; 

    function getTheme() {
        const val = document.documentElement.getAttribute("data-theme");
        return (val === "light") ? "light" : "dark";
    }

    function updateCanvasSize() {
        htmlCanvas.width = window.innerWidth;
        htmlCanvas.height = window.innerHeight;
    }

    function triggerWorkerGeneration(type) {
        const theme = getTheme();
        currentTheme = theme; 
        
        // NOW we clear the old bitmap, just before we ask for a new one.
        // This ensures the fade-out has finished (since this runs inside the timeout).
        if (currentBitmap) {
            currentBitmap.close();
            currentBitmap = null;
        }

        worker.postMessage({
            type: type,
            theme: theme,
            id: currentRequestId 
        });
        
        isFirstLoad = false;
    }

    // --- The Main Thread Render Loop ---
    function startRenderLoop() {
        if (isRendering) return;
        isRendering = true;
        
        function frame() {
            // Draw nothing if we have no bitmap (e.g. between fade-out finish and new load)
            if (!currentBitmap) {
                ctx.clearRect(0, 0, htmlCanvas.width, htmlCanvas.height);
                requestAnimationFrame(frame);
                return;
            }

            // 1. Clear
            ctx.clearRect(0, 0, htmlCanvas.width, htmlCanvas.height);

            // 2. Setup Pattern
            const patternSize = currentBitmap.width; 
            const scrollY = window.scrollY;
            const offsetY = -(scrollY % patternSize);
            const offsetX = 0; 
            
            const cols = Math.ceil(htmlCanvas.width / patternSize) + 1;
            const rows = Math.ceil(htmlCanvas.height / patternSize) + 2;

            // 3. Draw Base Maze (Source-Over)
            ctx.globalCompositeOperation = 'source-over';
            
            for (let c = 0; c < cols; c++) {
                for (let r = 0; r < rows; r++) {
                    const dx = c * patternSize + offsetX;
                    const dy = (r * patternSize) + offsetY;
                    // Move drawing up by 1 tile height to behave like an infinite scroll buffer
                    ctx.drawImage(currentBitmap, dx, dy - patternSize);
                }
            }

            // 4. Draw Glow Effects
            const isDark = (currentTheme === 'dark');
            const glowRadius = isDark ? 25 : 20;

            if (currentHeads && currentHeads.length > 0) {
                if (isDark) {
                    ctx.globalCompositeOperation = 'screen'; 
                } else {
                    ctx.globalCompositeOperation = 'source-over'; 
                }

                for (let c = 0; c < cols; c++) {
                    for (let r = 0; r < rows; r++) {
                        const ox = c * patternSize + offsetX;
                        const oy = (r * patternSize) + offsetY - patternSize;

                        for(let i = 0; i < currentHeads.length; i++) {
                            const h = currentHeads[i];
                            const cx = ox + h.x;
                            const cy = oy + h.y;

                            if (cx < -glowRadius || cx > htmlCanvas.width + glowRadius ||
                                cy < -glowRadius || cy > htmlCanvas.height + glowRadius) continue;

                            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
                            
                            if (isDark) {
                                g.addColorStop(0, h.c); 
                                g.addColorStop(1, "rgba(0, 0, 0, 0)");
                                ctx.fillStyle = g;
                            } else {
                                g.addColorStop(0, h.c); 
                                g.addColorStop(1, "rgba(255, 255, 255, 0)"); 
                                ctx.fillStyle = g;
                            }
                            
                            ctx.beginPath();
                            ctx.arc(cx, cy, glowRadius, 0, Math.PI*2);
                            ctx.fill();
                        }
                    }
                }
            }

            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }

    // --- Worker Listener ---
    worker.onmessage = (e) => {
        const data = e.data;
        
        // Critical: Ignore messages from stale requests
        if (data.id !== currentRequestId) {
            if (data.bitmap) data.bitmap.close();
            return;
        }

        if (data.type === 'started') {
            requestAnimationFrame(() => {
               htmlCanvas.classList.add('loaded');
            });
            currentHeads = [];
        }
        else if (data.type === 'render') {
            // It's safe to close the old frame now that we have a new one
            if (currentBitmap) currentBitmap.close(); 
            currentBitmap = data.bitmap;
            if (data.heads) {
                currentHeads = data.heads;
            }
        }
    };

    // --- Observers ---

    updateCanvasSize();
    startRenderLoop(); 
    triggerWorkerGeneration('init'); 

    const observer = new ResizeObserver(() => {
        const w = window.innerWidth;
        const h = window.innerHeight;

        if (w === lastWidth && h === lastHeight) return;
        lastWidth = w;
        lastHeight = h;

        updateCanvasSize();

        // 1. Invalidate - Any incoming 'render' messages from the OLD size are now stale.
        currentRequestId++; 
        clearTimeout(pendingTimeout);

        if (isFirstLoad) {
            pendingTimeout = setTimeout(() => {
                triggerWorkerGeneration('resize');
            }, 100);
        } else {
            // 2. Start Fade Out visually
            htmlCanvas.classList.remove('loaded');
            
            // 3. Wait for bounce, THEN generate (which clears the old bitmap)
            pendingTimeout = setTimeout(() => {
                triggerWorkerGeneration('resize');
            }, RESIZE_DEBOUNCE_TIME);
        }
    });
    observer.observe(document.body);

    const themeObserver = new MutationObserver((mutations) => {
        let themeChanged = false;
        mutations.forEach((mutation) => {
            if (mutation.type === "attributes" && mutation.attributeName === "data-theme") {
                themeChanged = true;
            }
        });

        if (themeChanged) {
            // 1. Invalidate - Any incoming messages from the OLD theme are now stale.
            currentRequestId++; 
            clearTimeout(pendingTimeout);
            
            if (!isFirstLoad) {
                // 2. Start Fade Out visually
                htmlCanvas.classList.remove('loaded');
            }

            // 3. Wait for FULL fade out (0.8s), THEN generate (which clears the old bitmap)
            pendingTimeout = setTimeout(() => {
                triggerWorkerGeneration('themeChange');
            }, FADE_OUT_DURATION);
        }
    });
    themeObserver.observe(document.documentElement, { attributes: true });

})();