import { Tree } from "@nrwl/devkit";

import { generatorLogger as logger } from "../../logger";
import { exec } from "../../utils";
import { noOpTask } from "../tasks";
import { GitGeneratorSchema } from "./gitGenerator.schema";
import { gitHooksGenerator } from "./gitHooks";

/**
 * Nx provides its own git repo generation capabilities, but there are two problems:
 * 1. Some of our generators require git repo generation to be complete before they can do their thing
 *    E.g. gitHooks and, in the future, GitHub settings
 *    Unfortunately, Nx only generates the git repo _after_ our workspace preset finishes executing, which is too late.
 *    We need to control the timing.
 * 2. The default git repo generation also fails if it detects an existing git repo, which is a bit annoying and
 *    sometimes makes it unsuitable for E2E testing where the E2E harness is being generated as a subdirectory of this
 *    repo.
 * @param tree the Nx file tree we are operating on
 */
export async function gitGenerator(tree: Tree, options: GitGeneratorSchema) {
  logger.info(
    `Generating git repo with options:\n${JSON.stringify(
      options,
      undefined,
      2,
    )}`,
  );

  const initGitRepoTask = initGitRepo(tree);
  const gitHooksTask = options.skipGitHooks
    ? noOpTask
    : await gitHooksGenerator(tree, options);
  const createInitialCommitTask = createInitialCommit(tree, options);

  return async () => {
    logger.info("Running post-processing tasks for git generator");

    await initGitRepoTask();
    await gitHooksTask();
    await createInitialCommitTask();
  };
}

function initGitRepo(tree: Tree) {
  const cwd = tree.root;

  return async () => {
    logger.info(`Initializing git repo in ${cwd}`);

    await exec("git init", { cwd });
  };
}

function createInitialCommit(tree: Tree, options: GitGeneratorSchema) {
  const { commitMessage, committerEmail, committerName } = options;

  const committerEmailEnvVars = committerEmail
    ? {
        GIT_AUTHOR_EMAIL: committerEmail,
        GIT_COMMITTER_EMAIL: committerEmail,
      }
    : {};

  const committerNameEnvVars = committerName
    ? {
        GIT_AUTHOR_NAME: committerName,
        GIT_COMMITTER_NAME: committerName,
      }
    : {};

  return async () => {
    logger.info(`Creating initial commit with message "${commitMessage}"`);

    await exec("git add .", {
      cwd: tree.root,
    });

    await exec(`git commit -m "${commitMessage}"`, {
      cwd: tree.root,
      env: {
        ...process.env,
        ...committerEmailEnvVars,
        ...committerNameEnvVars,
      },
    });
  };
}
