import lume from "lume/mod.ts";
import date from "lume/plugins/date.ts"; // Used by blog list
import esbuild from "lume/plugins/esbuild.ts"; // Minify and bundle JS and TS
import inline from "lume/plugins/inline.ts"; // Inline CSS and JS from separate files
import lightningCss from "lume/plugins/lightningcss.ts"; // Minify CSS
import minifyHTML from "lume/plugins/minify_html.ts"; // Minify HTML
import svgo from "lume/plugins/svgo.ts"; // Minify SVG

const site = lume({
  src: "./src",
  // dest: "./_site",
  // emptyDest: false,
  // location: new URL("https://www.scottfredericks.com/"),
  // prettyUrls: false,
  server: {
    open: true,
    debugBar: false,
  },
});

site.add([".css"]);
site.add([".js"]);
site.add([".svg"]);
site.add("/fonts");
site.add("/img");

site.use(date());
site.use(esbuild());
site.use(lightningCss());
site.use(inline());
site.use(minifyHTML({
  options: {
    minify_css: true,
    minify_js: true,
  },
}));
site.use(svgo());

export default site;
