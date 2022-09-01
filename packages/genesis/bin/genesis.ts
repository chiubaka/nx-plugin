import { getPackageManagerCommand } from "@nrwl/devkit";
import { program } from "commander";
import { spawn as nodeSpawn } from "node:child_process";
import { promisify } from "node:util";

const spawn = promisify(nodeSpawn);

interface GenesisOptions {
  workspaceScope: string;
  workspaceName: string;
  description: string;
  disableImmutableInstalls?: boolean;
  registry?: string;
  skipGithub?: boolean;
}

export async function genesis(argv = process.argv) {
  program
    .requiredOption("-s, --workspace-scope <workspaceScope>")
    .requiredOption("-n, --workspace-name <workspaceName>")
    .requiredOption("-d, --description <description>")
    .option("--disable-immutable-installs")
    .option("-r, --registry <registry>")
    .option("--skip-github");

  program.parse(argv);

  const opts = program.opts<GenesisOptions>();

  const {
    workspaceScope,
    workspaceName,
    description,
    disableImmutableInstalls,
    registry,
    skipGithub: skipGitHub,
  } = opts;

  const pmc = getPackageManagerCommand("npm");

  let fullCommand = `${pmc.exec} create-nx-workspace ${workspaceScope} --preset=@chiubaka/nx-plugin --nxCloud=false --directory=${workspaceName} --workspaceName=${workspaceName} --workspaceScope=${workspaceScope}`;

  if (skipGitHub) {
    fullCommand = `${fullCommand} --skipGitHub`;
  }

  if (registry) {
    fullCommand = `${fullCommand} --registry=${registry}`;
  }

  if (disableImmutableInstalls) {
    fullCommand = `${fullCommand} --disableImmutableInstalls=true`;
  }

  const commandTokens = fullCommand.split(" ");
  const [command, ...args] = commandTokens;

  await spawn(command, [...args, `--description="${description}"`], {
    cwd: process.cwd(),
    env: registry
      ? {
          ...process.env,
          npm_config_registry: registry,
        }
      : undefined,
  });
}
