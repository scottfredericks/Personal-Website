---
title: "Building a Personal Website - Part 1: Using Lume"
---
# Building a Personal Website - Part 1: Using Lume

*See the source repo [here](https://github.com/scottfredericks/Personal-Website).*

The situation: I know enough HTML, CSS, and JavaScript to cobble a few pages together. I have some questionable but working CSS code, and I have an AWS S3 bucket and a custom domain name.

Enter: an early version of my personal website:

![Early version of the website](/img/blog/personal-website-part-1/website-v1.png)

It's... fine. It gets the job done, and it shows potential employers that I know how to Google things.

But I don't want my website to just be *fine*; I want it to be *kind of nice*. So let's do some good old-fashioned overengineering and add some oddly-named tools to my resume.

## Choosing the Tech

### Lume for Static Site Generation

I don't need any server-side logic or persistent state management, so a static site should do the trick. See [Lume's explanation](https://lume.land/docs/overview/why-static-sites/) for more justification. Using a more complex web app framework might provide some good practice, but it would be overkill for the current size of the site.

I could continue using raw HTML and CSS, but that's no fun. I might also want to add a blog at some point (right now, for instance). So let's try out a static site generator.

There are a lot of options, but I ended up using [Lume](https://lume.land/) for a few reasons:

- I wanted to try out Deno (I've used Node briefly and it works, but it can be a bit slow and cluttered).
- I wanted to be able to use TypeScript and React for any client-side logic, mostly just for learning purposes.
- I don't want the site to contain any unnecessary JavaScript, other than logic I explicitly add myself.

### GitHub for Project Management and Hosting

I already have experience using GitLab for Agile-style project management, but it would be troublesome to host a server or pay for a project of this size.

GitHub's free repos and issue tracking are more than enough to track both the code changes, issues, and improvement plans. I don't mind making the code public (that's kind of the point of a dev portfolio), and in this particular case I don't really care if GitHub uses my code to train Copilot. For more sensitive code bases, I might instead use a self-hosted GitLab server or some other paid option.

For any coding project you plan to work on more than once, I recommend using some kind of Git workflow to track and apply changes. Yes, you could just do everything in a single branch, but having a separate issue for each change and having a branch for each issue makes it much easier to track progress over time. Having a searchable and taggable list of issues also makes prioritization easier when planning what to work on next.

Since I'm already using GitHub, I might as well use their free hosting option [GitHub Pages](https://docs.github.com/en/pages). I also already have a custom domain (purchased through godaddy.com), that GitHub Pages will allow using.

AWS S3 also works fine and is fairly inexpensive, but if I can host the site for free, that's even better. Especially if I (hopefully) end up getting more traffic in the future.

## Setting Up Lume

### Installation

OK, let's get started by [installing Lume](https://lume.land/docs/overview/installation/) and setting up the project skeleton.

First, we'll need to [install Deno](https://docs.deno.com/runtime/getting_started/installation/). On Windows, using non-admin PowerShell:

```powershell
irm https://deno.land/install.ps1 | iex
```

Conveniently, this also adds `deno` to the path. Much easier than installing `node`, by the way.

Then, from within the project folder:

```shell
deno run -A https://lume.land/init.ts
```

Note that we're using Lume 3.1.2. The installation options may change in other versions. I went with "Basic" setup, and chose not to install a CMS.

This creates `_config.ts` for Lume and `deno.json` for Deno.

Next, I'll install the optional [Lume CLI](https://lume.land/docs/overview/command-line/) so that Lume commands are a bit shorter to type (e.g. `lume` instead of `deno task lume`):

Finally, I'll install the [Deno](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno) and [Vento Template Support](https://marketplace.visualstudio.com/items?itemName=oscarotero.vento-syntax) extensions for VS Code for syntax highlighting. Vento is just a templating tool that we'll explain later.

```shell
deno install --allow-run --allow-env --allow-read --name lume --force --reload --global https://deno.land/x/lume_cli/mod.ts
```

### Lume Config

Now I'll set some default configurations for Lume. This is all handled in `_config.ts`, which is documented [here](https://lume.land/docs/configuration/config-file/).

There are three things we care about for now:

- Adding a `src` directory so that only files included here are output to the build (which is located at `./_site` by default). We don't want to include the outer README.md or other top-level files since those have other purposes within the repo.
- Having the server open a browser by default when we run `lume -s`.
- Disabling the debug bar.

This gives us the following:

```typescript
import lume from "lume/mod.ts";

const site = lume({
    src: "./src",
    server: {
        open: true,
        debugBar: false,
    },
});

export default site;
```

The other defaults are fine for now.

## Creating the Project Structure

### Adding a Page

Now that Lume is configured, we can start adding content and defining a basic structure.

First, we need to create a `src` folder where everything will live.

Within it, Lume will automatically discover [`.md`](https://www.markdownguide.org/) files and generate HTML using them. To start, let's create a simple `index.md`, which takes the place of `index.html` for a usual site:

```md
# Scott Fredericks

I'm a programmer guy.

I do stuff.
```

Now we can view our site by building it and starting a server (`lume -s`). Additionally, we can set the server to automatically watch for file changes (`-w`), so that whenever we change our source or config files, the website updates automatically. Now we can keep the command running in the background while we make edits. Let's run:

```shell
lume -s -w
```

This generates a very basic HTML file at the site root and opens it in the browser:

![Viewing in the browser for the first time](/img/blog/personal-website-part-1/index_page_in_browser.png)

If you're not familiar with Markdown, it's just a simple markup language that's liked by developers because it's easy to edit from a text editor, and it's easy to picture how the rendered version will look based on the text version. For example, this Markdown:

```md
# Level One Header

Summary Text

## Level Two Header

- Item 1
  - Item 1.1
  - Item 1.2
    - Item 1.2.1
- Item 2
- Item 3
```

produces this HTML:

```html
<h1>Level One Title</h1>
<p>Summary Text</p>
<h2>Level Two Title</h2>
<ul>
  <li>Item 1 <ul>
      <li>Item 1.1</li>
      <li>Item 1.2 <ul>
          <li>Item 1.2.1</li>
        </ul>
      </li>
    </ul>
  </li>
  <li>Item 2</li>
  <li>Item 3</li>
</ul>
```

and looks like this in the browser:

![Markdown conversion](/img/blog/personal-website-part-1/markdown_conversion.png)

OK, it works! But it's very ugly. We should add some CSS to make it less ugly. But before we can do that, we need to understand how Lume handles layouts, templates, and other resources (including CSS files).

### Applying a Layout

Lume uses a JavaScript-based templating engine called [Vento](https://vento.js.org/). If you've never used a templating tool before, the basic idea is that you create template files that are similar to the final output, but within those templates you use code-based expressions instead of the actual content. Then, the temlpating engine "renders" the final output by injecting the result of those expressions into the template and spitting out the final version.

For example, the following template code:

```html
<p>Hello, {{ name }}. Your age is {{ currentYear - birthYear }}.</p>
```

might produce this HTML code:

```html
<p>Hello, John. Your age is 21.</p>
```

Here, anything within the double curly braces `{{` and `}}` is treated as JavaScript code and converted to a string literal, which in turn becomes part of the output HTML.

This makes it easy to re-use parts of a file that stay the same (like the boilerplate elements in an HTML file) while making the other content dynamic (like the main text of a blog article). This becomes more relevant the more pages you have in your site; if you need to update the theme for 20 pages, templating allows you to update a single template file instead of updating all 20 pages separately.

Let's use a template to define the basic HTML structure that most of our pages will use. Template files are expected to live in the `_includes` folder, so let's create a file called `src/_includes/main.html.vto`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>{{ title }}</title>
  </head>
  <body>
    <h1>Main Layout - Added by Vento</h1>
    {{ content }}
  </body>
</html>
```

Note the `.html.vto` extension. Really, the file extension is just `.vto`, which is used for Vento template files. But using `.html.vto` is good practice since it indicates the file type for the output file. This makes each template easier to distinguish from files other types, for example if we wanted a `main.css.vto` file.

In our case, we want to use the variables `title` and `content`. `title` is just a regular variable that we will define within the `index.md` file. `content` is a built-in variable that stores the result of converting the source file (`index.md`) to the template file type (HTML).

Next, to have our `index.md` file use this layout, we can specify the built-in `layout` variable at the top of `index.md` like so:

```md
---
layout: blog_article.html.vto
title: Scott Fredericks - About Me
---
```

Note that `title` here is also a variable, but it doesn't have the same built-in meaning like `layout` does. You can define whatever other variables you like and use them within temlpate files.

Now the page includes the `h1` element added by the layout, and uses the page title defined at the top of `index.md`:

![HTML using a Vento layout](/img/blog/personal-website-part-1/html_vento_layout.png)

### Default Data

Lume also has a way to define directory-level default variable values, so that we don't need to include the `layout` line for every file. This way, you don't risk forgetting to update the layout line when making changes. We can do this by creating a file named `_data.yml` in the directory that we want to apply the defaults in. Let's create `src/_data.yml`:

```yml
layout: blog_article.html.vto
```

Now we can remove the `layout` line from the top of `index.html`, since a default value will now be pulled from `_data.yml`. If you reload the page, you'll see that the layout is still applied.

This extends to all child directories by default, but it can be overridden by putting another `_data.yml` file within the child directories you want to override. For example, if you want a `blog` directory where all of the articles use a different layout, you can create `src/blog/_data.yml`:

```yml
layout: blog_article.html.vto
```

All files in that directory would then use the layout defined in `src/_includes/blog_article.vto`.

### Adding Resources

#### Adding CSS

OK, now we know how to use (and re-use) HTML. Now let's add some CSS.

Other than the option to use templating, CSS works the same way it does outside of Lume. Let's add a CSS file at `src/css/main.css`. The exact filename doesn't matter; I just like this convention because it keeps CSS files separate and indicates their purpose. For now we'll just specify a font:

```css
body {
    font-family: monospace; /* Gotta look like a developer */
}
```

Now we can link the CSS file in the usual way within the HTML temlpate file, by adding a `link` element within the `head` and specifying the CSS file to use:

```html
  <head>
    ...
    <link rel="stylesheet" href="css/main.css" />
    ...
  </head>
```

By default, Lume only looks for certain file types (like `.md` and `.yml`) within the source directory, so we need to specify any other files (like CSS) that we want to add. To do this, we add a line in `_config.ts`:

```typescript
site.add("/css");
```

This recursively adds all files in the `src/css` folder.

Now `css/main.css` should be added to the `_site` folder, and we should see the updated styling in the output:

![HTML with CSS](/img/blog/personal-website-part-1/html_with_css.png)

Note that when we apply styling, we want to target the HTML elements that get generated in the final output, and not the literal contents of the Markdown files themselves. Remember: the website consists of everything that gets output to the `_site` folder, and nothing else.

#### Adding JavaScript

JavaScript works more or less the same way; we can add all JavaScript files within a `src/js` folder, and add these files using another line in `_config.ts`:

```typescript
site.add("/js");
```

Then we can reference these js files using the `<script>` element like we would normally.

#### Adding Images

Images are slightly different since we are using Markdown instead of HTML. It's still pretty simple though. You can add images within `md` files using the following syntax:

```md
![alt text](/img/image.png)
```

Here, we expect an image to exist at `src/img/image.png`. Note the `/` before the file path, which is necessary to reference the output root. We can also specify custom [alt text](https://www.w3schools.com/tags/att_img_alt.asp), which is used in the event that the image does not load correctly.

Like with CSS and JavaScript, we need to add the image files to the build, using another line in `_config.ts`:

```typescript
site.add("/img");
```

This will insert an `<img>` tag using the image into the output HTML.

Great! After all of this setup, we have all of the same functionality that raw HTML/CSS/JavaScript has, but now with templating and live updates. Now we can focus on the actual content of the site.
