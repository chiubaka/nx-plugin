import { Tree } from "@nrwl/devkit";

import { exec } from "../../utils";
import { GitGeneratorSchema } from "./gitGenerator.schema";

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
export function gitGenerator(tree: Tree, options: GitGeneratorSchema) {
  const initGitRepoTask = initGitRepo(tree);
  const createInitialCommitTask = createInitialCommit(tree, options);

  return async () => {
    await initGitRepoTask();
    await createInitialCommitTask();
  };
}

function initGitRepo(tree: Tree) {
  return async () => {
    await exec("git init", {
      cwd: tree.root,
    });
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
    await exec("git add .", {
      cwd: tree.root,
    });

    await exec(`git commit -m "${commitMessage}"`, {
      cwd: tree.root,
      env: {
        ...committerEmailEnvVars,
        ...committerNameEnvVars,
      },
    });
  };
}