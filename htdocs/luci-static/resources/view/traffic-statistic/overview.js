'use strict';
'require view';
'require rpc';
'require dom';
'require ui';

var callStatus = rpc.declare({
	object: 'traffic-statistic',
	method: 'status',
	expect: { '': {} }
});

var callQuery = rpc.declare({
	object: 'traffic-statistic',
	method: 'query',
	params: [ 'group', 'start', 'end', 'bucket', 'mac' ],
	expect: { '': {} }
});

var callClear = rpc.declare({
	object: 'traffic-statistic',
	method: 'clear',
	params: [ 'group' ],
	expect: { result: 1 }
});

function createSVG(tag, attrs, children) {
	var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
	for (var k in attrs || {}) {
		if (attrs.hasOwnProperty(k)) el.setAttribute(k, attrs[k]);
	}
	(children || []).forEach(function(c) {
		if (typeof c === 'string') el.appendChild(document.createTextNode(c));
		else if (c) el.appendChild(c);
	});
	return el;
}

function formatBytes(value) {
	var n = Number(value || 0), units = [ 'B', 'KiB', 'MiB', 'GiB', 'TiB' ], i = 0;
	while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
	return '%s %s'.format(n >= 100 || i === 0 ? n.toFixed(0) : n.toFixed(1), units[i]);
}

function hostLabel(mac, hosts) {
	if (mac === '00:00:00:00:00:00') return _('Interface total');
	var item = (hosts || []).find(function(h) { return h.mac === mac; });
	if (!item) return mac;
	return item.name ? '%s (%s)'.format(item.name, mac) : (item.ip ? '%s (%s)'.format(item.ip, mac) : mac);
}

function rangeFor(value) {
	var end = Math.floor(Date.now() / 1000), seconds = Number(value || 86400);
	return { start: end - seconds, end: end };
}

function dateTimeLocal(timestamp) {
	var d = new Date(timestamp * 1000);
	d = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
	return d.toISOString().slice(0, 16);
}

function chooseBucket(start, end) {
	var span = end - start;
	if (span <= 6 * 3600) return 300;
	if (span <= 2 * 86400) return 1800;
	if (span <= 14 * 86400) return 21600;
	return 86400;
}

function totalOf(d) {
	return Number(d.rx4 || 0) + Number(d.rx6 || 0) + Number(d.tx4 || 0) + Number(d.tx6 || 0);
}

function makeChart(points) {
	var width = 900, height = 300, pad = 42;
	var series = [
		[ 'rx4', '#1677ff', _('Receive IPv4') ],
		[ 'rx6', '#36cfc9', _('Receive IPv6') ],
		[ 'tx4', '#fa8c16', _('Transmit IPv4') ],
		[ 'tx6', '#722ed1', _('Transmit IPv6') ]
	];
	if (!points || !points.length)
		return E('div', { 'class': 'ts-empty' }, _('No data in this time range yet.'));
	var max = 1;
	points.forEach(function(p) { series.forEach(function(s) { max = Math.max(max, Number(p[s[0]] || 0)); }); });
	var minT = points[0].t, maxT = points[points.length - 1].t || minT + 1;
	if (maxT === minT) maxT++;
	function x(t) { return pad + (Number(t) - minT) / (maxT - minT) * (width - pad * 2); }
	function y(v) { return height - pad - Number(v || 0) / max * (height - pad * 2); }
	var children = [];
	for (var grid = 0; grid <= 4; grid++) {
		var gy = pad + grid * (height - pad * 2) / 4;
		children.push(createSVG('line', { x1: pad, y1: gy, x2: width - pad, y2: gy, stroke: 'currentColor', 'stroke-opacity': '.12' }));
	}
	series.forEach(function(s) {
		var coords = points.map(function(p) { return '%s,%s'.format(x(p.t).toFixed(1), y(p[s[0]]).toFixed(1)); }).join(' ');
		children.push(createSVG('polyline', { points: coords, fill: 'none', stroke: s[1], 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }, [ createSVG('title', {}, [ s[2] ]) ]));
		points.forEach(function(p) {
			children.push(createSVG('circle', { cx: x(p.t).toFixed(1), cy: y(p[s[0]]).toFixed(1), r: 2.5, fill: s[1] }, [
				createSVG('title', {}, [ '%s · %s · %s'.format(new Date(p.t * 1000).toLocaleString(), s[2], formatBytes(p[s[0]])) ])
			]));
		});
	});
	children.push(createSVG('text', { x: 4, y: pad + 4, 'font-size': 12, 'fill': 'currentColor' }, [ formatBytes(max) ]));
	children.push(createSVG('text', { x: 4, y: height - pad + 4, 'font-size': 12, 'fill': 'currentColor' }, [ '0 B' ]));
	children.push(createSVG('text', { x: pad, y: height - 8, 'font-size': 11, 'text-anchor': 'start', 'fill': 'currentColor' }, [ new Date(minT * 1000).toLocaleString() ]));
	children.push(createSVG('text', { x: width - pad, y: height - 8, 'font-size': 11, 'text-anchor': 'end', 'fill': 'currentColor' }, [ new Date(maxT * 1000).toLocaleString() ]));
	return E('div', {}, [
		createSVG('svg', { viewBox: '0 0 %s %s'.format(width, height), 'class': 'ts-chart', role: 'img' }, children),
		E('div', { 'class': 'ts-legend' }, series.map(function(s) {
			return E('span', {}, [ E('span', { 'class': 'ts-legend-dot', style: 'background-color:%s'.format(s[1]) }), s[2] ]);
		}))
	]);
}

return view.extend({
	load: function() {
		return callStatus().then(function(status) {
			var group = (status.groups || []).find(function(g) { return g.enabled; });
			var range = rangeFor(86400);
			if (!group) return [ status, null, range ];
			return callQuery(group.id, range.start, range.end, chooseBucket(range.start, range.end), '').then(function(data) {
				return [ status, data, range ];
			});
		});
	},

	render: function(loaded) {
		this.status = loaded[0] || {};
		this.query = loaded[1] || { points: [], devices: [], totals: {} };
		this.range = loaded[2];
		this.group = ((this.status.groups || []).find(function(g) { return g.enabled; }) || {}).id;
		this.mac = '';

		var root = E('div', { 'class': 'cbi-map ts-app' }, [
			E('style', {}, '.ts-toolbar{display:flex;gap:.7rem;align-items:end;flex-wrap:wrap;margin:1rem 0}.ts-toolbar label{display:flex;flex-direction:column;gap:.25rem}.ts-toolbar .ts-custom{display:none}.ts-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.8rem;margin:1rem 0}.ts-card{padding:1rem;border:1px solid rgba(127,127,127,.25);border-radius:8px;background:rgba(127,127,127,.04)}.ts-card strong{display:block;font-size:1.45rem;margin-top:.35rem}.ts-chart{width:100%;height:auto;min-height:220px;color:#7f8c8d}.ts-legend{display:flex;gap:1rem;flex-wrap:wrap;justify-content:center}.ts-legend-dot{display:inline-block;width:.8rem;height:.8rem;border-radius:50%;margin-right:.35rem}.ts-empty{padding:4rem 1rem;text-align:center;opacity:.7}.ts-state{display:inline-block;padding:.2rem .55rem;border-radius:999px;background:#d9f7be;color:#135200}.ts-state.bad{background:#fff1f0;color:#a8071a}.ts-note{opacity:.75}.ts-table-wrap{overflow:auto}'),
			E('h2', {}, _('Traffic Statistics')),
			E('p', { 'class': 'ts-note' }, _('Receive and transmit are from the client device perspective. Counters are split by IPv4 and IPv6.')),
			E('div', { id: 'ts-status' }),
			E('div', { 'class': 'ts-toolbar' }, this.renderControls()),
			E('div', { id: 'ts-results' }),
			E('div', { 'class': 'right' }, E('button', { 'class': 'btn cbi-button-negative', click: ui.createHandlerFn(this, 'confirmClear') }, _('Clear group history')))
		]);
		this.root = root;
		this.renderStatus();
		this.renderResults();
		return root;
	},

	renderControls: function() {
		var groups = (this.status.groups || []).filter(function(g) { return g.enabled; });
		var devices = (this.query.devices || []).slice().sort(function(a, b) { return totalOf(b) - totalOf(a); });
		return [
			E('label', {}, [ _('Interface group'), E('select', { id: 'ts-group', change: ui.createHandlerFn(this, 'groupChanged') }, groups.map(function(g) { return E('option', { value: g.id, selected: g.id === this.group ? '' : null }, g.name); }, this)) ]),
			E('label', {}, [ _('Time range'), E('select', { id: 'ts-range', change: ui.createHandlerFn(this, 'rangeChanged') }, [
				E('option', { value: '3600' }, _('Last hour')), E('option', { value: '21600' }, _('Last 6 hours')),
				E('option', { value: '86400', selected: '' }, _('Last 24 hours')), E('option', { value: '604800' }, _('Last 7 days')),
				E('option', { value: '2592000' }, _('Last 30 days')), E('option', { value: 'custom' }, _('Custom'))
			]) ]),
			E('label', { 'class': 'ts-custom', id: 'ts-start-wrap' }, [ _('Start time'), E('input', { id: 'ts-start', type: 'datetime-local' }) ]),
			E('label', { 'class': 'ts-custom', id: 'ts-end-wrap' }, [ _('End'), E('input', { id: 'ts-end', type: 'datetime-local' }) ]),
			E('label', {}, [ _('Device'), E('select', { id: 'ts-mac', change: ui.createHandlerFn(this, 'refresh') }, [ E('option', { value: '' }, _('All devices')) ].concat(devices.map(function(d) { return E('option', { value: d.mac }, hostLabel(d.mac, this.status.hosts)); }, this))) ]),
			E('button', { 'class': 'btn cbi-button-action', click: ui.createHandlerFn(this, 'refresh') }, _('Refresh'))
		];
	},

	rangeChanged: function() {
		var custom = this.root.querySelector('#ts-range').value === 'custom';
		this.root.querySelector('#ts-start-wrap').style.display = custom ? 'flex' : 'none';
		this.root.querySelector('#ts-end-wrap').style.display = custom ? 'flex' : 'none';
		if (custom) {
			var start = this.root.querySelector('#ts-start'), end = this.root.querySelector('#ts-end');
			if (!start.value) start.value = dateTimeLocal(this.range.start);
			if (!end.value) end.value = dateTimeLocal(this.range.end);
		}
		if (!custom) return this.refresh();
	},

	groupChanged: function() {
		this.root.querySelector('#ts-mac').value = '';
		return this.refresh();
	},

	selectedRange: function() {
		var value = this.root.querySelector('#ts-range').value;
		if (value !== 'custom') return rangeFor(value);
		var start = Date.parse(this.root.querySelector('#ts-start').value) / 1000;
		var end = Date.parse(this.root.querySelector('#ts-end').value) / 1000;
		if (!isFinite(start) || !isFinite(end) || start >= end) return null;
		return { start: Math.floor(start), end: Math.floor(end) };
	},

	refresh: function() {
		var range = this.selectedRange();
		if (!range) { ui.addNotification(null, E('p', {}, _('Choose a valid custom time range.')), 'warning'); return; }
		this.group = this.root.querySelector('#ts-group').value;
		this.mac = this.root.querySelector('#ts-mac').value;
		ui.showModal(_('Loading…'), [ E('p', { 'class': 'spinning' }, _('Reading statistics…')) ]);
		return Promise.all([ callStatus(), callQuery(this.group, range.start, range.end, chooseBucket(range.start, range.end), this.mac) ]).then(function(data) {
			this.status = data[0]; this.query = data[1]; this.range = range;
			if (!this.mac) this.updateDeviceOptions();
			this.renderStatus(); this.renderResults(); ui.hideModal();
		}.bind(this)).catch(function(err) { ui.hideModal(); ui.addNotification(null, E('p', {}, err.message), 'error'); });
	},

	updateDeviceOptions: function() {
		var select = this.root.querySelector('#ts-mac');
		var devices = (this.query.devices || []).slice().sort(function(a, b) { return totalOf(b) - totalOf(a); });
		dom.content(select, [ E('option', { value: '' }, _('All devices')) ].concat(devices.map(function(d) {
			return E('option', { value: d.mac, selected: d.mac === this.mac ? '' : null }, hostLabel(d.mac, this.status.hosts));
		}, this)));
	},

	renderStatus: function() {
		var group = (this.status.groups || []).find(function(g) { return g.id === this.group; }, this);
		var running = this.status.running;
		dom.content(this.root.querySelector('#ts-status'), [
			E('span', { 'class': 'ts-state%s'.format(running ? '' : ' bad') }, running ? _('Collector running') : _('Collector stopped')),
			' ', group ? E('span', { 'class': 'ts-note' }, _('%s · %s · every %s seconds · keep %s days').format(group.device || group.network, group.family === 'bridge' ? _('offload-safe bridge accounting') : _('basic interface accounting'), group.interval, group.retention_days)) : ''
		]);
	},

	renderResults: function() {
		var t = this.query.totals || {};
		var devices = (this.query.devices || []).slice().sort(function(a, b) { return totalOf(b) - totalOf(a); });
		var cards = E('div', { 'class': 'ts-cards' }, [
			E('div', { 'class': 'ts-card' }, [ _('Received'), E('strong', {}, formatBytes(Number(t.rx4 || 0) + Number(t.rx6 || 0))), E('small', {}, 'IPv4 %s · IPv6 %s'.format(formatBytes(t.rx4), formatBytes(t.rx6))) ]),
			E('div', { 'class': 'ts-card' }, [ _('Transmitted'), E('strong', {}, formatBytes(Number(t.tx4 || 0) + Number(t.tx6 || 0))), E('small', {}, 'IPv4 %s · IPv6 %s'.format(formatBytes(t.tx4), formatBytes(t.tx6))) ]),
			E('div', { 'class': 'ts-card' }, [ _('Total'), E('strong', {}, formatBytes(totalOf(t))), E('small', {}, _('%s data points').format((this.query.points || []).length)) ])
		]);
		var rows = devices.map(function(d) {
			return E('tr', {}, [ E('td', {}, hostLabel(d.mac, this.status.hosts)), E('td', {}, formatBytes(Number(d.rx4) + Number(d.rx6))), E('td', {}, formatBytes(Number(d.tx4) + Number(d.tx6))), E('td', {}, formatBytes(totalOf(d))) ]);
		}, this);
		dom.content(this.root.querySelector('#ts-results'), [ cards, makeChart(this.query.points || []), E('h3', {}, _('Devices')), E('div', { 'class': 'ts-table-wrap' }, E('table', { 'class': 'table' }, [ E('tr', { 'class': 'tr table-titles' }, [ E('th', {}, _('Device')), E('th', {}, _('Received')), E('th', {}, _('Transmitted')), E('th', {}, _('Total')) ]) ].concat(rows.length ? rows : [ E('tr', {}, E('td', { colspan: 4 }, _('No devices in this range.'))) ]))) ]);
	},

	confirmClear: function() {
		if (!this.group) return;
		ui.showModal(_('Clear history?'), [ E('p', {}, _('All saved history for the selected interface group will be deleted. Live counters are not interrupted.')), E('div', { 'class': 'right' }, [ E('button', { 'class': 'btn', click: ui.hideModal }, _('Cancel')), ' ', E('button', { 'class': 'btn cbi-button-negative', click: ui.createHandlerFn(this, function() { return callClear(this.group).then(function() { ui.hideModal(); return this.refresh(); }.bind(this)); }) }, _('Clear')) ]) ]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
