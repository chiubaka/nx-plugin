import {
  generateFiles,
  moveFilesToNewDirectory,
  ProjectConfiguration,
  TargetConfiguration,
  Tree,
  updateJson,
} from "@nx/devkit";
import * as Detox from "detox";
import endent from "endent";
import path from "node:path";

import { EsLintExecutorOptions, JestConfig, PackageJson } from "../../../types";
import { Project, ProjectJsonUtils, replaceInFile } from "../../../utils";
import {
  eslintProjectGenerator,
  fastlaneProjectGenerator,
  reactNativeProjectGenerator,
} from "../../project";
import { ReactNativeAppGeneratorSchema } from "./reactNativeAppGenerator.schema";

export async function reactNativeAppGenerator(
  tree: Tree,
  options: ReactNativeAppGeneratorSchema,
) {
  const { name, appName } = options;
  const project = new Project(tree, name, "application");
  const e2eProject = new Project(tree, `${name}-e2e`, "e2e");

  const additionalSetupSteps = endent`
    - [] Ensure that you have the Android SDK installed
    - [] Ensure that you have Xcode, Xcode Command Line Tools, and the iOS SDKs installed
    - [] Update \`.detoxrc.json\` file in the generated E2E project
      - Ensure that a valid \`avdName\` is filled in under the \`devices\` section
    - [] Ensure that you have \`ruby\` (required) and \`rbenv\` (optional but recommended)
  `;

  const reactNativeProjectTask = await reactNativeProjectGenerator(tree, {
    ...project.getMeta(),
    displayName: appName,
    rootProjectGeneratorName: "app.react-native",
    additionalSetupSteps,
  });

  copyTemplates(project, options);
  updateYarnWorkspaces(project);
  updateProjectJson(project);
  updateNativeProjects(project, options);
  updateCodeSample(project);

  const fastlaneTask = fastlaneProjectGenerator(tree, {
    ...project.getMeta(),
    ...options,
  });

  const originalE2eBaseDir = project.relativePath("..");
  updateE2eProject(e2eProject, project, originalE2eBaseDir, options);

  return async () => {
    await reactNativeProjectTask();
    await fastlaneTask();
  };
}

function copyTemplates(
  project: Project,
  options: ReactNativeAppGeneratorSchema,
) {
  const tree = project.getTree();
  const templateDir = path.join(__dirname, "./files");

  generateFiles(tree, templateDir, project.path(), {
    rubyVersion: "3.2.2",
    xcodeVersion: "14.3.1",
    ...options,
  });
}

function updateYarnWorkspaces(project: Project) {
  const tree = project.getTree();

  updateJson(tree, "package.json", (packageJson: PackageJson) => {
    const workspaces = (packageJson.workspaces ?? { packages: [] }) as {
      packages: string[];
    };

    // React Native apps require symlinks for node_modules which break
    // if the package is allowed to be part of the yarn workspace.
    workspaces.packages.push(`!${project.path()}`);

    packageJson.workspaces = workspaces;

    return packageJson;
  });
}

function updateProjectJson(project: Project) {
  const tree = project.getTree();
  const projectJsonPath = project.path("project.json");

  replaceInFile(tree, projectJsonPath, "bundle-ios", "bundle:ios");
  replaceInFile(
    tree,
    project.path("project.json"),
    "bundle-android",
    "bundle:android",
  );
  replaceInFile(tree, projectJsonPath, "build-ios", "build:ios");
  replaceInFile(
    tree,
    project.path("project.json"),
    "build-android",
    "build:android",
  );
  replaceInFile(tree, projectJsonPath, "run-ios", "run:ios");
  replaceInFile(
    tree,
    project.path("project.json"),
    "run-android",
    "run:android",
  );

  // Default project.json doesn't include sync-deps as a dependency for bundling targets,
  // which causes an error if bundle is ever run without running build first.
  updateJson(tree, projectJsonPath, (projectJson: ProjectConfiguration) => {
    ProjectJsonUtils.addTargetDependency(
      projectJson,
      "bundle:android",
      "sync-deps",
    );
    ProjectJsonUtils.addTargetDependency(
      projectJson,
      "bundle:ios",
      "sync-deps",
    );

    ProjectJsonUtils.addTarget(projectJson, "test:native:android", {
      command: "bundle exec fastlane android test",
      options: {
        cwd: project.path(),
      },
    });
    ProjectJsonUtils.addTarget(projectJson, "test:native:ios", {
      command: "bundle exec fastlane ios test",
      options: {
        cwd: project.path(),
      },
    });

    return projectJson;
  });
}

/* eslint-disable security/detect-non-literal-fs-filename */
function updateCodeSample(project: Project) {
  const tree = project.getTree();

  tree.rename(
    project.srcPath("app/App.spec.tsx"),
    project.testPath("unit/App.spec.tsx"),
  );

  replaceInFile(
    tree,
    project.testPath("unit/App.spec.tsx"),
    "import App from './App';",
    "import App from '../../src/app/App';",
  );

  replaceInFile(
    tree,
    project.srcPath("app/App.tsx"),
    "/* eslint-disable jsx-a11y/accessible-emoji */\n",
    "",
  );

  replaceInFile(
    tree,
    project.srcPath("app/App.tsx"),
    "onPress={() =>\n",
    "// eslint-disable-next-line @typescript-eslint/no-misused-promises\nonPress={() =>\n",
  );
}
/* eslint-enable security/detect-non-literal-fs-filename */

function updateNativeProjects(
  project: Project,
  options: ReactNativeAppGeneratorSchema,
) {
  const tree = project.getTree();

  replaceInFile(tree, project.path("Gemfile"), "'", '"');
  replaceInFile(
    tree,
    project.path("Gemfile"),
    'ruby ">= 2.6.10"',
    'ruby ">= 3.2.2"',
  );

  updateIosProject(project, options);
  updateAndroidProject(project, options);
}

function updateIosProject(
  project: Project,
  options: ReactNativeAppGeneratorSchema,
) {
  const tree = project.getTree();

  const iosProjectName = project.getNames().pascalCase;
  const iosXcodeProjectPath = project.path(
    `ios/${iosProjectName}.xcodeproj/project.pbxproj`,
  );

  const { appId } = options;

  replaceInFile(tree, project.path("ios/Podfile"), "'", '"');
  // There is one instance of a good single quote in this file that we need to allow
  replaceInFile(
    tree,
    project.path("ios/Podfile"),
    '"require.resolve(',
    "'require.resolve(",
  );
  replaceInFile(
    tree,
    project.path("ios/Podfile"),
    ')", __dir__]).strip',
    ")', __dir__]).strip",
  );

  // This patches a bug in Nx's generated project where some commands will open a useless
  // Metro terminal that is unable to find the metro config
  replaceInFile(
    tree,
    iosXcodeProjectPath,
    'export RCT_METRO_PORT=\\"${RCT_METRO_PORT:=8081}\\"\\necho \\"export RCT_METRO_PORT=${RCT_METRO_PORT}\\" >',
    'export RCT_METRO_PORT=\\"${RCT_METRO_PORT:=8081}\\"\\nexport PROJECT_ROOT=${SRCROOT}\\necho \\"export RCT_METRO_PORT=${RCT_METRO_PORT}\\\\nexport PROJECT_ROOT=${PROJECT_ROOT}\\" >',
  );

  replaceInFile(
    tree,
    iosXcodeProjectPath,
    "org.reactjs.native.example.$(PRODUCT_NAME:rfc1034identifier)",
    appId,
  );
}

function updateAndroidProject(
  project: Project,
  options: ReactNativeAppGeneratorSchema,
) {
  const tree = project.getTree();

  const { appId } = options;
  const packageName = appId.toLowerCase();

  const oldPackageName = `com.${project.getNames().camelCase.toLowerCase()}`;

  const oldPackageDir = oldPackageName.split(".").join("/");
  const packageDir = packageName.split(".").join("/");

  replaceInFile(
    tree,
    project.path("android/app/build.gradle"),
    `namespace "${oldPackageName}"`,
    `namespace "${packageName}"`,
  );

  replaceInFile(
    tree,
    project.path("android/app/build.gradle"),
    `applicationId "${oldPackageName}"`,
    `applicationId "${appId}"`,
  );

  const configurations = ["androidTest", "debug", "main", "release"];

  for (const configuration of configurations) {
    const javaDir = project.path(`android/app/src/${configuration}/java`);
    moveJavaPackage(
      tree,
      path.join(javaDir, oldPackageDir),
      path.join(javaDir, packageDir),
      oldPackageName,
      packageName,
    );
  }
}

function moveJavaPackage(
  tree: Tree,
  oldDir: string,
  newDir: string,
  oldPackageName: string,
  newPackageName: string,
) {
  moveFilesToNewDirectory(tree, oldDir, newDir);

  const children = tree.children(newDir);

  for (const child of children) {
    if (child.endsWith(".java")) {
      replaceInFile(
        tree,
        path.join(newDir, child),
        `package ${oldPackageName}`,
        `package ${newPackageName}`,
      );
    }
  }
}

function updateE2eProject(
  e2eProject: Project,
  project: Project,
  originalE2eBaseDir: string,
  options: ReactNativeAppGeneratorSchema,
) {
  moveE2eProject(
    e2eProject,
    path.join(originalE2eBaseDir, e2eProject.getName()),
  );
  updateE2eProjectJson(e2eProject, project, originalE2eBaseDir);
  updateE2eTsConfig(e2eProject);
  updateE2eTestSetup(e2eProject, options);

  eslintProjectGenerator(e2eProject.getTree(), {
    ...e2eProject.getMeta(),
    noPrimaryTsConfig: true,
  });

  updateE2eCodeSample(e2eProject);
}

function moveE2eProject(e2eProject: Project, originalE2eProjectDir: string) {
  const tree = e2eProject.getTree();

  moveFilesToNewDirectory(tree, originalE2eProjectDir, e2eProject.path());
}

function updateE2eProjectJson(
  e2eProject: Project,
  project: Project,
  originalE2eBaseDir: string,
) {
  const tree = e2eProject.getTree();
  const e2eProjectJsonPath = e2eProject.path("project.json");
  const newE2eBaseDir = e2eProject.relativePath("..");

  replaceInFile(tree, e2eProjectJsonPath, "build-ios", "build:ios");
  replaceInFile(tree, e2eProjectJsonPath, "build-android", "build:android");
  replaceInFile(tree, e2eProjectJsonPath, "test-ios", "e2e:ios");
  replaceInFile(tree, e2eProjectJsonPath, "test-android", "e2e:android");

  updateJson(tree, e2eProjectJsonPath, (projectJson: ProjectConfiguration) => {
    const { targets } = projectJson;

    if (!targets?.lint) {
      return projectJson;
    }

    const lintTarget =
      targets.lint as TargetConfiguration<EsLintExecutorOptions>;

    if (!lintTarget.options) {
      return projectJson;
    }

    const lintFilePatterns = lintTarget.options.lintFilePatterns;

    if (!lintFilePatterns) {
      return projectJson;
    }

    const newLintFilePatterns = lintFilePatterns.map((pattern: string) => {
      return pattern.replace(originalE2eBaseDir, newE2eBaseDir);
    });

    lintTarget.options.lintFilePatterns = newLintFilePatterns;

    ProjectJsonUtils.addTarget(projectJson, "setup-e2e", {
      command: "bundle exec fastlane run setup_circle_ci",
      options: {
        cwd: project.path(),
      },
    });

    ProjectJsonUtils.addTargetDependency(
      projectJson,
      "e2e:android",
      "setup-e2e",
    );
    ProjectJsonUtils.addTargetDependency(projectJson, "e2e:ios", "setup-e2e");

    return projectJson;
  });
}

function updateE2eTsConfig(e2eProject: Project) {
  const tree = e2eProject.getTree();

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  tree.rename(
    e2eProject.path("tsconfig.e2e.json"),
    e2eProject.path("tsconfig.spec.json"),
  );

  replaceInFile(
    tree,
    e2eProject.path("tsconfig.json"),
    "tsconfig.e2e.json",
    "tsconfig.spec.json",
  );

  replaceInFile(tree, e2eProject.path("tsconfig.spec.json"), "src", "test");
}

function updateE2eTestSetup(
  e2eProject: Project,
  options: ReactNativeAppGeneratorSchema,
) {
  const tree = e2eProject.getTree();

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  tree.rename(
    e2eProject.path("test-setup.ts"),
    e2eProject.testPath("setup/setup.ts"),
  );

  updateJson(
    tree,
    e2eProject.path("jest.config.json"),
    (config: JestConfig) => {
      config.setupFilesAfterEnv = ["<rootDir>/test/setup/setup.ts"];
      config.coverageDirectory = `../../reports/coverage/${e2eProject.relativePath()}`;
      config.reporters = [
        [
          "jest-junit",
          {
            addFileAttribute: "true",
            classNameTemplate: "{suitename}",
            outputDirectory: "reports/junit",
            outputName: `${e2eProject.getName()}.xml`,
          },
        ],
      ];

      return config;
    },
  );

  replaceInFile(tree, e2eProject.path("jest.config.json"), "src", "test");

  updateJson(
    tree,
    e2eProject.path(".detoxrc.json"),
    (config: Detox.DetoxConfig) => {
      const devices = config.devices;

      if (!devices) {
        return config;
      }

      const iosSimulatorConfig =
        devices.simulator as Detox.DetoxIosSimulatorDriverConfig;
      const androidEmulatorConfig =
        devices.emulator as Detox.DetoxAndroidEmulatorDriverConfig;

      if (iosSimulatorConfig) {
        const deviceConfig =
          iosSimulatorConfig.device as Partial<Detox.IosSimulatorQuery>;

        iosSimulatorConfig.device = {
          ...deviceConfig,
          type: options.iosSimulatorDeviceType ?? deviceConfig.type,
        };
      }

      if (androidEmulatorConfig) {
        const deviceConfig = androidEmulatorConfig.device as {
          avdName: string;
        };

        androidEmulatorConfig.device = {
          avdName: options.androidEmulatorAvdName ?? deviceConfig.avdName,
        };
      }

      return config;
    },
  );
}

function updateE2eCodeSample(e2eProject: Project) {
  const tree = e2eProject.getTree();

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  tree.rename(
    e2eProject.srcPath("app.spec.ts"),
    e2eProject.testPath("e2e/app.spec.ts"),
  );

  tree.delete(e2eProject.srcPath());
}
