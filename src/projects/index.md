---
title: Projects
url: /projects/
---

# Projects

A selection of professional and independent work, spanning multiple fields.{: style="text-align: center;"}

## End-to-End Test Automation Framework

_**Tech**: Python, JavaScript, gRPC, pytest, industrial protocols_

Testing the [Canvas](https://www.cimon.com/software/canvas) software suite at [CIMON](https://www.cimon.com/) required validating complex interactions across desktop environments and proprietary industrial hardware.

To bridge the gap between unit tests and real-world usage, I engineered a Python-based end-to-end test framework to run projects on real devices and collect the execution results. This involved:

<!-- - a Python library to generate project files based on the schema
- JavaScript injection for execution-time logic and function-level testing
- real-time tag-based communication using various industrial protocols
- gRPC for deployment
- pytest for final collection and reporting -->

- **Schema-Based Generation**: A Python library to generate complex project files dynamically.
- **Runtime Logic**: JavaScript injection for function-level validation.
- **Hardware Communication**: Real-time interactions using various industrial protocols.
- **Automated Reporting**: Integrated `pytest` for collection and analysis.

<!-- By making the project and test generation scriptable, we were able to cover a large number of complex test cases using a relatively small testing code base. -->

## Automated Cross-Platform Packaging

_**Tech**: Python, AWS S3, MSI, pkg, Bash, Visual Basic, WiX Toolset, pkgbuild_

Deployment for [Canvas](https://www.cimon.com/software/canvas) required MSI (Windows) and pkg (macOS) installers. Existing CLI tools used fragile commands that were difficult to maintain across project changes.

To solve this, I developed an internal Python library to automate the release pipeline. The system collected the binaries, packaged them into installers, and uploaded them for public use. This simplified the basic release workflow to specifying the version for each component.

A key feature was the ability to define custom logic for each component using standard Python code. This made it easy to modify specific files conditionally based on the platform, language, build flags, and other variables.

Other features included white label branding support, S3 upload/download, multi-language translation, and automated Apple code signing.

## Personal Website

_**Tech**: HTML, CSS, JavaScript, Lume, AWS S3_

![Personal website logo](/img/sflogo.svg){: style="max-width: 15%;" }

This website was created using the static site generator [Lume](https://lume.land/) with custom HTML, CSS, and JavaScript. You can find the source code [on GitHub](https://github.com/scottfredericks/Personal-Website).

Hosting is provided by [GitHub Pages](https://docs.github.com/en/pages). Older versions used an [AWS S3](https://aws.amazon.com/s3/) bucket.

I also have some blog articles describing the site's creation in greater detail:

- [Building a Personal Website - Part 1: Using Lume](/blog/personal-website-part-1/)

## PyXtal (Research Assistant at UNLV)

_**Tech**: Python, NumPy, unittest, Sphinx, Slurm_

![PyXtal logo](/img/projects/pyxtal_logo.png){: style="background:white;" }

[PyXtal](https://github.com/MaterSim/PyXtal) is an open-source Python library for [crystal structure prediction](https://en.wikipedia.org/wiki/Crystal_structure_prediction). It introduced a novel algorithm for generating molecular crystal structures with user-defined symmetry constraints. It was created in collaboration with [Dr. Qiang Zhu](https://qzhu2017.github.io/) for my masters thesis, and is now maintained by his research group. The library is available for installation via `pip` on [PyPi](https://pypi.org/project/pyxtal/).

The research was peer-reviewed and published in ScienceDirect: ["PyXtal: A Python library for crystal structure generation and symmetry analysis"](https://doi.org/10.1016/j.cpc.2020.107810).

This project served as my transition from academic research to software engineering. Beyond the core algorithms, I established the project's development standards, including version control, unit testing, package distribution (`PyPi`), and automated documentation.

<details>

<summary><h3 style="display: inline-block;">Expand for Details</h3></summary>

Crystals are materials that consist of the same pattern of atoms repeated throughout 3D space, on a grid of boxes called unit cells. To describe a specific crystal structure, you just need to define the size and shape of the unit cell, plus the type and positions of atoms within the cell. In practice, most crystals have additional symmetry, for example rotation or reflection. This symmetry is described using a branch of mathematics called [group theory](https://en.wikipedia.org/wiki/Group_theory), and it turns out there are 230 distinct [space groups](https://en.wikipedia.org/wiki/Space_group) that a crystal structure might fall into.

Scientists are aware that real crystals tend to have high symmetry. So in order to predict the structure of new materials, it is reasonable to guess possible space groups first, then insert atoms in a way that preserves the symmetry of those space groups. The basic idea is to generate a large number of random crystal structures in this way, then optimize them using [force-field methods](https://en.wikipedia.org/wiki/Force_field_(chemistry)) or [DFT](https://en.wikipedia.org/wiki/Density_functional_theory) to calculate their energies. The structure with the lowest total energy is the one that is most likely to exist in the real world. Using computer simulations to do this is often much faster and cheaper than running physical experiments.

To ensure that symmetry is preserved when adding atoms, we can look at special positions within the unit cell called [Wyckoff positions](https://en.wikipedia.org/wiki/Wyckoff_positions). Wyckoff positions define what symmetry is needed for objects located at different locations in the cell. To visualize this, imagine cutting out holes on a paper snowflake before unfolding it. If you cut a hole in the middle corner where two edges meet, you will end up with a single hole after unfolding. Mathematically, this is because the corner is a high-symmetry Wyckoff position. If you instead cut a hole in the middle of the paper, away from the edges, then you will end up with multiple holes after unfolding. We can apply the same idea to construct a symmetrical crystal. When we want to insert an atom into a Wyckoff position, we can make sure that the result is still symmetrical by making copies of that atom in the right places (e.g. by "unfolding the snowflake").

Doing this for [molecular crystals](https://en.wikipedia.org/wiki/Molecular_solid) is trickier, because you have to worry about the orientations of the molecules in addition to their positions. For example, imagine that instead of cutting a circular hole in the corner of the snowflake (similar to an atom), you instead cut out a letter of the alphabet (similar to a molecule). Now if you were to unfold the paper, you would end up with a shape that didn't match the original. Analogously, putting an asymmetrical molecule in a symmetrical Wyckoff position would result in extra atoms that didn't match the desired molecular structure. PyXtal solves this problem by automatically detecting molecular symmetry and determining which Wyckoff positions are compatible with which molecular orientations.

</details>

## Wave Equation Simulation

_**Tech**: Rust, Macroquad, C++, SDL, Lua, Love2D_

![2D wave equation simulation](/img/projects/wave.gif){ loading="lazy" }

The [wave equation](https://en.wikipedia.org/wiki/Wave_equation) is one of the most fundamental equations in physics and mathematics. It describes how disturbances (aka "waves") move through a medium (like water, solid material, or space itself). In other words, if you "shake" something, the wave equation tells you how the resulting waves move around. This gives a good first-order approximation for many real-world phenomena, including light and radio waves, sound, and ocean waves.

The wave equation is also well-suited for numerical simulation, and is a good starting point for learning computational physics.

I've revisited this simulation several times with different languages and graphics frameworks to compare their performance:

- a [2D version](https://github.com/scottfredericks/rust-wave-2d) using Rust and [Macroquad](https://macroquad.rs/)
- a [2D version](https://github.com/scottfredericks/Wave2D) using C++ and [SDL](https://www.libsdl.org/)
- a [1D version](https://github.com/scottfredericks/StringLove2D) (a 1D string moving in 2D space) using Lua and [Love2D](https://love2d.org/)

<details>

<summary><h3 style="display: inline-block;">Expand for Details</h3></summary>

Simulating the wave equation works by splitting space up into a grid of tiny cells. You define the value of the field (the quantity you care about, like height, pressure, etc.) at each cell, as well as how quickly the value is changing there (the "velocity"). Then you start moving forward in time by small steps. For every time step, at each cell, you update the field value using the velocity, and you update the velocity using the acceleration.

This is a basic example of converting a differential equation into a [cellular automaton](https://en.wikipedia.org/wiki/Cellular_automaton). This technique can also be applied to more complicated equations, and is widely used in computational physics.

For the wave equation specifically, the acceleration is proportional to the second spatial derivative (the ["Laplacian"](https://en.wikipedia.org/wiki/Laplace_operator)) of the field value. On a 2D grid, this can easily be calculated by comparing the value at each cell to the sum of its neighbors.

One nice property of the wave equation is that it is easy to extend to higher dimensions. The method for simulating a 3D system is basically the same as for 1D or 2D. You can even simulate a lower-dimensional object waving around in a higher-dimensional space. The simplicity of the calculation also makes it easy to code and suitable for running on a GPU.

One big challenge is ensuring [numerical stability](https://en.wikipedia.org/wiki/Numerical_stability). If your cells or your time steps are too large, the simulation tends to "blow up" into chaotic noise. But if you go too small, you'll be doing more computation than you need to. To find the right balance, the [CFL conditions](https://en.wikipedia.org/wiki/Courant%E2%80%93Friedrichs%E2%80%93Lewy_condition) can be used to determine how big your step sizes can be without losing stability.

</details>

## Gravity Pong

_**Tech**: Lua, Love2D_

![PongLove2D screen capture](/img/projects/pong_love2d.gif){ loading="lazy" style="max-width: 40%;" }

A physics-based Pong clone with a gravity vector that changes over time. Created using Lua and [Love2D](https://love2d.org/). Uses the mouse for control and has 8-bit sound effects generated using [jsfxr](https://sfxr.me/) and [LMMS](https://lmms.io/).

You can play on Windows by cloning or downloading the [GitHub repo](https://github.com/scottfredericks/PongLove2D) and running the `exe` file.
