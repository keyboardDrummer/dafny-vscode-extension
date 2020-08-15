'use strict';

import { workspace, ExtensionContext, Disposable } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient';
import * as path from 'path'
import * as fs from 'fs'
import TelemetryReporter from 'vscode-extension-telemetry';

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

async function activateWithConfig(context: ExtensionContext) {
	for(const previousClient of context.subscriptions) {
		previousClient.dispose()
	}
	context.subscriptions.length = 0;

	// ensure it gets property disposed
	context.subscriptions.push(reporter);

	const disposable = activateLanguage();
	context.subscriptions.push(disposable);
}

function activateLanguage(): Disposable {
	let serverOptions: ServerOptions = createServerOptions();
	
	let clientOptions: LanguageClientOptions = {
		documentSelector: [{scheme: 'file', language: "eafny"}],
		synchronize: {
			configurationSection: 'eafny',
		}
	}
	
	const start = Date.now()
	const languageClient = new LanguageClient(
		"eafny", "Eafny Language Server", 
		serverOptions, clientOptions);

	const info = (message: String) => {
		languageClient.outputChannel.appendLine(`[INFO] ${message}`);
	}
	languageClient.onReady().then(_ => {
		const connectionTime = Date.now() - start;
		info(`Connection time was ${connectionTime}`);
		reporter.sendTelemetryEvent("Dafny_ready", undefined, { connectionTime })
	})
	languageClient.onTelemetry((data: any) => {
		const {name, value} = data
		const measurements = {}
		measurements[name] = value
		info(`${name} was ${value}`);
		reporter.sendTelemetryEvent("Dafny_lspServer", undefined, measurements)
	})

	return languageClient.start();

}

function getExecutable() {
	return `C:\\Users\\Steen\\source\\repos\\dafny\\Source\\DafnyLSPServerTests\\bin\\Debug\\DafnyLSPServer.exe`
}

function createServerOptions(): ServerOptions {
	return {
		command: getExecutable(),
		options: {
			env: process.env,
			stdio: 'pipe'
		},
		args: []
	}
}

export function deactivate() {
	if (reporter) {
		reporter.dispose();
	}
}