# luci-app-traffic-statistic

English | [简体中文](README.zh-CN.md)

A low-overhead OpenWrt LuCI traffic accounting application. It records IPv4
and IPv6 receive/transmit bytes per interface group and client MAC address.

## Design

- Bridge groups use an isolated nftables `bridge` table at prerouting and
  postrouting. This remains accurate with OpenWrt flow offloading enabled.
- Rules only update kernel counters and always accept traffic. The application
  does not modify `fw4`, policy routing, DNS, or proxy rules.
- A small POSIX shell daemon snapshots counters at each group's configured
  interval. History is appended to one CSV file per group per day.
- The default 300-second interval and 30-day retention avoid frequent flash
  writes. Set the storage path to `/tmp/...` for volatile history or to an
  external disk for long retention.
- Non-bridge interfaces use an `inet` compatibility path and expose both
  directions under a synthetic "Interface total" device. Per-MAC accounting
  is intended for bridge groups; offloaded traffic on a raw L3 interface may
  be under-counted and is marked as basic accounting in LuCI.

> **Accounting capability note:** This application can account for traffic
> traversing bridge ports with reasonable accuracy and distinguish IPv4/IPv6
> by client MAC address. Complete accounting cannot be guaranteed for a
> non-bridge L3 uplink while Flow Offloading is enabled unless MediaTek PPE
> hardware flow-table counters are integrated and the synthetic MAC matching
> used for locally generated outbound traffic is corrected.

## Configuration

The UCI package is `traffic_statistic`. Every `config interface` section is an
independent group with its own network, write interval, and retention period.
The network's active L3 device is resolved through ubus; an explicit device can
be supplied when needed.

## Data format

History is stored beneath the configured path as:

```text
GROUP/YYYYMMDD.csv
unix_time,mac,rx_ipv4,rx_ipv6,tx_ipv4,tx_ipv6
```

Receive/transmit directions are from the client device perspective. Files are
append-only and are safe to inspect or export with standard tools.
