---
title: Projects
---

# Projects

## Automated Test Project Generation and Deployment

TODO

## Personal Website

![Personal website logo](/img/sflogo.svg){: style="max-width: 15%;" }

This website was created using the static site generator [Lume](https://lume.land/) with custom HTML, CSS, and JavaScript. You can find the source code on GitHub [here](https://github.com/scottfredericks/Personal-Website).

Hosting is provided by [GitHub Pages](https://docs.github.com/en/pages). Older versions used an [AWS S3](https://aws.amazon.com/s3/) bucket.

I also have some blog articles describing the site's creation in greater detail:

- [Building a Personal Website - Part 1: Using Lume](/blog/personal-website-part-1/)

## PyXtal

![PyXtal logo](/img/projects/pyxtal_logo.png){: style="background:white;" }

[PyXtal](https://github.com/MaterSim/PyXtal) is an open-source Python library for [crystal structure prediction](https://en.wikipedia.org/wiki/Crystal_structure_prediction), specializing in generating high-symmetry molecular crystals. It is available for installation via `pip` on [PyPi](https://pypi.org/project/pyxtal/). I also published a [paper in ScienceDirect](https://doi.org/10.1016/j.cpc.2020.107810) summarizing the research.

This was my first major dive into version control, issue tracking, packaging, unit testing, and automated documentation (see the [readthedocs](https://pyxtal.readthedocs.io/en/latest/)).

This project was created in collaboration with [Dr. Qiang Zhu](https://qzhu2017.github.io/) for my masters thesis, and is now maintained by his research group.

<details>

<summary>Technical Details</summary>

Crystals are materials that consist of the same pattern of atoms repeated throughout space on a 3D grid. To define a specific crystal, you just need to define the size and shape of the unit cell, plus the type positions of atoms within the cell. In practice, most crystals have additional symmetry, for example rotation or reflection. This symmetry is described using a branch of mathematics called [group theory](https://en.wikipedia.org/wiki/Group_theory), and it turns out there are 230 distinct [space groups](https://en.wikipedia.org/wiki/Space_group) that a crystal structure might fall into.

Scientists are aware that real crystals tend to have high symmetry, so in order to predict the structure of new materials, it is reasonable to guess possible space groups first, then insert atoms in a way that preserves the symmetry. The idea is to generate a large number of random crystal structures in this way, then optimize them using [force-field methods](https://en.wikipedia.org/wiki/Force_field_(chemistry)) or [DFT](https://en.wikipedia.org/wiki/Density_functional_theory) and compare their energies. The structure with the lowest total energy is the one that is most likely to exist in the real world.

To ensure that symmetry is preserved, we can look at special positions within the unit cell called [Wyckoff positions](https://en.wikipedia.org/wiki/Wyckoff_positions). Wyckoff positions define what symmetry is needed for objects located at different locations. To visualize this, imagine cutting out holes on a paper snowflake before unfolding it. If you cut a hole in the middle corner where two edges meet, you will end up with a single hole after unfolding, because the corner is a high-symmetry location. If you instead cut a hole in the middle of the paper, away from the edges, then you will end up with multiple holes after unfolding. We can apply the same idea to construct a symmetrical crystal. When we want to insert an atom into a Wyckoff position, we can make sure that the result is still symmetrical by making copies of that atom in the right places (e.g. by "unfolding the snowflake").

Doing this with [molecular crystals](https://en.wikipedia.org/wiki/Molecular_solid) is a bit trickier, since you have to worry about the orientations of the molecules in addition to their positions. For example, imagine that instead of cutting a circular hole in the corner of the snowflake, you instead cut out a lightning bolt extending outward. Now if you unfold the paper, you would end up with a shape that doesn't match the original. In the case of a molecular crystal, this would correspond to having molecules you don't want. PyXtal solves this problem by automatically detecting molecular symmetry and determining which Wyckoff positions and orientations are compatible. The user just needs to specify the number and type of molecules or atoms and the space groups they want to check, and PyXtal will randomly generate crystal structures matching those conditions.

</details>

## Wave Equation Simulation

![2D wave equation simulation](/img/projects/wave.gif)

The [wave equation](https://en.wikipedia.org/wiki/Wave_equation) is one of the most fundamental equations in physics and mathematics. It describes how disturbances (aka "waves") move through a medium (like water, solid material, or space itself). In other words, if you "shake" something, the wave equation tells you how the resulting waves move around. This gives a good approximation for many real-world phenomena, including light and radio waves, sound, ocean waves, and gravitational waves.

I've worked on a few different simulations using various languages and GUI frameworks over the years:

- a [2D Rust version](https://github.com/scottfredericks/rust-wave-2d) using [Macroquad](https://macroquad.rs/)
- a [2D C++ version](https://github.com/scottfredericks/Wave2D) using [SDL](https://www.libsdl.org/)
- a [1D Lua version](https://github.com/scottfredericks/StringLove2D) using [Love2D](https://love2d.org/).

<details>

<summary>Technical Details</summary>

Simulating the wave equation works by splitting space up into a grid of tiny cells. You define the value of the field (the quantity you care about, like height, pressure, etc.) at each cell, as well as how quickly the value is changing at that cell (the "velocity"). Then you start moving forward in time by small steps. At each time step, at each cell, you update the field value using the velocity, and you update the velocity using the acceleration.

For the wave equation, the acceleration is proportional to the second spatial derivative (the ["Laplacian"](https://en.wikipedia.org/wiki/Laplace_operator)) of the field value. On a 2D grid, this can easily be calculated by taking (the value on the right minus the value on the left) plus (the value above minus the value below). This is a basic example of converting a differential equation into a [cellular automaton](https://en.wikipedia.org/wiki/Cellular_automaton). This technique can also be applied to more complicated equations, and is widely used in computational physics.

One nice property of the wave equation is that it extends very nicely to higher dimensions. The method for simulating in 3D is basically the same as in 1D or 2D. You can even simulate a lower-dimensional object waving around in a higher-dimensional space. The simplicity of the calculation also makes it easy to code and suitable for running on a GPU.

One big challenge is ensuring [numerical stability](https://en.wikipedia.org/wiki/Numerical_stability). If your cells or your time steps are too large, the simulation tends to "blow up" into a static-y mess. But if you go too small, you'll be doing more computation than you need to. The [CFL conditions](https://en.wikipedia.org/wiki/Courant%E2%80%93Friedrichs%E2%80%93Lewy_condition) tell you how big your step sizes can be without losing stability.

</details>

## Pong (Love2D)

![PongLove2D screen capture](/img/projects/pong_love2d.gif){: style="max-width: 40%;" }

A simple Pong clone, but with gravity whose direction rotates over time. Uses the mouse for control and has 8-bit sound effects.

Created using Lua and [Love2D](https://love2d.org/). Unfortunately I no longer have the source code, but you can still download and play the `exe` from the [GitHub repo](https://github.com/scottfredericks/PongLove2D).

## Possible Future Projects

No promises, but here are some projects I might work on at some point:

- AI-powered job search app using Tauri and React/TypeScript
  - Emphasis on finding high-alignment jobs based on user preferences and natural language reasoning
  - Use models that preserve user privacy, from companies that practice AI safety
  - Use a user-provided, locally stored OpenRouter API key to simplify setup, deployment, and billing
  - Never submit job applications or communications automatically, and encourage the user to review all AI-generated materials before submission
  - Nice-to-have: in-software, layout-aware, interactive AI-powered generation and editing of resumes and other documents
- Educational videos for physics and mathematics
  - Emphasis on deep conceptual understanding by breaking complex ideas into accessible pieces
  - Focus on abstract foundational topics, rather than popular descriptions or application
  - Heavy use of scripting for visualizations
- Indie game dev
  - Frameworks: [PICO-8](https://www.lexaloffle.com/pico-8.php), [Godot](https://godotengine.org/), [Bevy](https://bevy.org/), [pygame](https://www.pygame.org/news)
  - Genres: simulation, survival, RPG, arcade
