'use strict';
const path = require('path');
const {app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, dialog } = require('electron');
const {autoUpdater} = require('electron-updater');
const {is} = require('electron-util');
const unhandled = require('electron-unhandled');
const debug = require('electron-debug');
const config = require('./config');
const WebSocket = require('ws');

//mdns variables
const mdns = require('mdns-js');
var mdns_browse_window_timer = undefined;
var mdns_browser_propresenter = undefined; //mdns browser variable
var mdns_browser_midirelay = undefined; //mdns browser variable
var mdns_propresenter_hosts = []; //global array of found hosts through mdns
var mdns_midirelay_hosts = []; //global array of found hosts through mdns

//ProPresenter variables
var propresenter_socket = undefined;
var propresenter_status = 'disconnected';
var propresenter_cs = '';
var propresenter_csn = '';
var propresenter_csn_commands = [];
var propresenter_ns = '';
var propresenter_nsn = '';
var propresenter_nsn_commands = [];

const axios = require('axios');
const socketio = require('socket.io-client');
const net = require('net');

//PresentationBridge variables
let bridgeConnected = false;
let bridgeIO = null;
var presentationbridge_status = 'disconnected';

var commands_on = true;
var lyrics_on = true;

//Companion socket
let companionClient = undefined;

unhandled();
//debug();

var trayMenuItems = [
	{
		label: 'ProPresenter: Disconnected',
		enabled: false
	},
	{
		label: 'Presentation Bridge: Disconnected',
		enabled: false
	},
	{
		label: 'Settings',
		click: function () {
			openSettings();
		}
	},

	{
		label: 'Go To Logo',
		click: function () {
			presentationbridge_gotologo();
		}
	},
	{
		label: 'Turn Off Commands',
		click: function () {
			turnOffCommands();
		}
	},
	{
		label: 'Turn Off Cloud Lyrics',
		click: function () {
			turnOffLyrics();
		}
	},
	{
		label: 'Monitor',
		click: function () {
			openMonitor();
		}
	},
	{
		label: 'Quit',
		click: function () {
			app.quit();
		}
	}
];
var tray = null;

// Note: Must match `build.appId` in package.json
app.setAppUserModelId('com.techministry.presentationbridgeclient');

// Prevent windows from being garbage collected
let settingsWindow;
let monitorWindow;

// Prevent multiple instances of the app
if (!app.requestSingleInstanceLock()) {
	app.quit();
}

app.on('second-instance', () => {
	if (settingsWindow) {
		if (settingsWindow.isMinimized()) {
			settingsWindow.restore();
		}

		settingsWindow.show();
	}
	if (monitorWindow) {
		if (monitorWindow.isMinimized()) {
			monitorWindow.restore();
		}

		monitorWindow.show();
	}
});

app.on('window-all-closed', () => {
	/* 
	Don't quit just because windows are closed as Tray will still be running
	*/
});

app.on('quit', () => {
	if (companionClient !== undefined) {
		companionClient.destroy()
	}
	clearLyrics();
});

app.on('activate', async () => {
	if (!settingsWindow) {
		settingsWindow = await createsettingsWindow();
	}
	if (!monitorWindow) {
		monitorWindow = await createmonitorWindow();
	}

	if (process.platform === "darwin")
	{
		app.dock.hide(); // Keep it out of the dock
	}
});

const createsettingsWindow = async () => {
	const win = new BrowserWindow({
		title: app.name + ' Settings',
		autoHideMenuBar: true,
		show: false,
		width: 1000,
		height: 825,
		webPreferences: {
			contextIsolation: false,
			nodeIntegration: true,
			enableRemoteModule: true
		}
	});

	win.on('ready-to-show', () => {
		if (config.get('switch_settings')) {
			win.show();
			SendStatusMessage();
		}
	});

	win.on('closed', () => {
		// Dereference the window
		// For multiple windows store them in an array
		settingsWindow = undefined
	});

	await win.loadFile(path.join(__dirname, 'index.html'));

	return win;
};

const openSettings = async () => {
	if (settingsWindow !== undefined) {
		if (settingsWindow.isMinimized()) {
			settingsWindow.restore();
		}

		settingsWindow.show();
	}
	else {
		settingsWindow = await createsettingsWindow();
	}
}

const createmonitorWindow = async () => {
	const win2 = new BrowserWindow({
		title: app.name + ' Monitor',
		autoHideMenuBar: true,
		show: false,
		width: 1000,
		height: 800,
		webPreferences: {
			contextIsolation: false,
			nodeIntegration: true,
			enableRemoteModule: true
		}
	});

	win2.on('ready-to-show', () => {
		if (config.get('switch_monitor')) {
			win2.show();
		}
	});

	win2.on('closed', () => {
		// Dereference the window
		// For multiple windows store them in an array
		monitorWindow = undefined;
	});

	await win2.loadFile(path.join(__dirname, 'monitor.html'));

	return win2;
};

const openMonitor = async () => {

	if (monitorWindow !== undefined) {
		if (monitorWindow.isMinimized()) {
			monitorWindow.restore();
		}

		monitorWindow.show();
	}
	else {
		monitorWindow = await createmonitorWindow();
		monitorWindow.show();
	}
}

function checkForUpdates() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.checkForUpdates();
    autoUpdater.on("update-available", () => {
		settingsWindow.show();
        dialog.showMessageBox(settingsWindow, {
            title: "Update Available",
            message: "There's an update available for PresentationBridge Client. Do you want to download and install it?",
            buttons: ["Update", "Cancel"],
        }).then((v) => {
            if (v.response == 0) {
                dialog.showMessageBox(settingsWindow, {
                    title: "Downloading update",
                    message: "The update is being downloaded in the background. Once finished, you will be prompted to save your work and restart PresentationBridge Client."
                });
                autoUpdater.downloadUpdate();
            }
        });
    });
    autoUpdater.on("update-downloaded", () => {
        dialog.showMessageBox(null, {
            title: "Update downloaded",
            message: "The update has been downloaded. Save your work and then press the Update button.",
            buttons: ["Update"],
        }).then((r) => {
            if (r.response == 0) {
                autoUpdater.quitAndInstall();
            }
        });
    });
}

(async () => {
	await app.whenReady();

	settingsWindow = await createsettingsWindow();
	monitorWindow = await createmonitorWindow();
	
	tray = new Tray(path.join(__dirname,'Bridge-icon.png'));
	buildTray();

	if (!is.development) {
		const FOUR_HOURS = 1000 * 60 * 60 * 4;
		setInterval(() => {
			checkForUpdates();
		}, FOUR_HOURS);
		checkForUpdates();
	}

	if (config.get('switch_mdns')) {
		findHosts();
	}

	if (config.get('propresenterIP') !== '') {
		propresenter_connect();
	}

	if (config.get('presentationbridgeHost') !== '') {
		presentationbridge_connect();
	}
})();

function buildTray() {
	let trayContextMenu = Menu.buildFromTemplate(trayMenuItems);
	tray.setToolTip('Presentation Bridge Client');
	tray.setContextMenu(trayContextMenu);
}

function mdns_close_browsers(){
	mdns_browser_propresenter.stop();
	mdns_browser_midirelay.stop();

	mdns_browser_propresenter = undefined;
	mdns_browser_midirelay = undefined;
}

function findHosts() {

	mdns_browser_propresenter = mdns.createBrowser(mdns.tcp('pro7stagedsply'));
	mdns_browser_midirelay = mdns.createBrowser(mdns.tcp('midi-relay'));
	mdns_browse_window_timer = setTimeout(mdns_close_browsers, 5000) // stop browser after a discovery period to protect from low level memory leak error that can occur in rare circumstances

	mdns_browser_propresenter.on('ready', function onReady() {
		mdns_browser_propresenter.discover();
	});

	mdns_browser_propresenter.on('update', function onUpdate(data) {
		//console.log(data);
		for (let i = 0; i < data.type.length; i++) {
			if (data.type[i].name.indexOf('pro7stagedsply') > -1) {
				mdns_propresenter_addhost(data.host, data.addresses[0], data.port, data.fullname);
			}	
		}
	});

	mdns_browser_midirelay.on('ready', function onReady() {
		mdns_browser_midirelay.discover();
	});

	mdns_browser_midirelay.on('update', function onUpdate(data) {
		//console.log(data);
		for (let i = 0; i < data.type.length; i++) {
			if (data.type[i].name.indexOf('midi-relay') > -1) {
				mdns_midirelay_addhost(data.host, data.addresses[0], data.port);
			}	
		}
	});
}

function mdns_propresenter_addhost(host, ip, port, name) {
	// first check to see if it's already in the list, and don't add it if so
	let isFound = false;

	for (let i = 0; i < mdns_propresenter_hosts.length; i++) {
		if (mdns_propresenter_hosts[i].ip === ip) {
			isFound = true;
			mdns_propresenter_hosts[i].port = port;
			mdns_propresenter_hosts[i].name = name ? name.substring(0, name.indexOf('.')) : '';
			break;
		}
	}

	if (!isFound) {
		let hostObj = {};
		hostObj.name = host;
		hostObj.ip = ip;
		hostObj.port = port;
		hostObj.name = name ? name.substring(0, name.indexOf('.')) : '';
		mdns_propresenter_hosts.push(hostObj);
	}

	if (settingsWindow) {
		settingsWindow.webContents.send('mdns_propresenter_hosts', mdns_propresenter_hosts);
	}
}

function mdns_midirelay_addhost(host, ip, port) {
	// first check to see if it's already in the list, and don't add it if so
	let isFound = false;

	for (let i = 0; i < mdns_midirelay_hosts.length; i++) {
		if (mdns_midirelay_hosts[i].ip === ip) {
			isFound = true;
			mdns_midirelay_hosts[i].port = port;
			break;
		}
	}

	if (!isFound) {
		let hostObj = {};
		hostObj.name = host;
		hostObj.ip = ip;
		hostObj.port = port;
		mdns_midirelay_hosts.push(hostObj);
	}

	if (settingsWindow) {
		settingsWindow.webContents.send('mdns_midirelay_hosts', mdns_midirelay_hosts);
	}

	console.log('mdns hosts', mdns_midirelay_hosts);
}


function propresenter_connect() {
	let ip = config.get('propresenterIP');
	let port = config.get('propresenterPort');
	let password = config.get('propresenterPassword');

	console.log('Opening ProPresenter Socket Connection: ' + ip + ':' + port);

	propresenter_status = 'connecting';
	SendStatusMessage();
	trayMenuItems[0].label = 'Connecting: ' + ip + ':' + port;
	buildTray();

	propresenter_socket = new WebSocket('ws://' + ip + ':' + port + '/stagedisplay');

	propresenter_socket.on('open', function open() {
		console.log('ProPresenter Connection Opened.');
		propresenter_status = 'open';
		SendStatusMessage();

		trayMenuItems[0].label = 'Connected: ' + ip + ':' + port;
		buildTray();

		propresenter_socket.send(JSON.stringify({
			pwd: password,
			ptl: 610,
			acn: "ath"
		}));
	});

	propresenter_socket.on('message', function(message) {
		// Handle the stage display message received from ProPresenter
		handleStageDisplayMessage(message);
	});

	propresenter_socket.on('error', function (err) {
		if (err.errno.indexOf('ECONNREFUSED') > -1) {
			propresenter_status = 'econnrefused';
			SendStatusMessage();
			trayMenuItems[0].label = 'Connection Refused: ' + ip + ':' + port;
			buildTray();
		}
		else if (err.errno.indexOf('ETIMEDOUT') > -1) {
			propresenter_status = 'etimedout';
			SendStatusMessage();
			trayMenuItems[0].label = 'Connection Timed Out: ' + ip + ':' + port;
			buildTray();
		}
	});

	propresenter_socket.on('close', function(code, reason) {
		console.log('ProPresenter disconnected.');
		//console.log('Current State: ' + propresenter_status);

		if (propresenter_status !== 'force_disconnected') {
			setTimeout(propresenter_reconnect, 5000); //attempt to reeconnect until the user forces it to stop
		}
		SendStatusMessage();
	});
}

function propresenter_disconnect(reconnect) {
	console.log('Closing ProPresenter Connection.');
	propresenter_status = 'force_disconnected';
	trayMenuItems[0].label = 'Disconnected: ' + config.get('propresenterIP') + ':' + config.get('propresenterPort');
	buildTray();
	SendStatusMessage();
	if (reconnect) {
		propresenter_reconnect();
	}
}

function propresenter_reconnect() {
	console.log('Attempting to reconnect to ProPresenter...');
	propresenter_status = 'reconnecting';
	SendStatusMessage();
	propresenter_connect();
}

function presentationbridge_connect() {
	let host = config.get('presentationbridgeHost');
	let port = config.get('presentationbridgePort');
	let bridgeID = config.get('presentationbridgeID');
	let password = config.get('presentationbridgePassword');

	bridgeIO = socketio('http://' + host + ':' + port, { 'forceNew': true });
	presentationbridge_status = 'connecting';
	console.log('Connecting to Presentation Bridge Server...' + host + ' : ' + port);
	SendStatusMessage();

	bridgeIO.on('connect', function() {
		console.log('Bridge Connected. Authenticating...');
		bridgeIO.emit('bridgerooms_authenticate', bridgeID, password);
		presentationbridge_status = 'connected';
		SendStatusMessage();
	});

	bridgeIO.on('bridgerooms_authenticated', function(value) {
		console.log('Bridge Authenticated: ' + value);
		if (value) {
			bridgeConnected = true;
			presentationbridge_status = 'authenticated';
			SendStatusMessage();
			bridgeIO.emit('gotologo', bridgeID, false);
			trayMenuItems[1].label = 'Connected: ' + host + ':' + port;
			buildTray();
		}
		else {
			bridgeConnected = false;
			console.log('Invalid Bridge Password.');
			presentationbridge_status = 'badpassword';
			trayMenuItems[1].label = 'Bad Password: ' + host + ':' + port;
			buildTray();
			SendStatusMessage();
		}
	});

	bridgeIO.on('bridgerooms_inuse', function(value) {
		console.log('The selected Presentation Bridge is already in use on the server.');
		presentationbridge_status = 'inuse';
		trayMenuItems[1].label = 'Bridge Already In Use: ' + host + ':' + port;
		buildTray();
		SendStatusMessage();
	});

	bridgeIO.on('bridgeid_invalid', function() {
		console.log('The provided Presentation Bridge ID is invalid.');
		presentationbridge_status = 'badid';
		trayMenuItems[1].label = 'Invalid Bridge ID: ' + host + ':' + port;
		buildTray();
		SendStatusMessage();
	});

	bridgeIO.on('error', function (err) {
		console.log('Bridge Connect Error')
		if (err.errno.indexOf('ECONNREFUSED') > -1) {
			presentationbridge_status = 'econnrefused';
			SendStatusMessage();
			trayMenuItems[1].label = 'Connection Refused: ' + ip + ':' + port;
			buildTray();
		}
		else if (err.errno.indexOf('ETIMEDOUT') > -1) {
			presentationbridge_status = 'etimedout';
			SendStatusMessage();
			trayMenuItems[1].label = 'Connection Timed Out: ' + ip + ':' + port;
			buildTray();
		}
	});
 
	bridgeIO.on('disconnect', function() {
		bridgeConnected = false;
		console.log('Disconnected from Presentation Bridge Server.');
		presentationbridge_status = 'disconnected';
		trayMenuItems[1].label = 'Disconnected: ' + host + ':' + port;
		buildTray();
		SendStatusMessage();
	});
}

function presentationbridge_disconnect() {
	bridgeIO.emit('bridgerooms_disconnect', config.get('presentationbridgeID'));
	bridgeIO.disconnect();
	bridgeIO = null;
}

function presentationbridge_gotologo() {
	bridgeIO.emit('gotologo', config.get('presentationbridgeID'), true);
	console.log('Turning on logo.');
	trayMenuItems[3].label = 'Turn Off Logo';
	trayMenuItems[3].click = function () { presentationbridge_turnofflogo(); }
	buildTray();
}

function presentationbridge_turnofflogo() {
	bridgeIO.emit('gotologo', config.get('presentationbridgeID'), false);
	console.log('Turning off logo.');
	trayMenuItems[3].label = 'Go To Logo';
	trayMenuItems[3].click = function () { presentationbridge_gotologo(); }
	buildTray();
}

function turnOffCommands() {
	commands_on = false;
	console.log('Turning off all commands.');
	trayMenuItems[4].label = 'Turn On Commands';
	trayMenuItems[4].click = function () { turnOnCommands(); }
	buildTray();
}

function turnOnCommands() {
	commands_on = true;
	console.log('Turning on all commands.');
	trayMenuItems[4].label = 'Turn Off Commands';
	trayMenuItems[4].click = function () { turnOffCommands(); }
	buildTray();
}

function turnOffLyrics() {
	lyrics_on = false;
	console.log('Turning off all cloud lyrics.');
	clearLyrics();
	trayMenuItems[5].label = 'Turn On Lyrics';
	trayMenuItems[5].click = function () { turnOnLyrics(); }
	buildTray();
}

function turnOnLyrics() {
	lyrics_on = true;
	console.log('Turning on all cloud lyrics.');
	trayMenuItems[5].label = 'Turn Off Lyrics';
	trayMenuItems[5].click = function () { turnOffLyrics(); }
	buildTray();
}

function clearLyrics() {
	if (bridgeConnected) {
		bridgeIO.emit('current_slide', config.get('presentationbridgeID'), '');
		bridgeIO.emit('current_slide_notes', config.get('presentationbridgeID'), '');
		bridgeIO.emit('next_slide', config.get('presentationbridgeID'), '');
		bridgeIO.emit('next_slide_notes', config.get('presentationbridgeID'), '');
	}
}
function handleStageDisplayMessage(message) {

	var objData = JSON.parse(message);
	
	switch(objData.acn) {
		case 'ath':
			if (objData.ath === true) {
				console.log('ProPresenter connection authenticated.');
				propresenter_status = 'authenticated';
				SendStatusMessage();
			} else {
				console.log('Incorrect ProPresenter Stage Display password.');
				propresenter_status = 'badpassword';
				SendStatusMessage();
			}
			break;
		case 'fv':
			for (let i = 0; i < objData.ary.length; i++) {
				if (objData.ary[i].acn === 'cs') {
					propresenter_cs = objData.ary[i].txt;
					if (lyrics_on) {
						if (bridgeConnected) {
							bridgeIO.emit('current_slide', config.get('presentationbridgeID'), objData.ary[i].txt);
							if(config.get('switch_PPimages')) {
								GetProPresenterImage(objData.ary[i].uid)  
							}
						}
					}
					if (monitorWindow) {
						monitorWindow.webContents.send('cs', objData.ary[i].txt);
					}
				}
				if (objData.ary[i].acn === 'csn') {
					// separate commands from notes
					propresenter_csn = objData.ary[i].txt.toString()
					propresenter_csn_commands = []
					let commandset = objData.ary[i].txt.toString().match(/(?<command>\w+\s*:[\w\s,]*?;)/g)
					if (commandset !== null) {
						for (const item of commandset) {
							let command = item.substring(0, item.indexOf(':')).trim().toLowerCase()
							let parameters = item.substring(item.indexOf(':')+1).slice(0,-1).split(',').map(each => each.trim())
							// remove command from notes
							propresenter_csn = propresenter_csn.replace(item, '')
							// build commands array of clean strings
							propresenter_csn_commands.push({"command": command, "parameters": parameters})
						}
					}

					if (propresenter_csn_commands.length > 0) {
						if (commands_on) {
							parseStageDisplayMessage(propresenter_csn_commands);

						}
					}	

					if (monitorWindow) {
						monitorWindow.webContents.send('csn', propresenter_csn_commands);
					}

					if (lyrics_on) {
						if (bridgeConnected) {
							bridgeIO.emit('current_slide_notes', config.get('presentationbridgeID'), propresenter_csn);
						}
					}

				}
				if (objData.ary[i].acn === 'ns') {
					propresenter_ns = objData.ary[i].txt;
					if (lyrics_on) {
						if (bridgeConnected) {
							bridgeIO.emit('next_slide', config.get('presentationbridgeID'), objData.ary[i].txt);
						}
					}
					if (monitorWindow) {
						monitorWindow.webContents.send('ns', objData.ary[i].txt);
					}
				}
				if (objData.ary[i].acn === 'nsn') {
					// separate commands from notes
					propresenter_nsn = objData.ary[i].txt.toString()
					propresenter_nsn_commands = []
					let commandset = objData.ary[i].txt.toString().match(/(?<command>\w+\s*:[\w\s,]*?;)/g)
					if (commandset !== null) {
						for (const item of commandset) {
							let command = item.substring(0, item.indexOf(':')).trim().toLowerCase()
							let parameters = item.substring(item.indexOf(':')+1).slice(0,-1).split(',').map(each => each.trim())
							// remove command from notes
							propresenter_nsn = propresenter_nsn.replace(item, '')
							// build commands array of clean strings
							propresenter_nsn_commands.push({"command": command, "parameters": parameters})
						}
					}

					if (monitorWindow) {
						monitorWindow.webContents.send('nsn', propresenter_nsn_commands);
					}
				
					if (lyrics_on) {
						if (bridgeConnected) {
							bridgeIO.emit('next_slide_notes', config.get('presentationbridgeID'), propresenter_nsn);
						}
					}
				}
			}
			break;
		default:
			break;
	}
}

function parseStageDisplayMessage(commands) {

		for (let i = 0; i < commands.length; i++) {
			let command = commands[i].command
			let parameters = commands[i].parameters
			let commandObj = {};
			if (command !== '' && parameters) {
				switch(command) {
					case 'noteon':
						//"noteon:0,55,100" Note On Command, Channel 1 (zero based), Note 55, Velocity 100
						commandObj.midiport = config.get('midirelayMIDIPort');
						commandObj.midicommand = 'noteon';
						commandObj.channel = parameters[0];
						commandObj.note = parameters[1];
						commandObj.velocity = parameters[2];
						sendMidiRelayMessage(commandObj);
						break;
					case 'noteoff':
						//"noteoff:0,55,0" Note Off Command, Channel 1 (zero based), Note 55, Velocity 0
						commandObj.midiport = config.get('midirelayMIDIPort');
						commandObj.midicommand = 'noteoff';
						commandObj.channel = parameters[0];
						commandObj.note = parameters[1];
						commandObj.velocity = parameters[2];
						sendMidiRelayMessage(commandObj);
						break;
					case 'aftertouch':
						//"aftertouch:0,55,100" Polyphonic Aftertouch Command, Channel 1 (zero based), Note 55, Value 100
						commandObj.midiport = config.get('midirelayMIDIPort');
						commandObj.midicommand = 'aftertouch';
						commandObj.channel = parameters[0];
						commandObj.note = parameters[1];
						commandObj.value = parameters[2];
						sendMidiRelayMessage(commandObj);
						break;
					case 'cc':
						//"cc:0,32,100" CC (Controller Change) Command, Channel 1 (zero based), Controller 32, Value 100
						commandObj.midiport = config.get('midirelayMIDIPort');
						commandObj.midicommand = 'cc';
						commandObj.channel = parameters[0];
						commandObj.note = parameters[1];
						commandObj.value = parameters[2];
						sendMidiRelayMessage(commandObj);
						break;
					case 'pc':
						//"pc:0,100" PC (Program Change) Command, Channel 1 (zero based), Value 100
						commandObj.midiport = config.get('midirelayMIDIPort');
						commandObj.midicommand = 'pc';
						commandObj.channel = parameters[0];
						commandObj.value = parameters[1];
						sendMidiRelayMessage(commandObj);
						break;
					case 'pressure':
						//"pressure:0,100" Channel Pressure / Aftertouch Command, Channel 1 (zero based), Value 100
						commandObj.midiport = config.get('midirelayMIDIPort');
						commandObj.midicommand = 'pressure';
						commandObj.channel = parameters[0];
						commandObj.value = parameters[1];
						sendMidiRelayMessage(commandObj);
						break;
					case 'pitchbend':
						//"pitchbend:0,100" Pitchbend Command, Channel 1 (zero based), Value 100
						commandObj.midiport = config.get('midirelayMIDIPort');
						commandObj.midicommand = 'pitchbend';
						commandObj.channel = parameters[0];
						commandObj.value = parameters[1];
						sendMidiRelayMessage(commandObj);
						break;
					case 'msc':
						//"msc:0,lighting.general,go,1,12,," MSC Command, Device ID 0, Command Format lighting.general, Cue 1, Cuelist 12, Cue Path blank
						commandObj.midiport = config.get('midirelayMIDIPort');
						commandObj.midicommand = 'msc';
						commandObj.deviceid = parameters[0];
						commandObj.commandformat = parameters[1];
						commandObj.command = parameters[2];
						commandObj.cue = parameters[3];
						commandObj.cuelist = parameters[4];
						commandObj.cuepath = parameters[5];
						sendMidiRelayMessage(commandObj);
						break;
					case 'sysex':
						//"sysex;0xF0,0x41,0x10,0x00,0x00,0x00,0x20,0x12,0x71,0x00,0x08,0x00,0x07,0xF7" SysEx Command, Hexadecimal or Decimal format
						commandObj.midiport = config.get('midirelayMIDIPort');
						commandObj.midicommand = 'sysex';
						commandObj.message = parameters[0];
						sendMidiRelayMessage(commandObj);
						break;
					case 'vista':
						//"vista:12,1" Vista MSC Command, Cuelist 12, Cue 1
						commandObj.midiport = config.get('vistaMIDIPort');
						commandObj.midicommand = 'msc';
						commandObj.deviceid = '0';
						commandObj.commandformat = 'lighting.general';
						commandObj.command = 'go';
						commandObj.cue = parameters[1];
						commandObj.cuelist = parameters[0];
						commandObj.cuepath = '';
						sendVistaMessage(commandObj);
						break;
					case 'http':
						//"http:post,url,{json}"
						//"http:get,url"
						//"http:url"
						if (parameters[0] === 'POST') {
							commandObj.type = 'POST';
							commandObj.url = parameters[1];
							if (parameters[2]) {
								commandObj.data = parameters[2];
							}
						}
						else if (parameters[0] === 'GET') {
							commandObj.type = 'GET';
							commandObj.url = parameters[1];
						}
						else {
							commandObj.type = 'GET';
							commandObj.url = parameters[0];
						}
						sendHttpMessage(commandObj);
						break;
					case 'companion':
					case 'cbp':
						//"companion:1,2"
						commandObj.bank = parameters[0];
						commandObj.button = parameters[1];
						sendCompanionMessage(commandObj);
						break;
					case 'logo':
						//"logo:on"
						if (parameters[0].toLowerCase() === 'on') {
							presentationbridge_gotologo();
						} 
						else {
							presentationbridge_turnofflogo();
						}
						break;
					default:
						console.log('Invalid command: ' + command);
						break;
				}
			}
		}

}

function sendMidiRelayMessage(midiObj) {
	if (commands_on) {
		if (config.get('plugin_midirelay')) {
			let ip = config.get('midirelayIP');
			let port = config.get('midirelayPort');
		
			let options = {
				method: 'POST',
				url: 'http://' + ip + ':' + port + '/sendmidi',
				data: midiObj
			};
		
			axios(options)
			.then(function (response) {
				console.log('midi-relay message sent.');
			})
			.catch(function (error) {
				console.log('Unable to send midi-relay message.', error.errno);
			});
		}
	}
}

function sendVistaMessage(obj) {
	if (commands_on) {
		if (config.get('plugin_vista')) {
			let ip = config.get('vistaIP');
			let port = config.get('vistaPort');
		
			let options = {
				method: 'POST',
				url: 'http://' + ip + ':' + port + '/sendmidi',
				data: obj
			};
		
			axios(options)
			.then(function (response) {
				console.log('Vista midi-relay message sent.');
			})
			.catch(function (error) {
				console.log('Unable to send Vista midi-relay message.', error.errno);
			});
		}
	}
}

function sendHttpMessage(httpObj) {
	if (commands_on) {
		if (config.get('plugin_http')) {
			let options = {
				method: httpObj.method,
				url: httpObj.url
			};
		
			if (httpObj.data) {
				options.data = httpObj.data;
			}
		
			axios(options)
			.then(function (response) {
				console.log('HTTP message sent.');
			})
			.catch(function (error) {
				console.log('Unable to send HTTP message.', error.errno);
			});
		}
	}
}

function GetProPresenterImage(slideUID) {
	const ip = config.get('propresenterIP');
	const port = config.get('propresenterPort');
			
	const url = ('http://' + ip + ':' + port + '/stage/image/' + slideUID);

	let options = {
		method: 'GET',
		url: url,
		responseType: 'arraybuffer'
	};

	axios(options)
	.then(function (response) {
		if (response.data !== undefined && response.data !== null) {
			bridgeIO.emit('current_slide_image', config.get('presentationbridgeID'), Buffer.from(response.data, 'binary').toString('base64'))
		}
	})
	.catch(function (error) {
		console.log('ProPresenter Image GET error', error.errno);
	});
}

function createCompanionConnection() { 
	if (config.get('plugin_companion')) {
		if (companionClient !== undefined){
			companionClient.destroy()
			companionClient = undefined
		}
		companionClient = new net.createConnection(51234, config.get('companionIP'));
			console.log('Connecting to Companion.');

		companionClient.on('connect', () => {
			console.log('Companion Connected')
		})
		companionClient.on('timeout', () => {
			console.log('Companion Connection timeout')
			companionClient.destroy()
			companionClient = undefined
		})
		companionClient.on('error', (err) => {
			console.log('Companion Connection error, re-connecting in 5 seconds: ' + err)
			setTimeout(createCompanionConnection, 5000)
		})
		companionClient.on('data', (data) => {
			console.log('Received from Companion: ' + data)
		})
		companionClient.on('close', () => {
			console.log('Companion Connection closed')
			companionClient.destroy()
			companionClient = undefined
		})
	} else {
		console.log('Companion Connection closing')
		companionClient.destroy()
		companionClient = undefined
	}
}
function sendCompanionMessage(companionObj) { 
	if (commands_on) {
		if (config.get('plugin_companion')) {
			if (companionClient === undefined) {
				createCompanionConnection();
			}
			let bank = companionObj.bank;
			let button = companionObj.button;
			if  (companionClient !== undefined) {
				console.log('Companion Message: '+ bank + ', ' + button)
				companionClient.write(`BANK-PRESS ${bank} ${button}\r\n`);
			}	
		} 
	}
}

function SendStatusMessage() {
	if (settingsWindow) {
		settingsWindow.webContents.send('propresenter_status', propresenter_status);
		settingsWindow.webContents.send('presentationbridge_status', presentationbridge_status);
	}
}

//IPCs
ipcMain.on('propresenter_status', function (event) {
	event.sender.send('propresenter_status', propresenter_status);
});

ipcMain.on('monitor_status', function (event) {
	event.sender.send('cs', propresenter_cs);
	event.sender.send('csn', propresenter_csn_commands);
	event.sender.send('ns', propresenter_ns);
	event.sender.send('nsn', propresenter_nsn_commands);
});

ipcMain.on('mdns_propresenter_hosts', function (event) {
	event.sender.send('mdns_propresenter_hosts', mdns_propresenter_hosts);
});

ipcMain.on('mdns_midirelay_hosts', function (event) {
	event.sender.send('mdns_midirelay_hosts', mdns_midirelay_hosts);
});

ipcMain.on('mdns_rescan', function (event) {
	findHosts();
});

ipcMain.on('propresenter_connect', function (event, ip, port, password) {
	propresenter_disconnect(false);
	propresenter_status = 'connecting';
	SendStatusMessage();
	setTimeout(propresenter_connect, 2000);
});

ipcMain.on('propresenter_disconnect', function (event) {
	propresenter_disconnect(false);
});

ipcMain.on('propresenter_force_disconnect', function (event) {
	propresenter_disconnect(false);
});

ipcMain.on('presentationbridge_connect', function (event, host, port, id, password) {
	presentationbridge_connect();
});

ipcMain.on('presentationbridge_disconnect', function (event) {
	presentationbridge_disconnect();
});

ipcMain.on('presentationbridge_force_disconnect', function (event) {
	presentationbridge_disconnect();
});