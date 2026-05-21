import type { ComponentContext } from "dreamland/core";
import "./style.css";
import { dotnetState, initDotnet, play, setPhase } from "./dotnet";
import { downloadMinecraftVersionToOpfs, isMinecraftVersionDownloaded, setProxyBypass } from "./minecraft";

if (!import.meta.env.DEV) {
	setProxyBypass(true);
}

function App(cx: ComponentContext<{}>) {
	cx.mount = async () => {
		const canvas = cx.root.querySelector("#canvas") as HTMLCanvasElement;
		if (!canvas) return;

		await initDotnet(canvas);

		setPhase("check", "Checking Minecraft files...", 0, 1);
		const downloaded = await isMinecraftVersionDownloaded("1.16.1", { verifyHashes: true });
		if (!downloaded) {
			setPhase("download", "Preparing download...", 0, 1);
			await downloadMinecraftVersionToOpfs("1.16.1", {
				onProgress: (p) => {
					setPhase("download", p.label, p.current, p.total);
				}
			});
		}

		setPhase("launch", "Launching Minecraft...", 0, 1);
		await play();
		setPhase("running", "Playing", 1, 1);

		canvas.style.display = "block";
		const loader = cx.root.querySelector("#loader");
		if (loader) loader.remove();
	};

	return (
		<div style="overflow:hidden;height:100%;background:#1a1a2e;color:#eee;font-family:system-ui,sans-serif">
			<canvas id="canvas" class="canvas" style="display:none;width:100%;height:100%" />
			<div id="loader" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px">
				<div style="font-size:18px;font-weight:600">{use(dotnetState.statusText)}</div>
				<div style="width:320px;height:6px;background:#333;border-radius:3px;overflow:hidden">
					<div id="bar" style="width:0%;height:100%;background:#4fc3f7;border-radius:3px;transition:width .3s" />
				</div>
			</div>
		</div>
	)
}

document.querySelector("#app")!.replaceWith(<App />);
