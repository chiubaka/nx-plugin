import { Project } from "../../utils";

export const readmeProjectTestCases = (project: Project) => {
  const tree = project.getTree();
  const projectScope = project.getScope();
  const projectName = project.getName();

  it("generates a README.md file", () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    expect(tree.exists(project.path("README.md"))).toBe(true);
  });

  describe("README.md", () => {
    it("includes the project name as the title", () => {
      expect(tree).toHaveFileWithContent(
        project.path("README.md"),
        `# ${projectName}`,
      );
    });

    describe("shields", () => {
      it("generates an NPM package version shield", () => {
        expect(tree).toHaveFileWithContent(
          project.path("README.md"),
          `[![npm](https://img.shields.io/npm/v/@${projectScope}/${projectName})](https://www.npmjs.com/package/@${projectScope}/${projectName})`,
        );
      });

      it("generates a Codecov shield for just the flag matching this project", () => {
        expect(tree).toHaveFileWithContent(
          project.path("README.md"),
          `[![codecov](https://codecov.io/gh/${projectScope}/${projectName}/branch/master/graph/badge.svg?token=foobar&flag=${projectName})](https://codecov.io/gh/${projectScope}/${projectName})`,
        );
      });
    });
  });
};
