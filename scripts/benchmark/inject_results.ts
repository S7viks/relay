declare function require(name: string): any;
declare const process: { cwd(): string; exitCode: number };

const { readFile, writeFile } = require("node:fs/promises") as {
  readFile(path: string, encoding: "utf8"): Promise<string>;
  writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
};

const { resolve } = require("node:path") as {
  resolve(...paths: string[]): string;
};

async function injectResults(): Promise<void> {
  const root = process.cwd();
  const resultsPath = resolve(root, "scripts", "benchmark", "results", "benchmark_results.json");
  const dashboardPath = resolve(root, "web", "results-dashboard.html");

  const resultsJson = await readFile(resultsPath, "utf8");
  const parsed = JSON.parse(resultsJson);
  const injectedLine = `const INJECTED_DATA = ${JSON.stringify(parsed)};`;

  const dashboardHtml = await readFile(dashboardPath, "utf8");
  const needle = "const INJECTED_DATA = null;";

  if (!dashboardHtml.includes(needle)) {
    throw new Error("Could not find 'const INJECTED_DATA = null;' in web/results-dashboard.html");
  }

  const updatedHtml = dashboardHtml.replace(needle, injectedLine);
  await writeFile(dashboardPath, updatedHtml, "utf8");

  console.log("Injected benchmark results into results-dashboard.html");
}

injectResults().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
