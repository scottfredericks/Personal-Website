/**
 * /js/background_maze.js
 */

(function() {
    const htmlCanvas = document.getElementById('background-maze-canvas');
    // NEW: Get reference to the container
    const container = document.getElementById('background-maze-div');

    const ctx = htmlCanvas.getContext('2d', { alpha: true }); 
    const FADE_OUT_DURATION = 800; 
    const RESIZE_DEBOUNCE_TIME = 300; 
    const AUTO_REGEN_DELAY = 1000; // Time to wait after generation finishes

    const worker = new Worker('/js/background_maze_worker.js'); 
    
    let pendingTimeout;
    let autoRegenTimeout; // Tracks the "wait and fade" logic
    let isFirstLoad = true;
    let currentRequestId = 0;

    let lastWidth = 0;
    let lastHeight = 0;

    let currentBitmap = null; 
    let currentHeads = []; 
    let isRendering = false;
    let currentTheme = 'dark'; 

    function getTheme() {
        const val = document.documentElement.getAttribute("data-theme");
        return (val === "light") ? "light" : "dark";
    }

    function updateCanvasSize() {
        // Since CSS handles the display size (width: 100%, height: 100% of container),
        // we just need to match the internal resolution to the display size.
        // We use clientWidth/Height of the canvas element itself (which fills the div).
        
        const w = htmlCanvas.clientWidth;
        const h = htmlCanvas.clientHeight;
        
        // Only update if dimensions actually changed to avoid flicker
        if (htmlCanvas.width !== w || htmlCanvas.height !== h) {
            htmlCanvas.width = w;
            htmlCanvas.height = h;
        }
    }

    function triggerWorkerGeneration(type) {
        const theme = getTheme();
        currentTheme = theme; 
        
        // Critical: If we receive a manual trigger (theme, resize) while waiting 
        // to auto-regenerate, cancel the auto-regeneration so we don't fade out prematurely.
        clearTimeout(autoRegenTimeout);

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

    function startRenderLoop() {
        if (isRendering) return;
        isRendering = true;
        
        function frame() {
            if (!currentBitmap) {
                ctx.clearRect(0, 0, htmlCanvas.width, htmlCanvas.height);
                requestAnimationFrame(frame);
                return;
            }

            ctx.clearRect(0, 0, htmlCanvas.width, htmlCanvas.height);

            const patternSize = currentBitmap.width; 
            const scrollY = window.scrollY;
            const offsetY = -(scrollY % patternSize);
            const offsetX = 0; 
            
            const cols = Math.ceil(htmlCanvas.width / patternSize) + 1;
            const rows = Math.ceil(htmlCanvas.height / patternSize) + 2;

            ctx.globalCompositeOperation = 'source-over';
            
            for (let c = 0; c < cols; c++) {
                for (let r = 0; r < rows; r++) {
                    const dx = c * patternSize + offsetX;
                    const dy = (r * patternSize) + offsetY;
                    ctx.drawImage(currentBitmap, dx, dy - patternSize);
                }
            }

            // ... (Drawing Effects Code remains exactly the same as your file) ...
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

    worker.onmessage = (e) => {
        const data = e.data;
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
            if (currentBitmap) currentBitmap.close(); 
            currentBitmap = data.bitmap;
            if (data.heads) {
                currentHeads = data.heads;
            }
        }
        else if (data.type === 'finished') {
            // Maze generation is complete. 
            // 1. Wait for AUTO_REGEN_DELAY (1 sec)
            // 2. Remove loaded class (fade out)
            // 3. Wait for FADE_OUT_DURATION (0.8 sec)
            // 4. Trigger regenerate
            
            autoRegenTimeout = setTimeout(() => {
                htmlCanvas.classList.remove('loaded');

                autoRegenTimeout = setTimeout(() => {
                    // Only trigger if we are still on the same request ID 
                    // (though triggerWorkerGeneration handles clearing the timeout too)
                    if (currentRequestId === data.id) {
                        triggerWorkerGeneration('finished_regen');
                    }
                }, FADE_OUT_DURATION);

            }, AUTO_REGEN_DELAY);
        }
    };

    updateCanvasSize();
    startRenderLoop(); 
    triggerWorkerGeneration('init'); 

    // UPDATED: Observe the container (div), NOT the body.
    // This prevents re-triggers when content loads, unless the viewport technically resizes.
    const observer = new ResizeObserver(() => {
        // Measure client dimensions of the container
        const w = container.clientWidth;
        const h = container.clientHeight;

        if (w === lastWidth && h === lastHeight) return;
        lastWidth = w;
        lastHeight = h;

        updateCanvasSize();

        currentRequestId++; 
        clearTimeout(pendingTimeout);
        clearTimeout(autoRegenTimeout); // Stop any pending fade-outs

        if (isFirstLoad) {
            pendingTimeout = setTimeout(() => {
                triggerWorkerGeneration('resize');
            }, 100);
        } else {
            htmlCanvas.classList.remove('loaded');
            pendingTimeout = setTimeout(() => {
                triggerWorkerGeneration('resize');
            }, RESIZE_DEBOUNCE_TIME);
        }
    });
    // UPDATED: Observe container
    observer.observe(container);

    const themeObserver = new MutationObserver((mutations) => {
        let themeChanged = false;
        mutations.forEach((mutation) => {
            if (mutation.type === "attributes" && mutation.attributeName === "data-theme") {
                themeChanged = true;
            }
        });

        if (themeChanged) {
            currentRequestId++; 
            clearTimeout(pendingTimeout);
            clearTimeout(autoRegenTimeout); // Stop any pending fade-outs
            
            if (!isFirstLoad) {
                htmlCanvas.classList.remove('loaded');
            }

            pendingTimeout = setTimeout(() => {
                triggerWorkerGeneration('themeChange');
            }, FADE_OUT_DURATION);
        }
    });
    themeObserver.observe(document.documentElement, { attributes: true });

})();