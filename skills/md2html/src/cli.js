#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import { convert } from "./index.js";

// Replaced at build time by esbuild --define. Falls back to "dev" when run unbundled.
const VERSION =
  typeof __MD2HTML_VERSION__ !== "undefined" ? __MD2HTML_VERSION__ : "dev";

const USAGE = `md2html — convert a markdown file to a self-contained HTML file and open it in the browser.

Usage:
  md2html <file.md>            convert and open in the default browser
  md2html <file.md> --no-open  convert only, do not open
  md2html --help               show this help
  md2html --version            show version

Output:
  Writes <file>.html next to the input file (overwriting any existing one),
  then opens it so you can select-all, copy, and paste into Google Docs.
`;

function fail(message) {
  console.error(`md2html: ${message}`);
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(USAGE);
    return;
  }
  if (args.includes("--version") || args.includes("-v")) {
    console.log(VERSION);
    return;
  }

  const noOpen = args.includes("--no-open");
  const positionals = args.filter((a) => !a.startsWith("-"));

  if (positionals.length === 0) {
    process.stderr.write(USAGE);
    process.exit(1);
  }
  if (positionals.length > 1) {
    fail("expected exactly one markdown file");
  }

  const input = path.resolve(process.cwd(), positionals[0]);
  if (!/\.(md|markdown)$/i.test(input)) {
    fail(`input must be a .md file: ${positionals[0]}`);
  }
  if (!fs.existsSync(input)) {
    fail(`file not found: ${positionals[0]}`);
  }

  let html;
  try {
    const source = fs.readFileSync(input, "utf8");
    html = convert(source, {
      baseDir: path.dirname(input),
      title: path.basename(input, path.extname(input)),
    });
  } catch (err) {
    console.error(`md2html: conversion failed: ${err.message}`);
    process.exit(2);
  }

  const output = input.replace(/\.(md|markdown)$/i, ".html");
  fs.writeFileSync(output, html, "utf8");
  console.log(output);

  if (!noOpen) {
    spawn("open", [output], { stdio: "ignore", detached: true }).unref();
  }
}

main();
