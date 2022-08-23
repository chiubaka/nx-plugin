import { TestingWorkspace, Verdaccio } from "@chiubaka/nx-plugin-testing";
import { tmpProjPath, uniq } from "@nrwl/nx-plugin/testing";
import { ensureDirSync, moveSync, removeSync } from "fs-extra";
import os from "node:os";
import path from "node:path";

describe("genesis", () => {
  let verdaccio: Verdaccio;
  let workspace: TestingWorkspace;

  beforeAll(() => {
    verdaccio = new Verdaccio("http://localhost:4873");

    const distPackagesDir = path.join(__dirname, "../../../dist/packages");

    verdaccio.publish(path.join(distPackagesDir, "genesis"));
    verdaccio.publish(path.join(distPackagesDir, "nx-plugin"));

    const workspaceScope = "chiubaka";
    const workspaceName = "genesis";

    const tmpDir = path.join(os.tmpdir(), uniq(workspaceName));
    ensureDirSync(tmpDir);

    verdaccio.npx(
      `genesis --workspace-scope=${workspaceScope} --workspace-name=${workspaceName} --registry=${verdaccio.getUrl()} --description="Test repo for genesis CLI E2E tests" --skip-github`,
      tmpDir,
    );

    const tmpDestination = path.join(tmpDir, workspaceName);
    const destination = path.join(tmpProjPath(), "..", workspaceName);

    removeSync(destination);
    moveSync(tmpDestination, destination);

    workspace = new TestingWorkspace(destination);
  });

  afterAll(async () => {
    await workspace.execNx("reset");

    verdaccio.logout();
  });

  it("should create a workspace root directory matching name option, not org scope", () => {
    const workspaceName = path.basename(workspace.getRoot());

    expect(workspaceName).toBe("genesis");
  });

  it("should not create an apps dir", () => {
    workspace.assert.fs.notExists("apps");
  });

  describe("package manager", () => {
    it("should install packages with yarn", () => {
      workspace.assert.fs.exists("yarn.lock");
    });

    it("should install packages with yarn v3", () => {
      workspace.assert.fs.fileContents(".yarnrc.yml", ".yarn/releases/yarn-3.");
    });

    it("should continue to use the yarn v3 node-modules nodeLinker for compatibility", () => {
      workspace.assert.fs.fileContents(
        ".yarnrc.yml",
        "nodeLinker: node-modules",
      );
    });

    it("should not install packages with npm", () => {
      workspace.assert.fs.notExists("package-lock.json");
    });
  });

  describe("tsconfig", () => {
    it("generates a tsconfig.base.json file", () => {
      workspace.assert.fs.exists("tsconfig.base.json");
    });

    describe("tsconfig.base.json", () => {
      it("extends from @chiubaka/tsconfig", () => {
        workspace.assert.fs.jsonFileContents("tsconfig.base.json", {
          extends: "@chiubaka/tsconfig",
        });
      });
    });
  });

  describe("linting", () => {
    it("creates a working linting setup", async () => {
      await workspace.assert.linting.hasValidConfig();
    });

    it("creates a working lint fix setup", async () => {
      await workspace.assert.linting.canFixIssues();
    });

    it("generates a project without linting issues", async () => {
      await workspace.assert.linting.isClean();
    });

    it("generates a working lint-staged setup", async () => {
      await workspace.assert.linting.canFixStagedIssues();
    });
  });

  describe("README", () => {
    it("generates a root README.md file", () => {
      workspace.assert.fs.exists("README.md");
    });

    it("uses the workspace's name as the title of the README", () => {
      workspace.assert.fs.fileContents("README.md", "# genesis");
    });
  });

  describe("git", () => {
    it("creates an initial commit with a generated message", async () => {
      await workspace.assert.git.latestCommitMessage(
        "Initial commit with files generated by @chiubaka/nx-plugin@0.0.1 preset.",
      );
    });

    it("leaves the working directory clean", async () => {
      await workspace.assert.git.workingDirectoryIsClean();
    });
  });

  describe("git hooks", () => {
    describe("pre-commit hook", () => {
      it("creates a pre-commit hook", () => {
        workspace.assert.fs.exists(".husky/pre-commit");
      });

      it("populates the pre-commit hook with the correct command", () => {
        workspace.assert.fs.fileContents(
          ".husky/pre-commit",
          "yarn lint:staged",
        );
      });
    });

    describe("pre-push hook", () => {
      it("creates a pre-push hook", () => {
        workspace.assert.fs.exists(".husky/pre-push");
      });

      it("populates the pre-push hook with the correct command", () => {
        workspace.assert.fs.fileContents(
          ".husky/pre-push",
          "nx affected --target=test",
        );
      });
    });
  });

  describe("testing", () => {
    it("generates a Codecov configuration file", () => {
      workspace.assert.fs.exists("codecov.yml");
    });

    it("generates a jest.config.ts file", () => {
      workspace.assert.fs.exists("jest.config.ts");
    });

    it("generates a jest.preset.js file", () => {
      workspace.assert.fs.exists("jest.preset.js");
    });
  });

  describe("CI", () => {
    it("generates a .circleci/config.yml file", () => {
      workspace.assert.fs.exists(".circleci/config.yml");
    });
  });
});
