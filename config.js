'use strict';
const Store = require('electron-store');

module.exports = new Store({
	defaults: {
		propresenterIP: '192.168.11.75',
		propresenterPort: '49610',
		propresenterPassword: 'control22',
		presentationbridgeHost: 'fglyrics.com',
		presentationbridgePort: '80',
		presentationbridgeID: '5eaf62b6c',
		presentationbridgePassword: 'test22',
		midirelayIP: '127.0.0.1',
		midirelayPort: '4000',
		midirelayMIDIPort: 'loopMIDI Port',
		companionIP: '127.0.0.1',
		plugin_midirelay: true,
		plugin_vista: true,
		plugin_http: true,
		plugin_companion: true,
		switch_settings: true,
		switch_monitor: true
	}
});
