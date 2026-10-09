import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { bindPreparedExtensions, loadExtensions } from "@oh-my-pi/pi-coding-agent/extensibility/extensions/loader";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent/extensibility/extensions/types";
import { EventBus } from "@oh-my-pi/pi-coding-agent/utils/event-bus";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })),
	);
});

describe("prepared extension rebinding", () => {
	it("rebinds parent, child, and grandchild sessions without evaluating the module graph again", async () => {
		const directory = await fs.mkdtemp(path.join(os.tmpdir(), "omp-prepared-extension-"));
		temporaryDirectories.push(directory);
		const parentDirectory = path.join(directory, "parent");
		const childDirectory = path.join(directory, "child");
		await Promise.all([fs.mkdir(parentDirectory), fs.mkdir(childDirectory)]);
		const extensionPath = path.join(directory, "counter.ts");
		const evalKey = `__omp_prepared_extension_eval_${crypto.randomUUID().replaceAll("-", "")}`;
		const bindKey = `__omp_prepared_extension_bind_${crypto.randomUUID().replaceAll("-", "")}`;
		const bindingsKey = `${evalKey}_bindings`;
		await Bun.write(
			extensionPath,
			[
				`Reflect.set(globalThis, ${JSON.stringify(evalKey)}, Number(Reflect.get(globalThis, ${JSON.stringify(evalKey)}) ?? 0) + 1);`,
				`export default function counterExtension(api) {`,
				`  Reflect.set(globalThis, ${JSON.stringify(bindKey)}, Number(Reflect.get(globalThis, ${JSON.stringify(bindKey)}) ?? 0) + 1);`,
				`  const bindings = Reflect.get(globalThis, ${JSON.stringify(bindingsKey)}) ?? [];`,
				`  bindings.push(api);`,
				`  Reflect.set(globalThis, ${JSON.stringify(bindingsKey)}, bindings);`,
				`}`,
			].join("\n"),
		);

		const parentEventBus = new EventBus();
		const childEventBus = new EventBus();
		const parent = await loadExtensions([extensionPath], parentDirectory, parentEventBus);
		const prepared = parent.preparedExtensions;
		expect(prepared).toHaveLength(1);
		expect(Reflect.get(globalThis, evalKey)).toBe(1);

		const child = await bindPreparedExtensions(prepared ?? [], childDirectory, childEventBus);
		const grandchildEventBus = new EventBus();
		const grandchild = await bindPreparedExtensions(
			child.preparedExtensions ?? [],
			childDirectory,
			grandchildEventBus,
		);

		expect(Reflect.get(globalThis, evalKey)).toBe(1);
		expect(Reflect.get(globalThis, bindKey)).toBe(3);
		expect(child.extensions).toHaveLength(1);
		expect(grandchild.extensions).toHaveLength(1);
		expect(child.extensions[0]).not.toBe(parent.extensions[0]);
		expect(grandchild.extensions[0]).not.toBe(child.extensions[0]);
		expect(parent.runtime).not.toBe(child.runtime);
		expect(child.runtime).not.toBe(grandchild.runtime);

		const bindings = Reflect.get(globalThis, bindingsKey) as ExtensionAPI[];
		expect(bindings).toHaveLength(3);
		expect(bindings[0]).not.toBe(bindings[1]);
		expect(bindings[1]).not.toBe(bindings[2]);
		expect(bindings[0]?.events).toBe(parentEventBus);
		expect(bindings[1]?.events).toBe(childEventBus);
		expect(bindings[2]?.events).toBe(grandchildEventBus);
		const [parentPwd, childPwd, grandchildPwd] = await Promise.all([
			bindings[0]!.exec("pwd", []),
			bindings[1]!.exec("pwd", []),
			bindings[2]!.exec("pwd", []),
		]);
		expect(parentPwd.stdout.trim()).toBe(await fs.realpath(parentDirectory));
		expect(childPwd.stdout.trim()).toBe(await fs.realpath(childDirectory));
		expect(grandchildPwd.stdout.trim()).toBe(await fs.realpath(childDirectory));
		Reflect.deleteProperty(globalThis, evalKey);
		Reflect.deleteProperty(globalThis, bindKey);
		Reflect.deleteProperty(globalThis, bindingsKey);
	});
});
