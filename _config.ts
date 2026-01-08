import lume from "lume/mod.ts";
import date from "lume/plugins/date.ts"; // Used by blog list

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

site.add("/css");
site.add("/js");
site.add("/img");

site.use(date());

export default site;
