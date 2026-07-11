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
	params: [ 'group', 'start', 'end', 'bucket', 'mac', 'special' ],
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

function formatRate(value) {
	var n = Number(value || 0), units = [ 'bit/s', 'Kbit/s', 'Mbit/s', 'Gbit/s', 'Tbit/s' ], i = 0;
	while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
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

function makeChart(points, bucket, mode, detail) {
	var width = 1000, height = 390, left = 72, right = 18, top = 24, bottom = 46, center = (top + height - bottom) / 2;
	var colors = { rx4: '#1677ff', rx6: '#722ed1', tx4: '#36cfc9', tx6: '#9c6ade' };
	if (!points || !points.length)
		return E('div', { 'class': 'ts-empty' }, _('No data in this time range yet.'));
	var divisor = mode === 'rate' ? Math.max(1, Number(bucket || 1)) : 1;
	function value(p, key) { return mode === 'rate' ? Number(p[key] || 0) * 8 / divisor : Number(p[key] || 0); }
	function display(v) { return mode === 'rate' ? formatRate(v) : formatBytes(v); }
	var max = 1;
	points.forEach(function(p) {
		max = Math.max(max, value(p, 'rx4') + value(p, 'rx6'), value(p, 'tx4') + value(p, 'tx6'));
	});
	var minT = points[0].t, maxT = points[points.length - 1].t || minT + 1;
	if (maxT === minT) maxT++;
	function x(t) { return left + (Number(t) - minT) / (maxT - minT) * (width - left - right); }
	function yRx(v) { return center - Number(v || 0) / max * (center - top); }
	function yTx(v) { return center + Number(v || 0) / max * (height - bottom - center); }
	function area(upper, lower, color, opacity) {
		var coords = points.map(function(p) { return '%s,%s'.format(x(p.t).toFixed(1), upper(p).toFixed(1)); });
		coords = coords.concat(points.slice().reverse().map(function(p) { return '%s,%s'.format(x(p.t).toFixed(1), lower(p).toFixed(1)); }));
		return createSVG('polygon', { points: coords.join(' '), fill: color, 'fill-opacity': opacity, stroke: color, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' });
	}
	var children = [];
	for (var grid = -2; grid <= 2; grid++) {
		var gy = center + grid * (height - top - bottom) / 4;
		children.push(createSVG('line', { x1: left, y1: gy, x2: width - right, y2: gy, stroke: 'currentColor', 'stroke-opacity': grid === 0 ? '.28' : '.1', 'stroke-dasharray': grid === 0 ? '' : '4 4' }));
		children.push(createSVG('text', { x: left - 8, y: gy + 4, 'font-size': 11, 'text-anchor': 'end', fill: 'currentColor' }, [ (grid < 0 ? '' : grid > 0 ? '-' : '') + (grid === 0 ? (mode === 'rate' ? '0 bit/s' : '0 B') : display(max * Math.abs(grid) / 2)) ]));
	}
	if (detail) {
		children.push(area(function(p) { return yRx(value(p, 'rx4')); }, function() { return center; }, colors.rx4, '.82'));
		children.push(area(function(p) { return yRx(value(p, 'rx4') + value(p, 'rx6')); }, function(p) { return yRx(value(p, 'rx4')); }, colors.rx6, '.78'));
		children.push(area(function(p) { return yTx(value(p, 'tx4')); }, function() { return center; }, colors.tx4, '.8'));
		children.push(area(function(p) { return yTx(value(p, 'tx4') + value(p, 'tx6')); }, function(p) { return yTx(value(p, 'tx4')); }, colors.tx6, '.72'));
	} else {
		children.push(area(function(p) { return yRx(value(p, 'rx4') + value(p, 'rx6')); }, function() { return center; }, colors.rx4, '.82'));
		children.push(area(function(p) { return yTx(value(p, 'tx4') + value(p, 'tx6')); }, function() { return center; }, colors.tx4, '.8'));
	}
	children.push(createSVG('text', { x: left, y: 15, 'font-size': 11, fill: 'currentColor' }, [ _('Receive') ]));
	children.push(createSVG('text', { x: left, y: height - bottom + 18, 'font-size': 11, fill: 'currentColor' }, [ _('Transmit') ]));
	children.push(createSVG('text', { x: left, y: height - 8, 'font-size': 11, 'text-anchor': 'start', fill: 'currentColor' }, [ new Date(minT * 1000).toLocaleString() ]));
	children.push(createSVG('text', { x: width - right, y: height - 8, 'font-size': 11, 'text-anchor': 'end', fill: 'currentColor' }, [ new Date(maxT * 1000).toLocaleString() ]));
	var crosshair = createSVG('line', { y1: top, y2: height - bottom, stroke: '#64748b', 'stroke-width': 1, 'stroke-dasharray': '4 3', style: 'display:none' });
	children.push(crosshair);
	var svg = createSVG('svg', { viewBox: '0 0 %s %s'.format(width, height), 'class': 'ts-chart', role: 'img' }, children);
	var tooltip = E('div', { 'class': 'ts-tooltip', style: 'display:none' });
	var wrapper = E('div', { 'class': 'ts-chart-wrap' }, [ svg, tooltip ]);
	svg.addEventListener('mousemove', function(ev) {
		var rect = svg.getBoundingClientRect(), sx = (ev.clientX - rect.left) / rect.width * width;
		var ratio = Math.max(0, Math.min(1, (sx - left) / (width - left - right)));
		var wanted = minT + ratio * (maxT - minT), best = points[0];
		points.forEach(function(p) { if (Math.abs(p.t - wanted) < Math.abs(best.t - wanted)) best = p; });
		var px = x(best.t), rows = [
			[ colors.rx4, _('Receive IPv4'), value(best, 'rx4') ], [ colors.rx6, _('Receive IPv6'), value(best, 'rx6') ],
			[ colors.tx4, _('Transmit IPv4'), value(best, 'tx4') ], [ colors.tx6, _('Transmit IPv6'), value(best, 'tx6') ]
		];
		crosshair.setAttribute('x1', px); crosshair.setAttribute('x2', px); crosshair.style.display = '';
		dom.content(tooltip, [ E('strong', {}, new Date(best.t * 1000).toLocaleString()) ].concat(rows.map(function(row) {
			return E('div', {}, [ E('span', { 'class': 'ts-legend-dot', style: 'background-color:%s'.format(row[0]) }), E('span', {}, row[1]), E('b', {}, display(row[2])) ]);
		})));
		tooltip.style.display = 'block';
		tooltip.style.left = Math.min(rect.width - 220, Math.max(8, ev.clientX - rect.left + 12)) + 'px';
		tooltip.style.top = Math.max(8, ev.clientY - rect.top - 80) + 'px';
	});
	svg.addEventListener('mouseleave', function() { crosshair.style.display = 'none'; tooltip.style.display = 'none'; });
	var legends = detail ? [ [ colors.rx4, _('Receive IPv4') ], [ colors.rx6, _('Receive IPv6') ], [ colors.tx4, _('Transmit IPv4') ], [ colors.tx6, _('Transmit IPv6') ] ] : [ [ colors.rx4, _('Received') ], [ colors.tx4, _('Transmitted') ] ];
	return E('div', {}, [ wrapper, E('div', { 'class': 'ts-legend' }, legends.map(function(s) { return E('span', {}, [ E('span', { 'class': 'ts-legend-dot', style: 'background-color:%s'.format(s[0]) }), s[1] ]); })) ]);
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
		this.chartMode = 'rate';
		this.protocolDetail = true;
		this.includeSpecial = false;

		var root = E('div', { 'class': 'cbi-map ts-app' }, [
			E('style', {}, '.ts-toolbar{display:flex;gap:.7rem;align-items:end;flex-wrap:wrap;margin:1rem 0;padding:1rem;border:1px solid rgba(127,127,127,.2);border-radius:9px}.ts-toolbar label{display:flex;flex-direction:column;gap:.25rem}.ts-toolbar label.ts-check{flex-direction:row;align-items:center;padding-bottom:.45rem}.ts-toolbar .ts-custom{display:none}.ts-segment{display:inline-flex;border:1px solid rgba(127,127,127,.3);border-radius:6px;overflow:hidden}.ts-segment button{border:0;border-radius:0;background:transparent;padding:.48rem .8rem}.ts-segment button.active{background:#1677ff;color:#fff}.ts-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.8rem;margin:1rem 0}.ts-card,.ts-panel{padding:1rem;border:1px solid rgba(127,127,127,.22);border-radius:9px;background:rgba(127,127,127,.025)}.ts-card strong{display:block;font-size:1.45rem;margin-top:.35rem}.ts-panel{margin:1rem 0}.ts-panel h3{margin:0 0 .8rem}.ts-chart-wrap{position:relative}.ts-chart{width:100%;height:auto;min-height:280px;color:#64748b}.ts-tooltip{position:absolute;z-index:2;min-width:205px;padding:.7rem;background:rgba(255,255,255,.96);color:#1f2937;border:1px solid #d1d5db;border-radius:7px;box-shadow:0 5px 18px rgba(0,0,0,.16);pointer-events:none}.ts-tooltip strong{display:block;margin-bottom:.4rem}.ts-tooltip div{display:grid;grid-template-columns:1rem 1fr auto;gap:.3rem;align-items:center;margin:.2rem 0}.ts-tooltip b{font-weight:600}.ts-legend{display:flex;gap:1rem;flex-wrap:wrap;justify-content:center}.ts-legend-dot{display:inline-block;width:.72rem;height:.72rem;border-radius:3px;margin-right:.35rem}.ts-empty{padding:4rem 1rem;text-align:center;opacity:.7}.ts-state{display:inline-block;padding:.2rem .55rem;border-radius:999px;background:#d9f7be;color:#135200}.ts-state.bad{background:#fff1f0;color:#a8071a}.ts-note{opacity:.75}.ts-table-wrap{overflow:auto}.ts-devices{display:grid;grid-template-columns:minmax(250px,.8fr) minmax(420px,1.7fr);gap:1.2rem}.ts-rank-row{display:grid;grid-template-columns:minmax(100px,1fr) 2fr auto;gap:.6rem;align-items:center;margin:.75rem 0}.ts-rank-track{height:.55rem;background:rgba(127,127,127,.15);border-radius:99px;overflow:hidden}.ts-rank-fill{height:100%;background:#1677ff;border-radius:99px}@media(max-width:900px){.ts-devices{grid-template-columns:1fr}.ts-chart{min-height:220px}}'),
			E('h2', {}, _('Traffic Statistics')),
			E('p', { 'class': 'ts-note' }, _('Receive and transmit follow the configured perspective. Counters are split by IPv4 and IPv6.')),
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
			E('label', { 'class': 'ts-check' }, [ E('input', { id: 'ts-special', type: 'checkbox', change: ui.createHandlerFn(this, 'specialChanged') }), E('span', {}, _('Include multicast / broadcast')) ]),
			E('div', { 'class': 'ts-segment' }, [
				E('button', { id: 'ts-mode-rate', 'class': 'active', click: ui.createHandlerFn(this, 'setChartMode', 'rate') }, _('Rate')),
				E('button', { id: 'ts-mode-volume', click: ui.createHandlerFn(this, 'setChartMode', 'volume') }, _('Volume'))
			]),
			E('div', { 'class': 'ts-segment' }, [
				E('button', { id: 'ts-protocol-total', click: ui.createHandlerFn(this, 'setProtocolDetail', false) }, _('Overview')),
				E('button', { id: 'ts-protocol-detail', 'class': 'active', click: ui.createHandlerFn(this, 'setProtocolDetail', true) }, _('IPv4 + IPv6'))
			]),
			E('button', { 'class': 'btn cbi-button-action', click: ui.createHandlerFn(this, 'refresh') }, _('Refresh'))
		];
	},

	setChartMode: function(mode) {
		this.chartMode = mode;
		this.root.querySelector('#ts-mode-rate').classList.toggle('active', mode === 'rate');
		this.root.querySelector('#ts-mode-volume').classList.toggle('active', mode === 'volume');
		this.renderResults();
	},

	setProtocolDetail: function(detail) {
		this.protocolDetail = detail;
		this.root.querySelector('#ts-protocol-total').classList.toggle('active', !detail);
		this.root.querySelector('#ts-protocol-detail').classList.toggle('active', detail);
		this.renderResults();
	},

	specialChanged: function() {
		this.includeSpecial = this.root.querySelector('#ts-special').checked;
		this.root.querySelector('#ts-mac').value = '';
		return this.refresh();
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
		return Promise.all([ callStatus(), callQuery(this.group, range.start, range.end, chooseBucket(range.start, range.end), this.mac, this.includeSpecial ? 1 : 0) ]).then(function(data) {
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
			' ', group ? E('span', { 'class': 'ts-note' }, _('%s · %s · %s · every %s seconds · keep %s days').format(group.device || group.network, group.family === 'bridge' ? _('offload-safe bridge accounting') : _('basic interface accounting'), group.role === 'client' ? _('router as client') : _('router as server'), group.interval, group.retention_days)) : ''
		]);
	},

	renderResults: function() {
		var t = this.query.totals || {};
		var points = this.query.points || [], bucket = Number(this.query.bucket || chooseBucket(this.range.start, this.range.end));
		var devices = (this.query.devices || []).slice().sort(function(a, b) { return totalOf(b) - totalOf(a); });
		var seconds = Math.max(bucket, Number(this.query.end || this.range.end) - Number(this.query.start || this.range.start)), average = totalOf(t) * 8 / seconds, peak = 0;
		points.forEach(function(p) { peak = Math.max(peak, totalOf(p) * 8 / Math.max(1, bucket)); });
		var cards = E('div', { 'class': 'ts-cards' }, [
			E('div', { 'class': 'ts-card' }, [ _('Received'), E('strong', {}, formatBytes(Number(t.rx4 || 0) + Number(t.rx6 || 0))), E('small', {}, 'IPv4 %s · IPv6 %s'.format(formatBytes(t.rx4), formatBytes(t.rx6))) ]),
			E('div', { 'class': 'ts-card' }, [ _('Transmitted'), E('strong', {}, formatBytes(Number(t.tx4 || 0) + Number(t.tx6 || 0))), E('small', {}, 'IPv4 %s · IPv6 %s'.format(formatBytes(t.tx4), formatBytes(t.tx6))) ]),
			E('div', { 'class': 'ts-card' }, [ _('Total'), E('strong', {}, formatBytes(totalOf(t))), E('small', {}, _('%s data points').format(points.length)) ]),
			E('div', { 'class': 'ts-card' }, [ _('Average rate'), E('strong', {}, formatRate(average)), E('small', {}, _('Across the selected range')) ]),
			E('div', { 'class': 'ts-card' }, [ _('Peak rate'), E('strong', {}, formatRate(peak)), E('small', {}, _('Highest time bucket')) ])
		]);
		var rows = devices.map(function(d) {
			return E('tr', {}, [ E('td', {}, hostLabel(d.mac, this.status.hosts)), E('td', {}, formatBytes(Number(d.rx4) + Number(d.rx6))), E('td', {}, formatBytes(Number(d.tx4) + Number(d.tx6))), E('td', {}, formatBytes(totalOf(d))) ]);
		}, this);
		var maxDevice = devices.length ? totalOf(devices[0]) : 1;
		var ranking = E('div', {}, devices.slice(0, 5).map(function(d) {
			return E('div', { 'class': 'ts-rank-row' }, [ E('span', {}, hostLabel(d.mac, this.status.hosts)), E('div', { 'class': 'ts-rank-track' }, E('div', { 'class': 'ts-rank-fill', style: 'width:%s%%'.format((totalOf(d) / maxDevice * 100).toFixed(1)) })), E('b', {}, formatBytes(totalOf(d))) ]);
		}, this));
		var table = E('div', { 'class': 'ts-table-wrap' }, E('table', { 'class': 'table' }, [ E('tr', { 'class': 'tr table-titles' }, [ E('th', {}, _('Device')), E('th', {}, _('Received')), E('th', {}, _('Transmitted')), E('th', {}, _('Total')) ]) ].concat(rows.length ? rows : [ E('tr', {}, E('td', { colspan: 4 }, _('No devices in this range.'))) ])));
		dom.content(this.root.querySelector('#ts-results'), [ cards, E('div', { 'class': 'ts-panel' }, [ E('h3', {}, _('Traffic trend')), makeChart(points, bucket, this.chartMode, this.protocolDetail) ]), E('div', { 'class': 'ts-panel' }, [ E('h3', {}, _('Device traffic ranking')), E('div', { 'class': 'ts-devices' }, [ ranking, table ]) ]) ]);
	},

	confirmClear: function() {
		if (!this.group) return;
		ui.showModal(_('Clear history?'), [ E('p', {}, _('All saved history for the selected interface group will be deleted. Live counters are not interrupted.')), E('div', { 'class': 'right' }, [ E('button', { 'class': 'btn', click: ui.hideModal }, _('Cancel')), ' ', E('button', { 'class': 'btn cbi-button-negative', click: ui.createHandlerFn(this, function() { return callClear(this.group).then(function() { ui.hideModal(); return this.refresh(); }.bind(this)); }) }, _('Clear')) ]) ]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
