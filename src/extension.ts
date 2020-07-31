'use strict';

import { workspace, ExtensionContext, window, Disposable } from 'vscode';
import { TransportKind, LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient';
import * as path from 'path'
import * as fs from 'fs'
import TelemetryReporter from 'vscode-extension-telemetry';
import * as jvmDetector from './requirements';

let reporter: TelemetryReporter;

export function activate(context: ExtensionContext) {
    createReporter(context)
	reporter.sendTelemetryEvent("activate")

	workspace.onDidChangeConfiguration(() => activateWithConfig(context));
	activateWithConfig(context);
}

function createReporter(context: ExtensionContext) {
    const extensionPath = path.join(context.extensionPath, "package.json");
    const packageFile = JSON.parse(fs.readFileSync(extensionPath, 'utf8'));

	let version = "unknown"
	let extensionId = "unknown"

    if (packageFile) {
		version = packageFile.version;
		extensionId = packageFile.name
	}

	// create telemetry reporter on extension activation
	reporter = new TelemetryReporter(extensionId, version, "4f5e6451-3d46-49f6-a295-ade5e6d47d47");
}

let previousMode: Mode | undefined = undefined;
async function activateWithConfig(context: ExtensionContext) {

	const mode = await getMode()
	if (!mode) {
		window.showErrorMessage("Could not locate a language server. Please configure \"miksilo.jar\" in settings.");
		return;
	}

	if (mode?.toString() === previousMode?.toString())
		return;

	previousMode = mode;

	for(const previousClient of context.subscriptions) {
		previousClient.dispose()
	}
	context.subscriptions.length = 0;

	// ensure it gets property disposed
	context.subscriptions.push(reporter);

	const disposable = activateLanguage();
}

function activateLanguage(): Disposable {
	let serverOptions: ServerOptions = prepareExecutable(mode, language)
	
	let clientOptions: LanguageClientOptions = {
		documentSelector: [{scheme: 'file', language: "Dafny"}],
		synchronize: {
			configurationSection: 'miksilo',
		}
	}
	
	const start = Date.now()
	const languageClient = new LanguageClient(
		"dafny-vscode", "Dafny Language Server", 
		serverOptions, clientOptions);

	const info = (message: String) => {
		languageClient.outputChannel.appendLine(`[INFO] ${message}`);
	}
	if (mode.reason) {
	    info(mode.reason);
	}
	languageClient.onReady().then(_ => {
		const connectionTime = Date.now() - start;
		info(`Connection time was ${connectionTime}`);
		reporter.sendTelemetryEvent(language.vscodeName + "_ready", undefined, { connectionTime })
	})
	languageClient.onTelemetry((data: any) => {
		const {name, value} = data
		const measurements = {}
		measurements[name] = value
		info(`${name} was ${value}`);
		reporter.sendTelemetryEvent(language.vscodeName + "_lspServer", undefined, measurements)
	})

	info("Using Miksilo mode " + mode);
	return languageClient.start();

}

function prepareExecutable(mode: Mode, language: LanguageConfiguration): ServerOptions {

	language.miksiloName = language.miksiloName || language.vscodeName;
    const args = [language.miksiloName, `${__dirname}/CloudFormationResourceSpecification.json`]
	const serverOptions = mode.createServerOptions(args);

	return serverOptions;
}

export function deactivate() {
	if (reporter) {
		reporter.dispose();
	}
}