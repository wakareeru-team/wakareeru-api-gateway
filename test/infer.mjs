#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const options = parseArgs(process.argv.slice(2));

if (options.help) {
	printHelp();
	process.exit(0);
}

const config = await loadConfig();
const target = config.targets[options.target];
if (!target) {
	fail(`Unknown target '${options.target}'. Add it to test/infer.config.json.`);
}

const imagePath = resolve(scriptDir, "..", config.image.path);
const imageBytes = await readFile(imagePath);
const endpoint = `${trimTrailingSlash(target.baseUrl)}/v1/infer`;

for (let attempt = 1; attempt <= options.count; attempt += 1) {
	const startedAt = Date.now();
	const response = await sendInferenceRequest({
		endpoint,
		imageBytes,
		fileName: config.image.fileName || basename(config.image.path),
		contentType: config.image.contentType,
		topK: config.topK,
	});
	const elapsedMs = Date.now() - startedAt;
	const parsed = parseJson(await response.text());

	printResult({
		attempt,
		count: options.count,
		status: response.status,
		elapsedMs,
		body: parsed,
	});

	if (attempt < options.count && config.delayMs > 0) {
		await sleep(config.delayMs);
	}
}

async function loadConfig() {
	const configPath = resolve(scriptDir, "infer.config.json");
	try {
		const raw = await readFile(configPath, "utf8");
		return validateConfig(JSON.parse(raw));
	} catch (error) {
		if (error?.code === "ENOENT") {
			fail("Missing test/infer.config.json. Copy test/infer.config.example.json first.");
		}
		throw error;
	}
}

function validateConfig(value) {
	if (!value || typeof value !== "object") {
		fail("Config must be a JSON object.");
	}
	if (!value.image?.path || !value.image?.contentType) {
		fail("Config must include image.path and image.contentType.");
	}
	if (!value.targets || typeof value.targets !== "object") {
		fail("Config must include targets.");
	}
	return {
		image: {
			path: String(value.image.path),
			contentType: String(value.image.contentType),
			fileName: value.image.fileName ? String(value.image.fileName) : "",
		},
		topK: value.topK === null ? null : parseConfigInteger(value.topK ?? 5, "topK"),
		delayMs: parseConfigInteger(value.delayMs ?? 0, "delayMs"),
		targets: Object.fromEntries(
			Object.entries(value.targets).map(([name, target]) => [
				name,
				{ baseUrl: validateBaseUrl(target?.baseUrl, `targets.${name}.baseUrl`) },
			]),
		),
	};
}

async function sendInferenceRequest({ endpoint, imageBytes, fileName, contentType, topK }) {
	const form = new FormData();
	form.set("image", new File([imageBytes], fileName, { type: contentType }));
	if (topK !== null) {
		form.set("top_k", String(topK));
	}
	return fetch(endpoint, {
		method: "POST",
		body: form,
	});
}

function parseArgs(args) {
	const parsed = {
		target: "local",
		count: 1,
		help: false,
	};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		switch (arg) {
			case "--target":
				parsed.target = requiredValue(args, ++index, arg);
				break;
			case "--count":
				parsed.count = parseInteger(requiredValue(args, ++index, arg), arg);
				break;
			case "--help":
			case "-h":
				parsed.help = true;
				break;
			default:
				fail(`Unknown argument: ${arg}`);
		}
	}

	if (parsed.count < 1) {
		fail("--count must be at least 1");
	}
	return parsed;
}

function validateBaseUrl(value, name) {
	const baseUrl = String(value || "");
	if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
		fail(`${name} must be a full http(s) URL.`);
	}
	return baseUrl;
}

function parseConfigInteger(value, name) {
	const parsed = Number.parseInt(String(value), 10);
	if (!Number.isFinite(parsed)) {
		fail(`${name} must be an integer or null.`);
	}
	return parsed;
}

function parseInteger(value, name) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) {
		fail(`${name} must be an integer`);
	}
	return parsed;
}

function requiredValue(args, index, name) {
	const value = args[index];
	if (!value || value.startsWith("--")) {
		fail(`${name} requires a value`);
	}
	return value;
}

function basename(path) {
	return path.split("/").pop() || "image";
}

function trimTrailingSlash(value) {
	return value.endsWith("/") ? value.slice(0, -1) : value;
}

function parseJson(value) {
	if (!value) {
		return null;
	}
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function printResult({ attempt, count, status, elapsedMs, body }) {
	const prefix = `[${attempt}/${count}] HTTP ${status} ${elapsedMs}ms`;
	if (typeof body === "string") {
		console.log(`${prefix}\n${body}`);
		return;
	}
	console.log(`${prefix}\n${JSON.stringify(body, null, 2)}`);
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(message) {
	console.error(`error: ${message}`);
	console.error("Run with --help for usage.");
	process.exit(1);
}

function printHelp() {
	console.log(`Usage:
  npm run infer -- --target local
  npm run infer -- --target production
  npm run infer -- --target production --count 10

Options:
  --target NAME   Target name from test/infer.config.json. Default: local
  --count N       Number of requests. Default: 1
`);
}
