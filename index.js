'use strict';
const path = require('path');
const {app, BrowserWindow, Menu, Tray, ipcMain} = require('electron');
// const {autoUpdater} = require('electron-updater');
const {is} = require('electron-util');
const unhandled = require('electron-unhandled');
const debug = require('electron-debug');
const config = require('./config');

const WebSocket = require('ws');

//ProPresenter variables
var StageDisplaySocket = null;
var propresenter_interval = null;
var propresenter_status = 'disconnected';

const axios = require('axios');
const socketio = require('socket.io-client');

//PresentationBridge variables
let bridgeConnected = false;
let bridgeIO = null;

unhandled();
debug();

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
		label: 'Quit',
		click: function () {
			app.quit();
		}
	}
];
var tray = null;

// Note: Must match `build.appId` in package.json
app.setAppUserModelId('com.techministry.presentationbridgeclient');

// Uncomment this before publishing your first version.
// It's commented out as it throws an error if there are no published versions.
// if (!is.development) {
// 	const FOUR_HOURS = 1000 * 60 * 60 * 4;
// 	setInterval(() => {
// 		autoUpdater.checkForUpdates();
// 	}, FOUR_HOURS);
//
// 	autoUpdater.checkForUpdates();
// }

// Prevent window from being garbage collected
let mainWindow;

const createMainWindow = async () => {
	const win = new BrowserWindow({
		title: app.name + ' Settings',
		show: false,
		width: 800,
		height: 400,
		webPreferences: {
			nodeIntegration: true,
			enableRemoteModule: true
		}
	});

	win.on('ready-to-show', () => {
		win.show();
	});

	win.on('closed', () => {
		// Dereference the window
		// For multiple windows store them in an array
		mainWindow = undefined;
	});

	await win.loadFile(path.join(__dirname, 'index.html'));

	return win;
};

// Prevent multiple instances of the app
if (!app.requestSingleInstanceLock()) {
	app.quit();
}

app.on('second-instance', () => {
	if (mainWindow) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}

		mainWindow.show();
	}
});

app.on('window-all-closed', () => {
	if (!is.macos) {
		app.quit();
	}
});

app.on('activate', async () => {
	if (!mainWindow) {
		mainWindow = await createMainWindow();
	}
});

(async () => {
	await app.whenReady();
	mainWindow = await createMainWindow();
	tray = new Tray('cloudTemplate.png');
	buildTray();

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

function propresenter_connect() {
	let ip = config.get('propresenterIP');
	let port = config.get('propresenterPort');
	let password = config.get('propresenterPassword');

	console.log('Opening ProPresenter Socket Connection: ' + ip + ':' + port);

	propresenter_status = 'connecting';
	SendStatusMessage();

	StageDisplaySocket = new WebSocket('ws://' + ip + ':' + port + '/stagedisplay');

	StageDisplaySocket.on('open', function open() {
		console.log('ProPresenter Connection Opened.');
		propresenter_status = 'open';
		SendStatusMessage();
		
		if (propresenter_interval !== null) {
			clearInterval(propresenter_interval);
			propresenter_interval = null;
		}

		trayMenuItems[0].label = 'Connected: ' + ip + ':' + port;
		buildTray();

		StageDisplaySocket.send(JSON.stringify({
			pwd: password,
			ptl: 610,
			acn: "ath"
		}));
	});

	StageDisplaySocket.on('message', function(message) {
		// Handle the stage display message received from ProPresenter
		handleStageDisplayMessage(message);
	});

	StageDisplaySocket.on('error', function (err) {
		console.log(err);
		if (err.errno.indexOf('ECONNREFUSED') > -1) {
			propresenter_status = 'econnrefused';
			SendStatusMessage();
			propresenter_disconnect(false);
		}
	});

	StageDisplaySocket.on('close', function(code, reason) {
		console.log('ProPresenter disconnected.', code, reason);
		propresenter_status = 'disconnected';
		SendStatusMessage();
		if (propresenter_interval === null) {
			propresenter_interval = setInterval(propresenter_receonnect, 5000); //attempt to reeconnect every 5 seconds
		}
	});
}

function propresenter_disconnect(reconnect) {
	console.log('Closing ProPresenter Connection.');
	propresenter_status = 'disconnected';
	SendStatusMessage();
	if (reconnect) {
		reconnectProPresenter();
	}
	else {
		if (propresenter_interval !== null) {
			clearInterval(propresenter_interval);
			propresenter_interval = null;
		}
	}
}

function propresenter_receonnect() {
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

	bridgeIO = socketio('http://' + host + ':' + port);

	bridgeIO.on('connect', function() {
		bridgeIO.emit('bridgerooms_authenticate', bridgeID, password);
	});

	bridgeIO.on('bridgerooms_authenticated', function(value) {
		console.log('Bridge Authenticated: ' + value);
		if (value) {
			bridgeConnected = true;
			bridgeIO.emit('gotologo', bridgeID, false);
			trayMenuItems[1].label = 'Connected: ' + host + ':' + port;
			buildTray();
		}
		else {
			bridgeConnected = false;
		}
	});

	bridgeIO.on('disconnect', function() {
		bridgeConnected = false;
	});
}

function openSettings() {
	if (mainWindow) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}

		mainWindow.show();
	}
	else {
		mainWindow = createMainWindow();
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
					if (bridgeConnected) {
						bridgeIO.emit('current_slide', config.get('presentationbridgeID'), objData.ary[i].txt);
					}
				}
				if (objData.ary[i].acn === 'csn') {
					parseStageDisplayMessage(objData.ary[i].txt);
					if (bridgeConnected) {
						bridgeIO.emit('current_slide_notes', config.get('presentationbridgeID'), objData.ary[i].txt);
					}
				}
				if (objData.ary[i].acn === 'ns') {
					if (bridgeConnected) {
						bridgeIO.emit('next_slide', config.get('presentationbridgeID'), objData.ary[i].txt);
					}
				}
				if (objData.ary[i].acn === 'nsn') {
					if (bridgeConnected) {
						bridgeIO.emit('next_slide_notes', config.get('presentationbridgeID'), objData.ary[i].txt);
					}
				}
			}
			break;
		default:
			break;
	}
}

function parseStageDisplayMessage(text) {
	if (text !== '') {
		console.log('Stage Display Message: ' + text);
		let command = text.substring(0, text.indexOf(':'));
		console.log('Command: ' + command);
		let parameters = text.substring(text.indexOf(':')+1).split(';');
		console.log('Parameters: ' + parameters);

		let commandObj = {};

		if (parameters) {
			switch(command.toLowerCase()) {
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
					//"companion:1,2"
					commandObj.bank = parameters[0];
					commandObj.button = parameters[1];
					sendCompanionMessage(commandObj);
					break;
				default:
					console.log('Invalid command');
					break;
			}
		}
	}
}

function sendMidiRelayMessage(midiObj) {
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

function sendVistaMessage(obj) {
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

function sendHttpMessage(httpObj) {
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

function sendCompanionMessage(companionObj) {
	if (config.get('plugin_companion')) {

	}
}

function SendStatusMessage() {
	if (mainWindow) {
		mainWindow.webContents.send('propresenter_status', propresenter_status);
	}
}

//IPCs
ipcMain.on('propresenter_status', function (event) {
	event.sender.send('propresenter_status', propresenter_status);
});

ipcMain.on('propresenter_connect', function (event, ip, port, password) {
	propresenter_disconnect(false);
	config.set('propresenterIP', ip);
	config.set('propresenterPort', port);
	config.set('propresenterPassword', password);
	propresenter_connect();
});

ipcMain.on('propresenter_disconnect', function (event) {
	propresenter_disconnect(false);
});

ipcMain.on('presentationbridge_connect', function (event, host, port, id, password) {
	presentationbridge_disconnect(false);
	config.set('presentationbridgeHost', host);
	config.set('presentationbridgePort', port);
	config.set('presentationbridgeID', id);
	config.set('presentationbridgePassword', password);
	presentationbridge_connect();
});