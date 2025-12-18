import lume from "lume/mod.ts";

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

export default site;
