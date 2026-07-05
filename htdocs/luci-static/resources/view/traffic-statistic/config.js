'use strict';
'require view';
'require form';
'require network';
'require uci';

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('traffic_statistic'),
			network.getNetworks()
		]);
	},

	render: function(data) {
		var networks = data[1] || [];
		var m = new form.Map('traffic_statistic', _('Traffic Statistics'),
			_('Traffic is counted in the kernel and written in batches. Receive and transmit are shown from the client device perspective.'));

		var s = m.section(form.NamedSection, 'main', 'global', _('General settings'));
		s.anonymous = true;

		var o = s.option(form.Flag, 'enabled', _('Enable'));
		o.default = o.enabled;
		o.rmempty = false;

		o = s.option(form.Value, 'storage_path', _('Storage path'));
		o.default = '/etc/traffic-statistic/data';
		o.rmempty = false;
		o.validate = function(sectionId, value) {
			if (!/^\/(?!.*(?:^|\/)\.\.(?:\/|$))[^|\s]*$/.test(value) ||
			    /^\/(?:bin|boot|dev|etc|lib|mnt|overlay|proc|root|run|sbin|sys|tmp|usr|var)\/?$/.test(value))
				return _('Use an absolute path without spaces or parent-directory components.');
			return true;
		};
		o.description = _('Use an external disk path for long retention periods. /tmp is volatile and avoids flash writes.');

		o = s.option(form.Value, 'max_devices', _('Maximum devices per group'));
		o.default = '256';
		o.datatype = 'range(16,4096)';
		o.rmempty = false;

		s = m.section(form.GridSection, 'interface', _('Interface groups'));
		s.addremove = true;
		s.nodescriptions = true;
		s.sectiontitle = function(sectionId) {
			return uci.get('traffic_statistic', sectionId, 'name') || sectionId;
		};

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.default = o.enabled;
		o.rmempty = false;
		o.editable = true;

		o = s.option(form.Value, 'name', _('Display name'));
		o.placeholder = _('LAN');
		o.rmempty = false;

		o = s.option(form.ListValue, 'network', _('Network'));
		o.rmempty = false;
		networks.forEach(function(net) {
			var name = net.getName();
			o.value(name, name);
		});

		o = s.option(form.Value, 'device', _('Device override'));
		o.placeholder = _('Automatic from network');
		o.validate = function(sectionId, value) {
			return !value || /^[A-Za-z0-9_.:-]{1,15}$/.test(value) || _('Use a valid Linux interface name.');
		};
		o.description = _('Usually leave empty. Bridge member ports are discovered automatically.');

		o = s.option(form.Value, 'interval', _('Write interval'));
		o.default = '300';
		o.datatype = 'range(60,86400)';
		o.rmempty = false;
		o.description = _('Seconds. Longer intervals reduce flash writes.');

		o = s.option(form.Value, 'retention_days', _('Retention'));
		o.default = '30';
		o.datatype = 'range(1,3650)';
		o.rmempty = false;
		o.description = _('Days of history retained for this group.');

		return m.render();
	}
});
