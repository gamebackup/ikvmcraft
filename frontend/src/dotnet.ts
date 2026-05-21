import { createState } from "dreamland/core";
import type { ModuleAPI, MonoConfig, RuntimeAPI } from "./dotnetdefs";

const wasm: ModuleAPI = await eval(`import("/_framework/dotnet.js")`);
const dotnet = wasm.dotnet;
let runtime: RuntimeAPI;
let config: MonoConfig;
let exports: any;

export let dotnetState = createState({
	logs: [] as string[],
	phase: "idle" as string,
	progress: 0,
	progressMax: 1,
	statusText: "",
});

export function setPhase(phase: string, statusText: string, progress: number, progressMax: number) {
	dotnetState.phase = phase;
	dotnetState.statusText = statusText;
	dotnetState.progress = progress;
	dotnetState.progressMax = progressMax;
	const bar = document.getElementById("bar") as HTMLDivElement | null;
	if (bar) {
		bar.style.width = progressMax > 0 ? `${Math.min(100, (progress / progressMax) * 100)}%` : "0%";
	}
}

export function tickProgress(increment: number) {
	dotnetState.progress = dotnetState.progress + increment;
}

export function setProgressMax(max: number) {
	dotnetState.progressMax = max;
}

/*
console.log = new Proxy(console.log, {
	apply(target, thisArg, argArray) {
		dotnetState.logs = [...dotnetState.logs, argArray.join(" ")];
		return Reflect.apply(target, thisArg, argArray);
	},
})
(globalThis as any).logs = []
console.log = new Proxy(console.log, {
	apply(target, thisArg, argArray) {
		(globalThis as any).logs.push(argArray);
	},
})
*/

const rootFolder = await navigator.storage.getDirectory();
(globalThis as any).selectjar = async () => {
	const fileHandle = await (window as any).showOpenFilePicker().then((handles: any[]) => handles[0]);
	const data = await fileHandle.getFile().then((r: File) => r.stream());
	let handle = await rootFolder.getFileHandle("main.jar", { create: true });
	const writable = await handle.createWritable();
	await data.pipeTo(writable);
}

export async function initDotnet(canvas: HTMLCanvasElement) {
	console.time("dotnet ");
	setPhase("runtime", "Loading .NET runtime...", 0, 4);

	runtime = await dotnet
		.withConfig({ pthreadPoolInitialSize: 16 })
		.withEnvironmentVariable("MONO_SLEEP_ABORT_LIMIT", "20000")
		.withRuntimeOptions([
			`--no-jiterpreter-traces-enabled`
		])
		.create();

	// why??
	let pump = (runtime.Module as any).wasmExports["emscripten_main_thread_process_queued_calls"];
	setInterval(() => {
		pump();
	}, 1);

	setPhase("runtime", "Starting .NET runtime...", 1, 4);
	config = runtime.getConfig();
	exports = await runtime.getAssemblyExports(config.mainAssemblyName!);

	(runtime.Module as any).canvas = canvas;

	(globalThis as any).wasm = {
		Module: runtime.Module,
		FS: (runtime.Module as any).FS,
		dotnet,
		runtime,
		config,
		exports,
		canvas,
	};

	setPhase("runtime", "Running PreInit...", 2, 4);
	await runtime.runMain();
	setPhase("runtime", "Initializing IKVM...", 3, 4);
	await exports.IkvmWasm.PreInit(location.href, [["org.lwjgl.util.Debug", "true"], ["org.lwjgl.util.DebugLoader", "true"]]);
	setPhase("runtime", "Runtime ready", 4, 4);
	console.timeEnd("dotnet ");
}

export async function play() {
	console.debug("Run...");
	//await triageSetupAndInvoke("org.lwjgl.system.MemoryUtil");
	//await reflectInvoke("org.lwjgl.system.Pointer$Default");
	//await reflectInvoke("org.lwjgl.system.SharedLibrary$Default");
	//await reflectInvoke("org.lwjgl.system.Callback");
	await exports.IkvmWasm.Run()
	//await exports.IkvmWasm.RunJar("/assets/log4j-demo.jar")
	//await exports.IkvmWasm.RunJar("/assets/lwjgl3-demos.jar", "org.lwjgl.demo.game.VoxelGameGL");
	//await exports.IkvmWasm.RunJar("/assets/lwjgl3-demos.jar", "org.lwjgl.demo.opengl.camera.FreeCameraDemo");
	//await exports.IkvmWasm.RunJar("/assets/lwjgl3-demos.jar", "org.lwjgl.demo.opengl.shadow.ShadowMappingDemo20");
	console.debug("Exited");
}

/**
 * Triage helper: set up Minecraft classpath without launching, then drive
 * specific Java classes by reflection. Use to bisect which class triggers the
 * bug. Call from devtools as `wasm.triage("net.minecraft.Util")` etc.
 */
export async function reflectInvoke(className: string, methodName: string = "", args: string[] = []) {
	console.debug(`[triage] reflect-invoke ${className}.${methodName || "<load>"}(${args.join(", ")})`);
	await exports.IkvmWasm.ReflectInvoke(className, methodName, args);
}

export async function triageSetupAndInvoke(className: string, methodName: string = "", args: string[] = []) {
	console.debug("[triage] setting up minecraft classpath...");
	await exports.IkvmWasm.SetupMinecraft();
	await reflectInvoke(className, methodName, args);
}

(globalThis as any).triage = triageSetupAndInvoke;
(globalThis as any).triageInvoke = reflectInvoke;

/**
 * Run the full Minecraft Main.main(String[]) via the triage path. Use this
 * to test whether the bug reproduces when only the launcher main code runs,
 * with no extra setup beyond what SetupMinecraft does.
 */
export async function triageMain() {
	console.debug("[triage] setting up + running Main.main...");
	await exports.IkvmWasm.SetupMinecraft();
	await exports.IkvmWasm.RunMinecraftMain();
}
(globalThis as any).triageMain = triageMain;
