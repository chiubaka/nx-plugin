import {
  formatFiles,
  generateFiles,
  getPackageManagerCommand,
  readWorkspaceConfiguration,
  Tree,
  updateWorkspaceConfiguration,
} from "@nrwl/devkit";
import path from "node:path";
import { PackageJson as PackageJsonType } from "nx/src/utils/package-json";

import PackageJson from "../../../package.json";
import { generatorLogger as logger } from "../../logger";
import { exec } from "../../utils";
import { ciGenerator } from "../ci";
import { gitGenerator } from "../git";
import { lintingGenerator } from "../linting";
import { readmeGenerator } from "../readme";
import { noOpTask } from "../tasks";
import { testingGenerator } from "../testing";
import { tsconfigGenerator } from "../tsconfig";
import { PresetGeneratorSchema } from "./presetGenerator.schema";

export async function presetGenerator(
  tree: Tree,
  options: PresetGeneratorSchema,
) {
  logger.info(
    `Generating @chiubaka/nx-plugin workspace preset with options:\n${JSON.stringify(
      options,
      undefined,
      2,
    )}`,
  );
  modifyWorkspaceLayout(tree);

  const installTask = reinstallPackagesWithYarn(tree, options);
  const tsconfigTask = tsconfigGenerator(tree);
  const lintingTask = lintingGenerator(tree, { packageManager: "yarn" });
  testingGenerator(tree);
  ciGenerator(tree);
  readmeGenerator(tree, options);
  const gitTask = setUpGit(tree);

  await formatFiles(tree);

  return async () => {
    logger.info("Running post-processing tasks for preset generator");

    await installTask();
    await tsconfigTask();
    await lintingTask();
    await gitTask();
  };
}

function modifyWorkspaceLayout(tree: Tree) {
  logger.info("Modifying workspace layout to conform to e2e/ and packages/");

  const workspaceConfig = readWorkspaceConfiguration(tree);
  updateWorkspaceConfiguration(tree, {
    ...workspaceConfig,
    workspaceLayout: {
      appsDir: "e2e",
      libsDir: "packages",
    },
    cli: {
      packageManager: "yarn",
    },
  });

  tree.delete("apps");
  tree.delete("libs");

  tree.write("e2e/.gitkeep", "");
  tree.write("packages/.gitkeep", "");
}

function reinstallPackagesWithYarn(tree: Tree, options: PresetGeneratorSchema) {
  if (options.skipInstall) {
    return noOpTask;
  }

  tree.delete("package-lock.json");
  generateFiles(tree, path.join(__dirname, "./files"), ".", {});

  const pmc = getPackageManagerCommand("yarn");

  return async () => {
    logger.info("Reinstalling packages with yarn");

    await exec(`yarn set version berry`, {
      cwd: tree.root,
    });

    await exec(`${pmc.install} --no-immutable`, {
      cwd: tree.root,
    });
  };
}

function setUpGit(tree: Tree) {
  const { name: packageName, version: packageVersion } =
    PackageJson as PackageJsonType;
  const packageInfo = `${packageName}@${packageVersion}`;

  return gitGenerator(tree, {
    commitMessage: `Initial commit with files generated by ${packageInfo} preset.`,
    preCommitCommand: "yarn lint:staged",
    prePushCommand: "nx affected --target=test",
  });
}
