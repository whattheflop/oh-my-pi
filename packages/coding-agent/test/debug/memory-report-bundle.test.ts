import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { HeapSnapshot } from "@oh-my-pi/pi-coding-agent/debug/profiler";
import { createReportBundle } from "@oh-my-pi/pi-coding-agent/debug/report-bundle";
import { getConfigRootDir, removeWithRetries, setAgentDir } from "@oh-my-pi/pi-utils";

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
const originalXdgStateHome = process.env.XDG_STATE_HOME;
const fallbackAgentDir = path.join(getConfigRootDir(), "agent");
let cleanupRoot: string | undefined;

afterEach(async () => {
	if (originalXdgStateHome === undefined) delete process.env.XDG_STATE_HOME;
	else process.env.XDG_STATE_HOME = originalXdgStateHome;
	if (originalAgentDir) setAgentDir(originalAgentDir);
	else {
		setAgentDir(fallbackAgentDir);
		delete process.env.PI_CODING_AGENT_DIR;
	}
	if (cleanupRoot) await removeWithRetries(cleanupRoot);
	cleanupRoot = undefined;
});

describe("memory report bundle", () => {
	it("includes pre-snapshot JSC and process memory counters", async () => {
		cleanupRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omp-memory-report-"));
		const xdgStateHome = path.join(cleanupRoot, "state");
		await fs.mkdir(path.join(xdgStateHome, "omp"), { recursive: true });
		process.env.XDG_STATE_HOME = xdgStateHome;
		setAgentDir(fallbackAgentDir);

		const heapSnapshot: HeapSnapshot = {
			data: "heap-data",
			jscData: "jsc-heap-data",
			jscHeap: {
				heapSize: 101,
				heapCapacity: 202,
				extraMemorySize: 303,
				objectCount: 404,
				protectedObjectCount: 5,
				globalObjectCount: 1,
				protectedGlobalObjectCount: 1,
				objectTypeCounts: { ModuleRecord: 17, string: 29 },
				protectedObjectTypeCounts: {},
			},
			jscProcessMemory: { current: 505, peak: 606, currentCommit: 707, peakCommit: 808, pageFaults: 9 },
			processMemory: { rss: 909, heapTotal: 1_010, heapUsed: 1_111, external: 1_212, arrayBuffers: 1_313 },
		};

		const result = await createReportBundle({ sessionFile: undefined, heapSnapshot });

		expect(result.files).toContain("heap.heapsnapshot");
		expect(result.files).toContain("heap.jsc.json");
		expect(result.files).toContain("memory-stats.json");
		const archive = new Bun.Archive(await Bun.file(result.path).bytes());
		const files = await archive.files();
		expect(await files.get("heap.heapsnapshot")?.text()).toBe("heap-data");
		expect(await files.get("heap.jsc.json")?.text()).toBe("jsc-heap-data");
		const metrics = await files.get("memory-stats.json")?.json();
		expect(metrics).toEqual({
			jscHeap: heapSnapshot.jscHeap,
			jscProcessMemory: heapSnapshot.jscProcessMemory,
			processMemory: heapSnapshot.processMemory,
		});
	});
});
