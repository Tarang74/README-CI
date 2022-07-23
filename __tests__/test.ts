import { parseCODEOWNERS } from "../src/index";

test("Parse CODEOWNERS.", () => {
    const codeowners = ".   @ownerauthor @author1";

    expect(parseCODEOWNERS(codeowners)).toEqual("Thanks to [author1](https://github.com/author1) for the collaboration.\n\n");
});

import { parseCopyright } from "../src/index";

test("Parse copyright (1).", () => {
    const file = `\\usepackage[
    type={CC},
    modifier={by-nc-sa},
    version={4.0},
    imagewidth={5em},
    hyphenation={raggedright}
]{doclicense}`;

    const outputs:Array<string> = parseCopyright(file);

    expect(outputs[0]).toEqual("by-nc-sa");
    expect(outputs[1]).toEqual("4.0");
});

test("Parse copyright (2).", () => {
    const file = `\\usepackage[
    type={CC},
    modifier={by},
    version={4.0},
    imagewidth={5em},
    hyphenation={raggedright}
]{doclicense}`;

    const outputs:Array<string> = parseCopyright(file);

    expect(outputs[0]).toEqual("by");
    expect(outputs[1]).toEqual("4.0");
});

test("Parse copyright (3).", () => {
    const file = `\\usepackage[
    type={CC},
    modifier={by-sa},
    version={4.0},
    imagewidth={5em},
    hyphenation={raggedright}
]{doclicense}`;

    const outputs:Array<string> = parseCopyright(file);

    expect(outputs[0]).toEqual("by-sa");
    expect(outputs[1]).toEqual("4.0");
});

import { formatCopyright } from "../src/index";

test("Format Copyright.", () => {
    const copyright_modifier = "by-nc-sa";
    const copyright_version = "4.0";

    expect(formatCopyright(copyright_modifier, copyright_version))
    .toEqual("---\n\n[![license](https://forthebadge.com/images/badges/cc-nc-sa.svg)](http://creativecommons.org/licenses/by-nc-sa/4.0/)\n\nThis work is licensed under a [Attribution-NonCommercial-ShareAlike 4.0 International License](http://creativecommons.org/licenses/by-nc-sa/4.0/).\r\n");
});
