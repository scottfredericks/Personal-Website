---
title: "Building a Personal Website - Part 2: Designing a Theme"
date: 2026-01-06 12:00
tags: [blog_article]
---

# Building a Personal Website - Part 2: Designing a Theme

_See the source repo
[here](https://github.com/scottfredericks/Personal-Website)._

## Inspiration

The layout for my old website was a bit boring. I like simplicity and neutral
tones, but I wanted more individuality and better use of accents. I also wanted
to combine the unique parts of my background in a sleek, modern way.

I've had Alaska on my mind lately, and being
[Unangax̂](https://en.wikipedia.org/wiki/Aleuts) (an Alaska native from the
Aleutian islands, AKA "Aleut"), I wanted to see if I could incorporate some of
the traditional art style into the design.

This style uses a few traditional colors including black, red, teal, white, and
to a lesser extent brown or faded orange as a stand-in for wood or hide. The
shapes tend to be large, swirling, almost psychadelic patterns that ending in
curves, spirals, or sharp points. Here's a traditional hunting hat to give you
the general idea:

![Aleut Hunting Hat](https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Hunting_hat%2C_Aleut_-_Ethol%C3%A9n_collection%2C_Museum_of_Cultures_%28Helsinki%29_-_DSC04917.JPG/960px-Hunting_hat%2C_Aleut_-_Ethol%C3%A9n_collection%2C_Museum_of_Cultures_%28Helsinki%29_-_DSC04917.JPG)

At the same time, I wanted to give a modern sense of digitality and general
"computer-y-ness", with some inspiration from physics and computational science.
I also really like the simplicity of a dark theme with a gradient, as
demonstrated in
[Brittany Chang's portfolio website](https://brittanychiang.com/).

I ended up with some JavaScript code to procedurally generate a maze-like
pattern with traditional Aleut colors. I also decided to add a dark gradient
over the top to reduce the sense of clutter, and to use light brown as an accent
color in the foreground. This background can be rendered in a canvas element in
the background, with the rendering logic in a separate script file.

## CSS

We also want the background to stay fixed while the rest of the content scrolls
over it. We can use `position::fixed` to keep the canvas separate from the rest
of the rendering, and make the canvas take up 100% of the screen.

This can be added to the main HTML template with just a few lines:

```html
TODO
```

## Adding a Blog Post

TODO

## Automating the Build

TODO

## Setting up GitHub Pages

TODO

## Using a Custom Domain

TODO
