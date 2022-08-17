import { getPackageManagerCommand } from "@nrwl/devkit";
import { program } from "commander";
import { spawn as nodeSpawn } from "node:child_process";
import { promisify } from "node:util";

const spawn = promisify(nodeSpawn);

interface GenesisOptions {
  workspaceScope: string;
  workspaceName: string;
  registry?: string;
}

export async function genesis(argv = process.argv) {
  program
    .requiredOption("-s, --workspace-scope <workspaceScope>")
    .requiredOption("-n, --workspace-name <workspaceName>")
    .option("-r, --registry <registry>");

  program.parse(argv);

  const opts = program.opts<GenesisOptions>();

  const { workspaceScope, workspaceName, registry } = opts;

  const pmc = getPackageManagerCommand("npm");

  const fullCommand = `${pmc.exec} create-nx-workspace ${workspaceScope} --preset=@chiubaka/nx-plugin --nxCloud=false --directory=${workspaceName} --workspaceName=${workspaceName} --workspaceScope=${workspaceScope}`;

  const commandTokens = fullCommand.split(" ");
  const [command, ...args] = commandTokens;

  await spawn(command, args, {
    cwd: process.cwd(),
    env: registry
      ? {
          ...process.env,
          npm_config_registry: registry,
        }
      : undefined,
  });
}