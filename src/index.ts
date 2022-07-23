import { getInput, info, setFailed, warning } from "@actions/core";
import { context, getOctokit } from "@actions/github";

// Type information
import { GitHub } from "@actions/github/lib/utils";

async function run() {
    // Get client and context
    const client = getOctokit(getInput("GITHUB_TOKEN", { required: true }));
    const levelMacro = getInput("LEVEL_MACRO", { required: true });

    if (context.payload.repository == null) throw new Error("No repository found.");

    // Repository name should match the name of the unit
    const UNIT_CODE = context.payload.repository.name;

    // Get the contents of the LaTeX source code
    const lectureNotesContents = await fetchFileContents(client, `${UNIT_CODE} Lecture Notes.tex`);
    const examNotesContents = await fetchFileContents(client, `${UNIT_CODE} Exam Notes.tex`);
    if (lectureNotesContents == null && examNotesContents == null) {
        return setFailed("No LaTeX source files were found.");
    }

    // Get the contents of the CODEOWNERS file
    const CODEOWNERSContents = await fetchFileContents(client, "CODEOWNERS");
    if (CODEOWNERSContents == null) {
        return setFailed("No CODEOWNERS file was provided.");
    }

    // Prepare the contents of the README file (output)
    let WHICH_NOTES = "";
    let DOWNLOADS = "";

    const CONTRIBUTORS = parseCODEOWNERS(CODEOWNERSContents);
    let UNIT_NAME = "";
    let UNIT_TIME = "";
    let UNIT_COORDINATOR = "";

    let COPYRIGHT = "";
    let COPYRIGHT_TYPE: Array<string> = [];
    let COPYRIGHT_MODIFIER = "";
    let COPYRIGHT_VERSION = "";

    let CONTENTS_LIST: Array<string> = [];
    let CONTENTS = "";

    if (lectureNotesContents != null && examNotesContents != null) {
        WHICH_NOTES = "**lecture notes** and **exam notes**";
        DOWNLOADS = `Lecture notes download: [${UNIT_CODE} Lecture Notes PDF](https://www.github.com/${context.payload.repository.owner.name}/${context.payload.repository.name}/raw/main/${UNIT_CODE}%20Lecture%20Notes.pdf)\n\nExam notes download: [${UNIT_CODE} Exam Notes PDF](https://www.github.com/${context.payload.repository.owner.name}/${context.payload.repository.name}/raw/main/${UNIT_CODE}%20Exam%20Notes.pdf)`;
    } else if (lectureNotesContents != null) {
        WHICH_NOTES = "**lecture notes**";
        DOWNLOADS = `Lecture notes download: [${UNIT_CODE} Lecture Notes PDF](https://www.github.com/${context.payload.repository.owner.name}/${context.payload.repository.name}/raw/main/${UNIT_CODE}%20Lecture%20Notes.pdf)`;
    } else if (examNotesContents != null) {
        WHICH_NOTES = "**exam notes**";
        DOWNLOADS = `Exam notes download: [${UNIT_CODE} Exam Notes PDF](https://www.github.com/${context.payload.repository.owner.name}/${context.payload.repository.name}/raw/main/${UNIT_CODE}%20Exam%20Notes.pdf)`;
    }

    if (lectureNotesContents != null) {
        UNIT_NAME = parseUnitName(lectureNotesContents);
        UNIT_TIME = parseTime(lectureNotesContents);
        UNIT_COORDINATOR = parseUC(lectureNotesContents);
        COPYRIGHT_TYPE = parseCopyright(lectureNotesContents);
        CONTENTS_LIST = parseContents(lectureNotesContents, levelMacro);
    } else if (examNotesContents != null) {
        UNIT_NAME = parseUnitName(examNotesContents);
        UNIT_TIME = parseTime(examNotesContents);
        UNIT_COORDINATOR = parseUC(examNotesContents);
        COPYRIGHT_TYPE = parseCopyright(examNotesContents);
        CONTENTS_LIST = parseContents(examNotesContents, levelMacro);
    }
    COPYRIGHT_MODIFIER = COPYRIGHT_TYPE[0];
    COPYRIGHT_VERSION = COPYRIGHT_TYPE[1];
    COPYRIGHT = formatCopyright(COPYRIGHT_MODIFIER, COPYRIGHT_VERSION);
    CONTENTS = formatContents(CONTENTS_LIST);

    const file_contents = formatOutput(UNIT_CODE, UNIT_NAME, UNIT_COORDINATOR, UNIT_TIME, DOWNLOADS, CONTRIBUTORS, WHICH_NOTES, CONTENTS, COPYRIGHT);

    pushFile(client, file_contents);
}

async function fetchFileContents(client: InstanceType<typeof GitHub>, filename: string): Promise<string | null> {
    let output: string | null = null;

    if (context.payload.repository == null) throw new Error("No repository found.");
    if (context.payload.repository.owner.name == null) throw new Error("No repository name found.");

    await client
        .request("GET /repos/{owner}/{repo}/contents/{path}", {
            owner: context.payload.repository.owner.name,
            repo: context.payload.repository.name,
            path: filename,
            ref: context.sha
        })
        .then((onfulfilled) => {
            if (onfulfilled.status == 200) {
                const buffer = Buffer.from(
                    onfulfilled.data["content"],
                    onfulfilled.data["encoding"]
                );
                output = buffer.toString();
            }
        })
        .catch(() => {
            warning(`${filename} was not found.`);
        });

    return output;
}

export function parseCODEOWNERS(s: string): string {
    let output = "";
    const lines = s.split(/\r?\n/);
    const usernames: Array<string> = [];

    lines.forEach((v) => {
        v = v.trim();

        // Skip if comment
        if (v.startsWith("%")) {
            return;
        }

        const ignoreComments = v.split("#")[0];

        const temp_usernames = ignoreComments.match(
            /@([a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38})/gi
        );
        if (temp_usernames == null) return;

        temp_usernames.forEach((u) => {
            usernames.push(u.slice(1));
        });
    });

    const usernamesSet = new Set(usernames);
    let usernamesArray = [...usernamesSet];
    usernamesArray = usernamesArray.slice(1);

    if (usernamesArray.length > 1) {
        let usernamesText = "";

        usernamesArray.forEach((u, i) => {
            if (i == usernamesArray.length - 1) {
                usernamesText += `and [${u}](https://github.com/${u})`;
            } else {
                if (usernamesArray.length == 2) {
                    usernamesText += `[${u}](https://github.com/${u}) `;
                } else {
                    usernamesText += `[${u}](https://github.com/${u}), `;
                }
            }
        });

        output = `Thanks to ${usernamesText} for the collaboration.\n\n`;
    } else if (usernamesArray.length == 1) {
        output = `Thanks to [${usernamesArray[0]}](https://github.com/${usernamesArray[0]}) for the collaboration.\n\n`;
    }

    return output;
}

export function parseUnitName(s: string): string {
    const regex = /(?!(?<=(?<!\\)(?:\\{2})*)%) *\\newcommand{\\unitName}{([\w .,]*)}/gm;
    let output = "";

    const match = regex.exec(s);
    if (match != null) {
        output = match[1];
    }

    return output;
}

export function parseTime(s: string): string {
    const regex = /(?!(?<=(?<!\\)(?:\\{2})*)%) *\\newcommand{\\unitTime}{([\w .,]*)}/gm;
    let output = "";

    const match = regex.exec(s);
    if (match != null) {
        output = match[1];
    }

    return output;
}

export function parseUC(s: string): string {
    const regex = /(?!(?<=(?<!\\)(?:\\{2})*)%) *\\newcommand{\\unitCoordinator}{([\w .,]*)}/gm;
    let output = "";

    const match = regex.exec(s);
    if (match != null) {
        output = match[1];
    }

    return output;
}

export function parseCopyright(s: string): Array<string> {
    const modifierRegex = /(?!(?<=(?<!\\)(?:\\{2})*)%) *modifier={([a-zA-Z-]*)}/gm;
    const versionRegex = /(?!(?<=(?<!\\)(?:\\{2})*)%) *version={(\d\.0)}/gm;

    const output: Array<string> = [];

    const modifierMatch = modifierRegex.exec(s);
    if (modifierMatch != null) {
        output.push(modifierMatch[1]);
    }

    const versionMatch = versionRegex.exec(s);
    if (versionMatch != null) {
        output.push(versionMatch[1]);
    }

    return output;
}

export function parseContents(s: string, levelMacro: string): Array<string> {
    const regex = new RegExp(`(?!(?<=(?<!\\\\)(?:\\\\{2})*)%) *\\\\${levelMacro}{(.*?)}`, "gm");
    const output: Array<string> = [];

    let match = regex.exec(s);
    while (match != null) {
        output.push(match[1]);
        match = regex.exec(s);
    }

    return output;
}

export function formatCopyright(copyrightModifier: string, copyrightVersion: string): string {
    copyrightModifier = copyrightModifier.toLowerCase();

    let modifierText = "";
    let versionText = "";

    const licenseURL = `http://creativecommons.org/licenses/${copyrightModifier}/${copyrightVersion}/`;
    let iconBadge = "";

    switch (copyrightVersion) {
        case "1.0":
            versionText = "1.0 Generic";
            break;
        case "2.0":
            versionText = "2.0 Generic";
            break;
        case "3.0":
            versionText = "3.0 Unported";
            break;
        case "4.0":
            versionText = "4.0 International";
            break;
    }

    switch (copyrightModifier) {
        case "by":
            modifierText = "Attribution";
            iconBadge = `[![license](https://forthebadge.com/images/badges/cc-by.svg)](${licenseURL})`;
            break;
        case "by-nd":
            modifierText = "Attribution-NoDerivatives";
            iconBadge = `[![license](https://forthebadge.com/images/badges/cc-by-nd.svg)](${licenseURL})`;
            break;
        case "by-nc":
            modifierText = "Attribution-NonCommercial";
            iconBadge = `[![license](https://forthebadge.com/images/badges/cc-nc.svg)](${licenseURL})`;
            break;
        case "by-nc-nd":
            modifierText = "Attribution-NonCommercial-NoDerivatives";
            iconBadge = "<a href=\"https://forthebadge.com\"><svg  xmlns=\"http://www.w3.org/2000/svg\" width=\"270.02\" height=\"35\" viewBox=\"0 0 270.02 35\"><rect class=\"svg__rect\" x=\"0\" y=\"0\" width=\"190.57000000000002\" height=\"35\" fill=\"#B0AEAF\"></rect><rect class=\"svg__rect\" x=\"188.57000000000002\" y=\"0\" width=\"81.44999999999999\" height=\"35\" fill=\"#1C1C1D\"></rect><path class=\"svg__text\" d=\"M13.95 18.19L13.95 18.19L13.95 17.39Q13.95 16.19 14.38 15.27Q14.80 14.35 15.60 13.85Q16.40 13.35 17.45 13.35L17.45 13.35Q18.86 13.35 19.73 14.12Q20.59 14.89 20.73 16.29L20.73 16.29L19.25 16.29Q19.14 15.37 18.71 14.96Q18.28 14.55 17.45 14.55L17.45 14.55Q16.48 14.55 15.97 15.26Q15.45 15.96 15.44 17.33L15.44 17.33L15.44 18.09Q15.44 19.47 15.93 20.20Q16.43 20.92 17.38 20.92L17.38 20.92Q18.25 20.92 18.69 20.53Q19.13 20.14 19.25 19.22L19.25 19.22L20.73 19.22Q20.60 20.59 19.72 21.35Q18.84 22.12 17.38 22.12L17.38 22.12Q16.36 22.12 15.59 21.63Q14.81 21.15 14.39 20.26Q13.97 19.37 13.95 18.19ZM26.52 22L25.04 22L25.04 13.47L28.04 13.47Q29.52 13.47 30.32 14.13Q31.12 14.79 31.12 16.05L31.12 16.05Q31.12 16.90 30.71 17.48Q30.30 18.06 29.56 18.37L29.56 18.37L31.47 21.92L31.47 22L29.89 22L28.17 18.71L26.52 18.71L26.52 22ZM26.52 14.66L26.52 17.52L28.05 17.52Q28.80 17.52 29.22 17.15Q29.64 16.77 29.64 16.11L29.64 16.11Q29.64 15.43 29.25 15.05Q28.86 14.68 28.09 14.66L28.09 14.66L26.52 14.66ZM41.09 22L35.52 22L35.52 13.47L41.05 13.47L41.05 14.66L37.00 14.66L37.00 17.02L40.50 17.02L40.50 18.19L37.00 18.19L37.00 20.82L41.09 20.82L41.09 22ZM46.07 22L44.53 22L47.75 13.47L49.08 13.47L52.31 22L50.76 22L50.06 20.01L46.76 20.01L46.07 22ZM48.41 15.28L47.18 18.82L49.65 18.82L48.41 15.28ZM57.95 14.66L55.31 14.66L55.31 13.47L62.08 13.47L62.08 14.66L59.42 14.66L59.42 22L57.95 22L57.95 14.66ZM67.40 22L65.92 22L65.92 13.47L67.40 13.47L67.40 22ZM74.50 22L71.45 13.47L73.07 13.47L75.21 20.14L77.38 13.47L79.01 13.47L75.94 22L74.50 22ZM88.54 22L82.96 22L82.96 13.47L88.50 13.47L88.50 14.66L84.44 14.66L84.44 17.02L87.95 17.02L87.95 18.19L84.44 18.19L84.44 20.82L88.54 20.82L88.54 22ZM98.44 18.19L98.44 18.19L98.44 17.39Q98.44 16.19 98.87 15.27Q99.30 14.35 100.10 13.85Q100.89 13.35 101.94 13.35L101.94 13.35Q103.36 13.35 104.22 14.12Q105.08 14.89 105.22 16.29L105.22 16.29L103.74 16.29Q103.64 15.37 103.21 14.96Q102.78 14.55 101.94 14.55L101.94 14.55Q100.98 14.55 100.46 15.26Q99.94 15.96 99.93 17.33L99.93 17.33L99.93 18.09Q99.93 19.47 100.42 20.20Q100.92 20.92 101.87 20.92L101.87 20.92Q102.75 20.92 103.19 20.53Q103.63 20.14 103.74 19.22L103.74 19.22L105.22 19.22Q105.09 20.59 104.21 21.35Q103.33 22.12 101.87 22.12L101.87 22.12Q100.85 22.12 100.08 21.63Q99.30 21.15 98.88 20.26Q98.46 19.37 98.44 18.19ZM109.26 18.00L109.26 18.00L109.26 17.52Q109.26 16.28 109.70 15.32Q110.15 14.37 110.95 13.86Q111.76 13.35 112.80 13.35Q113.84 13.35 114.65 13.85Q115.46 14.35 115.89 15.29Q116.33 16.23 116.34 17.48L116.34 17.48L116.34 17.96Q116.34 19.21 115.91 20.16Q115.47 21.10 114.67 21.61Q113.86 22.12 112.81 22.12L112.81 22.12Q111.78 22.12 110.96 21.61Q110.15 21.10 109.71 20.17Q109.27 19.23 109.26 18.00ZM110.74 17.46L110.74 17.96Q110.74 19.36 111.29 20.13Q111.84 20.90 112.81 20.90L112.81 20.90Q113.80 20.90 114.33 20.15Q114.86 19.40 114.86 17.96L114.86 17.96L114.86 17.51Q114.86 16.09 114.32 15.34Q113.79 14.58 112.80 14.58L112.80 14.58Q111.84 14.58 111.30 15.33Q110.76 16.09 110.74 17.46L110.74 17.46ZM122.28 22L120.81 22L120.81 13.47L122.73 13.47L125.19 20.01L127.64 13.47L129.56 13.47L129.56 22L128.08 22L128.08 19.19L128.23 15.43L125.71 22L124.65 22L122.14 15.43L122.28 19.19L122.28 22ZM135.78 22L134.30 22L134.30 13.47L136.22 13.47L138.68 20.01L141.14 13.47L143.05 13.47L143.05 22L141.58 22L141.58 19.19L141.72 15.43L139.20 22L138.14 22L135.63 15.43L135.78 19.19L135.78 22ZM147.52 18.00L147.52 18.00L147.52 17.52Q147.52 16.28 147.97 15.32Q148.41 14.37 149.21 13.86Q150.02 13.35 151.06 13.35Q152.11 13.35 152.91 13.85Q153.72 14.35 154.16 15.29Q154.60 16.23 154.60 17.48L154.60 17.48L154.60 17.96Q154.60 19.21 154.17 20.16Q153.73 21.10 152.93 21.61Q152.12 22.12 151.07 22.12L151.07 22.12Q150.04 22.12 149.23 21.61Q148.41 21.10 147.97 20.17Q147.53 19.23 147.52 18.00ZM149.01 17.46L149.01 17.96Q149.01 19.36 149.55 20.13Q150.10 20.90 151.07 20.90L151.07 20.90Q152.06 20.90 152.59 20.15Q153.12 19.40 153.12 17.96L153.12 17.96L153.12 17.51Q153.12 16.09 152.58 15.34Q152.05 14.58 151.06 14.58L151.06 14.58Q150.10 14.58 149.56 15.33Q149.02 16.09 149.01 17.46L149.01 17.46ZM160.55 22L159.07 22L159.07 13.47L160.55 13.47L164.36 19.54L164.36 13.47L165.83 13.47L165.83 22L164.35 22L160.55 15.95L160.55 22ZM170.14 19.42L170.14 19.42L171.62 19.42Q171.62 20.15 172.10 20.55Q172.58 20.95 173.48 20.95L173.48 20.95Q174.25 20.95 174.64 20.63Q175.03 20.32 175.03 19.80L175.03 19.80Q175.03 19.24 174.64 18.94Q174.24 18.63 173.21 18.32Q172.18 18.01 171.57 17.63L171.57 17.63Q170.40 16.90 170.40 15.72L170.40 15.72Q170.40 14.69 171.25 14.02Q172.09 13.35 173.43 13.35L173.43 13.35Q174.32 13.35 175.02 13.68Q175.71 14.01 176.11 14.61Q176.51 15.22 176.51 15.96L176.51 15.96L175.03 15.96Q175.03 15.29 174.61 14.91Q174.20 14.54 173.42 14.54L173.42 14.54Q172.69 14.54 172.29 14.85Q171.89 15.16 171.89 15.71L171.89 15.71Q171.89 16.18 172.32 16.50Q172.75 16.81 173.75 17.10Q174.75 17.40 175.35 17.78Q175.95 18.16 176.23 18.65Q176.52 19.13 176.52 19.79L176.52 19.79Q176.52 20.86 175.70 21.49Q174.88 22.12 173.48 22.12L173.48 22.12Q172.56 22.12 171.78 21.77Q171.00 21.43 170.57 20.83Q170.14 20.22 170.14 19.42Z\" fill=\"#FFFFFF\"></path><path class=\"svg__text\" d=\"M205.09 22L202.76 22L202.76 13.60L204.71 13.60L208.42 18.07L208.42 13.60L210.75 13.60L210.75 22L208.80 22L205.09 17.52L205.09 22ZM215.48 17.80L215.48 17.80Q215.48 16.54 216.08 15.54Q216.68 14.55 217.73 13.99Q218.78 13.43 220.10 13.43L220.10 13.43Q221.26 13.43 222.18 13.84Q223.10 14.25 223.72 15.02L223.72 15.02L222.21 16.39Q221.39 15.40 220.22 15.40L220.22 15.40Q219.54 15.40 219.01 15.70Q218.47 16 218.18 16.54Q217.88 17.09 217.88 17.80L217.88 17.80Q217.88 18.51 218.18 19.05Q218.47 19.60 219.01 19.90Q219.54 20.20 220.22 20.20L220.22 20.20Q221.39 20.20 222.21 19.22L222.21 19.22L223.72 20.58Q223.11 21.35 222.18 21.76Q221.26 22.17 220.10 22.17L220.10 22.17Q218.78 22.17 217.73 21.61Q216.68 21.05 216.08 20.05Q215.48 19.06 215.48 17.80ZM231.49 19.46L227.99 19.46L227.99 17.71L231.49 17.71L231.49 19.46ZM238.72 22L236.39 22L236.39 13.60L238.35 13.60L242.06 18.07L242.06 13.60L244.38 13.60L244.38 22L242.43 22L238.72 17.52L238.72 22ZM253.52 22L249.55 22L249.55 13.60L253.52 13.60Q254.90 13.60 255.97 14.12Q257.03 14.63 257.62 15.58Q258.21 16.53 258.21 17.80L258.21 17.80Q258.21 19.07 257.62 20.02Q257.03 20.97 255.97 21.48Q254.90 22 253.52 22L253.52 22ZM251.92 15.50L251.92 20.10L253.42 20.10Q254.50 20.10 255.16 19.49Q255.81 18.88 255.81 17.80L255.81 17.80Q255.81 16.72 255.16 16.11Q254.50 15.50 253.42 15.50L253.42 15.50L251.92 15.50Z\" fill=\"#FFFFFF\" x=\"201.57000000000002\"></path></svg></a>";
            break;
        case "by-nc-sa":
            modifierText = "Attribution-NonCommercial-ShareAlike";
            iconBadge = `[![license](https://forthebadge.com/images/badges/cc-nc-sa.svg)](${licenseURL})`;
            break;
        case "by-sa":
            modifierText = "Attribution-ShareAlike";
            iconBadge = `[![license](https://forthebadge.com/images/badges/cc-sa.svg)](${licenseURL})`;
            break;
    }

    return `---\n\n${iconBadge}\n\nThis work is licensed under a [${modifierText} ${versionText} License](${licenseURL}).\r\n`;
}

export function formatContents(sections: Array<string>): string {
    let output =
        "*The contents of the lecture notes are described below.*\n\n---\n\n## Contents\n\n";

    sections.forEach((s, i) => {
        output += `${i + 1}. ${s}\n`;
    });

    output += "\n";

    return output;
}

export function formatOutput(UNIT_CODE: string, UNIT_NAME: string, UNIT_COORDINATOR: string,
    UNIT_TIME: string, DOWNLOADS: string, CONTRIBUTORS: string, WHICH_NOTES: string, CONTENTS: string, COPYRIGHT: string): string {
    // Combine all variables
    return `# ${UNIT_CODE} - ${UNIT_NAME}

## ${UNIT_COORDINATOR}

### ${UNIT_TIME}

---

## Downloads

${DOWNLOADS}

${CONTRIBUTORS}---

This repository provides ${WHICH_NOTES} for **${UNIT_CODE} - ${UNIT_NAME}**.

${CONTENTS}${COPYRIGHT}`;
}

async function pushFile(client: InstanceType<typeof GitHub>, file_content: string) {
    if (context.payload.repository == null) throw new Error("No repository found.");
    if (context.payload.repository.owner.name == null) throw new Error("No repository name found.");
    
    // Check if file exists
    const requestOptions = {
        owner: context.payload.repository.owner.name,
        repo: context.payload.repository.name,
        path: "README.md",
        message: "README CI",
        content: Buffer.from(file_content).toString("base64")
    };

    await client
        .request("GET /repos/{owner}/{repo}/contents/{path}", {
            owner: context.payload.repository.owner.name,
            repo: context.payload.repository.name,
            path: "README.md",
            ref: context.sha
        })
        .then((onfulfilled) => {
            if (onfulfilled.status == 200) {
                requestOptions["sha"] = onfulfilled.data["sha"];
            }
        });

    await client
        .request("PUT /repos/{owner}/{repo}/contents/{path}", requestOptions)
        .then((onfulfilled) => {
            if (onfulfilled.status == 200) {
                return info("Successfully updated README.md.");
            } else if (onfulfilled.status == 201) {
                return info("Successfully created README.md.");
            }
        })
        .catch((onrejected) => {
            return setFailed(onrejected);
        });
}

// If Jest is not active
if (!process.env.JEST_WORKER_ID) {
    run();
}