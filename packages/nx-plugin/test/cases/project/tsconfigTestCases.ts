import { readJson, Tree } from "@nrwl/devkit";

import { Project } from "../../../src/index";
import { TsConfig } from "../../types/tsconfig";

interface TsConfigTestCasesOptions {
  skipAppOrLibConfig?: boolean;
  skipTestConfig?: boolean;
}

export const tsconfigTestCases = (
  getProject: () => Project,
  options: TsConfigTestCasesOptions = {},
) => {
  const { skipAppOrLibConfig, skipTestConfig } = options;

  let project: Project;
  let tree: Tree;

  let primaryTsConfigName: string;

  beforeAll(() => {
    project = getProject();
    tree = project.getTree();

    primaryTsConfigName =
      project.getType() === "application"
        ? "tsconfig.app.json"
        : "tsconfig.lib.json";
  });

  it("generates a tsconfig.json file", () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    expect(tree.exists(project.path("tsconfig.json"))).toBe(true);
  });

  describe("tsconfig.json", () => {
    let tsConfig: TsConfig;

    beforeAll(() => {
      tsConfig = readJson(tree, project.path("tsconfig.json"));
    });

    it("matches snapshot", () => {
      expect(tsConfig).toMatchSnapshot();
    });
  });

  if (!skipAppOrLibConfig) {
    it("generates a tsconfig.app.json or tsconfig.lib.json file", () => {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      expect(tree.exists(project.path(primaryTsConfigName))).toBe(true);
    });

    describe("tsconfig.app.json or tsconfig.lib.json", () => {
      let tsConfig: TsConfig;

      beforeAll(() => {
        tsConfig = readJson(tree, project.path(primaryTsConfigName));
      });

      it("matches snapshot", () => {
        expect(tsConfig).toMatchSnapshot();
      });
    });
  }

  if (!skipTestConfig) {
    it("generates a tsconfig.spec.json file", () => {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      expect(tree.exists(project.path("tsconfig.spec.json"))).toBe(true);
    });

    describe("tsconfig.spec.json", () => {
      let tsConfig: TsConfig;

      beforeAll(() => {
        tsConfig = readJson(tree, project.path("tsconfig.spec.json"));
      });

      it("matches snapshot", () => {
        expect(tsConfig).toMatchSnapshot();
      });
    });
  }
};
