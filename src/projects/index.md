---
title: Projects
---

# Projects

## Personal Website (Lume)

TODO

## PyXtal

TODO

## Wave Equation Simulation

![2D wave equation simulation](/img/projects/wave.gif)

The [wave equation](https://en.wikipedia.org/wiki/Wave_equation) is one of the most fundamental equations in physics and mathematics. It describes how disturbances (aka "waves") move through a medium (like water, solid material, or space itself). In other words, if you "shake" something, the wave equation tells you how the resulting waves move around. This gives a good approximation for many real-world phenomena, including light and radio waves, sound, ocean waves, and gravitational waves.

My simulation code currently includes:

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
