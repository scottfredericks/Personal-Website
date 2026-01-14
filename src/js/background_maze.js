// deno-lint-ignore-file no-window no-window-prefix
(function () {
  const htmlCanvas = document.getElementById("background-maze-canvas");
  const container = document.getElementById("background-maze-div");

  const ctx = htmlCanvas.getContext("2d", { alpha: true });
  const FADE_DURATION = 800;
  const RESIZE_DEBOUNCE_TIME = 300;
  const AUTO_REGEN_DELAY = 1000;

  const worker = new Worker("/js/background_maze_worker.js");

  // Visual state machine: "hidden" | "fading-in" | "visible" | "fading-out"
  let visualState = "hidden";

  // Pending operations
  let debounceTimeout = null;
  let autoRegenTimeout = null;
  let transitionTimeout = null;

  // Generation tracking
  let currentRequestId = 0;

  // Rendering state
  let currentBitmap = null;
  let currentHeads = [];
  let isRendering = false;
  let isShuttingDown = false;
  let currentTheme = "dark";

  // Size tracking
  let lastWidth = 0;
  let lastHeight = 0;

  function getTheme() {
    const val = document.documentElement.getAttribute("data-theme");
    return (val === "light") ? "light" : "dark";
  }

  function updateCanvasSize() {
    const w = htmlCanvas.clientWidth;
    const h = htmlCanvas.clientHeight;

    if (htmlCanvas.width !== w || htmlCanvas.height !== h) {
      htmlCanvas.width = w;
      htmlCanvas.height = h;
    }
  }

  function setVisualState(newState) {
    if (isShuttingDown) return;
    if (visualState === newState) return;

    clearTimeout(transitionTimeout);
    visualState = newState;

    switch (newState) {
      case "fading-out":
        htmlCanvas.classList.remove("loaded");
        transitionTimeout = setTimeout(() => {
          setVisualState("hidden");
        }, FADE_DURATION);
        break;

      case "hidden":
        // Nothing to do here; generation is triggered externally
        break;

      case "fading-in":
        htmlCanvas.classList.add("loaded");
        transitionTimeout = setTimeout(() => {
          setVisualState("visible");
        }, FADE_DURATION);
        break;

      case "visible":
        // Nothing to do here
        break;
    }
  }

  function startGeneration(type) {
    if (isShuttingDown) return;

    currentTheme = getTheme();

    clearTimeout(autoRegenTimeout);
    updateCanvasSize();

    if (currentBitmap) {
      currentBitmap.close();
      currentBitmap = null;
    }

    worker.postMessage({
      type: type,
      theme: currentTheme,
      id: currentRequestId,
    });
  }

  function scheduleRegeneration(type, delay) {
    clearTimeout(debounceTimeout);
    clearTimeout(autoRegenTimeout);

    // Increment request ID immediately to reject any frames from the old generation
    currentRequestId++;

    debounceTimeout = setTimeout(() => {
      // Ensure we're in hidden state before starting
      if (visualState === "hidden") {
        startGeneration(type);
      } else {
        // Wait for fade-out to complete, then check again
        const waitForHidden = () => {
          if (isShuttingDown) return;
          if (visualState === "hidden") {
            startGeneration(type);
          } else {
            // Poll until hidden (transition timeout will eventually get us there)
            setTimeout(waitForHidden, 50);
          }
        };
        waitForHidden();
      }
    }, delay);
  }

  function startRenderLoop() {
    if (isRendering) return;
    isRendering = true;

    function frame() {
      if (isShuttingDown) {
        isRendering = false;
        return;
      }

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

      ctx.globalCompositeOperation = "source-over";

      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const dx = c * patternSize + offsetX;
          const dy = (r * patternSize) + offsetY;
          ctx.drawImage(currentBitmap, dx, dy - patternSize);
        }
      }

      const isDark = currentTheme === "dark";
      const glowRadius = isDark ? 25 : 20;

      if (currentHeads && currentHeads.length > 0) {
        if (isDark) {
          ctx.globalCompositeOperation = "screen";
        } else {
          ctx.globalCompositeOperation = "source-over";
        }

        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            const ox = c * patternSize + offsetX;
            const oy = (r * patternSize) + offsetY - patternSize;

            for (let i = 0; i < currentHeads.length; i++) {
              const h = currentHeads[i];
              const cx = ox + h.x;
              const cy = oy + h.y;

              if (
                cx < -glowRadius || cx > htmlCanvas.width + glowRadius ||
                cy < -glowRadius || cy > htmlCanvas.height + glowRadius
              ) continue;

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
              ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
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
    if (isShuttingDown) {
      if (e.data.bitmap) e.data.bitmap.close();
      return;
    }

    const data = e.data;

    // Ignore messages from old generations
    if (data.id !== currentRequestId) {
      if (data.bitmap) data.bitmap.close();
      return;
    }

    if (data.type === "started") {
      currentHeads = [];
    } else if (data.type === "render") {
      if (currentBitmap) currentBitmap.close();
      currentBitmap = data.bitmap;
      if (data.heads) {
        currentHeads = data.heads;
      }

      // Start fade-in on first frame if we're hidden
      if (visualState === "hidden") {
        // Double rAF to ensure browser is ready for transition
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (data.id === currentRequestId && visualState === "hidden") {
              setVisualState("fading-in");
            }
          });
        });
      }

      worker.postMessage({ type: "ack", id: currentRequestId });
    } else if (data.type === "finished") {
      autoRegenTimeout = setTimeout(() => {
        if (isShuttingDown) return;
        if (data.id === currentRequestId) {
          setVisualState("fading-out");
          scheduleRegeneration("finished_regen", FADE_DURATION);
        }
      }, AUTO_REGEN_DELAY);
    }
  };

  function cleanup() {
    isShuttingDown = true;

    clearTimeout(debounceTimeout);
    clearTimeout(autoRegenTimeout);
    clearTimeout(transitionTimeout);

    observer.disconnect();
    themeObserver.disconnect();

    if (currentBitmap) {
      currentBitmap.close();
      currentBitmap = null;
    }

    worker.terminate();
  }

  function handleVisibilityChange() {
    if (isShuttingDown) return;

    if (document.visibilityState === "hidden") {
      worker.postMessage({ type: "pause", id: currentRequestId });
    } else if (document.visibilityState === "visible") {
      worker.postMessage({ type: "resume", id: currentRequestId });
    }
  }

  // Initialize
  startRenderLoop();
  startGeneration("init");

  const observer = new ResizeObserver(() => {
    if (isShuttingDown) return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    if (w === lastWidth && h === lastHeight) return;
    lastWidth = w;
    lastHeight = h;

    clearTimeout(autoRegenTimeout);

    // Start fade-out immediately if not already fading out or hidden
    if (visualState === "visible" || visualState === "fading-in") {
      setVisualState("fading-out");
    }

    // Schedule regeneration with debounce
    // Use the longer of debounce time or fade duration to ensure we're hidden
    scheduleRegeneration(
      "resize",
      Math.max(RESIZE_DEBOUNCE_TIME, FADE_DURATION),
    );
  });
  observer.observe(container);

  const themeObserver = new MutationObserver((mutations) => {
    if (isShuttingDown) return;

    let themeChanged = false;
    mutations.forEach((mutation) => {
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "data-theme"
      ) {
        themeChanged = true;
      }
    });

    if (themeChanged) {
      clearTimeout(autoRegenTimeout);

      // Start fade-out immediately if not already fading out or hidden
      if (visualState === "visible" || visualState === "fading-in") {
        setVisualState("fading-out");
      }

      scheduleRegeneration("themeChange", FADE_DURATION);
    }
  });
  themeObserver.observe(document.documentElement, { attributes: true });

  window.addEventListener("pagehide", cleanup);
  window.addEventListener("beforeunload", cleanup);
  document.addEventListener("visibilitychange", handleVisibilityChange);
})();
