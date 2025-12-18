/**
 * /js/background_maze.js
 */

(function() {
    const htmlCanvas = document.getElementById('background-maze-canvas');
    const FADE_OUT_DURATION = 800; 
    const RESIZE_DEBOUNCE_TIME = 300; 

    if (!htmlCanvas.transferControlToOffscreen) {
        console.warn("OffscreenCanvas not supported.");
        return;
    }

    const offscreen = htmlCanvas.transferControlToOffscreen();
    const worker = new Worker('/js/background_maze_worker.js'); 
    
    let pendingTimeout;
    let isFirstLoad = true;

    // Request ID System to prevent "flashing" of stale mazes
    let currentRequestId = 0;

    // Track dimensions to prevent duplicate firing
    let lastWidth = 0;
    let lastHeight = 0;

    function getTheme() {
        const val = document.documentElement.getAttribute("data-theme");
        return (val === "light") ? "light" : "dark";
    }

    function getDimensions() {
        const body = document.body;
        const html = document.documentElement;
        
        const fullHeight = Math.max( 
            body.scrollHeight, body.offsetHeight, 
            html.clientHeight, html.scrollHeight, html.offsetHeight,
            window.innerHeight
        );
        const fullWidth = html.clientWidth || window.innerWidth;
        return { width: fullWidth, height: fullHeight };
    }

    /**
     * Sends the command to the worker. 
     * Includes the 'currentRequestId' so we can specificially validate the response later.
     */
    function triggerWorkerGeneration(type) {
        const dims = getDimensions();
        
        worker.postMessage({
            type: type,
            width: dims.width,
            height: dims.height,
            theme: getTheme(),
            id: currentRequestId 
        });
        
        isFirstLoad = false;
    }

    // --- Worker Listener ---
    worker.onmessage = (e) => {
        const data = e.data;
        
        // Only reveal if the message matches the MOST RECENT request.
        // If 'currentRequestId' has incremented since this job started 
        // (due to a new resize event), we ignore this completion.
        if (data.type === 'started' && data.id === currentRequestId) {
            requestAnimationFrame(() => {
                htmlCanvas.classList.add('loaded');
            });
        }
    };

    // --- Observers ---

    // 1. Init Worker (Setup only)
    worker.postMessage({ 
        type: 'init', 
        canvas: offscreen, 
        theme: getTheme()
    }, [offscreen]);

    // 2. Resize Observer
    const observer = new ResizeObserver(() => {
        const dims = getDimensions();

        if (dims.width === lastWidth && dims.height === lastHeight) {
            return;
        }
        lastWidth = dims.width;
        lastHeight = dims.height;

        // 1. Invalidate previous requests immediately.
        // Any worker job currently running is now considered "stale".
        // Its completion message will be ignored because IDs won't match.
        currentRequestId++; 

        // 2. Clear any pending generation triggers.
        clearTimeout(pendingTimeout);

        if (isFirstLoad) {
            pendingTimeout = setTimeout(() => {
                triggerWorkerGeneration('resize');
            }, 100);
        } else {
            // 3. Hide Canvas immediately
            htmlCanvas.classList.remove('loaded');

            // 4. Wait for resize to STOP before requesting new generation
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
            // Invalidate race conditions
            currentRequestId++; 
            clearTimeout(pendingTimeout);
            
            if (!isFirstLoad) {
                htmlCanvas.classList.remove('loaded');
            }

            // Wait for fade out to complete before generating
            pendingTimeout = setTimeout(() => {
                triggerWorkerGeneration('themeChange');
            }, FADE_OUT_DURATION);
        }
    });
    themeObserver.observe(document.documentElement, { attributes: true });

})();