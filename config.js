'use strict';
const Store = require('electron-store');

module.exports = new Store({
	defaults: {
		propresenterIP: '127.0.0.1',
		propresenterPort: '49610',
		propresenterPassword: '',
		switch_PPimages: false,
		switch_PPUCase: false,
		presentationbridgeHost: '',
		presentationbridgePort: '80',
		presentationbridgeID: '',
		presentationbridgePassword: '',
		midirelayIP: '127.0.0.1',
		midirelayPort: '4000',
		midirelayMIDIPort: 'loopMIDI Port',
		companionIP: '127.0.0.1',
		plugin_midirelay: true,
		plugin_vista: true,
		plugin_http: true,
		plugin_companion: true,
		switch_mdns: true,
		switch_settings: true,
		switch_monitor: true
	}
});
