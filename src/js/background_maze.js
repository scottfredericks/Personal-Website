// deno-lint-ignore-file no-window no-window-prefix
(function () {
  const htmlCanvas = document.getElementById("background-maze-canvas");
  const container = document.getElementById("background-maze-div");

  const ctx = htmlCanvas.getContext("2d", { alpha: true });
  const FADE_OUT_DURATION = 800;
  const RESIZE_DEBOUNCE_TIME = 300;
  const AUTO_REGEN_DELAY = 1000;

  const worker = new Worker("/js/background_maze_worker.js");

  let pendingTimeout;
  let autoRegenTimeout;
  let isFirstLoad = true;
  let currentRequestId = 0;

  // The request ID that we're currently accepting render frames from.
  // This is separate from currentRequestId to allow the old generation
  // to continue displaying during fade-out.
  let acceptingFramesFromId = 0;

  let lastWidth = 0;
  let lastHeight = 0;

  let currentBitmap = null;
  let currentHeads = [];
  let isRendering = false;
  let isShuttingDown = false;
  let currentTheme = "dark";

  // Tracks whether we've received the first render frame for the current request.
  // Used to ensure we only fade in after content is ready to display.
  let hasReceivedFirstFrame = false;

  // Timestamp when fade-out started. Used to calculate remaining fade time
  // when multiple resize events occur.
  let fadeOutStartTime = null;

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
    if (isShuttingDown) return;

    const theme = getTheme();
    currentTheme = theme;

    // Critical: if we receive a manual trigger (theme, resize) while waiting
    // to auto-regenerate, cancel the auto-regeneration so we don't fade out prematurely.
    clearTimeout(autoRegenTimeout);

    // Update canvas size here, right before starting new generation,
    // rather than during the fade-out period
    updateCanvasSize();

    if (currentBitmap) {
      currentBitmap.close();
      currentBitmap = null;
    }

    // Reset the first frame flag when starting a new generation
    hasReceivedFirstFrame = false;

    // Clear fade-out tracking since we're starting fresh
    fadeOutStartTime = null;

    // Now start accepting frames from the new request ID
    acceptingFramesFromId = currentRequestId;

    worker.postMessage({
      type: type,
      theme: theme,
      id: currentRequestId,
    });

    isFirstLoad = false;
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

    // Reject frames that aren't from the generation we're currently accepting
    if (data.id !== acceptingFramesFromId) {
      if (data.bitmap) data.bitmap.close();
      return;
    }

    if (data.type === "started") {
      // Worker has begun generation. We wait for the first render frame
      // to arrive before fading in.
      currentHeads = [];
    } else if (data.type === "render") {
      if (currentBitmap) currentBitmap.close();
      currentBitmap = data.bitmap;
      if (data.heads) {
        currentHeads = data.heads;
      }

      // Add loaded class on first frame to trigger fade-in
      if (!hasReceivedFirstFrame) {
        hasReceivedFirstFrame = true;
        const frameRequestId = data.id;

        // Use a double requestAnimationFrame to ensure the browser has
        // fully processed the current frame and is ready for the transition
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (frameRequestId === currentRequestId && !isShuttingDown) {
              htmlCanvas.classList.add("loaded");
            }
          });
        });
      }

      // Signal worker that we're ready for the next frame
      worker.postMessage({ type: "ack", id: acceptingFramesFromId });
    } else if (data.type === "finished") {
      // Maze generation is complete.
      //   Wait for AUTO_REGEN_DELAY
      //   Remove loaded class (fade out)
      //   Wait for FADE_OUT_DURATION
      //   Trigger regenerate

      autoRegenTimeout = setTimeout(() => {
        if (isShuttingDown) return;
        htmlCanvas.classList.remove("loaded");

        autoRegenTimeout = setTimeout(() => {
          if (isShuttingDown) return;
          // Only trigger if we are still on the same request ID
          // (though triggerWorkerGeneration handles clearing the timeout too)
          if (currentRequestId === data.id) {
            triggerWorkerGeneration("finished_regen");
          }
        }, FADE_OUT_DURATION);
      }, AUTO_REGEN_DELAY);
    }
  };

  function cleanup() {
    isShuttingDown = true;

    clearTimeout(pendingTimeout);
    clearTimeout(autoRegenTimeout);

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
      worker.postMessage({ type: "pause", id: acceptingFramesFromId });
    } else if (document.visibilityState === "visible") {
      worker.postMessage({ type: "resume", id: acceptingFramesFromId });
    }
  }

  startRenderLoop();
  triggerWorkerGeneration("init");

  const observer = new ResizeObserver(() => {
    if (isShuttingDown) return;

    // Measure client dimensions of the container
    const w = container.clientWidth;
    const h = container.clientHeight;

    if (w === lastWidth && h === lastHeight) return;
    lastWidth = w;
    lastHeight = h;

    // Don't update canvas size here - it clears the canvas and disrupts fade-out.
    // Canvas size will be updated in triggerWorkerGeneration instead.

    currentRequestId++;
    clearTimeout(pendingTimeout);
    clearTimeout(autoRegenTimeout);

    // Reset first frame flag immediately on resize
    hasReceivedFirstFrame = false;

    if (isFirstLoad) {
      pendingTimeout = setTimeout(() => {
        triggerWorkerGeneration("resize");
      }, 100);
    } else {
      const now = performance.now();

      // Only start fade-out if not already fading out
      if (fadeOutStartTime === null) {
        fadeOutStartTime = now;
        htmlCanvas.classList.remove("loaded");
      }

      // Calculate how much time has elapsed since fade-out started
      const elapsed = now - fadeOutStartTime;
      const remainingFadeTime = Math.max(0, FADE_OUT_DURATION - elapsed);

      // Wait for both the debounce period and the remaining fade-out time
      const delay = Math.max(RESIZE_DEBOUNCE_TIME, remainingFadeTime);

      pendingTimeout = setTimeout(() => {
        triggerWorkerGeneration("resize");
      }, delay);
    }
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
      currentRequestId++;
      clearTimeout(pendingTimeout);
      clearTimeout(autoRegenTimeout);

      // Reset first frame flag on theme change
      hasReceivedFirstFrame = false;

      // Reset fade-out tracking for theme changes
      fadeOutStartTime = null;

      if (!isFirstLoad) {
        htmlCanvas.classList.remove("loaded");
      }

      pendingTimeout = setTimeout(() => {
        triggerWorkerGeneration("themeChange");
      }, FADE_OUT_DURATION);
    }
  });
  themeObserver.observe(document.documentElement, { attributes: true });

  // Clean up resources when navigating away or closing the page
  window.addEventListener("pagehide", cleanup);
  window.addEventListener("beforeunload", cleanup);

  // Pause/resume generation based on page visibility
  document.addEventListener("visibilitychange", handleVisibilityChange);
})();
