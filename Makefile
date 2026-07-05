include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-traffic-statistic
PKG_VERSION:=0.1.0
PKG_RELEASE:=1

PKG_LICENSE:=MIT
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=saruo
PKG_BUILD_DEPENDS:=luci-base/host

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
	SECTION:=luci
	CATEGORY:=LuCI
	SUBMENU:=3. Applications
	TITLE:=Low-overhead per-device traffic statistics
	DEPENDS:=+luci-base +rpcd +nftables +kmod-nft-bridge +jsonfilter
	PKGARCH:=all
endef

define Package/$(PKG_NAME)/description
	Low-overhead IPv4/IPv6 receive and transmit accounting grouped by
	interface and client MAC address, with configurable history retention.
endef

define Build/Compile
	$(STAGING_DIR_HOSTPKG)/bin/po2lmo ./po/zh_Hans/traffic-statistic.po ./po/zh_Hans/traffic-statistic.zh-cn.lmo
endef

define Package/$(PKG_NAME)/conffiles
/etc/config/traffic_statistic
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	/etc/init.d/rpcd reload >/dev/null 2>&1 || true
	rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache
	/etc/init.d/traffic-statistic enable >/dev/null 2>&1 || true
	/etc/init.d/traffic-statistic restart >/dev/null 2>&1 || true
fi
exit 0
endef

define Package/$(PKG_NAME)/prerm
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	/etc/init.d/traffic-statistic stop >/dev/null 2>&1 || true
	/etc/init.d/traffic-statistic disable >/dev/null 2>&1 || true
fi
exit 0
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./root/etc/config/traffic_statistic $(1)/etc/config/traffic_statistic
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./root/etc/init.d/traffic-statistic $(1)/etc/init.d/traffic-statistic
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) ./root/usr/sbin/traffic-statisticd $(1)/usr/sbin/traffic-statisticd
	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_BIN) ./root/usr/libexec/rpcd/traffic-statistic $(1)/usr/libexec/rpcd/traffic-statistic
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/luci-app-traffic-statistic.json $(1)/usr/share/luci/menu.d/luci-app-traffic-statistic.json
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-traffic-statistic.json $(1)/usr/share/rpcd/acl.d/luci-app-traffic-statistic.json
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/traffic-statistic
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/traffic-statistic/overview.js $(1)/www/luci-static/resources/view/traffic-statistic/overview.js
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/traffic-statistic/config.js $(1)/www/luci-static/resources/view/traffic-statistic/config.js
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n
	$(INSTALL_DATA) ./po/zh_Hans/traffic-statistic.zh-cn.lmo $(1)/usr/lib/lua/luci/i18n/traffic-statistic.zh-cn.lmo
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
