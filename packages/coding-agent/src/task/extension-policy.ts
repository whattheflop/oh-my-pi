import { getExtensionNameFromPath } from "../discovery/helpers";
import type { PreparedExtension } from "../extensibility/extensions/types";

/** How filesystem/prepared extension modules are made available to task children. */
export type TaskExtensionMode = "inherit" | "none" | "allowlist";

/** Effective extension-module forwarding policy for one task-session lineage. */
export interface TaskExtensionPolicy {
	mode: TaskExtensionMode;
	/** Exact `extension-module:<derivedName>` identifiers allowed by `allowlist`. */
	allowlist: readonly string[];
}

export type AgentExtensionOverride = TaskExtensionMode | readonly string[];

export interface TaskExtensionPolicyInputs {
	settingsMode: TaskExtensionMode | undefined;
	settingsAllowlist: readonly string[] | undefined;
	inherited?: TaskExtensionPolicy;
	agentOverride?: AgentExtensionOverride;
	restricted?: boolean;
}

export function resolveTaskExtensionPolicy(inputs: TaskExtensionPolicyInputs): TaskExtensionPolicy {
	if (inputs.restricted) return { mode: "none", allowlist: [] };

	const override = inputs.agentOverride;
	if (Array.isArray(override)) return { mode: "allowlist", allowlist: [...override] };
	if (override === "none") return { mode: "none", allowlist: [] };
	if (override === "allowlist") return { mode: "allowlist", allowlist: [] };
	if (override === "inherit") {
		return inputs.inherited
			? { mode: inputs.inherited.mode, allowlist: [...inputs.inherited.allowlist] }
			: { mode: "inherit", allowlist: [] };
	}
	if (inputs.inherited) {
		return { mode: inputs.inherited.mode, allowlist: [...inputs.inherited.allowlist] };
	}

	const mode = inputs.settingsMode ?? "inherit";
	return {
		mode,
		allowlist: mode === "allowlist" ? [...(inputs.settingsAllowlist ?? [])] : [],
	};
}

function extensionId(path: string): string {
	return `extension-module:${getExtensionNameFromPath(path)}`;
}

/** Filter a path list according to a task policy. Inherit preserves the input list. */
export function filterTaskExtensionPaths(
	policy: TaskExtensionPolicy,
	paths: readonly string[] | undefined,
): string[] | undefined {
	if (paths === undefined || policy.mode === "inherit") return paths as string[] | undefined;
	if (policy.mode === "none" || policy.allowlist.length === 0) return [];
	const allowed = new Set(policy.allowlist);
	return paths.filter(path => allowed.has(extensionId(path)));
}

/**
 * Filter prepared factories and fallback paths using the same derived id. The
 * prepared list intentionally includes errored entries: they still correspond
 * to source modules and must be filtered identically to fallback paths.
 */
export function filterTaskExtensionPreloads(
	policy: TaskExtensionPolicy,
	prepared: readonly PreparedExtension[] | undefined,
	paths: readonly string[] | undefined,
): { prepared: readonly PreparedExtension[] | undefined; paths: string[] | undefined } {
	if (policy.mode === "inherit") {
		return { prepared, paths: paths as string[] | undefined };
	}
	if (policy.mode === "none" || policy.allowlist.length === 0) return { prepared: [], paths: [] };
	const allowed = new Set(policy.allowlist);
	const matches = (sourcePath: string): boolean => allowed.has(extensionId(sourcePath));
	return {
		prepared: prepared?.filter(entry => matches(entry.path)),
		paths: paths?.filter(matches),
	};
}
