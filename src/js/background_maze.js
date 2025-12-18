/**
 * /js/background_maze.js
 */

(function() {
    const htmlCanvas = document.getElementById('background-maze-canvas');
    const FADE_OUT_DELAY = 800; 

    if (!htmlCanvas.transferControlToOffscreen) {
        console.warn("OffscreenCanvas not supported.");
        return;
    }

    const offscreen = htmlCanvas.transferControlToOffscreen();
    const worker = new Worker('/js/background_maze_worker.js'); 
    
    let pendingGenerationTimeout;
    let isFirstLoad = true;

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

    function startRegeneration(type) {
        const isThemeChange = (type === 'themeChange');
        
        // 1. Hide Canvas (Fade Out) for resets
        // If it's the first load, the canvas is already opacity: 0, 
        // implies no ease-out needed.
        if (!isFirstLoad) {
            htmlCanvas.classList.remove('loaded');
        }

        clearTimeout(pendingGenerationTimeout);

        // 2. Wait for Fade Out (if needed)
        const delay = (isThemeChange && !isFirstLoad) ? FADE_OUT_DELAY : 0;

        pendingGenerationTimeout = setTimeout(() => {
            const dims = getDimensions();
            worker.postMessage({
                type: type,
                width: dims.width,
                height: dims.height,
                theme: getTheme()
            });
            isFirstLoad = false;
        }, delay);
    }

    // --- Worker Listener ---
    worker.onmessage = (e) => {
        // "started" means the worker has cleared the canvas 
        // and is drawing frame 1. Safe to reveal.
        if (e.data === 'started') {
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
    // This fires immediately when we observe(body), acting as our "Document Ready"
    let resizeDebounce;
    const observer = new ResizeObserver(() => {
        // If this is the very first detection, run immediately to show maze ASAP.
        // Subsequent resizes (user dragging window) should be debounced.
        if (isFirstLoad) {
            startRegeneration('resize');
        } else {
            clearTimeout(resizeDebounce);
            resizeDebounce = setTimeout(() => {
                startRegeneration('resize');
            }, 300); 
        }
    });
    observer.observe(document.body);

    // 3. Theme Observer
    const themeObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === "attributes" && mutation.attributeName === "data-theme") {
                startRegeneration('themeChange');
            }
        });
    });
    themeObserver.observe(document.documentElement, { attributes: true });

})();