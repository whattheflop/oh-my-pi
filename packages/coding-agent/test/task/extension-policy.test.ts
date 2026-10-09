import { describe, expect, it } from "bun:test";
import type { PreparedExtension } from "@oh-my-pi/pi-coding-agent/extensibility/extensions/types";
import {
	filterTaskExtensionPaths,
	filterTaskExtensionPreloads,
	resolveTaskExtensionPolicy,
} from "@oh-my-pi/pi-coding-agent/task/extension-policy";

const paths = ["/plugins/workflow.ts", "/plugins/pi-autoresearch/hooks.ts", "/plugins/other/index.ts"];
const prepared: PreparedExtension[] = [
	{ path: paths[0], resolvedPath: paths[0], factory: () => {}, error: null },
	{ path: paths[1], resolvedPath: paths[1], factory: null, error: "load failed" },
	{ path: paths[2], resolvedPath: paths[2], factory: () => {}, error: null },
];

describe("task extension policy", () => {
	it("preserves inherited extension preloads by default", () => {
		const policy = resolveTaskExtensionPolicy({ settingsMode: undefined, settingsAllowlist: undefined });

		expect(policy).toEqual({ mode: "inherit", allowlist: [] });
		expect(filterTaskExtensionPreloads(policy, prepared, paths)).toEqual({ prepared, paths });
	});

	it("explicitly suppresses prepared factories, paths, and fallback discovery", () => {
		const policy = resolveTaskExtensionPolicy({ settingsMode: "none", settingsAllowlist: [] });

		expect(filterTaskExtensionPreloads(policy, undefined, undefined)).toEqual({ prepared: [], paths: [] });
		expect(filterTaskExtensionPreloads(policy, prepared, paths)).toEqual({ prepared: [], paths: [] });
	});

	it("filters prepared factories and fallback paths by the same derived extension id", () => {
		const policy = resolveTaskExtensionPolicy({
			settingsMode: "allowlist",
			settingsAllowlist: ["extension-module:workflow", "extension-module:hooks"],
		});

		expect(filterTaskExtensionPaths(policy, paths)).toEqual(paths.slice(0, 2));
		const filtered = filterTaskExtensionPreloads(policy, prepared, paths);
		expect(filtered.paths).toEqual(paths.slice(0, 2));
		expect(filtered.prepared).toEqual(prepared.slice(0, 2));
		// Failed imports still belong to an extension id and follow the same filter.
		expect(filtered.prepared?.[1]?.error).toBe("load failed");
	});

	it("treats an unknown or empty allowlist as explicit suppression", () => {
		for (const allowlist of [[], ["extension-module:missing"]]) {
			const policy = resolveTaskExtensionPolicy({ settingsMode: "allowlist", settingsAllowlist: allowlist });
			expect(filterTaskExtensionPreloads(policy, prepared, paths)).toEqual({ prepared: [], paths: [] });
		}
	});

	it("applies agent overrides before settings and inherited lineage policy", () => {
		const inherited = { mode: "none" as const, allowlist: [] };
		const allowlisted = resolveTaskExtensionPolicy({
			settingsMode: "none",
			settingsAllowlist: [],
			inherited,
			agentOverride: ["extension-module:workflow"],
		});
		expect(allowlisted).toEqual({ mode: "allowlist", allowlist: ["extension-module:workflow"] });

		const inheritedOverride = resolveTaskExtensionPolicy({
			settingsMode: "inherit",
			settingsAllowlist: [],
			inherited,
			agentOverride: "inherit",
		});
		expect(inheritedOverride).toEqual(inherited);

		const settingsOverride = resolveTaskExtensionPolicy({
			settingsMode: "none",
			settingsAllowlist: [],
			agentOverride: "inherit",
		});
		expect(settingsOverride).toEqual({ mode: "inherit", allowlist: [] });
	});

	it("makes restricted child suppression unconditional", () => {
		const policy = resolveTaskExtensionPolicy({
			settingsMode: "inherit",
			settingsAllowlist: [],
			agentOverride: ["extension-module:workflow"],
			restricted: true,
		});

		expect(policy).toEqual({ mode: "none", allowlist: [] });
	});
});
