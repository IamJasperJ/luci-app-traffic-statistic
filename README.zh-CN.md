# luci-app-traffic-statistic

[English](README.md) | 简体中文

一款低开销的 OpenWrt LuCI 流量统计应用程序。它按接口组和客户端 MAC 地址记录 IPv4 以及 IPv6 的接收/发送字节数。

## 设计

- **网桥组（Bridge groups）**在 prerouting 和 postrouting 阶段使用独立的 nftables `bridge` 表。即使在启用了 OpenWrt 流量分载（Flow Offloading）的情况下，统计依然保持准确。
- 规则仅更新内核计数器，并且总是放行流量。本应用**不会修改** `fw4`、策略路由、DNS 或代理规则。
- 采用轻量的 POSIX shell 守护进程，按照每个接口组配置的时间间隔对计数器进行快照。历史记录每天以追加的方式写入每个接口组独立的 CSV 文件中。
- 默认 300 秒的统计间隔和 30 天的保留时间，能够有效避免频繁读写闪存。可将存储路径设为 `/tmp/...` 进行易失性历史记录存储，或指向外部硬盘以实现超长周期的保留。
- **非网桥接口（Non-bridge interfaces）**使用 `inet` 兼容路径，并在虚拟的“接口总计（Interface total）”设备下显示双向流量。按 MAC 地址的流量统计主要是为网桥组设计的；在原生 L3 接口上运行的分载流量可能会被低估，并在 LuCI 中会被标记为基本统计。

## 配置

UCI 配置文件为 `traffic_statistic`。每个 `config interface` 段都是一个独立的接口组，拥有各自的网络接口、写入间隔和数据保留期限。网络对应的活跃 L3 设备是通过 ubus 解析获得的；在需要时也可以手动提供一个显式的设备名。

## 数据格式

历史记录存储在配置的路径下，格式为：

```text
GROUP/YYYYMMDD.csv
unix_time,mac,rx_ipv4,rx_ipv6,tx_ipv4,tx_ipv6
```

接收/发送（Receive/transmit）方向是从**客户端设备**的视角定义的。文件采用仅追加（append-only）方式写入，因此可以使用标准工具安全地查看或导出。
