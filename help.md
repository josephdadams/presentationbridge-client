# Presentation Bridge Client

This software is designed to work with your presentation lyrics software, accessing slide data in real time and then performing custom actions. It integrates with PresentationBridge, a free server program that allows you to send lyric data to end devices such as phones, tablets, and tv sticks through the built in web browser on those devices. 

THe Settings window is used to configure the software for ProPresenter, PresentationBridge, midi-relay, Vista, Companion and HTTP. 

Text on slides is sent to the bridge for display on devices that are connected. Images of the slides will be sent if the 'Send Images' switch in settings is on.

In addition, using the notes section of a slide, this Client can also send commands using midi-relay, HHHTP and Companion:
* Send MIDI voice messages, using the free program [midi-relay](http://github.com/josephdadams/midi-relay)
* Make HTTP Requests (GET and POST, with JSON data if needed)
* Press Companion Buttons using the TCP protocol

In general, the format is as follows:

`[command type]:[parameter 1],[parameter 2][etc.]`

Each parameter is separated by a comma and acommand should be terminated with a semicolon.

The program works by listening to the "current slide notes" data within ProPresenter. If the text contains valid commands embedded in curly brackets then these will be processed. Other text is sent to the stagedisplay bridge.

e.g. 'This text will go to the stage display {noteon:0,55,100; cbp:1,2;}'

## Sending MIDI Relay Messages

### Supported MIDI Relay Types
* Note On

	Format: `noteon:[channel],[note],[velocity]`
	
	* `channel` should be a integer between 0 and 15.
	* `note` should be an integer of the MIDI Number value that represents the note, between 0 and 127.
	* `velocity` should be a integer between 1 and 127. A value of 0 is considered a Note Off message.

	Example: `noteon:0,55,100`
	
* Note Off

	Format: `noteoff:[channel],[note],[velocity]`
	
	* `channel` should be a integer between 0 and 15.
	* `note` should be an integer of the MIDI Number value that represents the note, between 0 and 127.
	* `velocity` should be 0.

	Example: `noteoff:0,55,100`

* Polyphonic Aftertouch

	Format: `aftertouch:[channel],[note],[value]`
	
	* `channel` should be a integer between 0 and 15.
	* `note` should be an integer of the MIDI Number value that represents the note, between 0 and 127.
	* `velocity` should be a integer between 0 and 127.

	Example: `aftertouch:0,55,100`

* CC (Control Change)

	Format: `cc:[channel],[controller],[value]`
	
	* `channel` should be a integer between 0 and 15.
	* `controller` should be a integer between 0 and 127.
	* `value` should be a integer between 0 and 127.

	Example: `cc:0,32,100`
	
* PC (Program Change)

	Format: `pc:[channel],[value]`

	* `channel` should be a integer between 0 and 15.
	* `value` should be a integer between 0 and 127.

	Example: `pc:0,100`

* Channel Pressure / Aftertouch

	Format: `pressure:[channel],[value]`
	
	* `channel` should be a integer between 0 and 15.
	* `value` should be a integer between 0 and 127.

	Example: `pressure:0,100`

* Pitch Bend / Pitch Wheel

	Format: `pitchbend:[channel],[value]`
	
	* `channel` should be a integer between 0 and 15.
	* `value` should be a integer between 0 and 16,383.

	Example: `pitchbend:0,100`

* MSC (MIDI Show Control)

	Format: `msc:[device id],[command format],[command],[cue],[cuelist],[cuepath]`

	* `deviceid` should be an integer between 0 and 111. It can also be a string 'g1' through 'g15' to represent groups, or it can be `all`.

	* `commandformat` should be a string with one of the following values:
		* lighting.general
		* sound.general
		* machinery.general
		* video.general
		* projection.general
		* processcontrol.general
		* pyro.general
		* all
		* Any other value for _commandformat_ will default to `all`.
	
	* `command` should be a string with one of the following values:
		* go
		* stop
		* gojam
		* gooff
		* resume
		* timedgo
		* load
		* set
		* fire
		* alloff
		* restore
		* reset
		* opencuelist
		* closecuelist
		* startclock
		* stopclock

	* Values for `cue`, `cuelist`, and `cuepath` are all optional strings. If you don't want to include them, just include the `,` delimiter.

	Example: `msc:0,lighting.general,go,1,12,,`

* Sysex MIDI Message

	Format: `sysex:[message]`
	
	* `message` should contain the actual MIDI message in bytes. Bytes can be either in hexadecimal or decimal, separated by commas.
	* A response of `{result: 'sysex-sent-successfully'}` indicates the SysEx MIDI message was successfully sent.

	Example: `sysex:0xF0,0x41,0x10,0x00,0x00,0x00,0x20,0x12,0x71,0x00,0x08,0x00,0x07,0xF7`
	
All values for `channel` are zero-based. (e.g., Channel of `1` should be sent as `0`.)

## Additional MIDI Notations
In addition to the primary MIDI voice message notations, the following notations are also available:

* Chroma-Q Vista Lighting MSC Message (the Vista console must be running midi-relay)

	Format: `vista:[cue list],[cue]`

	* `cue list`: The cue list you want to control
	* `cue`: The cue to play

	Example: `vista:1,2.5` : This would run Cue 2.5 on Cuelist 1. This assumes a `device id` of `0`, `command format` is `lighting.general`, and the `command` is `go`.

## HTTP Requests
HTTP Requests to perform actions or send data can also be easily performed.

Format: `http:[url]`

* `url`: The URL to perform an HTTP GET request

You can also use the following notations to perform specific HTTP request types:

* `http:get,[url]`
* `http:post,[url]`
* `http:post,[url],[json]`

Example: `http:get,http://www.techministry.blog` : This would perform an HTTP GET request to the URL, `http://www.techministry.blog`.

## Companion Button Press

Format: `companion:[bank],[button]` or `cbp:[bank],[button]`

* `bank`: The page in Companion where the button is
* `button`: The button on the page that you wish to press

Example: `companion:1,2` : This would press Button 2 on Page 1.

## Turn bridge logo on or off

Format: `logo:[switch]`

* `switch`: Either `on` or `off`

Example: `logo:on` : To turn the logo on.