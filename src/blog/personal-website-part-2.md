---
title: "Building a Personal Website - Part 2: Designing a Theme"
date: 2026-04-20 12:00
tags: [blog_article]
---

# Building a Personal Website - Part 2: Designing a Theme

_Good to know before reading: basic HTML/CSS, basic JavaScript_

_You can check out the source code for this website
[on GitHub](https://github.com/scottfredericks/Personal-Website)._

In the previous article, we showed how to set up a static site using Lume. In this article, we'll look at how to incorporate a dynamic theme using CSS and JavaScript.

## Inspiration

The layout for my old website was a bit boring. I generally like simplicity and neutral
tones, but I wanted more individuality and better use of accents. I also wanted
to combine the unique parts of my background in a modern but visually interesting way.

I've had Alaska on my mind lately, and being
[Unangax̂](https://en.wikipedia.org/wiki/Aleuts) (an Alaska native from the
Aleutian islands, AKA "Aleut"), I wanted to see if I could incorporate the traditional art style into the design.

This style uses a few distinct colors including black, red, teal, white, and
to a lesser extent brown or faded orange as a stand-in for wood or hide. The
shapes tend to be large, swirling, almost psychadelic patterns ending in
curves, spirals, or sharp points. Here's a traditional hunting hat to give you
the general idea:

![Aleut Hunting Hat](https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Hunting_hat%2C_Aleut_-_Ethol%C3%A9n_collection%2C_Museum_of_Cultures_%28Helsinki%29_-_DSC04917.JPG/960px-Hunting_hat%2C_Aleut_-_Ethol%C3%A9n_collection%2C_Museum_of_Cultures_%28Helsinki%29_-_DSC04917.JPG)

At the same time, I wanted a sense of digitality and "computer-y-ness", with some inspiration from physics and computational science.
I also really like the simplicity of a dark theme with a gradient, as
demonstrated in
[Brittany Chang's portfolio website](https://brittanychiang.com/).

Lastly, I wanted to support both dark and light mode, just for fun.

After looking at some quick mock-ups for inspiration (generated using [Banana Pro](https://aistudio.google.com/models/gemini-3-pro-image)), I decided to use a simple centered column layout for the foreground, with a dynamic maze-like background to incorporate the other colors and styles.

## Choosing Colors

When desigining a theme, it's important to choose colors that complement each other while providing sufficient contrast. Generally, you'll want 2-3 variants for most of the main "color roles", where roles might include background, primary, secondary, and accent. The role indicates the general purpose of the element (button, text, title, etc.), while the variations of each role indicate click state, importance, or other organizational information.

If you have a dark background, for example, you'll probably want most of the objects in the foreground to be light-colored. You'll also want some slightly lighter variants for the background to highlight section boundaries. You can check your contrast using an online tool like [WebAIM](https://webaim.org/resources/contrastchecker/).

For dark mode, I decided to use black and white for my main background and text colors, and to use light red and teal for the primary and secondary colors. Gold worked well as an accent color for this theme.

Light mode was similar, but with light and dark colors swapped, and with slightly different roles for the colors. The colors are also slightly more faded than the dark-mode versions, to give the appearance of paint on canvas or wood.

### Color Variables

For reusability, colors can be stored as variables in `main.css` or another CSS location:

```css
/* Dark theme */
:root {
  color-scheme: dark;

  --background1: #02020d;
  --background2: #03051a;
  --background3: #090d40;
  --foreground1: #fff9ed;
  --foreground2: #f5e6c0;
  --foreground3: #e7c88e;
  --primary1: #24e6dc;
  --primary2: #07a79f;
  --primary3: #08817b;
  --primary4: #07bdb4;
  --accent1: #ffe91f;
  --accent2: #f0be1d;
  --accent3: #cf9a09;
  --backdrop1: #02020dde;
  --backdrop2: #02020d52;
}

/* Light theme */
[data-theme="light"] {
  color-scheme: light;
  --background1: #f7efe2;
  --background2: #fae5b1;
  --background3: #eec67c;
  --foreground1: #02020d;
  --foreground2: #050726;
  --foreground3: #090d40;
  --primary1: #f15757;
  --primary2: #be4e42;
  --primary3: #ad4335;
  --primary4: #d45749;
  --accent1: #148882;
  --accent2: #1c8d87;
  --accent3: #21a59e;
  --backdrop1: #fffefcef;
  --backdrop2: #f7f3ea28;
}
```

If you apply the colors by variable name like so:

```css
body {
  background-color: var(--background1);
  color: var(--foreground1);
}
```

then you can change colors globally from a single file, without needing to update the individual pages that use them.

### Utilizing Color Variants

With multiple variants for each color, we can differentiate similar elements with different levels of importance or different states. For example, these headers go from brighter to more muted as they get lower in importance:

```css
h1 {
  color: var(--accent1);
}

h2, h3 {
  color: var(--accent2);
}

h4, h5, h6 {
  color: var(--accent3);
}
```

Likewise, unclicked links should stand out, while clicked ones should blend in more with the background. You also want a subtle visual indication when links are being hovered over or actively clicked:

```css
main a:link {
  color: var(--primary1);
}

main a:visited {
  color: var(--primary3);
}

main a:hover {
  color: var(--primary2);
}

main a:active {
  color: var(--primary4);
}
```

## Main CSS

### Centered Column View With Gradient

For the main layout, I decided to use a central column to keep the text readable while leaving some space so that the background is always visible on the sides. I also made the central column background slightly transparent for the same reasons.

The `main` element lives inside of the `body` element, and holds the primary content for each page, in this case the central column:

```css
main {
  position: relative; /* Sits below the navbar vertically */
  z-index: 2; /* Sits on top of the canvas */
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding-left: 50px;
  padding-right: 50px;
  padding-bottom: 75px;
  padding-top: 50px;
  margin-top: -20px;

  background: var(--backdrop1);
  ...
```

The padding and margins ensure there is always space on the sides and bottom to display the background. Having a max width of 900px prevents the user from needing to scan too far left and right while reading.

To ease the transition between the edges, the background, and the content, I added a gradient. Since I wanted both horizontal and vertical gradients, I used a `mask-image` to compose the two gradients together smoothly:

```css
main {
  ...
    --mask-vert: linear-gradient(
    to bottom,
    transparent 0px,
    black 20px,
    black calc(100% - 50px),
    transparent 100%
  );

  --mask-horiz: linear-gradient(
    to right,
    transparent 0px,
    black 20px,
    black calc(100% - 20px),
    transparent 100%
  );

  -webkit-mask-image:
    var(--mask-vert),
    var(--mask-horiz);
  mask-image:
    var(--mask-vert),
    var(--mask-horiz);

  -webkit-mask-composite: source-in; /* For older WebKit */
  mask-composite: intersect; /* For modern browsers */
```

Here, we define the horizontal and linear gradients using variables (`--mask-vert` and `--mask-horiz`), then mix them into a `mask-image`. Using `mask-composite: intersect` gives us the blending behavior we want, and the `-webkit-mask` bits handle legacy environments.

### Other Elements

For graphical elements, I decicded to center them vertically and limit their width to match the column's:

```css
img, video, canvas, svg, iframe {
  max-width: 100%;
  height: auto;

  display: block;
  margin-left: auto;
  margin-right: auto;
}
```

Since different images have different aspect ratios and levels of detail, I decided to handle further sizing on a case-by-case basis, rather than creating a single rule. For pages with lots of images, it would probably be appropriate to use break points to create more general rules, or just use `max-height` with some pixel limit.

I also wanted code-based elements to stand out slightly from regular text and to allow them to use horizontal scrollbars when needed:

```css
pre, code {
  max-width: 100%;
  overflow-x: auto;
}

pre {
  max-width: 100%;
  overflow-x: auto;

  background-color: var(--background2);
  padding: 1rem;
  border-radius: 4px;
}
```

## Adding a Navbar

A navbar is a simple way to let the user easily get between different sections of the site (landing page, experience, projects, etc.). For this site, I wanted the navbar to stay fixed at the top and to blend into the content using a vertical gradient.

Since we're using Vento templating, I placed the HTML for the navbar in a separate `navbar.html.vto` file, and referenced a separate `navbar.css` file from within it. This helps prevent changes to the navbar from affecting other elements.

The navbar code goes in the `body` section, after the dynamic background but before the main content:

```css
  <body>
    {{ include "components/background_maze.html.vto" }}
    {{ include "components/navbar.html.vto" }}
    <main>
      {{ content }}
    </main>
  </body>
```

Note that the height for the navbar is actually defined as a variable in `main.css`, just in case we ever need to use the height in other places (we shouldn't unless we're doing something tricky):

```css
:root {
  --navbar-height: 65px;
  ...
```

### Differentiating the Mobile View

Most of the navbar code is fairly standard, but one less obvious feature is hiding most of the elements behind a hamburger button menu when the window is too narrow. This keeps the navigation accessible without taking up vertical space on mobile devices.

We place everything inside of a `nav` element, with the website title always active, a hamburger button that's only visible below a certain width, and a `nav-menu` section that either displays horizontally on desktop, or within the hamburger menu on mobile:

```html
<nav class="navbar">
  <div class="nav-content">
    <!-- Brand -->
    <h1 class="nav-brand">
      <a href="/" class="nav-link-item">Scott Fredericks</a>
    </h1>

    <!-- Hamburger Button (Mobile Only) -->
    <button
      class="hamburger"
      aria-expanded="false"
      aria-label="Toggle navigation"
      id="hamburger-btn"
    >
      <span class="bar"></span>
      <span class="bar"></span>
      <span class="bar"></span>
    </button>

    <!-- Links + Theme Toggle Container -->
    <div class="nav-menu-wrapper" id="nav-menu-wrapper">
      <ul class="nav-menu">
        <li><a href="/experience/" class="nav-link-item">Experience</a></li>
        <li><a href="/projects/" class="nav-link-item">Projects</a></li>
        <li><a href="/blog/" class="nav-link-item">Blog</a></li>
        <li>
          <!-- Theme Toggle -->
          <button
            ...
          </button>
        </li>
      </ul>
    </div>
  </div>
</nav>
```

To handle the transition, we use a break point in the navbar CSS based on width:

```css
@media (max-width: 768px) {
  .nav-content {
    padding: 0 1rem;
  }

  .hamburger {
    display: flex;
  }

  .nav-menu-wrapper {
    position: absolute;
    top: 100%;
    left: 0;
    width: 100%;
    background-color: var(--background2);

    max-height: 0;
    padding: 0;
    overflow: hidden;

    transition: max-height 0.3s ease-in-out, padding 0.3s ease-in-out;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }
  ...
```

For desktop (in the default CSS, above this break point section), we simply hide the hamburger button, while also defining any other properties used in the mobile view. The inner contents are displayed on the right side of the navbar:

```css
/* Wrapper for the menu items (desktop default) */
.nav-menu-wrapper {
  display: block;
}

/* Menu links styling */
.nav-menu {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

...

.hamburger {
  display: none;
  background: none;
  border: none;
  cursor: pointer;
  flex-direction: column;
  gap: 5px;
  padding: 5px;
  z-index: 1001;
}
```

Back in the navbar HTML, we add an inline script so that the hamburger button can toggle the navigation elements as a dropdown menu:

```html
<script>
  // Simple Toggle Logic
  const hamburger = document.getElementById("hamburger-btn");
  const navMenu = document.getElementById("nav-menu-wrapper");

  hamburger.addEventListener("click", () => {
    const isExpanded = hamburger.getAttribute("aria-expanded") === "true";
    hamburger.setAttribute("aria-expanded", !isExpanded);
    navMenu.classList.toggle("active");
  });
</script>
```

Back in the mobile CSS, we can use this state to display the menu and animate the button changing back and forth between a hamburger and an "X":

```css
  ...
  .nav-menu-wrapper.active {
    max-height: 400px; /* Large enough to fit content */
    padding: 1rem 0; /* Only add padding when open */
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .nav-menu {
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    width: 100%;
  }

  /* Hamburger animation */
  .hamburger[aria-expanded="true"] .bar:nth-child(1) {
    transform: translateY(8px) rotate(45deg);
  }
  .hamburger[aria-expanded="true"] .bar:nth-child(2) {
    opacity: 0;
  }
  .hamburger[aria-expanded="true"] .bar:nth-child(3) {
    transform: translateY(-8px) rotate(-45deg);
  }
}
```

## Adding a Dark Theme Toggle

TODO

## Adding a Dynamic Background

TODO

## Adding a Font

TODO