/**
 * /js/background_maze.js
 */

(function() {
    const htmlCanvas = document.getElementById('background-maze-canvas');
    const ctx = htmlCanvas.getContext('2d', { alpha: true }); // Standard 2D context
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
    let currentBitmap = null; // The texture received from worker
    let isRendering = false;

    function getTheme() {
        const val = document.documentElement.getAttribute("data-theme");
        return (val === "light") ? "light" : "dark";
    }

    /**
     * Resizes the generic canvas to fit the viewport exactly.
     * Since it is position:fixed, it matches window.inner*
     */
    function updateCanvasSize() {
        htmlCanvas.width = window.innerWidth;
        htmlCanvas.height = window.innerHeight;
    }

    function triggerWorkerGeneration(type) {
        // We no longer send dims to the worker for logic, 
        // as the worker only cares about the pattern size.
        worker.postMessage({
            type: type,
            theme: getTheme(),
            id: currentRequestId 
        });
        
        isFirstLoad = false;
    }

    // --- The Main Thread Render Loop ---
    // This tiles the available bitmap based on scroll position
    function startRenderLoop() {
        if (isRendering) return;
        isRendering = true;
        
        function frame() {
            if (!currentBitmap) {
                // Keep running to catch the bitmap when it arrives
                requestAnimationFrame(frame);
                return;
            }

            // 1. Clear
            ctx.clearRect(0, 0, htmlCanvas.width, htmlCanvas.height);

            // 2. Calculate Scroll Offset
            const patternSize = currentBitmap.width; // Should be 750px based on config
            
            // We want the maze to move "up" when we scroll down, naturally.
            // wrappedY is the offset into the first tile.
            // window.scrollY of 0 means start at 0.
            // window.scrollY of 10 means ship everything up 10px (draw at -10).
            const scrollY = window.scrollY;
            const offsetY = -(scrollY % patternSize);
            const offsetX = 0; // Can extend for horizontal scroll if desired

            // 3. Tile
            // Start drawing from just above the screen to ensure no gaps
            // We loop until we have covered height + patternSize
            const cols = Math.ceil(htmlCanvas.width / patternSize) + 1;
            const rows = Math.ceil(htmlCanvas.height / patternSize) + 2;

            for (let c = 0; c < cols; c++) {
                for (let r = 0; r < rows; r++) {
                    // Coordinates might need to be shifted back if offset is positive,
                    // but here offset is negative (moving up).
                    // We start at -patternSize to handle the partial tile entering from top (if scrolling up)
                    // Actually simple logic: simply grid it out.
                    const dx = c * patternSize + offsetX;
                    const dy = (r * patternSize) + offsetY;
                    
                    ctx.drawImage(currentBitmap, dx, dy);
                }
            }
            
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }

    // --- Worker Listener ---
    worker.onmessage = (e) => {
        const data = e.data;
        
        // ID Check: If this message belongs to an old request, ignore it.
        if (data.id !== currentRequestId) {
            // Close bitmap to prevent memory leaks if it was sent
            if (data.bitmap) data.bitmap.close();
            return;
        }

        if (data.type === 'started') {
            // Worker is reporting restart. Reveal canvas.
            requestAnimationFrame(() => {
               htmlCanvas.classList.add('loaded');
            });
        }
        else if (data.type === 'render') {
            // Update texture
            if (currentBitmap) currentBitmap.close(); // Cleanup old frame
            currentBitmap = data.bitmap;
        }
    };

    // --- Observers ---

    // 1. Init
    updateCanvasSize();
    startRenderLoop(); // Start the painting loop immediately
    worker.postMessage({ type: 'init', theme: getTheme() }); // No canvas passed

    // 2. Resize Observer
    const observer = new ResizeObserver(() => {
        const w = window.innerWidth;
        const h = window.innerHeight;

        if (w === lastWidth && h === lastHeight) return;
        lastWidth = w;
        lastHeight = h;

        updateCanvasSize(); // Immediately resize the drawing surface

        // Logic Flash Prevention
        currentRequestId++; 
        clearTimeout(pendingTimeout);

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
    observer.observe(document.body);

    // 3. Theme Observer
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