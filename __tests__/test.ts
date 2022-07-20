import { parseCODEOWNERS } from "../src/index";

test("Parse CODEOWNERS.", () => {
    const CODEOWNERS = ".   @ownerauthor @author1";

    expect(parseCODEOWNERS(CODEOWNERS)).toEqual("Thanks to [author1](https://github.com/author1) for the collaboration.\n\n");
});
