import * as fs from 'fs';
import * as path from 'path';
import * as github from '@actions/github';
import * as core from '@actions/core';

const accessToken: string = process.env.GITHUB_TOKEN as string;
const octokit = github.getOctokit(accessToken);

interface Label {
    name: string;
    color: string;
    description?: string;
}

interface LabelModification {
    type: 'create' | 'update' | 'delete';
    label: Label;
}

export async function run(): Promise<void> {
    const newLabelsUrl: string = path.join(
        process.env["GITHUB_WORKSPACE"] as string,
        ".github",
        "labels.json"
    );

    if (!core.getBooleanInput("delete")) {
        console.log("[Action] Will not delete any existing labels");
    }

    const liveLabels: Label[] = await getCurrentLabels();
    const newLabels: Label[] = JSON.parse(fs.readFileSync(newLabelsUrl).toString());

    // If the color of a label has a # sign, remove it
    newLabels.forEach((newLabel) => {
        if (newLabel.color.startsWith("#")) {
            newLabel.color = newLabel.color.slice(1);
        }
    });

    const labelModList: LabelModification[] = diffLabels(liveLabels, newLabels);

    for (const mod of labelModList) {
        if (mod.type === "create") {
            const params = {
                ...github.context.repo,
                name: mod.label.name,
                color: mod.label.color,
                description: mod.label.description,
            };
            console.log(`[Action] Creating Label: ${mod.label.name}`);

            await octokit.rest.issues.createLabel(params);
        } else if (mod.type === "update") {
            const params = {
                ...github.context.repo,
                current_name: mod.label.name,
                color: mod.label.color,
                description: mod.label.description,
            };
            console.log(`[Action] Updating Label: ${mod.label.name}`);

            await octokit.rest.issues.updateLabel(params as any);
        } else if (mod.type === "delete") {
            if (core.getBooleanInput("delete")) {
                const params = {
                    ...github.context.repo,
                    name: mod.label.name,
                };
                console.log(`[Action] Deleting Label: ${mod.label.name}`);

                await octokit.rest.issues.deleteLabel(params);
            }
        }
    }
}

async function getCurrentLabels(): Promise<Label[]> {
    const response = await octokit.rest.issues.listLabelsForRepo({
        ...github.context.repo,
    });
    return response.data as Label[];
}

function diffLabels(oldLabels: Label[], newLabels: Label[]): LabelModification[] {
    const oldLabelsNames: string[] = oldLabels.map((label) => label.name.toLowerCase());
    let newLabelsNames: string[] = newLabels.map((label) => label.name.toLowerCase());

    const labelModList: LabelModification[] = [];

    oldLabelsNames.forEach((oLabel) => {
        if (newLabelsNames.includes(oLabel)) {
            const oldLabel = oldLabels.find((l) => l.name.toLowerCase() === oLabel) as Label;
            const newLabel = newLabels.find((l) => l.name.toLowerCase() === oLabel) as Label;

            if (
                oldLabel.color !== newLabel.color ||
                (newLabel.description !== undefined &&
                    oldLabel.description !== newLabel.description)
            ) {
                // UPDATE
                labelModList.push({ type: "update", label: newLabel });
            }
            newLabelsNames = newLabelsNames.filter((element) => element !== oLabel);
        } else {
            // DELETE
            const oldLabel = oldLabels.find((l) => l.name.toLowerCase() === oLabel) as Label;

            labelModList.push({ type: "delete", label: oldLabel });
        }
    });

    newLabelsNames.forEach((nLabel) => {
        const newLabel = newLabels.find((l) => l.name.toLowerCase() === nLabel) as Label;

        // CREATE
        labelModList.push({ type: "create", label: newLabel });
    });

    return labelModList;
}
