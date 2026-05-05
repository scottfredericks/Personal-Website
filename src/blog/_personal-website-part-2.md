---
title: "Building a Personal Website - Part 2: Designing a Theme"
date: 2026-04-20 12:00
tags: [blog_article]
---

# Building a Personal Website - Part 2: Designing a Theme

_Good to know before reading: basic HTML/CSS, basic JavaScript, editing files_

_You can check out the source code for this website
[on GitHub](https://github.com/scottfredericks/Personal-Website)._

In the previous article, we showed how to set up a static site using Lume. In this article, we'll look at how to incorporate a dynamic theme using CSS and JavaScript.

## Inspiration

The layout for my old website was a bit boring. I generally like simplicity and neutral
tones, but I wanted more individuality and better use of accents. I also wanted
to combine the unique parts of my background in a sleek, modern way.

I've had Alaska on my mind lately, and being
[Unangax̂](https://en.wikipedia.org/wiki/Aleuts) (an Alaska native from the
Aleutian islands, AKA "Aleut"), I wanted to see if I could incorporate the traditional art style into the design.

This style uses a few traditional colors including black, red, teal, white, and
to a lesser extent brown or faded orange as a stand-in for wood or hide. The
shapes tend to be large, swirling, almost psychadelic patterns ending in
curves, spirals, or sharp points. Here's a traditional hunting hat to give you
the general idea:

![Aleut Hunting Hat](https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Hunting_hat%2C_Aleut_-_Ethol%C3%A9n_collection%2C_Museum_of_Cultures_%28Helsinki%29_-_DSC04917.JPG/960px-Hunting_hat%2C_Aleut_-_Ethol%C3%A9n_collection%2C_Museum_of_Cultures_%28Helsinki%29_-_DSC04917.JPG)

At the same time, I wanted a sense of digitality and general
"computer-y-ness", with some inspiration from physics and computational science.
I also really like the simplicity of a dark theme with a gradient, as
demonstrated in
[Brittany Chang's portfolio website](https://brittanychiang.com/).

Lastly, I wanted to support both dark and light mode, just for fun.

After looking at some quick mock-ups for inspiration (generated using [Banana Pro](https://aistudio.google.com/models/gemini-3-pro-image)), I decided to use a simple layout for the foreground, with a dynamic maze-like background to incorporate the other colors and styles.

## Choosing Colors

When desigining a theme, it's important to choose colors that complement each other while providing sufficient contrast. Generally, you'll want 2-3 variants for each main "role", where roles often include background, primary, secondary, and accent.

If you have a dark background, for example, you'll want most of the objects in the foreground to be light-colored. You'll also want some slightly lighter variants for the background to highlight section boundaries. You can check your contrast using an online tool like [WebAIM](https://webaim.org/resources/contrastchecker/).

For dark mode, I decided to use black and white for my main background and text colors, and to use light red and teal for the primary and secondary colors. Gold worked well as an accent color for this theme.

Light mode was similar, but with light and dark colors swapped, and with slightly different roles for the different colors. The colors are also slightly more faded than the dark-mode versions, to give the appearance of paint on canvas or wood.

### Color Variables

For reusability, colors can be stored in `main.css` or another CSS location:

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
  --accent1: #148882;
  --accent2: #1c8d87;
  --accent3: #21a59e;
  --backdrop1: #fffefcef;
  --backdrop2: #f7f3ea28;
}
```

By using variables like so:

```css
body {
  background-color: var(--background1);
  color: var(--foreground1);
}
```

you can change colors globally without updating individual pages.

### Utilizing Color Variants

With multiple variants for each color, we can differentiate similar elements with different levels of importance or different states. For example, headers go from brighter to more muted as they get lower in importance:

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

Likewise, unclicked links should stand out, while clicked ones can fade more into the background. You also want some visual indication that links are being hovered over without being too different from the other link colors:

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
  color: var(--primary3);
}
```

## Main CSS

### Centered Column View

For the main layout, I decided to use a central column to leave some space for the background and to keep the text readable.

TODO

### Edge Gradient

TODO

### 

## Adding a Navbar

TODO

## Adding a Dark Theme Toggle

TODO

## Adding a Dynamic Background

TODO

## Adding a Font

TODO